# Gemma ARIA
### Adaptive Resilience Infrastructure Intelligence

> **Gemma ARIA is not just an app. It's proof that offline humanitarian AI is buildable today — by one person, on consumer hardware, with open source tools.**

Built for the **Gemma 4 Good Hackathon**. Every model runs locally. No cloud. No API keys. No internet required in the field.

---

## What It Does

ARIA is a desktop AI assistant for humanitarian workers, field doctors, and disaster responders. Three modes, one mission:

### 🆘 Disaster Response
Upload a photo of a flood, collapsed building, or emergency scene. ARIA analyzes it with Qwen3-VL vision, routes through a Gemma 4 E2B fine-tune trained on disaster response protocols, and delivers immediate triage guidance. Built for the reality that the person holding the phone may be the only trained responder for miles.

### ⚡ Moonshot Infrastructure
Ask anything about water systems, solar microgrids, bridge load capacity, soil contamination, food security. The Gemma 4 E4B Moonshot fine-tune was trained on infrastructure engineering and humanitarian logistics data. Same stack as Disaster — different training data, different domain expertise.

### 👁️ DR Vision Screening
Upload a retinal fundus image. ARIA runs diabetic retinopathy grading using `gemma-4-e2b-it.Q4_K_M.gguf` + `BF16-mmproj.gguf` via llama-cpp-python with full Metal GPU offload. Grades severity (None → Proliferative DR), identifies microaneurysms, hemorrhages, hard exudates, and gives a clinical recommendation. Built for clinics with no ophthalmologist within 200 miles.

### ✦ Hope
One prompt, multiple languages, simultaneously. Type a vision for better living conditions and watch it generate in English, Japanese, Filipino, Swahili — and 100+ other languages. For communities that have never seen AI speak their language.

---

## The Stack

| Component | Technology |
|-----------|------------|
| Desktop app | Electron + React + Vite + Tailwind CSS |
| Backend | FastAPI (Python) |
| Disaster fine-tune | Gemma 4 E2B · Unsloth Q4_K_M · Ollama |
| Moonshot fine-tune | Gemma 4 E4B · Unsloth Q4_K_M · Ollama |
| DR vision | gemma-4-e2b-it Q4_K_M + BF16-mmproj · llama-cpp-python · Metal |
| Image vision | Qwen3-VL 2B · Ollama |
| Speech-to-text | faster-whisper tiny · CPU |
| Embeddings | Nomic Embed v2 MoE · Ollama |
| GPU acceleration | Apple Metal (MPS) |

**Hardware tested on:** MacBook with Apple Silicon. 16GB RAM minimum. Models total ~8GB.

---

## Why This Matters

A farmer with no internet asking about crop disease. A field medic screening for diabetic retinopathy with a phone and a fundus lens. A disaster coordinator who needs structural damage assessment in 30 seconds, not 30 minutes waiting for a satellite uplink.

These people exist. They need this. The cloud doesn't reach them.

We're releasing everything — code, training data pipeline, fine-tuning scripts — so anyone can adapt this for their community. Swap the training data for your domain. Swap the language. The architecture holds.

**This is a blueprint, not a product.**

---

## Models Required

Download separately (not included in repo due to size):

```
# Ollama models
ollama pull gemma4-disaster:latest        # Gemma 4 E2B disaster fine-tune
ollama pull gemma4-e4b-moonshot:latest    # Gemma 4 E4B infrastructure fine-tune
ollama pull qwen3-vl:2b                   # Vision model
ollama pull nomic-embed-text-v2-moe       # Embeddings
ollama pull dimavz/whisper-tiny           # STT fallback

# GGUF models (place in /models directory)
gemma-4-e2b-it.Q4_K_M.gguf              # DR vision model
gemma-4-e2b-it.BF16-mmproj.gguf         # DR vision projector
```

---

## Running Locally

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # development
npm run electron:dev # Electron desktop app
```

See `RUN.md` for full setup including Ollama configuration and model paths.

---

## Training Data

The `training_data/` directory contains the pipeline used to generate fine-tuning datasets:

- `infra_cot_generated.jsonl` — Infrastructure chain-of-thought reasoning
- `infra_cot_moonshot.jsonl` — Moonshot infrastructure scenarios
- `generate_dataset.py` — Dataset generation pipeline
- `merge_jsons.py` — Dataset merging utilities

Fine-tuning was done with [Unsloth](https://github.com/unslothai/unsloth) for 4-bit quantized training on consumer hardware.

---

## Architecture

```
User (Electron UI)
        │
        ▼
FastAPI Backend (port 8000)
        │
        ├── /multimodal  → Qwen3-VL 2B (vision) → Gemma 4 fine-tune (reasoning)
        ├── /dr          → llama-cpp-python → gemma-4-e2b Q4_K_M + BF16-mmproj
        ├── /chat/stream → Gemma 4 fine-tune (SSE streaming)
        ├── /hope/stream → Gemma 4 E4B Moonshot (multilingual)
        ├── /stt         → faster-whisper tiny
        └── /embed       → Nomic Embed v2 MoE
```

All inference is local. The backend never calls an external API.

---

## License

Apache 2.0 — fork it, adapt it, deploy it for your community.

If you build something with this for a humanitarian use case, open a PR or open an issue. We want to know.

---

*Built in 72 hours for the Gemma 4 Good Hackathon.*
*One person. One MacBook. Fully offline. Open source.*
