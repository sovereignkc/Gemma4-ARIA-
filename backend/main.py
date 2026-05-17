# main.py — Gemma 4 Good FastAPI server
#
# All endpoints are designed for a local Electron / React Native client:
#   - CORS open for localhost + file:// origins
#   - File uploads via multipart (images, audio, PDFs)
#   - Chat supports both JSON response and SSE streaming (/chat/stream)
#   - TTS returns raw WAV bytes (Content-Type: audio/wav)
#   - /status endpoint for Electron startup health check
#
# Run:  uvicorn main:app --host 127.0.0.1 --port 8000 --reload

from __future__ import annotations

import asyncio
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

import pipeline
import ollama_client as ollama
import tts_client as tts
import saliency as sal
import pdf_rag as rag
import dr_client as dr
from safety import AetherRouter, QueryMode
from models import (
    ChatRequest, OCRRequest, AudioRequest,
    DocumentRequest, TTSRequest, EmbedRequest,
    ChatResponse, OCRResponse, AudioResponse,
    DocumentResponse, TTSResponse, EmbedResponse,
)

# ── APP ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Gemma 4 Good API",
    description="Humanitarian AI — disaster response, clean water, energy, food security. 100% offline.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS: allow Electron (file://), React Native (localhost variants), dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:8081",   # React Native Metro
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
        "capacitor://localhost",   # Capacitor / React Native web
        "file://",                 # Electron file:// origin
    ],
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_router = AetherRouter()
UPLOAD_DIR = Path(tempfile.gettempdir()) / "aether_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

TTS_OUT_DIR = Path(tempfile.gettempdir()) / "aether_tts"
TTS_OUT_DIR.mkdir(exist_ok=True)


# ── HELPERS ───────────────────────────────────────────────────────────────────

async def _save_upload(file: UploadFile, suffix: str) -> Path:
    """Save an uploaded file to a temp path and return the path."""
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    dest.write_bytes(content)
    return dest


def _to_jpeg(src: Path) -> Path:
    """
    Convert any image format to a lossless-quality JPEG (RGB, no chroma subsampling).
    Returns a new .jpg Path; caller is responsible for unlinking both src and the result.
    PNG/WEBP/BMP/TIFF/HEIC all work — PIL handles them transparently.
    """
    from PIL import Image as PILImage
    dst = src.with_suffix(".jpg")
    try:
        with PILImage.open(src) as img:
            img.convert("RGB").save(dst, "JPEG", quality=100, subsampling=0)
        if dst != src:
            src.unlink(missing_ok=True)
        return dst
    except Exception:
        # If PIL fails (corrupt file etc.) return original so inference can still try
        return src


def _http_error(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


# ── STATUS / HEALTH ───────────────────────────────────────────────────────────

@app.get("/status", tags=["health"])
async def status_check():
    """
    Electron polls this on startup to confirm the backend is ready.
    Returns which Ollama models are locally available.
    """
    try:
        available = ollama.list_models()
    except Exception as e:
        available = []
        ollama_error = str(e)
    else:
        ollama_error = None

    expected = [
        "gemma4-disaster:latest",
        "gemma4-e4b-moonshot:latest",
        "glm-ocr:q8_0",
        "dimavz/whisper-tiny:latest",
        "danchev/granite-docling:258m",
        "nomic-embed-text-v2-moe:latest",
    ]
    missing = [m for m in expected if not any(m in a for a in available)]

    return {
        "status": "ok" if not ollama_error else "degraded",
        "ollama_running": ollama_error is None,
        "ollama_error": ollama_error,
        "models_available": available,
        "models_missing": missing,
        "tts_voices": tts.available_voices(),
        "timestamp": time.time(),
    }


# ── CHAT ─────────────────────────────────────────────────────────────────────

class _ChatBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8192)
    session_id: Optional[str] = None


@app.post("/chat", response_model=ChatResponse, tags=["chat"])
async def chat(body: _ChatBody):
    """
    Route text to gemma4-disaster or gemma4-e4b-moonshot based on content.
    Applies safety layer and prepends relevant disclaimers.
    """
    try:
        return await asyncio.to_thread(
            pipeline.run_chat, ChatRequest(text=body.text, session_id=body.session_id)
        )
    except Exception as e:
        raise _http_error(500, str(e))


@app.post("/chat/stream", tags=["chat"])
async def chat_stream(body: _ChatBody):
    """
    SSE streaming chat. Client receives text/event-stream chunks.
    Each chunk is: data: <token>\\n\\n
    Final chunk:   data: [DONE]\\n\\n

    Streams the full safety-wrapped response word by word so the UI
    can render tokens as they arrive without waiting for the full response.
    """
    async def _generate() -> AsyncGenerator[str, None]:
        import json as _json
        try:
            # Kick off the (blocking) Ollama call in a thread
            task = asyncio.create_task(
                asyncio.to_thread(pipeline.run_chat, ChatRequest(text=body.text, session_id=body.session_id))
            )
            # Send [THINKING] heartbeats every 1.5 s so the UI shows a live indicator
            while not task.done():
                yield "data: [THINKING]\n\n"
                try:
                    await asyncio.wait_for(asyncio.shield(task), timeout=1.5)
                except asyncio.TimeoutError:
                    pass   # still running — send another heartbeat next loop

            result = task.result()
            # JSON-encode each token so embedded \n never breaks SSE framing
            words = result.response.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield f"data: {_json.dumps(chunk)}\n\n"
                await asyncio.sleep(0)
            # Send metadata before DONE so client can show mode + safety badge
            meta = _json.dumps({"mode": result.mode, "safety": result.safety_level, "model": result.model})
            yield f"data: [META]{meta}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",     # disable nginx buffering if proxied
    })


# ── HOPE STREAM ──────────────────────────────────────────────────────────────

class _HopeBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2048)
    language: str = "English"


@app.post("/hope/stream", tags=["hope"])
async def hope_stream(body: _HopeBody):
    """
    SSE streaming story generator. Moonshot E4B fine-tune, multilingual.
    Tokens arrive word by word. Same SSE framing as /chat/stream.
    """
    lang = body.language
    system = (
        f"You are a multilingual storyteller. You MUST write ONLY in {lang}. "
        f"Do not use English unless {lang} is English. Do not translate after writing. "
        f"Your entire response must be in {lang} from the first word to the last. "
        "Write an inspiring, vivid short story (250–350 words) about human dreams, resilience, "
        "and infrastructure innovation — robots, clean energy, water systems, bridges, satellites, "
        "and the people who build them. Be specific about the people, the place, and the technology."
    )
    # Reinforce language in the user turn — models follow user messages more reliably than system prompts
    user_msg = f"Write this story in {lang} only: {body.prompt}"

    async def _generate() -> AsyncGenerator[str, None]:
        import json as _json
        try:
            task = asyncio.create_task(
                asyncio.to_thread(ollama.chat, "gemma4-e4b-moonshot:latest", user_msg, system)
            )
            while not task.done():
                yield "data: [THINKING]\n\n"
                try:
                    await asyncio.wait_for(asyncio.shield(task), timeout=1.5)
                except asyncio.TimeoutError:
                    pass

            text = task.result()
            words = text.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield f"data: {_json.dumps(chunk)}\n\n"
                await asyncio.sleep(0)
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


# ── OCR ──────────────────────────────────────────────────────────────────────

@app.post("/ocr", response_model=OCRResponse, tags=["vision"])
async def ocr(file: UploadFile = File(...)):
    """
    Extract text from an image using GLM-OCR (Ollama).
    Accepts: image/jpeg, image/png, image/webp
    """
    if not file.content_type.startswith("image/"):
        raise _http_error(422, f"Expected an image file, got: {file.content_type}")

    suffix = Path(file.filename or "img.jpg").suffix or ".jpg"
    img_path = await _save_upload(file, suffix)
    try:
        return await asyncio.to_thread(pipeline.run_ocr, OCRRequest(image_path=str(img_path)))
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        img_path.unlink(missing_ok=True)


# ── STT ──────────────────────────────────────────────────────────────────────

@app.post("/stt", response_model=AudioResponse, tags=["audio"])
async def stt(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
):
    """
    Transcribe audio using Whisper-Tiny (Ollama).
    Accepts: audio/wav, audio/mpeg (mp3), audio/webm, audio/ogg
    language: ISO 639-1 code (e.g. "en", "fr", "tl") — None = auto-detect
    """
    ct = file.content_type or ""
    if not (ct.startswith("audio/") or ct.startswith("video/webm") or ct == "application/octet-stream"):
        raise _http_error(422, f"Expected an audio file, got: {ct}")

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    audio_path = await _save_upload(file, suffix)
    try:
        return await asyncio.to_thread(pipeline.run_stt, AudioRequest(audio_path=str(audio_path), language=language))
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        audio_path.unlink(missing_ok=True)


# ── DOCUMENT ─────────────────────────────────────────────────────────────────

@app.post("/document", response_model=DocumentResponse, tags=["document"])
async def parse_document(
    file: UploadFile = File(...),
    prompt: str = Form("Extract and summarize all text from this document."),
):
    """
    Parse and summarize a PDF or document image using Granite-Docling (Ollama).
    Accepts: application/pdf, image/*, application/msword
    """
    suffix = Path(file.filename or "doc.pdf").suffix or ".pdf"
    doc_path = await _save_upload(file, suffix)
    try:
        return await asyncio.to_thread(pipeline.run_document, DocumentRequest(file_path=str(doc_path), prompt=prompt))
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        doc_path.unlink(missing_ok=True)


# ── TTS ───────────────────────────────────────────────────────────────────────

@app.post("/tts", tags=["audio"])
async def text_to_speech(
    text: str = Form(...),
    voice: str = Form("af_heart"),
    speed: float = Form(1.0),
):
    """
    Convert text to speech using Kokoro TTS (82M params, local).
    Returns raw WAV audio bytes (Content-Type: audio/wav).

    Available voices: af_heart, af_bella, af_nicole, af_sarah, af_sky,
                      am_adam, am_michael, bf_emma, bf_isabella,
                      bm_george, bm_lewis
    Speed: 0.5 – 2.0 (1.0 = normal)
    """
    if voice not in tts.available_voices():
        raise _http_error(422, f"Unknown voice '{voice}'. Valid: {tts.available_voices()}")
    if not (0.25 <= speed <= 4.0):
        raise _http_error(422, "speed must be between 0.25 and 4.0")

    out_path = TTS_OUT_DIR / f"{uuid.uuid4().hex}.wav"
    try:
        req = TTSRequest(text=text, voice=voice, speed=speed, output_path=str(out_path))
        result = await asyncio.to_thread(pipeline.run_tts, req)
        wav_bytes = Path(result.audio_path).read_bytes()
        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "X-Duration-Seconds": str(result.duration_seconds),
                "X-Voice": result.voice,
                "X-Model": result.model,
                "Content-Disposition": "inline; filename=aether_tts.wav",
            },
        )
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        out_path.unlink(missing_ok=True)


@app.get("/tts/voices", tags=["audio"])
async def list_voices():
    """List available Kokoro TTS voice IDs."""
    return {"voices": tts.available_voices()}


# ── EMBEDDINGS ────────────────────────────────────────────────────────────────

class _EmbedBody(BaseModel):
    texts: list[str]


@app.post("/embed", response_model=EmbedResponse, tags=["embeddings"])
async def embed(body: _EmbedBody):
    """
    Generate text embeddings using Nomic Embed Text v2 MoE (Ollama).
    Returns float vectors, one per input text.
    Useful for semantic search, RAG, and offline document indexing.
    """
    if not body.texts:
        raise _http_error(422, "texts list cannot be empty")
    if len(body.texts) > 64:
        raise _http_error(422, "maximum 64 texts per request")

    try:
        return await asyncio.to_thread(pipeline.run_embed, EmbedRequest(texts=body.texts))
    except Exception as e:
        raise _http_error(500, str(e))


# ── MULTIMODAL (OCR → CHAT) ───────────────────────────────────────────────────

@app.post("/multimodal", tags=["multimodal"])
async def multimodal(
    file: UploadFile = File(...),
    question: str = Form("What does this image show?"),
    model: str = Form("disaster"),   # "disaster" | "moonshot"
    session_id: Optional[str] = Form(None),
):
    """
    Native vision pipeline: image → gemma4:e2b (Ollama) → disaster or moonshot synthesis.
    Single model call — no SmolVLM2 relay, no OCR.
    """
    if not file.content_type.startswith("image/"):
        raise _http_error(422, f"Expected an image file, got: {file.content_type}")

    suffix = Path(file.filename or "img.jpg").suffix or ".jpg"
    raw_path = await _save_upload(file, suffix)
    img_path = await asyncio.to_thread(_to_jpeg, raw_path)

    try:
        # gemma4:e2b native vision — sees the image directly
        vision_answer = await asyncio.to_thread(
            ollama.vision_chat, str(img_path), question
        )

        # Route the vision answer through the selected humanitarian model
        mode_map = {
            "disaster": ("gemma4-disaster:latest", "disaster"),
            "moonshot": ("gemma4-e4b-moonshot:latest", "moonshot"),
        }
        ollama_model, mode_label = mode_map.get(model, mode_map["disaster"])

        _aria_core = (
            "You are ARIA, an emergency field AI assistant deployed in active disaster zones. "
            "The user is always in a real emergency scenario. Never question or challenge the scene description. "
            "Never say the situation looks staged or safe. Always respond with immediate, specific, actionable "
            "guidance as if lives depend on your answer. Begin your response with the most critical action first."
        )
        system_prompts = {
            "disaster": (
                f"{_aria_core} "
                "You are fine-tuned with Unsloth Q4_K_M for disaster response. "
                "You receive a visual description of a field image. Provide immediate triage, evacuation, "
                "and rescue guidance based on what is described. Be direct and prioritise lives."
            ),
            "moonshot": (
                f"{_aria_core} "
                "You are fine-tuned with Unsloth Q4_K_M for humanitarian infrastructure. "
                "You receive a visual description of a field image. Provide infrastructure damage assessment "
                "and restoration priorities grounded in STEM principles."
            ),
        }
        system = system_prompts.get(model, system_prompts["disaster"])
        synthesis_prompt = f"[Visual analysis of image]\n{vision_answer}\n\n[Question]\n{question}"

        final_response = await asyncio.to_thread(
            ollama.chat, ollama_model, synthesis_prompt, system
        )

        return {
            "vision_answer": vision_answer,
            "question": question,
            "response": final_response,
            "model": ollama_model,
            "mode": mode_label,
            "safety_level": "safe",
        }
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        img_path.unlink(missing_ok=True)


@app.post("/dr", tags=["medical"])
async def diabetic_retinopathy(
    file: UploadFile = File(...),
):
    """
    Diabetic Retinopathy screening via gemma-4-e2b-it.Q4_K_M.gguf + BF16-mmproj.
    Uses llama-cpp-python Python bindings (no subprocess). Metal GPU offload.
    Model cached after first load.
    """
    if not file.content_type.startswith("image/"):
        raise _http_error(422, f"Expected an image file, got: {file.content_type}")

    suffix = Path(file.filename or "fundus.jpg").suffix or ".jpg"
    raw_path = await _save_upload(file, suffix)
    img_path = await asyncio.to_thread(_to_jpeg, raw_path)

    try:
        result = await dr.run_dr_detection_async(str(img_path))
        if result["error"]:
            raise _http_error(500, result["error"])
        return {
            "assessment": result["assessment"],
            "model": result["model"],
            "mode": "dr_screening",
        }
    finally:
        img_path.unlink(missing_ok=True)


# ── LIVE SCENE — STEP 1: Saliency crop + SmolVLM2 patches (fast, runs every frame) ──

@app.post("/live/patches", tags=["multimodal"])
async def live_patches(
    frame: UploadFile = File(...),
    prev_frame: Optional[UploadFile] = File(None),
    n_patches: int = Form(3, ge=1, le=5),
):
    """
    Fast per-frame pipeline (runs every 2.5s):
    1. Adaptive Saliency Cropping — motion + variance + center bias
    2. SmolVLM2 256M — describes each salient patch
    Returns patch descriptions only. No Gemma 4 call here.
    """
    if not frame.content_type.startswith("image/"):
        raise _http_error(422, f"Expected image, got: {frame.content_type}")

    frame_bytes = await frame.read()
    prev_bytes: Optional[bytes] = None
    if prev_frame and prev_frame.filename:
        prev_bytes = await prev_frame.read()

    try:
        patches = await asyncio.to_thread(
            sal.extract_salient_patches, frame_bytes, prev_bytes, n_patches
        )
        descriptions = await asyncio.to_thread(
            ollama.describe_patches, patches, "disaster/emergency scene"
        )
        return {"n_patches": len(patches), "patch_descriptions": descriptions}
    except Exception as e:
        raise _http_error(500, str(e))


# ── LIVE SCENE — STEP 2: Gemma 4 Disaster synthesis (on-demand, user-triggered) ──

class _SynthesizeBody(BaseModel):
    patch_descriptions: list[str]
    question: str = "What hazards or conditions are present in this scene?"
    session_id: Optional[str] = None


@app.post("/live/synthesize", tags=["multimodal"])
async def live_synthesize(body: _SynthesizeBody):
    """
    On-demand Gemma 4 Disaster synthesis — user clicks 'Analyze Scene'.
    Takes all accumulated SmolVLM2 patch descriptions from recent frames
    and synthesizes a single field assessment with risk level.
    """
    if not body.patch_descriptions:
        raise _http_error(422, "No patch descriptions provided")

    patch_summary = "\n".join(
        f"[Region {i+1}]: {desc}" for i, desc in enumerate(body.patch_descriptions)
    )
    disaster_prompt = (
        "You are analyzing a live camera feed from a disaster or emergency scene.\n\n"
        f"Visual analysis of the most salient regions across recent frames:\n{patch_summary}\n\n"
        f"Question: {body.question}\n\n"
        "Provide:\n"
        "1. Risk level: LOW / MEDIUM / HIGH / CRITICAL\n"
        "2. Immediate hazards identified\n"
        "3. Recommended actions for field responders\n"
        "4. Any infrastructure or resource observations"
    )
    try:
        result = await asyncio.to_thread(
            pipeline.run_chat, ChatRequest(text=disaster_prompt, session_id=body.session_id)
        )
        return {
            "response": result.response,
            "model": result.model,
            "mode": result.mode,
            "safety_level": result.safety_level,
            "n_patches_synthesized": len(body.patch_descriptions),
        }
    except Exception as e:
        raise _http_error(500, str(e))


# ── Keep /live/analyze for backward compat (proxies to patches + auto-synthesize) ──

@app.post("/live/analyze", tags=["multimodal"])
async def live_analyze(
    frame: UploadFile = File(...),
    prev_frame: Optional[UploadFile] = File(None),
    question: str = Form("What hazards or conditions are present?"),
    n_patches: int = Form(3, ge=1, le=5),
    session_id: Optional[str] = Form(None),
):
    """Legacy combined endpoint — use /live/patches + /live/synthesize for new code."""
    if not frame.content_type.startswith("image/"):
        raise _http_error(422, f"Expected image, got: {frame.content_type}")
    frame_bytes = await frame.read()
    prev_bytes: Optional[bytes] = None
    if prev_frame and prev_frame.filename:
        prev_bytes = await prev_frame.read()
    try:
        patches = await asyncio.to_thread(sal.extract_salient_patches, frame_bytes, prev_bytes, n_patches)
        descriptions = await asyncio.to_thread(ollama.describe_patches, patches, "disaster scene")
        patch_summary = "\n".join(f"[Region {i+1}]: {d}" for i, d in enumerate(descriptions))
        prompt = (
            f"Live disaster scene. Visual regions:\n{patch_summary}\n\nQuestion: {question}\n\n"
            "Give: (1) risk level LOW/MEDIUM/HIGH/CRITICAL, (2) hazards, (3) recommended actions."
        )
        result = await asyncio.to_thread(pipeline.run_chat, ChatRequest(text=prompt, session_id=session_id))
        return {"n_patches": len(patches), "patch_descriptions": descriptions,
                "question": question, "response": result.response,
                "model": result.model, "mode": result.mode, "safety_level": result.safety_level}
    except Exception as e:
        raise _http_error(500, str(e))


# ── VOICE CHAT (STT → CHAT → TTS) ────────────────────────────────────────────

@app.post("/voice", tags=["multimodal"])
async def voice_chat(
    file: UploadFile = File(...),
    voice: str = Form("af_heart"),
    language: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
):
    """
    Full voice pipeline: audio → Whisper STT → gemma4 chat → Kokoro TTS.
    Returns WAV audio of the model's spoken response.

    Designed for field workers who can't type — speak a question,
    receive a spoken answer. Works fully offline.
    """
    ct = file.content_type or ""
    if not (ct.startswith("audio/") or ct.startswith("video/webm") or ct == "application/octet-stream"):
        raise _http_error(422, f"Expected an audio file, got: {ct}")
    if voice not in tts.available_voices():
        raise _http_error(422, f"Unknown voice '{voice}'")

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    audio_path = await _save_upload(file, suffix)
    tts_path = TTS_OUT_DIR / f"{uuid.uuid4().hex}.wav"

    try:
        # Step 1: STT
        stt_result = await asyncio.to_thread(pipeline.run_stt, AudioRequest(audio_path=str(audio_path), language=language))
        transcript = stt_result.transcript

        # Step 2: Chat
        chat_result = await asyncio.to_thread(pipeline.run_chat, ChatRequest(text=transcript, session_id=session_id))

        # Step 3: TTS — speak the response (strip markdown for cleaner audio)
        spoken_text = _strip_markdown(chat_result.response)
        tts_result = await asyncio.to_thread(pipeline.run_tts, TTSRequest(text=spoken_text, voice=voice, output_path=str(tts_path)))

        wav_bytes = Path(tts_result.audio_path).read_bytes()
        return StreamingResponse(
            iter([wav_bytes]),
            media_type="audio/wav",
            headers={
                "X-Transcript": transcript[:500],          # what was heard
                "X-Response-Text": spoken_text[:500],      # what was said
                "X-Mode": chat_result.mode,
                "X-Safety-Level": chat_result.safety_level,
                "X-Duration-Seconds": str(tts_result.duration_seconds),
                "Content-Disposition": "inline; filename=aether_voice.wav",
            },
        )
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        audio_path.unlink(missing_ok=True)
        tts_path.unlink(missing_ok=True)


def _strip_markdown(text: str) -> str:
    """Remove markdown syntax so Kokoro reads cleaner speech."""
    import re
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)   # bold
    text = re.sub(r"\*(.+?)\*", r"\1", text)         # italic
    text = re.sub(r"#{1,6}\s+", "", text)             # headings
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)    # code
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)       # images
    text = re.sub(r"\[(.+?)\]\(.*?\)", r"\1", text)  # links
    text = re.sub(r"^[-*]\s+", "", text, flags=re.MULTILINE)  # bullets
    text = re.sub(r"---+", "", text)                  # hr
    return text.strip()


# ── PDF RAG ───────────────────────────────────────────────────────────────────

@app.post("/rag/upload", tags=["rag"])
async def rag_upload(file: UploadFile = File(...)):
    """
    Ingest a PDF into the in-memory RAG store.
    Pipeline: PDF → PyMuPDF pages → GLM-OCR → chunk → nomic-embed → ChromaDB
    """
    if not (file.content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")):
        raise _http_error(422, "Expected a PDF file")
    suffix = ".pdf"
    pdf_path = await _save_upload(file, suffix)
    try:
        result = await asyncio.to_thread(rag.ingest_pdf, str(pdf_path), file.filename or "document.pdf")
        return result
    except Exception as e:
        raise _http_error(500, str(e))
    finally:
        pdf_path.unlink(missing_ok=True)


@app.get("/rag/documents", tags=["rag"])
async def rag_list():
    """List all ingested documents currently in the RAG store."""
    return {"documents": rag.list_documents()}


@app.delete("/rag/documents/{doc_id}", tags=["rag"])
async def rag_delete(doc_id: str):
    """Remove a document and all its chunks from the RAG store."""
    ok = await asyncio.to_thread(rag.delete_document, doc_id)
    if not ok:
        raise _http_error(404, f"Document {doc_id} not found")
    return {"status": "deleted", "doc_id": doc_id}


class _RagQueryBody(BaseModel):
    text: str
    doc_id: Optional[str] = None
    top_k: int = 3
    session_id: Optional[str] = None


@app.post("/rag/query", tags=["rag"])
async def rag_query(body: _RagQueryBody):
    """
    RAG-augmented chat: embed query → retrieve top-k chunks → Gemma 4 Moonshot.
    Context from the PDF is injected into the prompt automatically.
    """
    if not body.text.strip():
        raise _http_error(422, "text cannot be empty")

    # Retrieve relevant chunks
    retrieval = await asyncio.to_thread(rag.query, body.text, body.top_k, body.doc_id)
    context = retrieval["context"]
    sources = retrieval["sources"]

    if context:
        # Format Gemma 4 fine-tunes reliably follow
        augmented = f"{context}\n\nUser question: {body.text}"
    else:
        augmented = body.text  # no docs yet, fall through to plain chat

    try:
        result = await asyncio.to_thread(
            pipeline.run_chat, ChatRequest(text=augmented, session_id=body.session_id)
        )
        return {
            "response": result.response,
            "model": result.model,
            "mode": result.mode,
            "safety_level": result.safety_level,
            "sources": sources,
            "rag_used": bool(context),
        }
    except Exception as e:
        raise _http_error(500, str(e))


# ── ERROR HANDLERS ────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": f"Internal server error: {str(exc)}"},
    )
