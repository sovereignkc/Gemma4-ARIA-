# models.py — Pydantic schemas for all Aether request/response types

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


class ChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8192)
    session_id: Optional[str] = None


class OCRRequest(BaseModel):
    image_path: str          # local path to image file
    session_id: Optional[str] = None


class AudioRequest(BaseModel):
    audio_path: str          # local .wav/.mp3 path
    language: Optional[str] = None   # e.g. "en", "tl", "fr" — None = auto-detect


class DocumentRequest(BaseModel):
    file_path: str
    prompt: str = "Extract and summarize all text from this document."


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    voice: str = "af_heart"          # Kokoro voice id
    speed: float = 1.0
    output_path: Optional[str] = None  # if None, returns bytes in response


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_items=1)


class ModelInfo(BaseModel):
    mode: str
    model: str
    description: str
    base: str
    size_gb: float
    disclaimer: str


class ChatResponse(BaseModel):
    response: str
    model: str
    mode: str
    safety_level: str
    model_info: ModelInfo


class OCRResponse(BaseModel):
    extracted_text: str
    model: str


class AudioResponse(BaseModel):
    transcript: str
    language: Optional[str]
    model: str


class DocumentResponse(BaseModel):
    extracted_text: str
    summary: str
    model: str


class TTSResponse(BaseModel):
    audio_path: str          # path to generated .wav file
    voice: str
    duration_seconds: Optional[float]
    model: str


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int
