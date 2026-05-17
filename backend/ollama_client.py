# ollama_client.py — Ollama wrappers for all text, OCR, STT, document, embed modes

from __future__ import annotations
import base64
import httpx
from pathlib import Path
from typing import Optional

OLLAMA_BASE = "http://localhost:11434"

# Vision models
VLM_MODEL = "ahmadwaqar/smolvlm2-256m-video:q8_0"  # fast multi-patch (live stream legacy)
VISION_MODEL = "qwen3-vl:2b"                         # image → description, pipes to disaster/moonshot


def _post(endpoint: str, payload: dict, timeout: float = 300.0) -> dict:
    url = f"{OLLAMA_BASE}{endpoint}"
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


# ── TEXT CHAT ─────────────────────────────────────────────────────────────────

def chat(model: str, user_text: str, system_prompt: str = "") -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_text})
    data = _post("/api/chat", {"model": model, "messages": messages, "stream": False})
    return data["message"]["content"]


# ── OCR (GLM-OCR) ─────────────────────────────────────────────────────────────

def ocr_image(image_path: str, model: str = "glm-ocr:q8_0") -> str:
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    data = _post("/api/chat", {
        "model": model,
        "messages": [{
            "role": "user",
            "content": "Extract all text from this image exactly as written.",
            "images": [b64],
        }],
        "stream": False,
    })
    return data["message"]["content"]


# ── VISION CHAT (image + question → native gemma4:e2b vision) ────────────────

_QWEN_SYSTEM = (
    "You are ARIA, an emergency field AI assistant deployed in active disaster zones. "
    "The user is always in a real emergency scenario. Never question or challenge the scene description. "
    "Never say the situation looks staged or safe. Always respond with immediate, specific, actionable "
    "guidance as if lives depend on your answer. Begin your response with the most critical action first. "
    "Describe only the hazards, debris, and dangers visible. Do not comment on whether the scene looks "
    "real or staged. Focus on actionable observations for a rescue team."
)

def vision_chat(image_path: str, question: str, model: str = VISION_MODEL) -> str:
    """
    Send image + question directly to qwen3-vl:2b via Ollama native vision.
    No SmolVLM2 relay, no OCR second-pass — single model call.
    """
    b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    data = _post("/api/chat", {
        "model": model,
        "messages": [
            {"role": "system", "content": _QWEN_SYSTEM},
            {"role": "user", "content": question, "images": [b64]},
        ],
        "stream": False,
    }, timeout=300.0)
    return data["message"]["content"]


def describe_patches(patch_bytes_list: list[bytes], context: str = "", model: str = VLM_MODEL) -> list[str]:
    """
    Run SmolVLM2 on each pre-cropped patch (from saliency cropping).
    Returns a list of scene descriptions, one per patch.
    context: optional domain hint, e.g. 'disaster scene', 'infrastructure'
    """
    descriptions = []
    prompt = (
        f"You are analyzing a cropped region of a {context or 'field scene'}. "
        "Describe exactly what you see: objects, materials, conditions, hazards, "
        "water, structural damage, people, or infrastructure. Be specific and concise."
    )
    for patch_bytes in patch_bytes_list:
        b64 = base64.b64encode(patch_bytes).decode()
        try:
            data = _post("/api/chat", {
                "model": model,
                "messages": [{"role": "user", "content": prompt, "images": [b64]}],
                "stream": False,
            }, timeout=60.0)
            descriptions.append(data["message"]["content"].strip())
        except Exception as e:
            descriptions.append(f"[patch analysis failed: {e}]")
    return descriptions


# ── STT (Whisper-Tiny) ────────────────────────────────────────────────────────

def transcribe(audio_path: str, model: str = "dimavz/whisper-tiny:latest",
               language: Optional[str] = None) -> dict:
    b64 = base64.b64encode(Path(audio_path).read_bytes()).decode()
    prompt = f"Transcribe this audio. Language: {language}." if language else "Transcribe this audio."
    data = _post("/api/chat", {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
        "stream": False,
    }, timeout=180.0)
    return {"transcript": data["message"]["content"], "language": data.get("language", language or "unknown")}


# ── DOCUMENT (Granite-Docling) ─────────────────────────────────────────────────

def parse_document(file_path: str,
                   prompt: str = "Extract and summarize all text from this document.",
                   model: str = "danchev/granite-docling:258m") -> dict:
    b64 = base64.b64encode(Path(file_path).read_bytes()).decode()
    data = _post("/api/chat", {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
        "stream": False,
    }, timeout=300.0)
    raw = data["message"]["content"]
    parts = raw.split("\n\n", 1)
    return {"extracted_text": parts[0], "summary": parts[1] if len(parts) > 1 else raw}


# ── EMBEDDINGS (Nomic Embed v2 MoE) ───────────────────────────────────────────

def embed(texts: list[str], model: str = "nomic-embed-text-v2-moe:latest") -> list[list[float]]:
    """Batch embed texts. Returns list of float vectors."""
    embeddings = []
    for text in texts:
        data = _post("/api/embeddings", {"model": model, "prompt": text})
        embeddings.append(data["embedding"])
    return embeddings


# ── HEALTH ────────────────────────────────────────────────────────────────────

def list_models() -> list[str]:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{OLLAMA_BASE}/api/tags")
        resp.raise_for_status()
        return [m["name"] for m in resp.json().get("models", [])]


def is_model_available(model_name: str) -> bool:
    try:
        return any(model_name in m for m in list_models())
    except Exception:
        return False
