"""
Full multimodal pipeline test — plain Python, no FastAPI yet.
Tests each Ollama model individually, then shows the full pipeline.

Models used:
  gemma4-disaster:latest      -> main disaster/moonshot LLM (text + vision)
  glm-ocr:q8_0               -> OCR for images / scanned docs
  dimavz/whisper-tiny:latest  -> Speech-to-Text (audio files)
  danchew/granite-docling:258m -> PDF document understanding (vision)
  qwen3.5:0.8b               -> fast lightweight text reasoning
  TTS                        -> kokoro-onnx (local, SOTA) or pyttsx3 fallback

Run:
  pip install httpx pillow pymupdf pyttsx3
  Optional SOTA TTS: pip install kokoro-onnx soundfile numpy
  python pipeline_test.py
"""

import base64
import io
import json
import os
import sys
import tempfile
from pathlib import Path

import httpx

OLLAMA = "http://localhost:11434"
TIMEOUT = 120.0

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _b64(path: str | Path) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode()


def _print_section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


# ─────────────────────────────────────────────
# 1. Text Generation — gemma4-disaster
# ─────────────────────────────────────────────

def test_text_generation(prompt: str = "What are the top 3 immediate actions after a flash flood?") -> str:
    _print_section("1. Text Generation (gemma4-disaster)")
    print(f"Prompt: {prompt}\n")

    resp = httpx.post(
        f"{OLLAMA}/api/generate",
        json={"model": "gemma4-disaster:latest", "prompt": prompt, "stream": False},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    result = resp.json()["response"]
    print(result)
    return result


# ─────────────────────────────────────────────
# 2. Image OCR — glm-ocr
# ─────────────────────────────────────────────

def test_ocr_image(image_path: str | Path) -> str:
    _print_section("2. Image OCR (glm-ocr:q8_0)")
    print(f"Image: {image_path}\n")

    resp = httpx.post(
        f"{OLLAMA}/api/generate",
        json={
            "model": "glm-ocr:q8_0",
            "prompt": "Extract all text from this image. Output only the extracted text.",
            "images": [_b64(image_path)],
            "stream": False,
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    result = resp.json()["response"]
    print(result)
    return result


# ─────────────────────────────────────────────
# 3. PDF → Text — granite-docling (page by page as images)
# ─────────────────────────────────────────────

def test_pdf(pdf_path: str | Path, max_pages: int = 3) -> str:
    _print_section("3. PDF Understanding (granite-docling:258m)")
    print(f"PDF: {pdf_path}  (first {max_pages} pages)\n")

    try:
        import fitz  # pymupdf
    except ImportError:
        print("ERROR: install pymupdf:  pip install pymupdf")
        return ""

    doc = fitz.open(str(pdf_path))
    full_text = []

    for page_num in range(min(max_pages, len(doc))):
        page = doc[page_num]
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes("png")
        b64_img = base64.b64encode(png_bytes).decode()

        print(f"  Processing page {page_num + 1}...")
        resp = httpx.post(
            f"{OLLAMA}/api/generate",
            json={
                "model": "danchev/granite-docling:258m",
                "prompt": "Extract and structure all text content from this document page.",
                "images": [b64_img],
                "stream": False,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        page_text = resp.json()["response"]
        full_text.append(f"[Page {page_num + 1}]\n{page_text}")
        print(page_text[:300], "..." if len(page_text) > 300 else "")

    doc.close()
    result = "\n\n".join(full_text)
    return result


# ─────────────────────────────────────────────
# 4. Speech-to-Text — whisper-tiny
# ─────────────────────────────────────────────

def test_stt(audio_path: str | Path) -> str:
    _print_section("4. Speech-to-Text (whisper-tiny)")
    print(f"Audio: {audio_path}\n")

    # Ollama exposes OpenAI-compat transcription endpoint
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    resp = httpx.post(
        f"{OLLAMA}/v1/audio/transcriptions",
        files={"file": (Path(audio_path).name, audio_bytes, "audio/wav")},
        data={"model": "dimavz/whisper-tiny:latest"},
        timeout=TIMEOUT,
    )

    if resp.status_code != 200:
        # Fallback: some Ollama builds use /api/audio/transcriptions
        resp = httpx.post(
            f"{OLLAMA}/api/audio/transcriptions",
            files={"file": (Path(audio_path).name, audio_bytes, "audio/wav")},
            data={"model": "dimavz/whisper-tiny:latest"},
            timeout=TIMEOUT,
        )

    resp.raise_for_status()
    result = resp.json().get("text", resp.text)
    print(result)
    return result


# ─────────────────────────────────────────────
# 5. Multimodal Vision — gemma4-disaster (vision-capable)
#    Falls back to qwen3.5 for text-only follow-up reasoning
# ─────────────────────────────────────────────

def test_multimodal_image(image_path: str | Path, question: str = "Describe what you see and any disaster-related risks.") -> str:
    _print_section("5. Multimodal Vision (gemma4-disaster)")
    print(f"Image: {image_path}")
    print(f"Question: {question}\n")

    # Vision pass with gemma4-disaster
    resp = httpx.post(
        f"{OLLAMA}/api/generate",
        json={
            "model": "gemma4-disaster:latest",
            "prompt": question,
            "images": [_b64(image_path)],
            "stream": False,
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    vision_result = resp.json()["response"]
    print("[Vision output]:", vision_result[:400])

    # Fast reasoning follow-up with qwen3.5
    reasoning_prompt = (
        f"Based on this image analysis:\n{vision_result}\n\n"
        "List 3 concrete emergency response recommendations."
    )
    resp2 = httpx.post(
        f"{OLLAMA}/api/generate",
        json={"model": "qwen3.5:0.8b", "prompt": reasoning_prompt, "stream": False},
        timeout=TIMEOUT,
    )
    resp2.raise_for_status()
    reasoning = resp2.json()["response"]
    print("\n[qwen3.5 recommendations]:", reasoning[:400])

    return vision_result + "\n\nRecommendations:\n" + reasoning


# ─────────────────────────────────────────────
# 6. Text-to-Speech — kokoro-onnx (SOTA local TTS)
#    Falls back to pyttsx3 if kokoro not installed
# ─────────────────────────────────────────────

def test_tts(text: str, output_path: str = "output_tts.wav") -> str:
    _print_section("6. Text-to-Speech")
    print(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}\n")

    # Try kokoro-onnx first (SOTA, pip install kokoro-onnx soundfile)
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
        import numpy as np

        print("Using kokoro-onnx (SOTA local TTS)...")
        kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
        samples, sample_rate = kokoro.create(text, voice="af_bella", speed=1.0, lang="en-us")
        sf.write(output_path, samples, sample_rate)
        print(f"Saved TTS audio -> {output_path}")
        return output_path

    except ImportError:
        pass

    # Try Ollama /api/speech (if server supports it)
    try:
        resp = httpx.post(
            f"{OLLAMA}/api/speech",
            json={"model": "dimavz/whisper-tiny:latest", "input": text, "voice": "alloy"},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            Path(output_path).write_bytes(resp.content)
            print(f"Saved TTS audio via Ollama -> {output_path}")
            return output_path
    except Exception:
        pass

    # Fallback: pyttsx3 (no model needed, works offline, robotic but functional)
    try:
        import pyttsx3
        print("Using pyttsx3 fallback TTS...")
        engine = pyttsx3.init()
        engine.setProperty("rate", 160)
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        print(f"Saved TTS audio -> {output_path}")
        return output_path
    except ImportError:
        print("No TTS available. Install:  pip install kokoro-onnx soundfile  OR  pip install pyttsx3")
        return ""


# ─────────────────────────────────────────────
# 7. Full Pipeline — any input → disaster response + TTS
# ─────────────────────────────────────────────

def run_full_pipeline(
    text_input: str | None = None,
    image_path: str | Path | None = None,
    pdf_path: str | Path | None = None,
    audio_path: str | Path | None = None,
    tts_output: str = "pipeline_response.wav",
) -> dict:
    _print_section("FULL PIPELINE")

    extracted_text_parts = []

    if text_input:
        extracted_text_parts.append(f"[User query]: {text_input}")

    if image_path:
        print(f"  -> Running OCR on image: {image_path}")
        ocr_text = test_ocr_image(image_path)
        extracted_text_parts.append(f"[Image OCR]: {ocr_text}")

    if pdf_path:
        print(f"  -> Processing PDF: {pdf_path}")
        pdf_text = test_pdf(pdf_path)
        extracted_text_parts.append(f"[PDF content]: {pdf_text}")

    if audio_path:
        print(f"  -> Transcribing audio: {audio_path}")
        stt_text = test_stt(audio_path)
        extracted_text_parts.append(f"[Audio transcript]: {stt_text}")

    combined = "\n\n".join(extracted_text_parts)
    if not combined:
        combined = "Summarize emergency preparedness for a hurricane scenario."

    # Main model response
    print("\n  -> Sending to gemma4-disaster...")
    final_prompt = (
        f"You are a disaster response expert. Based on the following input, "
        f"provide a structured emergency response plan:\n\n{combined}"
    )
    resp = httpx.post(
        f"{OLLAMA}/api/generate",
        json={"model": "gemma4-disaster:latest", "prompt": final_prompt, "stream": False},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    response_text = resp.json()["response"]
    print("\n[Disaster Response]:\n", response_text[:600])

    # TTS of the response
    tts_path = test_tts(response_text[:500], tts_output)

    return {
        "input_combined": combined,
        "response": response_text,
        "tts_output": tts_path,
    }


# ─────────────────────────────────────────────
# Main — run all individual tests
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Multimodal pipeline tester")
    parser.add_argument("--text", default=None, help="Text prompt to test")
    parser.add_argument("--image", default=None, help="Image file path")
    parser.add_argument("--pdf", default=None, help="PDF file path")
    parser.add_argument("--audio", default=None, help="Audio file path (.wav/.mp3)")
    parser.add_argument("--all-individual", action="store_true", help="Run all individual model tests")
    parser.add_argument("--pipeline", action="store_true", help="Run full pipeline")
    args = parser.parse_args()

    sample_image = Path("models/images/640.png")

    if args.all_individual or not any([args.text, args.image, args.pdf, args.audio, args.pipeline]):
        # Run each test that has available inputs
        test_text_generation(args.text or "List 5 warning signs of an imminent flash flood.")

        if args.image or sample_image.exists():
            test_ocr_image(args.image or sample_image)
            test_multimodal_image(args.image or sample_image)

        if args.pdf:
            test_pdf(args.pdf)

        if args.audio:
            test_stt(args.audio)

        test_tts("Flash flood warning issued. Evacuate immediately to higher ground.")

    elif args.pipeline:
        run_full_pipeline(
            text_input=args.text,
            image_path=args.image,
            pdf_path=args.pdf,
            audio_path=args.audio,
        )

    elif args.text:
        test_text_generation(args.text)

    elif args.image:
        test_ocr_image(args.image)
        test_multimodal_image(args.image)

    elif args.pdf:
        test_pdf(args.pdf)

    elif args.audio:
        test_stt(args.audio)
