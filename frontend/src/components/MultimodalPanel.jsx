import { useState, useRef, useCallback, useEffect } from 'react'
import { Image, Camera, Upload, Send, X, RefreshCw } from 'lucide-react'
import { multimodal } from '../api/client'
import { SafetyBadge } from './SafetyBadge'
import { Markdown } from './Markdown'

// ── Camera hook ───────────────────────────────────────────────────────────────

function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)  // video has loaded metadata
  const [error, setError] = useState(null)

  const start = useCallback(async () => {
    setError(null)
    setReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => setReady(true))
        }
      }
      setActive(true)
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Camera access denied — allow camera in System Settings.'
        : `Camera error: ${e.message}`)
    }
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
    setReady(false)
  }, [])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !ready) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })),
        'image/jpeg', 0.92
      )
    })
  }, [ready])

  useEffect(() => () => stop(), [stop])

  return { videoRef, active, ready, error, start, stop, capture }
}

// ── Component ─────────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  'What do you see in this image?',
  'What text is visible?',
  'Describe the infrastructure',
  'Is this area flood-prone?',
  'What resources are available?',
  'Identify hazards in this scene',
  'Estimate water source quality',
]

export function MultimodalPanel() {
  const [tab, setTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const cam = useCamera()

  const setImage = useCallback((f) => {
    if (!f || !f.type.startsWith('image/')) return
    const url = URL.createObjectURL(f)
    setFile(f)
    setPreview(url)
    setResult(null)
    setError(null)
  }, [])

  const clearImage = useCallback(() => {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setResult(null)
    setError(null)
  }, [preview])

  const switchTab = useCallback((t) => {
    if (t === 'camera') cam.start()
    else cam.stop()
    setTab(t)
    clearImage()
  }, [cam, clearImage])

  const snap = useCallback(async () => {
    const f = await cam.capture()
    if (f) {
      cam.stop()
      setTab('upload')
      // Use setTimeout so tab state settles before setting the image
      setTimeout(() => setImage(f), 0)
    }
  }, [cam, setImage])

  const onDrop = (e) => { e.preventDefault(); setImage(e.dataTransfer.files[0]) }

  const pickFile = async () => {
    if (window.aether) {
      const path = await window.aether.openImage()
      if (!path) return
      const res = await fetch(`file://${path}`)
      const blob = await res.blob()
      const ext = path.split('.').pop()
      setImage(new File([blob], `image.${ext}`, { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }))
    } else {
      inputRef.current?.click()
    }
  }

  const send = async () => {
    if (!file || !question.trim()) return
    setLoading(true)
    setError(null)
    try {
      setResult(await multimodal(file, question.trim()))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">Image + Chat</h2>
        <p className="text-xs text-aether-dim mt-0.5">
          Upload or capture an image → vision AI answers your question
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-aether-card rounded-xl border border-aether-border w-fit">
          {[
            { id: 'upload', icon: Upload, label: 'Upload' },
            { id: 'camera', icon: Camera, label: 'Camera' },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => switchTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all
                ${tab === id
                  ? 'bg-aether-accent text-white shadow-sm'
                  : 'text-aether-dim hover:text-aether-text'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ── CAMERA TAB ── */}
        {tab === 'camera' && (
          <div className="space-y-3">
            {cam.error ? (
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">
                {cam.error}
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-black border border-aether-border aspect-video">
                <video
                  ref={cam.videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!cam.ready && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-aether-dim">
                    <Camera size={40} className="opacity-30" />
                    <p className="text-sm opacity-60">Starting camera…</p>
                  </div>
                )}
                {cam.ready && (
                  <>
                    <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white/50 rounded-tl" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white/50 rounded-tr" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white/50 rounded-bl" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white/50 rounded-br" />
                  </>
                )}
              </div>
            )}
            {cam.ready && (
              <button onClick={snap}
                className="w-full py-3 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Camera size={16} /> Capture Photo
              </button>
            )}
          </div>
        )}

        {/* ── UPLOAD TAB ── */}
        {tab === 'upload' && !preview && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={pickFile}
            className="border-2 border-dashed border-aether-border rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer hover:border-aether-accent/50 hover:bg-aether-card/30 transition-all">
            <Image size={36} className="text-aether-muted" />
            <div className="text-center">
              <p className="text-sm font-medium text-aether-text">Drop image or click to browse</p>
              <p className="text-xs text-aether-dim mt-1">JPG · PNG · WEBP · Maps, documents, field scenes</p>
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => setImage(e.target.files[0])} />
          </div>
        )}

        {/* ── IMAGE PREVIEW + QUESTION (always together when image is set) ── */}
        {preview && (
          <div className="space-y-4">
            {/* Preview */}
            <div className="relative rounded-2xl overflow-hidden bg-aether-card border border-aether-border">
              <img src={preview} alt="preview" className="w-full max-h-56 object-contain" />
              <button onClick={clearImage}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                <X size={14} />
              </button>
              <button onClick={() => { clearImage(); switchTab('camera') }}
                className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition-colors">
                <RefreshCw size={11} /> Retake
              </button>
            </div>

            {/* Question — visible immediately when image is set */}
            {!result && (
              <>
                <div>
                  <label className="block text-xs font-medium text-aether-dim mb-2">
                    What do you want to know about this image?
                  </label>
                  <div className="flex gap-3">
                    <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && send()}
                      placeholder="What do you see? Is this area safe? Translate text…"
                      className="flex-1 bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors"
                      autoFocus
                    />
                    <button
                      onClick={send}
                      disabled={!question.trim() || loading}
                      className="px-5 py-3 rounded-xl bg-aether-accent text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium">
                      {loading ? <span className="animate-pulse">…</span> : <><Send size={15} /> Ask</>}
                    </button>
                  </div>
                </div>

                {/* Quick questions */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => setQuestion(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-aether-card border border-aether-border text-aether-dim hover:text-aether-text hover:border-aether-accent/50 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-3 animate-slide-up">
                {result.ocr_text && (
                  <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
                    <p className="text-xs font-medium text-aether-dim mb-2">Text extracted from image</p>
                    <p className="text-sm text-aether-text font-mono leading-relaxed">{result.ocr_text}</p>
                  </div>
                )}
                <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-aether-dim">Gemma 4 answer</p>
                    <SafetyBadge level={result.safety_level} />
                    <span className="text-xs text-aether-muted ml-auto">{result.mode}</span>
                  </div>
                  <Markdown text={result.response} />
                </div>

                <button onClick={() => { setResult(null); setQuestion('') }}
                  className="w-full py-2.5 rounded-xl border border-aether-border text-aether-dim text-sm hover:border-aether-accent/50 transition-colors">
                  <RefreshCw size={13} className="inline mr-1.5" />Ask another question
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
