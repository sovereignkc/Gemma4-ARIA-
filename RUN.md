# Gemma ARIA — Setup & Run Guide

**Requirements:** macOS with Apple Silicon (M1/M2/M3), 16GB RAM minimum, ~15GB free disk space.

---

## Step 1 — Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

Then pull the required models:

```bash
# Vision model (image analysis)
ollama pull qwen3-vl:2b

# Embeddings (for document RAG)
ollama pull nomic-embed-text-v2-moe

# Humanitarian fine-tunes (from Ollama registry)
ollama pull sovereignkc/gemma4-disaster:latest
ollama pull sovereignkc/gemma4-e4b-moonshot:latest
```

---

## Step 2 — Download DR Vision Models (GGUF)

The diabetic retinopathy screening models are hosted on Kaggle:

**[kaggle.com/datasets/sovereignkc/gemma-4-e2b-vision-gguf-dr-screening](https://www.kaggle.com/datasets/sovereignkc/gemma-4-e2b-vision-gguf-dr-screening)**

Download both files and place them in the `/models` directory:

```
Gemma4-ARIA-/
└── models/
    ├── gemma-4-e2b-it.Q4_K_M.gguf       ← download from Kaggle
    └── gemma-4-e2b-it.BF16-mmproj.gguf  ← download from Kaggle
```

---

## Step 3 — Python Backend

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install llama-cpp-python with Apple Metal support
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
```

---

## Step 4 — Run

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend (dev mode):**
```bash
cd frontend
npm install
npm run dev
```

Or open the `.dmg` from [Releases](https://github.com/sovereignkc/Gemma4-ARIA-/releases) — just keep the backend terminal running.

---

## macOS "App is damaged" fix

If Gatekeeper blocks the `.dmg` app:

```bash
xattr -cr /Applications/Gemma\ ARIA.app
```

---

## Verify everything is working

```bash
# Backend health check
curl http://localhost:8000/health

# Should return: {"status": "ok", "ollama": true, ...}
```

Green dot in the top-right of the app = Ollama connected and ready.

---

## Model Summary

| Model | Source | Size | Used for |
|-------|--------|------|---------|
| `sovereignkc/gemma4-disaster` | Ollama | 3.4GB | Disaster response reasoning |
| `sovereignkc/gemma4-e4b-moonshot` | Ollama | 5.3GB | Infrastructure analysis + Hope |
| `qwen3-vl:2b` | Ollama | 1.9GB | Image vision |
| `nomic-embed-text-v2-moe` | Ollama | 957MB | Document embeddings |
| `gemma-4-e2b-it.Q4_K_M.gguf` | Kaggle | ~2GB | DR screening (llama-cpp) |
| `gemma-4-e2b-it.BF16-mmproj.gguf` | Kaggle | ~300MB | DR vision projector |
