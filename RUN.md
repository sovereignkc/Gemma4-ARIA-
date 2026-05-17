# Run Commands

## Backend
```bash
cd backend && ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

## Frontend
```bash
cd frontend && npm run dev
```

## Both (split terminals)
Terminal 1 — backend:
```bash
cd /Users/kc/Gemma4InspirationSolveDROptimalSight_Disaster_Climate_MoonshotFoodWaterElectricityGen/backend && ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2 — frontend:
```bash
cd /Users/kc/Gemma4InspirationSolveDROptimalSight_Disaster_Climate_MoonshotFoodWaterElectricityGen/frontend && npm run dev
```

Then open: http://localhost:5173

## Prerequisites
- Ollama running: `ollama serve`
- Models pulled: `ollama list` (should show gemma4-disaster, gemma4-e4b-moonshot, glm-ocr:q8_0, ahmadwaqar/smolvlm2-256m-video:q8_0, dimavz/whisper-tiny, nomic-embed-text-v2-moe)
