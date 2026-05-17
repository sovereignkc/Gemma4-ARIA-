# test_api.py — FastAPI endpoint tests (TestClient, no live Ollama/TTS needed)
# Run: python test_api.py

from __future__ import annotations
import io
import sys
import json
import traceback
from unittest.mock import patch, MagicMock

# Patch heavy imports before FastAPI loads them
sys.modules.setdefault("kokoro", MagicMock())
sys.modules.setdefault("soundfile", MagicMock())

from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=False)

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results: list[tuple[str, bool]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    _results.append((name, condition))


def section(title: str) -> None:
    print(f"\n{'═' * 60}\n  {title}\n{'═' * 60}")


# ── /status ───────────────────────────────────────────────────────────────────

def test_status():
    section("/status — health check")
    with patch("main.ollama.list_models", return_value=[
        "gemma4-disaster:latest", "gemma4-e4b-moonshot:latest",
        "glm-ocr:q8_0", "dimavz/whisper-tiny:latest",
        "danchev/granite-docling:258m", "nomic-embed-text-v2-moe:latest",
    ]):
        r = client.get("/status")
        check("200 OK", r.status_code == 200)
        data = r.json()
        check("status field present", "status" in data)
        check("ollama_running True", data["ollama_running"] is True)
        check("models_missing empty when all present", data["models_missing"] == [])
        check("tts_voices list present", isinstance(data["tts_voices"], list))

    with patch("main.ollama.list_models", side_effect=Exception("connection refused")):
        r = client.get("/status")
        check("degraded when Ollama down", r.json()["status"] == "degraded")
        check("ollama_running False", r.json()["ollama_running"] is False)


# ── /chat ─────────────────────────────────────────────────────────────────────

def test_chat():
    section("/chat — text routing")
    mock_resp = "Boil water for 1 minute then add 2 chlorine tablets per litre."

    with patch("pipeline.ollama.chat", return_value=mock_resp):
        r = client.post("/chat", json={"text": "How do I purify flood water with chlorine?"})
        check("200 OK", r.status_code == 200)
        data = r.json()
        check("response field present", "response" in data)
        check("mode is moonshot", data["mode"] == "moonshot")
        check("safety_level present", "safety_level" in data)
        check("model_info present", "model_info" in data)
        check("model_info has size_gb", data["model_info"]["size_gb"] > 0)

    # Blocked query
    r = client.post("/chat", json={"text": "Give me 500mg morphine for a child"})
    check("blocked returns 200 with BLOCK_RESPONSE", r.status_code == 200)
    check("blocked mode field", r.json()["mode"] == "blocked")
    check("cannot help in response", "cannot help" in r.json()["response"].lower())

    # Empty text → 422
    r = client.post("/chat", json={"text": ""})
    check("empty text → 422", r.status_code == 422)


# ── /chat/stream ──────────────────────────────────────────────────────────────

def test_chat_stream():
    section("/chat/stream — SSE streaming")
    mock_resp = "Use clean water and oral rehydration salts."

    with patch("pipeline.ollama.chat", return_value=mock_resp):
        r = client.post("/chat/stream", json={"text": "How do we treat cholera in the field?"})
        check("200 OK", r.status_code == 200)
        check("content-type is event-stream", "text/event-stream" in r.headers.get("content-type", ""))
        body = r.text
        check("data: chunks present", "data: " in body)
        check("[DONE] sentinel present", "data: [DONE]" in body)
        # Reassemble streamed tokens — disclaimer may be prepended (cholera = medical warn)
        # Response includes medical disclaimer prefix — verify a distinctive word from the mock appears
        check("stream body contains mock response word", "rehydration" in body)


# ── /ocr ──────────────────────────────────────────────────────────────────────

def test_ocr():
    section("/ocr — image text extraction")
    with patch("pipeline.ollama.ocr_image", return_value="UNHCR Camp Alpha\nDate: 2026-05-13"):
        fake_image = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        r = client.post("/ocr", files={"file": ("test.png", fake_image, "image/png")})
        check("200 OK", r.status_code == 200)
        check("extracted_text present", "UNHCR" in r.json()["extracted_text"])
        check("model field present", "model" in r.json())

    # Wrong content type
    r = client.post("/ocr", files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")})
    check("non-image → 422", r.status_code == 422)


# ── /stt ──────────────────────────────────────────────────────────────────────

def test_stt():
    section("/stt — speech to text")
    with patch("pipeline.ollama.transcribe",
               return_value={"transcript": "50 survivors near the bridge.", "language": "en"}):
        fake_audio = io.BytesIO(b"RIFF" + b"\x00" * 44)
        r = client.post("/stt", files={"file": ("audio.wav", fake_audio, "audio/wav")})
        check("200 OK", r.status_code == 200)
        check("transcript present", "survivors" in r.json()["transcript"])
        check("language detected", r.json()["language"] == "en")

    # With explicit language form field
    with patch("pipeline.ollama.transcribe",
               return_value={"transcript": "Narito ang mga survivor.", "language": "tl"}):
        r = client.post("/stt",
            files={"file": ("audio.wav", io.BytesIO(b"RIFF" + b"\x00" * 44), "audio/wav")},
            data={"language": "tl"},
        )
        check("language param passed through", r.json()["language"] == "tl")

    # Wrong content type
    r = client.post("/stt", files={"file": ("img.jpg", io.BytesIO(b"\xff\xd8"), "image/jpeg")})
    check("non-audio → 422", r.status_code == 422)


# ── /document ─────────────────────────────────────────────────────────────────

def test_document():
    section("/document — PDF parsing")
    with patch("pipeline.ollama.parse_document", return_value={
        "extracted_text": "UNHCR Shelter Assessment — Camp Alpha",
        "summary": "Assessment covers 1,200 displaced persons.",
    }):
        fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
        r = client.post("/document", files={"file": ("report.pdf", fake_pdf, "application/pdf")})
        check("200 OK", r.status_code == 200)
        check("extracted_text present", "UNHCR" in r.json()["extracted_text"])
        check("summary present", "displaced" in r.json()["summary"])


# ── /tts ──────────────────────────────────────────────────────────────────────

def test_tts():
    section("/tts — text to speech")
    import numpy as np
    import soundfile as real_sf

    fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00" + b"\x00" * 28

    mock_tts_result = {
        "audio_path": "/tmp/fake_tts.wav",
        "voice": "af_heart",
        "duration_seconds": 2.5,
        "rtf": 0.1,
        "model": "kokoro-82m",
    }

    with patch("pipeline.tts.synthesize", return_value=mock_tts_result), \
         patch("pathlib.Path.read_bytes", return_value=fake_wav):
        r = client.post("/tts", data={"text": "Boil water before drinking.", "voice": "af_heart"})
        check("200 OK", r.status_code == 200)
        check("content-type is audio/wav", r.headers.get("content-type") == "audio/wav")
        check("X-Duration-Seconds header set", "X-Duration-Seconds" in r.headers)
        check("X-Voice header set", r.headers.get("X-Voice") == "af_heart")

    # Invalid voice
    r = client.post("/tts", data={"text": "Hello", "voice": "invalid_voice"})
    check("unknown voice → 422", r.status_code == 422)

    # Speed out of range
    r = client.post("/tts", data={"text": "Hello", "voice": "af_heart", "speed": "99"})
    check("speed out of range → 422", r.status_code == 422)


# ── /tts/voices ───────────────────────────────────────────────────────────────

def test_tts_voices():
    section("/tts/voices — list voices")
    r = client.get("/tts/voices")
    check("200 OK", r.status_code == 200)
    check("voices list present", isinstance(r.json()["voices"], list))
    check("af_heart in list", "af_heart" in r.json()["voices"])


# ── /embed ────────────────────────────────────────────────────────────────────

def test_embed():
    section("/embed — text embeddings")
    mock_vecs = [[0.1] * 768, [0.2] * 768]

    with patch("pipeline.ollama.embed", return_value=mock_vecs):
        r = client.post("/embed", json={"texts": ["flood shelter", "water purification"]})
        check("200 OK", r.status_code == 200)
        data = r.json()
        check("embeddings list returned", len(data["embeddings"]) == 2)
        check("dimensions field", data["dimensions"] == 768)
        check("model field", "nomic" in data["model"])

    # Empty list → 422
    r = client.post("/embed", json={"texts": []})
    check("empty texts → 422", r.status_code == 422)

    # Too many texts → 422
    r = client.post("/embed", json={"texts": ["x"] * 65})
    check("65 texts → 422", r.status_code == 422)


# ── /multimodal ───────────────────────────────────────────────────────────────

def test_multimodal():
    section("/multimodal — image + question → chat")
    with patch("pipeline.ollama.ocr_image", return_value="Damaged bridge, water level 3m"), \
         patch("pipeline.ollama.chat", return_value="Evacuate via northern route immediately."):
        r = client.post("/multimodal",
            files={"file": ("scene.jpg", io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 50), "image/jpeg")},
            data={"question": "Is this area safe to cross?"},
        )
        check("200 OK", r.status_code == 200)
        data = r.json()
        check("ocr_text present", "bridge" in data["ocr_text"])
        check("response present", "Evacuate" in data["response"])
        check("mode field present", "mode" in data)
        check("safety_level field present", "safety_level" in data)

    # Non-image file → 422
    r = client.post("/multimodal",
        files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        data={"question": "What is this?"},
    )
    check("non-image → 422", r.status_code == 422)


# ── /voice ────────────────────────────────────────────────────────────────────

def test_voice():
    section("/voice — full voice pipeline (STT → chat → TTS)")
    fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 36

    mock_tts_result = {
        "audio_path": "/tmp/voice_out.wav",
        "voice": "af_heart",
        "duration_seconds": 3.1,
        "rtf": 0.09,
        "model": "kokoro-82m",
    }

    with patch("pipeline.ollama.transcribe",
               return_value={"transcript": "How do we build a biogas digester?", "language": "en"}), \
         patch("pipeline.ollama.chat", return_value="A biogas digester needs an inlet, digestion chamber, and gas outlet."), \
         patch("pipeline.tts.synthesize", return_value=mock_tts_result), \
         patch("pathlib.Path.read_bytes", return_value=fake_wav):
        r = client.post("/voice",
            files={"file": ("question.wav", io.BytesIO(b"RIFF" + b"\x00" * 44), "audio/wav")},
            data={"voice": "af_heart"},
        )
        check("200 OK", r.status_code == 200)
        check("content-type is audio/wav", r.headers.get("content-type") == "audio/wav")
        check("X-Transcript header set", "X-Transcript" in r.headers)
        check("transcript is what was spoken", "biogas" in r.headers.get("X-Transcript", ""))
        check("X-Mode header set", "X-Mode" in r.headers)

    # Non-audio file → 422
    r = client.post("/voice",
        files={"file": ("img.jpg", io.BytesIO(b"\xff\xd8"), "image/jpeg")},
        data={"voice": "af_heart"},
    )
    check("non-audio → 422", r.status_code == 422)

    # Invalid voice → 422
    r = client.post("/voice",
        files={"file": ("a.wav", io.BytesIO(b"RIFF" + b"\x00" * 44), "audio/wav")},
        data={"voice": "bad_voice"},
    )
    check("invalid voice → 422", r.status_code == 422)


# ── _strip_markdown ───────────────────────────────────────────────────────────

def test_strip_markdown():
    section("_strip_markdown — clean text for TTS")
    from main import _strip_markdown
    cases = [
        ("**bold text**",          "bold text"),
        ("*italic*",               "italic"),
        ("## Heading",             "Heading"),
        ("`code`",                 ""),
        ("[link](http://x.com)",   "link"),
        ("- bullet point",         "bullet point"),
    ]
    for raw, expected in cases:
        result = _strip_markdown(raw)
        check(f"strip: {raw!r}", result == expected, f"got {result!r}")


# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "═" * 60)
    print("  AETHER FastAPI TEST SUITE")
    print("═" * 60)

    tests = [
        test_status,
        test_chat,
        test_chat_stream,
        test_ocr,
        test_stt,
        test_document,
        test_tts,
        test_tts_voices,
        test_embed,
        test_multimodal,
        test_voice,
        test_strip_markdown,
    ]

    for t in tests:
        try:
            t()
        except Exception:
            print(f"\n  [{FAIL}] {t.__name__} raised exception:")
            traceback.print_exc()
            _results.append((t.__name__, False))

    total  = len(_results)
    passed = sum(1 for _, ok in _results if ok)
    failed = total - passed

    print(f"\n{'═' * 60}")
    print(f"  RESULTS: {passed}/{total} passed", end="")
    if failed:
        print(f"  |  {failed} FAILED:")
        for name, ok in _results:
            if not ok:
                print(f"    ✗ {name}")
    else:
        print("  — all green ✓")
    print("═" * 60 + "\n")
    sys.exit(0 if failed == 0 else 1)
