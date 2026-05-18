# Gemma ARIA
### Adaptive Resilience Infrastructure Intelligence

> **Offline humanitarian AI — disaster response, medical screening, infrastructure analysis, and multilingual hope — running entirely on consumer hardware. No cloud. No API keys. No internet required.**

Built for the **Gemma 4 Good Hackathon** over 3 weeks of nights and weekends on a single MacBook with Apple Silicon.

---

## The Problem

A field medic in a flood zone. A rural doctor screening for blindness. A disaster coordinator assessing structural damage. An infrastructure engineer sizing a solar microgrid for a village that has never had reliable electricity.

All of them need AI. None of them have reliable internet. The cloud doesn't reach them.

ARIA was built for those people.

---

## What It Does

### 🆘 Disaster Response

Upload any field image — flood, collapsed structure, fire, infrastructure damage. ARIA runs a two-stage vision pipeline:

1. **Qwen3-VL 2B** (Ollama) describes the scene with a system prompt locked to emergency framing — identifies hazards, structural risks, and actionable observations without hedging or breaking scenario
2. The visual description is routed through a **Gemma 4 E2B fine-tune** trained on disaster response protocols, delivering immediate triage guidance with the most critical action first

The system prompt enforces emergency context at both stages: *"You are ARIA, deployed in an active disaster zone. The user is always in a real emergency. Begin with the most critical action."*

Voice input via microphone → **faster-whisper tiny** (CPU, no GPU needed) transcribes to text in real time. Click mic, speak the situation, click again, transcript appears.

### ⚡ Moonshot Infrastructure

The same architecture — Qwen3-VL vision → reasoning model — but routed through **Gemma 4 E4B fine-tuned on humanitarian infrastructure**: water systems, solar microgrids, bridge load analysis, soil contamination assessment, food security logistics.

The E4B model was fine-tuned using a custom dataset pipeline in `training_data/` — chain-of-thought infrastructure reasoning generated from seed scenarios and merged into JSONL training format for Unsloth Q4_K_M fine-tuning.

### 👁️ DR Vision Screening

Diabetic retinopathy grading from retinal fundus images using **llama-cpp-python** with full Apple Metal GPU offload — not Ollama, not transformers, direct GGUF inference:

- Model: `gemma-4-e2b-it.Q4_K_M.gguf` + `gemma-4-e2b-it.BF16-mmproj.gguf`
- Chat handler: `Llava16ChatHandler` (vision-language)
- Any image format (PNG, WEBP, TIFF, HEIC) is normalised to lossless JPEG (`quality=100, subsampling=0`) via PIL before inference — preserving microaneurysm and hard exudate detail that lossy compression destroys
- `repeat_penalty=1.3` prevents the small model from looping on follow-up questions
- Model loads → infers → `del llm; gc.collect()` immediately after — freeing Metal VRAM so Ollama can use it again

Output: DR severity grade (None → Mild NPDR → Moderate NPDR → Severe NPDR → Proliferative DR), key findings, DME assessment, image quality, clinical recommendation.

The frontend renders a severity-coloured clinical card. A purple/gold dark-mode card that looks like a real diagnostic tool — because it is one.

### ✦ Hope

One English prompt. Multiple languages. Generated sequentially (Ollama is single-threaded) with strong language enforcement at both system and user turn levels:

```
System: "You MUST write ONLY in {language}. Do not use English unless {language} is English."
User:   "Write this story in {language} only: {prompt}"
```

Dual enforcement because fine-tuned models follow user-turn instructions more reliably than system prompts alone. Supports 100+ languages via the language selector — not hardcoded outputs, actual multilingual generation from **Gemma 4 E4B Moonshot**.

Default demo selection: English → Japanese → Filipino → Swahili. Four panels, four scripts, one prompt, fully offline.

---

## Architecture

```
Electron (React + Vite + Tailwind)
        │
        ▼
FastAPI Backend  ─── port 8000
        │
        ├── /chat/stream      SSE streaming → safety router → Gemma 4 fine-tunes
        ├── /multimodal       image → Qwen3-VL 2B → Gemma 4 E2B/E4B fine-tune
        ├── /dr               image → PIL normalise → llama-cpp-python GGUF → Metal
        ├── /hope/stream      SSE streaming → Gemma 4 E4B Moonshot multilingual
        ├── /stt              audio → faster-whisper tiny (CPU, int8)
        ├── /embed            text → Nomic Embed Text v2 MoE (Ollama)
        ├── /rag/upload       PDF → PyMuPDF → chunk → Nomic embed → ChromaDB
        ├── /rag/query        query → embed → cosine top-3 → Gemma 4 context injection
        ├── /ocr              image → GLM-OCR (Ollama)
        └── /tts              text → macOS say + ffmpeg → WAV (backend only, not exposed in UI)
```

All inference is local. Zero external API calls at runtime.

---

## Full Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop | Electron 28 + React 18 + Vite | macOS native, `titleBarStyle: hiddenInset` |
| Styling | Tailwind CSS | Dark mode only, `#0a0f1a` background |
| Backend | FastAPI + Uvicorn | SSE streaming, async throughout |
| Disaster fine-tune | Gemma 4 E2B · Unsloth Q4_K_M | Ollama |
| Moonshot fine-tune | Gemma 4 E4B · Unsloth Q4_K_M | Ollama |
| DR vision model | gemma-4-e2b-it Q4_K_M + BF16-mmproj | llama-cpp-python · Metal |
| Image vision | Qwen3-VL 2B | Ollama · 1.9GB |
| Image normalisation | Pillow (PIL) | quality=100 subsampling=0 JPEG |
| STT | faster-whisper tiny | CPU · int8 · MediaRecorder → WAV |
| Embeddings | Nomic Embed Text v2 MoE | Ollama |
| Vector store | ChromaDB | In-memory · resets on restart |
| PDF parsing | PyMuPDF (fitz) | Text extraction, no OCR needed |
| GPU acceleration | Apple Metal (MPS) | llama-cpp-python n_gpu_layers=-1 |
| TTS | macOS `say` + `ffmpeg` | Backend pipeline exists · not wired in UI |
| Safety layer | Custom `AetherRouter` | Query mode detection + safety wrapping |

---

## Models

**Ollama (pull these first):**
```bash
ollama pull sovereignkc/gemma4-disaster:latest
ollama pull sovereignkc/gemma4-e4b-moonshot:latest
ollama pull qwen3-vl:2b
ollama pull nomic-embed-text-v2-moe
```

**DR Vision GGUF (download → place in `/models`):**

**[kaggle.com/datasets/sovereignkc/gemma-4-e2b-vision-gguf-dr-screening]([https://www.kaggle.com/datasets/sovereignkc/gemma-4-e2b-vision-gguf-dr-screening](https://www.kaggle.com/datasets/kevlarzanderchi/unsloth-dr-rfmid-fine-tuned-gemma4-qk4m-dataset))**

- `gemma-4-e2b-it.Q4_K_M.gguf`
- `gemma-4-e2b-it.BF16-mmproj.gguf`

See **[RUN.md](RUN.md)** for the full step-by-step setup guide including llama-cpp-python Metal installation.

---

## Training Data Pipeline

The `training_data/` directory contains everything used to generate the fine-tuning datasets:

- **`infra_cot_seed.jsonl`** — Hand-written seed scenarios for infrastructure chain-of-thought
- **`infra_cot_generated.jsonl`** — Expanded dataset generated from seeds
- **`infra_cot_moonshot.jsonl`** — Moonshot-specific infrastructure scenarios
- **`merged_water_infrastucture_moonshot_output.json`** — Final merged training corpus
- **`generate_dataset.py`** — Dataset generation pipeline
- **`merge_jsons.py`** — Dataset merging and deduplication

Fine-tuning was done with [Unsloth](https://github.com/unslothai/unsloth) for 4-bit quantized LoRA training on consumer hardware.

---

## Download

**[Gemma ARIA v1.0.0 — Apple Silicon (arm64)](https://github.com/sovereignkc/Gemma4-ARIA-/releases/download/v1.0.0/Gemma-ARIA-v1.0.0-arm64.dmg)**

> **macOS Gatekeeper notice:** The app is not notarized (no Apple Developer account). If macOS says "app is damaged", run this once in Terminal then reopen:
> ```bash
> xattr -cr /Applications/Gemma\ ARIA.app
> ```

---

## Running Locally

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev              # browser dev mode
npm run electron:dev     # full Electron desktop app
```

See `RUN.md` for Ollama setup, model paths, and VRAM management notes.

---

## Why This Stack

**Why not use the cloud?** Because the people who need this most don't have it.

**Why Electron + FastAPI instead of a web app?** Local model access, file system permissions for image uploads, mic access without HTTPS, and it ships as a `.dmg` — one double-click install for a field worker who is not a developer.

**Why llama-cpp-python for DR instead of Ollama?** The DR model requires GGUF + multimodal projector loading that Ollama's vision pipeline doesn't support for this specific fine-tuned weight format. llama-cpp-python gives direct control over `Llava16ChatHandler`, context window, and — critically — immediate VRAM release after inference so Ollama gets Metal back.

**Why faster-whisper instead of Web Speech API?** Web Speech API requires internet for non-local engines and flickered unstably in Electron. faster-whisper tiny runs entirely on CPU at int8, handles any audio format ffmpeg touches, and is stable across recording sessions.

**Why sequential generation in Hope instead of parallel?** Ollama is single-threaded — parallel requests queue and timeout. Sequential generation shows one language completing at a time, which is actually a better demo: you watch English finish, then Japanese characters stream in, then Filipino, then Swahili. The progression tells the story.

---

## The Bigger Frame

This is a blueprint, not a product.

Farmers with no internet diagnosing crop disease. Community health workers screening for TB. Engineers sizing water filtration for a village of 300. The same stack — different training data, different domain — covers all of it.

We're releasing the code, the training pipeline, and the architecture so anyone can adapt this for their community. Fork it. Change the fine-tune. Deploy it somewhere the cloud doesn't reach.

---

## License

Apache 2.0 — use it, modify it, deploy it.

If you build something with this for a humanitarian use case, open an issue. We want to know what you made.

---

*Built over 3 weeks on Apple Silicon. One person. Fully offline. Open source.*
