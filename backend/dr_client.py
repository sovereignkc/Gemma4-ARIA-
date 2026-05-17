# dr_client.py — Diabetic Retinopathy screening via llama-cpp-python
#
# Loads gemma-4-e2b-it.Q4_K_M.gguf + BF16-mmproj.gguf, runs inference,
# then immediately unloads to free Metal VRAM for Ollama.
# No persistent model in memory — each DR call is self-contained.

from __future__ import annotations
import asyncio
import base64
import gc
import threading
from pathlib import Path

_BASE = Path(__file__).parent.parent / "models"
MODEL_PATH  = _BASE / "gemma-4-e2b-it.Q4_K_M.gguf"
MMPROJ_PATH = _BASE / "gemma-4-e2b-it.BF16-mmproj.gguf"

# One call at a time — prevents two DR requests fighting for VRAM
_lock = threading.Lock()

_DR_PROMPT = (
    "Analyze this retinal fundus image for diabetic retinopathy. Provide:\n\n"
    "**DR SEVERITY GRADE**: None / Mild NPDR / Moderate NPDR / Severe NPDR / Proliferative DR\n\n"
    "**KEY FINDINGS**: List any visible microaneurysms, dot/blot hemorrhages, hard exudates, "
    "cotton-wool spots, IRMA, neovascularization, vitreous hemorrhage\n\n"
    "**DIABETIC MACULAR EDEMA**: Present / Absent / Cannot assess\n\n"
    "**IMAGE QUALITY**: Good / Adequate / Poor\n\n"
    "**CLINICAL RECOMMENDATION**: Immediate referral / Routine follow-up / Annual screening\n\n"
    "Be specific about what you see. If image quality prevents assessment, state so."
)


def run_dr_detection(image_path: str) -> dict:
    """Load Q4_K_M + mmproj, run DR grading, immediately unload to free VRAM."""
    if not MODEL_PATH.exists():
        return {"assessment": "", "model": str(MODEL_PATH), "error": f"Model not found: {MODEL_PATH}"}
    if not MMPROJ_PATH.exists():
        return {"assessment": "", "model": str(MODEL_PATH), "error": f"Mmproj not found: {MMPROJ_PATH}"}

    suffix = Path(image_path).suffix.lower() or ".jpg"
    mime = {"jpg": "image/jpeg", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".webp": "image/webp"}.get(suffix, "image/jpeg")
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    data_uri = f"data:{mime};base64,{b64}"

    llm = None
    try:
        with _lock:
            from llama_cpp import Llama
            from llama_cpp.llama_chat_format import Llava16ChatHandler

            chat_handler = Llava16ChatHandler(clip_model_path=str(MMPROJ_PATH), verbose=False)
            llm = Llama(
                model_path=str(MODEL_PATH),
                chat_handler=chat_handler,
                n_ctx=2048,
                n_gpu_layers=-1,  # full Metal offload
                verbose=False,
            )

            response = llm.create_chat_completion(
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_uri}},
                        {"type": "text", "text": _DR_PROMPT},
                    ],
                }],
                max_tokens=700,
                temperature=0.1,
                repeat_penalty=1.3,
            )
            assessment = response["choices"][0]["message"]["content"].strip()

        return {
            "assessment": assessment,
            "model": "gemma-4-e2b-it.Q4_K_M + BF16-mmproj (Unsloth Q4_K_M, vision fine-tuned)",
            "error": None,
        }
    except Exception as e:
        return {"assessment": "", "model": "gemma-4-e2b-it.Q4_K_M", "error": str(e)}
    finally:
        # Always free VRAM so Ollama can use Metal again
        if llm is not None:
            del llm
        gc.collect()


async def run_dr_detection_async(image_path: str) -> dict:
    return await asyncio.to_thread(run_dr_detection, image_path)
