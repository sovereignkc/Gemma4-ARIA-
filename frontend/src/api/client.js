// client.js — All fetch() calls to the FastAPI backend.
// React never touches models directly — only this file.

const BASE = 'http://localhost:8000'

async function _json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

// ── Status ────────────────────────────────────────────────────────────────────

export const getStatus = () =>
  fetch(`${BASE}/status`).then(_json)

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chat = (text, sessionId) =>
  fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, session_id: sessionId }),
  }).then(_json)

// SSE streaming — returns an EventSource-compatible reader via fetch + ReadableStream
export function chatStream(text, sessionId, onToken, onDone, onError, onThinking) {
  const controller = new AbortController()

  fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, session_id: sessionId }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) { onError(new Error(res.statusText)); return }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)
        if (raw === '[DONE]') { onDone(); return }
        if (raw === '[THINKING]') { onThinking?.(); continue }
        if (raw.startsWith('[ERROR]')) { onError(new Error(raw.slice(7))); return }
        if (raw.startsWith('[META]')) {
          try { onDone(JSON.parse(raw.slice(6))) } catch { onDone() }
          return
        }
        // Tokens are JSON-encoded strings to survive embedded newlines in markdown
        try { onToken(JSON.parse(raw)) } catch { onToken(raw) }
      }
    }
  }).catch((err) => { if (err.name !== 'AbortError') onError(err) })

  return () => controller.abort()
}

// ── OCR ───────────────────────────────────────────────────────────────────────

export const ocr = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/ocr`, { method: 'POST', body: fd }).then(_json)
}

// ── STT ───────────────────────────────────────────────────────────────────────

export const stt = (file, language) => {
  const fd = new FormData()
  fd.append('file', file)
  if (language) fd.append('language', language)
  return fetch(`${BASE}/stt`, { method: 'POST', body: fd }).then(_json)
}

// ── Document ──────────────────────────────────────────────────────────────────

export const parseDocument = (file, prompt) => {
  const fd = new FormData()
  fd.append('file', file)
  if (prompt) fd.append('prompt', prompt)
  return fetch(`${BASE}/document`, { method: 'POST', body: fd }).then(_json)
}

// ── TTS ───────────────────────────────────────────────────────────────────────

export const textToSpeech = async (text, voice = 'af_heart', speed = 1.0) => {
  const fd = new FormData()
  fd.append('text', text)
  fd.append('voice', voice)
  fd.append('speed', String(speed))
  const res = await fetch(`${BASE}/tts`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error((await res.json()).detail)
  const blob = await res.blob()
  return {
    url: URL.createObjectURL(blob),
    duration: parseFloat(res.headers.get('X-Duration-Seconds') || '0'),
    voice: res.headers.get('X-Voice'),
    model: res.headers.get('X-Model'),
  }
}

export const getTTSVoices = () =>
  fetch(`${BASE}/tts/voices`).then(_json).then((d) => d.voices)

// ── Multimodal ────────────────────────────────────────────────────────────────

export const multimodal = (file, question, model = 'disaster', sessionId) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('question', question)
  fd.append('model', model)
  if (sessionId) fd.append('session_id', sessionId)
  return fetch(`${BASE}/multimodal`, { method: 'POST', body: fd }).then(_json)
}

// ── DR / Diabetes Retinopathy Screening ───────────────────────────────────────

export const drScreen = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/dr`, { method: 'POST', body: fd }).then(_json)
}

// ── Voice pipeline (STT → chat → TTS) ────────────────────────────────────────

export const voiceChat = async (file, voice = 'af_heart', language) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('voice', voice)
  if (language) fd.append('language', language)
  const res = await fetch(`${BASE}/voice`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error((await res.json()).detail)
  const blob = await res.blob()
  return {
    url:        URL.createObjectURL(blob),
    transcript: res.headers.get('X-Transcript') || '',
    response:   res.headers.get('X-Response-Text') || '',
    mode:       res.headers.get('X-Mode') || '',
    safety:     res.headers.get('X-Safety-Level') || '',
    duration:   parseFloat(res.headers.get('X-Duration-Seconds') || '0'),
  }
}

// ── Live scene — Step 1: SmolVLM2 patches only (fast, every frame) ───────────

export const livePatches = (frameBlob, prevFrameBlob, nPatches = 3) => {
  const fd = new FormData()
  fd.append('frame', frameBlob, 'frame.jpg')
  if (prevFrameBlob) fd.append('prev_frame', prevFrameBlob, 'prev_frame.jpg')
  fd.append('n_patches', String(nPatches))
  return fetch(`${BASE}/live/patches`, { method: 'POST', body: fd }).then(_json)
}

// ── Live scene — Step 2: Gemma 4 Disaster synthesis (on demand) ──────────────

export const liveSynthesize = (patchDescriptions, question, sessionId) =>
  fetch(`${BASE}/live/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch_descriptions: patchDescriptions, question, session_id: sessionId }),
  }).then(_json)

// ── RAG ───────────────────────────────────────────────────────────────────────

export const ragUpload = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/rag/upload`, { method: 'POST', body: fd }).then(_json)
}

export const ragDocuments = () =>
  fetch(`${BASE}/rag/documents`).then(_json).then((d) => d.documents)

export const ragDelete = (docId) =>
  fetch(`${BASE}/rag/documents/${docId}`, { method: 'DELETE' }).then(_json)

export const ragQuery = (text, docId, topK = 3, sessionId) =>
  fetch(`${BASE}/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, doc_id: docId || null, top_k: topK, session_id: sessionId }),
  }).then(_json)

// ── Embeddings ────────────────────────────────────────────────────────────────

export const embed = (texts) =>
  fetch(`${BASE}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  }).then(_json)

// ── Cosine similarity (client-side for RAG ranking) ───────────────────────────

export function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
