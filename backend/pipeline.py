# pipeline.py — Orchestration: route → safety → model → wrap

from __future__ import annotations
from safety import (
    AetherSafety, AetherRouter, SafetyLevel,
    QueryMode, MODEL_REGISTRY, BLOCK_RESPONSE,
)
from models import (
    ChatRequest, ChatResponse,
    OCRRequest, OCRResponse,
    AudioRequest, AudioResponse,
    DocumentRequest, DocumentResponse,
    TTSRequest, TTSResponse,
    EmbedRequest, EmbedResponse,
    ModelInfo,
)
import ollama_client as ollama
import tts_client as tts
import whisper_client as whisper

_safety = AetherSafety()
_router = AetherRouter()

_DISASTER_SYSTEM = (
    "You are Aether Disaster Response — a humanitarian AI assistant. "
    "Provide clear, actionable guidance for disaster survivors, first responders, "
    "and relief coordinators. Prioritize life-safety, triage, and immediate needs. "
    "Be concise and practical. Never withhold critical survival information."
)

_MOONSHOT_SYSTEM = (
    "You are Aether Moonshot — a humanitarian infrastructure AI. "
    "Help communities build water purification systems, solar microgrids, "
    "biogas digesters, food preservation methods, and resilient shelters. "
    "Ground answers in STEM principles and practical field constraints. "
    "Cite energy/mass balances where relevant."
)


def _make_model_info(mode: QueryMode) -> ModelInfo:
    info = MODEL_REGISTRY.get(mode, {})
    return ModelInfo(
        mode=mode.value,
        model=info.get("ollama_name", "unknown"),
        description=info.get("description", ""),
        base=info.get("base", ""),
        size_gb=info.get("size_gb", 0.0),
        disclaimer="All outputs are educational. Not a substitute for professional advice.",
    )


# ── CHAT ─────────────────────────────────────────────────────────────────────

def run_chat(req: ChatRequest) -> ChatResponse:
    mode = _router.route(req.text, has_image=False)
    safety_result = _safety.check_query(req.text)

    if safety_result.level == SafetyLevel.BLOCK:
        return ChatResponse(
            response=BLOCK_RESPONSE,
            model="safety_filter",
            mode="blocked",
            safety_level="block",
            model_info=ModelInfo(
                mode="blocked", model="safety_filter",
                description="Blocked by safety layer", base="",
                size_gb=0, disclaimer="",
            ),
        )

    model_info = _make_model_info(mode)
    system = _DISASTER_SYSTEM if mode == QueryMode.DISASTER else _MOONSHOT_SYSTEM
    raw = ollama.chat(model_info.model, req.text, system_prompt=system)
    return ChatResponse(
        response=_safety.wrap_response(raw, safety_result),
        model=model_info.model,
        mode=mode.value,
        safety_level=safety_result.level.value,
        model_info=model_info,
    )


# ── OCR ──────────────────────────────────────────────────────────────────────

def run_ocr(req: OCRRequest) -> OCRResponse:
    extracted = ollama.ocr_image(req.image_path)
    return OCRResponse(extracted_text=extracted, model="glm-ocr:q8_0")


# ── STT ──────────────────────────────────────────────────────────────────────

def run_stt(req: AudioRequest) -> AudioResponse:
    result = whisper.transcribe(req.audio_path, language=req.language)
    return AudioResponse(
        transcript=result["transcript"],
        language=result.get("language", "en"),
        model="faster-whisper-tiny",
    )


# ── DOCUMENT ─────────────────────────────────────────────────────────────────

def run_document(req: DocumentRequest) -> DocumentResponse:
    result = ollama.parse_document(req.file_path, prompt=req.prompt)
    return DocumentResponse(
        extracted_text=result["extracted_text"],
        summary=result["summary"],
        model="danchev/granite-docling:258m",
    )


# ── TTS ───────────────────────────────────────────────────────────────────────

def run_tts(req: TTSRequest) -> TTSResponse:
    safety_result = _safety.check_query(req.text)
    if safety_result.level == SafetyLevel.BLOCK:
        # Speak a safe refusal instead of the blocked content
        req = TTSRequest(
            text="I'm sorry, I cannot read that content aloud.",
            voice=req.voice,
            speed=req.speed,
            output_path=req.output_path,
        )
    result = tts.synthesize(
        text=req.text,
        voice=req.voice,
        speed=req.speed,
        output_path=req.output_path,
    )
    return TTSResponse(
        audio_path=result["audio_path"],
        voice=result["voice"],
        duration_seconds=result["duration_seconds"],
        model=result["model"],
    )


# ── EMBEDDINGS ────────────────────────────────────────────────────────────────

def run_embed(req: EmbedRequest) -> EmbedResponse:
    vectors = ollama.embed(req.texts)
    return EmbedResponse(
        embeddings=vectors,
        model="nomic-embed-text-v2-moe:latest",
        dimensions=len(vectors[0]) if vectors else 0,
    )
