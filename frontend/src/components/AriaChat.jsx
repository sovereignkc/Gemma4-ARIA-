/**
 * AriaChat — Gemma ARIA Field AI
 *
 * Three modes:
 *   Disaster Response   → gemma4-disaster:latest  (Unsloth Q4_K_M)
 *   Moonshot Infra      → gemma4-e4b-moonshot:latest (Unsloth Q4_K_M)
 *   DR Vision Screening → gemma-4-e2b-it.Q4_K_M via llama-cpp-python (vision fine-tuned)
 *
 * Image flow: Qwen3-VL:2b vision → disaster/moonshot synthesis
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Paperclip, Camera, Mic, MicOff, Send, X, Loader2, Eye } from 'lucide-react'
import { marked } from 'marked'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { chatStream, multimodal, drScreen } from '../api/client'
import { useChatHistory } from '../hooks/useChatHistory'
import { useSTT } from '../hooks/useSTT'

marked.setOptions({ breaks: true, gfm: true })

// ── Model definitions ─────────────────────────────────────────────────────────

const MODELS = [
  {
    id: 'disaster',
    label: 'Disaster Response',
    emoji: '🆘',
    ollama: 'gemma4-disaster:latest',
    finetune: 'Gemma 4 E2B · Unsloth Q4_K_M',
    desc: 'Triage, rescue protocols, survival, field coordination',
    color: '#ef4444',
    colorMuted: 'rgba(239,68,68,0.15)',
    borderColor: 'border-red-800',
  },
  {
    id: 'moonshot',
    label: 'Moonshot Infra',
    emoji: '⚡',
    ollama: 'gemma4-e4b-moonshot:latest',
    finetune: 'Gemma 4 E4B · Unsloth Q4_K_M',
    desc: 'Water systems, solar microgrids, shelter, STEM engineering',
    color: '#1a73e8',
    colorMuted: 'rgba(26,115,232,0.15)',
    borderColor: 'border-blue-700',
  },
  {
    id: 'dr',
    label: 'DR Vision Screening',
    emoji: '👁️',
    ollama: 'gemma-4-e2b-it.Q4_K_M',
    finetune: 'Gemma 4 E2B · Vision fine-tuned · Unsloth Q4_K_M',
    desc: 'Diabetic retinopathy grading from fundus photographs',
    color: '#8b5cf6',
    colorMuted: 'rgba(139,92,246,0.15)',
    borderColor: 'border-violet-700',
  },
]

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return ''
  const processed = text
    .replace(/\$\$([^$]+?)\$\$/gs, (_, m) => {
      try { return katex.renderToString(m.trim(), { displayMode: true, throwOnError: false }) }
      catch { return `$$${m}$$` }
    })
    .replace(/\$([^$\n]+?)\$/g, (_, m) => {
      try { return katex.renderToString(m.trim(), { displayMode: false, throwOnError: false }) }
      catch { return `$${m}$` }
    })
  return marked.parse(processed)
}

// ── Camera modal ──────────────────────────────────────────────────────────────

function CameraModal({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then((stream) => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => videoRef.current.play().then(() => setReady(true))
      }
    }).catch((e) => setError(e.name === 'NotAllowedError' ? 'Camera access denied' : e.message))
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const capture = () => {
    const v = videoRef.current
    if (!v || !ready) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob((blob) => {
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-[#2d2d2d]">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-[#9aa0a6] text-sm">Starting camera…</div>}
          {error && <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4">{error}</div>}
          {ready && <>
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-[#1a73e8]/70 rounded-tl-sm" />
            <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-[#1a73e8]/70 rounded-tr-sm" />
            <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-[#1a73e8]/70 rounded-bl-sm" />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-[#1a73e8]/70 rounded-br-sm" />
          </>}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-[#2d2d2d] text-[#9aa0a6] text-sm hover:bg-[#1e1e1e] transition-colors">Cancel</button>
          <button onClick={capture} disabled={!ready}
            className="flex-1 py-3 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Camera size={15} /> Capture
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Model selector bar ────────────────────────────────────────────────────────

function ModelSelector({ selected, onChange }) {
  return (
    <div className="shrink-0 px-4 pt-3 pb-2">
      <div className="max-w-chat mx-auto">
        <div className="flex gap-2">
          {MODELS.map((m) => {
            const active = selected === m.id
            return (
              <button key={m.id} onClick={() => onChange(m.id)}
                style={active ? { borderColor: m.color, background: m.colorMuted, color: m.color } : {}}
                className={`flex-1 flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all ${
                  active ? '' : 'border-[#2d2d2d] text-[#5f6368] hover:border-[#3d3d3d] hover:text-[#9aa0a6]'
                }`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{m.emoji}</span>
                  <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
                </div>
                <span className="text-[9px] opacity-70 leading-tight">{m.finetune}</span>
              </button>
            )
          })}
        </div>
        {/* Active model description */}
        {(() => {
          const m = MODELS.find(x => x.id === selected)
          return (
            <p className="text-[10px] text-[#5f6368] mt-1.5 px-0.5">{m?.desc}</p>
          )
        })()}
      </div>
    </div>
  )
}

// ── DR result card ────────────────────────────────────────────────────────────

function DRResultCard({ assessment }) {
  const html = renderMarkdown(assessment)
  const severe = /\b(severe|proliferative|immediate referral)\b/i.test(assessment)
  const moderate = /\b(moderate)\b/i.test(assessment)
  const borderClass = severe ? 'border-red-700 bg-red-950/30' : moderate ? 'border-amber-700 bg-amber-950/30' : 'border-violet-800 bg-violet-950/20'
  const textClass = severe ? 'text-red-300' : moderate ? 'text-amber-300' : 'text-violet-300'

  return (
    <div className={`rounded-xl border-2 ${borderClass} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <Eye size={14} className={textClass} />
        <span className="text-xs font-semibold text-white">DR Screening Result</span>
        <span className="text-[9px] text-[#5f6368] border border-[#2d2d2d] px-2 py-0.5 rounded-full ml-auto">
          Gemma 4 E2B · Vision fine-tuned · Unsloth Q4_K_M
        </span>
      </div>
      <div className={`aria-prose text-xs leading-relaxed ${textClass}`} dangerouslySetInnerHTML={{ __html: html }} />
      <p className="text-[9px] text-[#5f6368] border-t border-[#2d2d2d] pt-2 mt-1">
        ⚠ For research and educational use only. Not a substitute for clinical diagnosis.
      </p>
    </div>
  )
}

// ── Message renderer ──────────────────────────────────────────────────────────

function AriaMessage({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[70%]">
          {msg.imagePreview && (
            <div className="mb-2 flex justify-end">
              <img src={msg.imagePreview} alt=""
                style={{ maxHeight: '180px', width: 'auto', maxWidth: '320px', display: 'block' }}
                className="rounded-xl border border-[#2d2d2d]" />
            </div>
          )}

          <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-[#1a73e8] text-white text-sm leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
        </div>
      </div>
    )
  }

  // DR result gets a special card
  if (msg.mode === 'dr_screening' && msg.content) {
    return (
      <div className="animate-slide-up">
        <DRResultCard assessment={msg.content} />
      </div>
    )
  }

  const html = renderMarkdown(msg.content || '')
  const modelDef = MODELS.find(m => m.id === msg.mode) || MODELS.find(m => m.id === 'moonshot')
  const badgeText = msg.mode === 'disaster' ? '🆘 Disaster · Qwen3-VL:2b → Gemma 4 E2B · Unsloth Q4_K_M'
    : msg.mode === 'moonshot' ? '⚡ Moonshot · Qwen3-VL:2b → Gemma 4 E4B · Unsloth Q4_K_M'

    : msg.mode ? `◆ ${msg.mode}` : null

  return (
    <div className="flex gap-3 animate-slide-up max-w-chat">
      <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#1a73e8]/20 flex items-center justify-center text-[#1a73e8] text-xs font-bold select-none">◆</div>
      <div className="flex-1 min-w-0">
        {(msg.thinking || msg.statusText) && !msg.content && (
          <div className="flex items-center gap-2 text-[#9aa0a6] text-sm">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#9aa0a6] animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            <span className="text-xs">{msg.statusText || 'Generating… model may take 30–60s on first query'}</span>
          </div>
        )}
        {msg.content && (
          <>
            <div className="aria-prose text-sm"
              dangerouslySetInnerHTML={{ __html: html + (msg.streaming ? '<span class="aria-cursor"></span>' : '') }} />
            {!msg.streaming && (
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                {badgeText && (
                  <span className="inline-block text-[10px] text-[#9aa0a6] border border-[#2d2d2d] px-2 py-0.5 rounded-full">{badgeText}</span>
                )}
                {msg.sources?.map((s, i) => (
                  <span key={i} className="inline-block text-[10px] text-[#1a73e8] border border-[#1a73e8]/30 bg-[#1a73e8]/5 px-2 py-0.5 rounded-full">
                    {s.doc_name} p.{s.page}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Suggestion chips per mode ─────────────────────────────────────────────────

const MODE_SUGGESTIONS = {
  disaster: [
    { emoji: '🌊', label: 'Typhoon response', prompt: 'Typhoon just hit, we have 2000 survivors, no power, what do we do first?' },
    { emoji: '🏠', label: 'Shelter triage',   prompt: 'Mass casualty event, 50 injured, 3 responders — triage protocol?' },
    { emoji: '🚰', label: 'Water emergency',  prompt: 'Flood contaminated our water supply, 500 people, how do we treat it?' },
    { emoji: '🔥', label: 'Fire rescue',      prompt: 'Structure fire with possible trapped victims, no fire department — what now?' },
  ],
  moonshot: [
    { emoji: '💧', label: 'Water system',   prompt: 'Design a gravity-fed water system from a hillside spring for 200 people' },
    { emoji: '⚡', label: 'Solar microgrid', prompt: 'Size a solar microgrid for a village of 300 people with no grid connection' },
    { emoji: '🏗️', label: 'Shelter build',  prompt: 'Build a flood-resistant community shelter with local materials' },
    { emoji: '🌾', label: 'Food security',  prompt: 'Solar-powered drip irrigation system for 5 hectares, no grid' },
  ],
  dr: [
    { emoji: '📷', label: 'Upload fundus image', prompt: '' },
  ],
}

// ── Main component ────────────────────────────────────────────────────────────

export function AriaChat({ prefillQuery, onPrefillConsumed }) {
  const history = useChatHistory()
  const [selectedModel, setSelectedModel] = useState('disaster')
  const [input, setInput] = useState('')
  const [attached, setAttached] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamMsgs, setStreamMsgs] = useState([])
  const stopRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (prefillQuery) {
      setInput(prefillQuery)
      onPrefillConsumed?.()
      textareaRef.current?.focus()
    }
  }, [prefillQuery, onPrefillConsumed])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history.messages, streamMsgs])

  // ── Attach ───────────────────────────────────────────────────────────────

  const attachFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const preview = URL.createObjectURL(file)
    setAttached({ file, preview, type: 'image' })
  }

  const clearAttached = () => {
    if (attached?.preview) URL.revokeObjectURL(attached.preview)
    setAttached(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── STT (Web Speech API) ──────────────────────────────────────────────────

  const stt = useSTT(
    (transcript) => setInput((prev) => prev ? `${prev} ${transcript}` : transcript),
    (err) => console.error('STT:', err)
  )

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && !attached) || streaming) return
    setInput('')
    const chatId = history.ensureChat()

    history.appendMessage(chatId, {
      role: 'user',
      content: text || '[Image]',
      imagePreview: attached?.preview || null,
    })

    const botId = `bot-${Date.now()}`
    setStreamMsgs([{ id: botId, role: 'bot', content: '', streaming: true, thinking: true, mode: null }])
    setStreaming(true)

    const finalize = (content, mode, safety, sources) => {
      history.appendMessage(chatId, { role: 'bot', content, mode: mode || null, safety: safety || null, sources: sources || null })
      setStreamMsgs([])
      setStreaming(false)
      clearAttached()
    }

    try {
      // ── DR screening mode ───────────────────────────────────────────────
      if (selectedModel === 'dr') {
        if (!attached?.file) {
          finalize('Please attach a retinal fundus image to run DR screening.', 'dr_screening', null, null)
          return
        }
        setStreamMsgs([{ id: botId, role: 'bot', content: '', streaming: false, thinking: false,
          mode: null, statusText: '👁️ Running DR vision screening (llama-cli)… ~5–10s' }])
        const result = await drScreen(attached.file)
        finalize(result.assessment, 'dr_screening', null, null)
        return
      }

      // ── Image + vision model ────────────────────────────────────────────
      if (attached?.type === 'image') {
        const question = text || 'Provide a humanitarian or infrastructure assessment of what you see.'
        const modelLabel = selectedModel === 'moonshot' ? '⚡ Moonshot Infra' : '🆘 Disaster Response'
        setStreamMsgs([{ id: botId, role: 'bot', content: '', streaming: false, thinking: false,
          mode: null, statusText: `🔍 Qwen3-VL:2b reading image → ${modelLabel}…` }])
        const result = await multimodal(attached.file, question, selectedModel, chatId)
        finalize(result.response, result.mode, result.safety_level, null)
        return
      }

      // ── Plain text SSE ──────────────────────────────────────────────────
      stopRef.current = chatStream(text, chatId,
        (token) => setStreamMsgs((prev) => prev.map((m) =>
          m.id === botId ? { ...m, content: m.content + token, thinking: false } : m
        )),
        (meta) => {
          setStreamMsgs((prev) => {
            const bot = prev.find((m) => m.id === botId)
            if (bot) finalize(bot.content, meta?.mode, meta?.safety, null)
            return []
          })
          setStreaming(false)
        },
        (err) => finalize(`Error: ${err.message}`, null, null, null),
        () => setStreamMsgs((prev) => prev.map((m) => m.id === botId ? { ...m, thinking: true } : m)),
      )
    } catch (e) {
      finalize(`Error: ${e.message}`, null, null, null)
    }
  }, [input, attached, streaming, history, selectedModel])

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const autoResize = (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }

  const allMsgs = [...(history.messages || []), ...streamMsgs]
  const activeMod = MODELS.find(m => m.id === selectedModel)
  const isDR = selectedModel === 'dr'
  const suggestions = MODE_SUGGESTIONS[selectedModel] || MODE_SUGGESTIONS.disaster

  return (
    <>
      {cameraOpen && (
        <CameraModal onCapture={(file) => { attachFile(file); setCameraOpen(false) }} onClose={() => setCameraOpen(false)} />
      )}

      <div className="flex flex-col h-full bg-black">

        {/* Model selector */}
        <ModelSelector selected={selectedModel} onChange={setSelectedModel} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {allMsgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 px-4 animate-fade-in">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span style={{ color: activeMod?.color }} className="text-2xl">{activeMod?.emoji}</span>
                  <span className="text-xl font-semibold text-white">{activeMod?.label}</span>
                </div>
                <p className="text-[11px] text-[#5f6368] mb-1">{activeMod?.finetune}</p>
                <p className="text-[#9aa0a6] text-sm">{activeMod?.desc}</p>
              </div>

              {isDR ? (
                <div className="text-center max-w-xs space-y-3">
                  <div className="p-4 rounded-2xl border border-violet-800/50 bg-violet-950/20 text-xs text-[#9aa0a6] leading-relaxed">
                    📷 Attach a retinal fundus photograph<br />
                    Gemma 4 E2B will grade DR severity and identify key findings<br />
                    <span className="text-[#5f6368]">~5–10s per image via llama-cli</span>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-2.5 rounded-full text-sm font-medium text-white border border-violet-700 bg-violet-950/40 hover:bg-violet-900/40 transition-colors flex items-center gap-2 mx-auto">
                    <Eye size={14} /> Upload fundus image
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                  {suggestions.map(({ emoji, label, prompt }) => (
                    <button key={label} onClick={() => prompt && setInput(prompt)}
                      style={{ '--hover-border': activeMod?.color }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#2d2d2d] text-[#9aa0a6] text-sm hover:border-[#1a73e8]/60 hover:text-white hover:bg-[#1a73e8]/10 transition-all">
                      {emoji} {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-chat mx-auto px-4 py-6 space-y-6">
              {allMsgs.map((msg) => (
                <AriaMessage key={msg.id || `${msg.role}-${msg.content?.slice(0, 12)}`} msg={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 pb-5 pt-2">
          <div className="max-w-chat mx-auto">
            <div className={`rounded-2xl border transition-colors ${
              stt.recording ? 'border-[#1a73e8] bg-[#1e1e1e]' : 'border-[#2d2d2d] bg-[#1e1e1e] focus-within:border-[#1a73e8]/60'
            }`}>

              {/* Image preview */}
              {attached?.type === 'image' && attached.preview && (
                <div className="px-4 pt-3">
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={attached.preview} alt="attached"
                      style={{ height: '110px', width: 'auto', maxWidth: '260px', minWidth: '80px', display: 'block' }}
                      className="rounded-xl border border-[#2d2d2d] bg-[#141414]" />
                    <button onClick={clearAttached} style={{ position: 'absolute', top: '-6px', right: '-6px' }}
                      className="w-5 h-5 rounded-full bg-[#1e1e1e] border border-[#2d2d2d] text-[#9aa0a6] flex items-center justify-center hover:text-white">
                      <X size={10} />
                    </button>
                  </div>
                </div>
              )}

              {/* Textarea — hidden in DR mode when no text needed */}
              {!isDR && (
                <textarea ref={textareaRef}
                  value={(stt.recording || stt.loading) ? '' : input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  onInput={autoResize}
                  placeholder={
                    stt.loading ? 'Transcribing…'
                    : stt.recording ? 'Listening…'
                    : selectedModel === 'disaster' ? 'Describe the emergency situation…'
                    : 'Describe your infrastructure challenge…'
                  }
                  disabled={stt.recording || stt.loading}
                  rows={1}
                  className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-[#e8eaed] placeholder-[#5f6368] focus:outline-none resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
                />
              )}
              {isDR && !attached && (
                <div className="px-4 py-3 text-sm text-[#5f6368]">
                  Attach a retinal fundus image to run DR screening →
                </div>
              )}
              {isDR && attached?.type === 'image' && (
                <div className="px-4 py-2 text-xs text-[#9aa0a6]">
                  Ready — click ➤ to run DR vision screening
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center px-3 pb-3 pt-1 gap-1">
                <button onClick={() => fileInputRef.current?.click()} title="Attach image"
                  className="p-2 rounded-xl text-[#5f6368] hover:text-[#e8eaed] hover:bg-white/5 transition-colors">
                  <Paperclip size={17} />
                </button>
                {!isDR && (
                  <button onClick={() => setCameraOpen(true)} title="Capture photo"
                    className="p-2 rounded-xl text-[#5f6368] hover:text-[#e8eaed] hover:bg-white/5 transition-colors">
                    <Camera size={17} />
                  </button>
                )}
                <div className="flex-1" />
                {!isDR && (
                  <button onClick={stt.loading ? undefined : stt.toggle}
                    title={stt.loading ? 'Transcribing…' : stt.recording ? 'Stop recording' : 'Voice input'}
                    className={`p-2 rounded-xl transition-colors ${
                      stt.loading ? 'text-yellow-400 bg-yellow-400/10 animate-pulse cursor-wait'
                      : stt.recording ? 'text-[#1a73e8] bg-[#1a73e8]/15 animate-pulse'
                      : 'text-[#5f6368] hover:text-[#e8eaed] hover:bg-white/5'
                    }`}>
                    {stt.loading ? <Mic size={17} /> : stt.recording ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                )}
                <button onClick={send}
                  disabled={isDR ? (!attached?.file || streaming) : ((!input.trim() && !attached) || streaming)}
                  title="Send"
                  className={`p-2 rounded-xl transition-colors ${
                    (isDR ? (!attached?.file || streaming) : ((!input.trim() && !attached) || streaming))
                      ? 'text-[#5f6368]'
                      : 'text-white bg-[#1a73e8] hover:bg-[#1557b0]'
                  }`}>
                  {streaming ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </div>
            </div>

            <p className="text-center text-[10px] text-[#5f6368] mt-2">
              ● Offline · {activeMod?.finetune} · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => attachFile(e.target.files[0])} />
    </>
  )
}
