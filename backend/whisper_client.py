# whisper_client.py — Local STT via faster-whisper (CTranslate2, CPU/MPS, no Ollama needed)
# dimavz/whisper-tiny in Ollama has a corrupted blob — this is the drop-in replacement.
# Model is cached after first load (~39 MB for tiny).

from __future__ import annotations
import threading
from typing import Optional

_lock = threading.Lock()
_model = None

def _get_model(model_size: str = "tiny"):
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel
            _model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _model


def transcribe(audio_path: str, language: Optional[str] = None, model_size: str = "tiny") -> dict:
    """
    Transcribe audio file using faster-whisper (Whisper tiny, int8 quantized).
    Returns {"transcript": str, "language": str, "segments": [...]}
    Supports: mp3, wav, webm, ogg, m4a — anything ffmpeg handles.
    """
    model = _get_model(model_size)
    kwargs: dict = {"beam_size": 5}
    if language:
        kwargs["language"] = language

    segments, info = model.transcribe(audio_path, **kwargs)
    segment_list = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
        segment_list.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})

    return {
        "transcript": " ".join(text_parts),
        "language": language or info.language,
        "segments": segment_list,
    }
