# tts_client.py — macOS `say` TTS (built-in, zero deps, genuinely multilingual)
#
# Uses macOS say command → AIFF → WAV via afconvert.
# Voices are native macOS voices — no model download needed.
# Language is selected by picking the right voice.

from __future__ import annotations
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

# voice → (say_voice_name, language_label)
VOICE_MAP = {
    "samantha":  ("Samantha",  "English (US)"),
    "thomas":    ("Thomas",    "French"),
    "monica":    ("Mónica",    "Spanish"),
    "majed":     ("Majed",     "Arabic"),
    "lekha":     ("Lekha",     "Hindi"),
    "luciana":   ("Luciana",   "Portuguese (BR)"),
    "joana":     ("Joana",     "Portuguese (PT)"),
    "kyoko":     ("Kyoko",     "Japanese"),
    "yuna":      ("Yuna",      "Korean"),
    "sinji":     ("Sinji",     "Chinese"),
}

# Language name → voice id (for HopeTab language selector)
LANG_VOICE = {
    "English":       "samantha",
    "French":        "thomas",
    "Spanish":       "monica",
    "Arabic":        "majed",
    "Hindi":         "lekha",
    "Portuguese":    "luciana",
    "Japanese":      "kyoko",
    "Korean":        "yuna",
    "Chinese":       "sinji",
}


def synthesize(
    text: str,
    voice: str = "samantha",
    speed: float = 1.0,
    output_path: Optional[str] = None,
    lang: str = "en-us",   # unused — kept for API compat
) -> dict:
    """
    Convert text to speech using macOS `say`.
    Returns {"audio_path": str, "voice": str, "duration_seconds": float, "model": str}
    """
    say_voice = VOICE_MAP.get(voice, ("Samantha", "English"))[0]

    if output_path is None:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        output_path = tmp.name
        tmp.close()

    # say → AIFF, afconvert → WAV (16-bit PCM, 22050 Hz — small and web-compatible)
    aiff_path = output_path.replace(".wav", ".aiff")
    rate_arg = str(int(200 * speed))  # say uses words-per-minute; 200 ≈ normal

    t0 = time.time()
    subprocess.run(
        ["say", "-v", say_voice, "-r", rate_arg, "-o", aiff_path, text],
        check=True, capture_output=True,
    )
    # ffmpeg strips Apple's non-standard FLLR padding chunk that browsers reject
    subprocess.run(
        ["ffmpeg", "-y", "-i", aiff_path, "-ar", "22050", "-ac", "1",
         "-c:a", "pcm_s16le", output_path],
        check=True, capture_output=True,
    )
    Path(aiff_path).unlink(missing_ok=True)

    duration = Path(output_path).stat().st_size / (22050 * 2)  # 16-bit mono estimate
    elapsed = time.time() - t0

    return {
        "audio_path": output_path,
        "voice": voice,
        "duration_seconds": round(duration, 2),
        "rtf": round(elapsed / max(duration, 0.001), 3),
        "model": "macos-say",
    }


def available_voices() -> list[str]:
    return list(VOICE_MAP.keys())
