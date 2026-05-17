/**
 * LiveStreamPanel — Real-time scene analysis for rescue & disaster missions
 *
 * Step 1 (auto, every 2s):  SmolVLM2 patch descriptions — fast, runs always
 * Step 2 (smart trigger):   Gemma 4 Disaster synthesis fires automatically when:
 *   a) Emergency keywords detected in SmolVLM2 output (drowning, fire, trapped…)
 *   b) 12 patches accumulated since last synthesis (~24s)
 *   c) User clicks "Analyze Scene" manually
 *
 * Escalation: CRITICAL/HIGH synthesis → banner with pre-filled Field AI prompt
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, CameraOff, Play, Square, Zap, Radio, AlertTriangle, ArrowRight, Mic, MicOff, Loader2 } from 'lucide-react'
import { livePatches, liveSynthesize } from '../api/client'
import { useSTT } from '../hooks/useSTT'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const SAMPLE_MS = 2000          // SmolVLM2 every 2s
const AUTO_SYNTH_PATCHES = 12   // auto-synthesize after this many new patches

// Emergency keywords that trigger immediate Gemma 4 synthesis
const EMERGENCY_RE = /\b(drown|flood|fire|flame|smoke|collapse|trapped|unconscious|bleed|injury|injured|rescue|stranded|victim|debris|rubble|overflow|surge|danger|help|critical)\b/i

const RISK_COLORS = {
  LOW:      { border: 'border-green-800',  bg: 'bg-green-950/30',  text: 'text-green-400',  pill: 'bg-green-900/50 border-green-700 text-green-300',  glow: '' },
  MEDIUM:   { border: 'border-amber-800',  bg: 'bg-amber-950/30',  text: 'text-amber-400',  pill: 'bg-amber-900/50 border-amber-700 text-amber-300',  glow: '' },
  HIGH:     { border: 'border-orange-700', bg: 'bg-orange-950/40', text: 'text-orange-400', pill: 'bg-orange-900/60 border-orange-600 text-orange-200', glow: 'shadow-orange-900/40' },
  CRITICAL: { border: 'border-red-600',    bg: 'bg-red-950/50',    text: 'text-red-300',    pill: 'bg-red-800/70 border-red-500 text-red-100',         glow: 'shadow-red-900/60' },
}
const NEUTRAL = { border: 'border-[#2d2d2d]', bg: 'bg-[#1a1a1a]', text: 'text-[#9aa0a6]', pill: 'bg-[#2d2d2d] border-[#3d3d3d] text-[#9aa0a6]', glow: '' }

function extractRisk(text) {
  const m = (text || '').match(/\b(CRITICAL|HIGH|MEDIUM|LOW)\b/)
  return m ? m[1] : null
}

// Quick keyword-based inline risk estimate from raw SmolVLM2 text (before Gemma 4)
function estimateRiskFromPatches(descriptions) {
  const combined = descriptions.join(' ')
  if (/\b(drown|fire|flame|collapse|unconscious|trapped|bleed)\b/i.test(combined)) return 'CRITICAL'
  if (/\b(flood|rescue|stranded|victim|debris|surge|overflow)\b/i.test(combined)) return 'HIGH'
  if (/\b(water|damage|broken|blocked|risk|hazard)\b/i.test(combined)) return 'MEDIUM'
  return null
}

// ── Live risk badge (from SmolVLM2 inline) ────────────────────────────────────

function LiveRiskBadge({ risk }) {
  if (!risk) return null
  const c = RISK_COLORS[risk] || NEUTRAL
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border animate-pulse ${c.pill}`}>
      ⚡ {risk}
    </span>
  )
}

// ── Synthesis card ────────────────────────────────────────────────────────────

function SynthesisCard({ card, onEscalate }) {
  const risk = extractRisk(card.response)
  const c = RISK_COLORS[risk] || NEUTRAL
  const html = marked.parse(card.response || '')
  const isUrgent = risk === 'CRITICAL' || risk === 'HIGH'

  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-4 space-y-3 animate-slide-up ${isUrgent ? `shadow-lg ${c.glow}` : ''}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#1a73e8] text-sm">◆</span>
          <span className="text-xs font-semibold text-white">Gemma 4 Disaster</span>
          {risk && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.pill}`}>
              {risk}
            </span>
          )}
          {card.triggerReason && card.triggerReason !== 'manual' && (
            <span className="text-[9px] text-[#1a73e8] border border-[#1a73e8]/30 px-1.5 py-0.5 rounded-full">
              {card.triggerReason === 'voice' ? '🎤 voice' : card.triggerReason === 'emergency' ? '⚡ auto' : 'auto'}
            </span>
          )}
        </div>
        <span className="text-[9px] text-[#5f6368]">{card.timestamp} · {card.n_patches_synthesized}p</span>
      </div>

      <div
        className={`aria-prose text-xs leading-relaxed ${c.text}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Escalation CTA */}
      {isUrgent && onEscalate && (
        <button
          onClick={() => onEscalate(card)}
          className="w-full mt-1 py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2">
          <ArrowRight size={13} />
          Ask Field AI for rescue protocol
        </button>
      )}
    </div>
  )
}

// ── Session block ─────────────────────────────────────────────────────────────

function SessionBlock({ session, isActive, onEscalate }) {
  const [framesCollapsed, setFramesCollapsed] = useState(true)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio size={10} className={isActive ? 'text-red-400' : 'text-[#5f6368]'} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5f6368]">
          Session · {session.startedAt}
        </span>
        {isActive && <span className="text-[10px] text-red-400 animate-pulse">LIVE</span>}
        <span className="text-[10px] text-[#5f6368]">
          {session.frames.length}f · {session.syntheses.length} analyses
        </span>
      </div>

      {/* Syntheses — newest first */}
      {session.syntheses.length > 0 && (
        <div className="space-y-3">
          {[...session.syntheses].reverse().map((card) => (
            <SynthesisCard key={card.id} card={card} onEscalate={onEscalate} />
          ))}
        </div>
      )}

      {/* SmolVLM2 frames — collapsed by default */}
      {session.frames.length > 0 && (
        <div>
          <button
            onClick={() => setFramesCollapsed(c => !c)}
            className="flex items-center gap-2 text-[9px] text-[#5f6368] hover:text-[#9aa0a6] transition-colors mb-1.5">
            {framesCollapsed ? '▶' : '▼'} SmolVLM2 frames ({session.frames.length})
          </button>
          {!framesCollapsed && (
            <div className="space-y-2">
              {[...session.frames].reverse().map((frame, i) => (
                <div key={frame.id} className="rounded-lg border border-[#2d2d2d] bg-[#141414] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-mono text-[#5f6368]">#{session.frames.length - i}</span>
                    <span className="text-[9px] text-[#5f6368]">{frame.timestamp}</span>
                    {frame.emergencyDetected && (
                      <span className="text-[9px] text-red-400 border border-red-900 px-1 rounded">⚡ auto</span>
                    )}
                    <span className="ml-auto text-[9px] text-[#5f6368] border border-[#2d2d2d] px-1.5 py-0.5 rounded-full">
                      SmolVLM2 · {frame.n_patches}p
                    </span>
                  </div>
                  <div className="space-y-1">
                    {frame.patch_descriptions.map((desc, pi) => (
                      <div key={pi} className="flex gap-2 text-[10px] text-[#9aa0a6] leading-relaxed">
                        <span className="shrink-0 font-mono text-[#5f6368]">P{pi+1}</span>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {session.frames.length === 0 && isActive && (
        <p className="text-[10px] text-[#5f6368] animate-pulse pl-2">Waiting for first frame…</p>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LiveStreamPanel({ onEscalate }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const timerRef = useRef(null)
  const prevFrameRef = useRef(null)
  const bottomRef = useRef(null)
  const synthLockRef = useRef(false)   // prevents concurrent synth calls

  const [camActive, setCamActive] = useState(false)
  const [camReady, setCamReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [patching, setPatching] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [error, setError] = useState(null)
  const [question, setQuestion] = useState('What hazards or conditions are present in this scene?')
  const [frameCount, setFrameCount] = useState(0)
  const [liveTicker, setLiveTicker] = useState('')   // latest SmolVLM2 summary line
  const [liveRisk, setLiveRisk] = useState(null)     // fast inline risk estimate

  const [sessions, setSessions] = useState([])
  const activeSessionIdRef = useRef(null)
  const pendingPatchesRef = useRef([])
  const patchCountSinceLastSynthRef = useRef(0)

  // STT — voice sets the analysis question and triggers immediate synthesis
  const stt = useSTT(
    (transcript) => {
      if (!transcript.trim()) return
      const t = transcript.trim()
      setQuestion(t)
      // If scanning is active and patches are pending, fire synthesis immediately with spoken question
      if (running && pendingPatchesRef.current.length > 0 && !synthLockRef.current) {
        runSynthesis('voice', t)
      }
    },
    (err) => setError(`STT: ${err}`)
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessions])

  // ── Camera ────────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setError(null)
    setCamReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () =>
          videoRef.current.play().then(() => setCamReady(true))
      }
      setCamActive(true)
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Camera access denied.' : `Camera error: ${e.message}`)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamActive(false)
    setCamReady(false)
  }, [])

  useEffect(() => () => { stopCamera(); clearInterval(timerRef.current) }, [stopCamera])

  // ── Frame capture ──────────────────────────────────────────────────────────

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !camReady) return null
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82)
    })
  }, [camReady])

  // ── Step 2: Gemma 4 synthesis ─────────────────────────────────────────────

  const runSynthesis = useCallback(async (reason = 'manual', questionOverride) => {
    if (synthLockRef.current) return
    const patches = [...pendingPatchesRef.current]
    if (!patches.length) return

    synthLockRef.current = true
    setSynthesizing(true)
    pendingPatchesRef.current = []
    patchCountSinceLastSynthRef.current = 0

    const effectiveQuestion = questionOverride || question
    try {
      const result = await liveSynthesize(patches, effectiveQuestion)
      const card = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        n_patches_synthesized: result.n_patches_synthesized,
        response: result.response,
        mode: result.mode,
        safety_level: result.safety_level,
        triggerReason: reason,
      }
      setSessions((prev) => prev.map((s) =>
        s.id === activeSessionIdRef.current
          ? { ...s, syntheses: [...s.syntheses, card] }
          : s
      ))

      // Auto-escalate CRITICAL/HIGH to Field AI with context
      const risk = extractRisk(result.response)
      if ((risk === 'CRITICAL' || risk === 'HIGH') && onEscalate && reason === 'emergency') {
        const prefill = `${question} — Gemma 4 assessed: ${risk}. Scene context: ${patches.slice(0, 3).join('. ')}. What immediate action should I take?`
        onEscalate(prefill)
      }
    } catch (e) {
      setError(`Synthesis failed: ${e.message}`)
    } finally {
      synthLockRef.current = false
      setSynthesizing(false)
    }
  }, [question, onEscalate])

  // ── Step 1: SmolVLM2 patches ──────────────────────────────────────────────

  const runPatches = useCallback(async () => {
    if (patching) return
    const blob = await captureFrame()
    if (!blob) return

    setPatching(true)
    setFrameCount((n) => n + 1)
    try {
      const result = await livePatches(blob, prevFrameRef.current)
      prevFrameRef.current = blob

      const descriptions = result.patch_descriptions || []
      const combined = descriptions.join(' ')

      // Live ticker — first sentence of first patch description
      const tickerLine = descriptions[0]?.split(/[.!?]/)[0]?.trim() || ''
      setLiveTicker(tickerLine)

      // Fast inline risk estimate
      const inlineRisk = estimateRiskFromPatches(descriptions)
      setLiveRisk(inlineRisk)

      const emergencyDetected = EMERGENCY_RE.test(combined)

      const frame = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        n_patches: result.n_patches,
        patch_descriptions: descriptions,
        emergencyDetected,
      }

      pendingPatchesRef.current = [...pendingPatchesRef.current, ...descriptions]
      patchCountSinceLastSynthRef.current += descriptions.length

      setSessions((prev) => prev.map((s) =>
        s.id === activeSessionIdRef.current
          ? { ...s, frames: [...s.frames, frame] }
          : s
      ))

      // Auto-trigger Gemma 4: emergency keywords → immediate
      if (emergencyDetected && !synthLockRef.current) {
        runSynthesis('emergency')
      // Auto-trigger: accumulated enough patches
      } else if (patchCountSinceLastSynthRef.current >= AUTO_SYNTH_PATCHES && !synthLockRef.current) {
        runSynthesis('auto')
      }
    } catch (e) {
      setError(`Patch failed: ${e.message}`)
    } finally {
      setPatching(false)
    }
  }, [patching, captureFrame, runSynthesis])

  // ── Start / Stop ──────────────────────────────────────────────────────────

  const startAnalysis = useCallback(() => {
    const sessionId = Date.now()
    activeSessionIdRef.current = sessionId
    pendingPatchesRef.current = []
    patchCountSinceLastSynthRef.current = 0
    setSessions((prev) => [...prev, {
      id: sessionId,
      startedAt: new Date().toLocaleTimeString(),
      active: true,
      frames: [],
      syntheses: [],
    }])
    setFrameCount(0)
    setLiveTicker('')
    setLiveRisk(null)
    setRunning(true)
    timerRef.current = setInterval(runPatches, SAMPLE_MS)
  }, [runPatches])

  const stopAnalysis = useCallback(() => {
    clearInterval(timerRef.current)
    setSessions((prev) => prev.map((s) =>
      s.id === activeSessionIdRef.current ? { ...s, active: false } : s
    ))
    setRunning(false)
    setLiveTicker('')
    setLiveRisk(null)
  }, [])

  // Handle escalation from synthesis card button
  const handleCardEscalate = useCallback((card) => {
    if (!onEscalate) return
    const risk = extractRisk(card.response)
    const prefill = `${question} — Scene assessed as ${risk || 'HIGH RISK'}. ${card.response.split('\n')[0]}. What immediate rescue action should I take?`
    onEscalate(prefill)
  }, [question, onEscalate])

  const pendingCount = pendingPatchesRef.current.length

  return (
    <div className="flex h-full bg-black" style={{ color: '#e8eaed' }}>

      {/* LEFT — camera + controls */}
      <div className="w-72 shrink-0 flex flex-col border-r border-[#1e1e1e] p-4 gap-3 overflow-y-auto">

        {/* Camera feed */}
        <div className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] border border-[#2d2d2d] aspect-video">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {!camActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#5f6368]">
              <CameraOff size={28} className="opacity-40" />
              <p className="text-xs">Camera off</p>
            </div>
          )}
          {camActive && !camReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-[#9aa0a6] animate-pulse">Starting…</p>
            </div>
          )}

          {/* Viewfinder when live — color reflects risk */}
          {camReady && running && (() => {
            const borderColor = liveRisk === 'CRITICAL' ? 'border-red-500'
              : liveRisk === 'HIGH' ? 'border-orange-500'
              : liveRisk === 'MEDIUM' ? 'border-amber-500'
              : 'border-[#1a73e8]/70'
            return <>
              <div className={`absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 ${borderColor}`} />
              <div className={`absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 ${borderColor}`} />
              <div className={`absolute bottom-8 left-2 w-5 h-5 border-b-2 border-l-2 ${borderColor}`} />
              <div className={`absolute bottom-8 right-2 w-5 h-5 border-b-2 border-r-2 ${borderColor}`} />
            </>
          })()}

          {/* Live ticker + status strip */}
          {running && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/85 px-2 py-1.5 space-y-0.5">
              {liveTicker && (
                <p className="text-[8px] text-[#9aa0a6] truncate leading-tight">{liveTicker}</p>
              )}
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  synthesizing ? 'bg-[#1a73e8] animate-ping'
                  : patching ? 'bg-[#1a73e8] animate-pulse'
                  : 'bg-[#22c55e]'
                }`} />
                <span className="text-[8px] text-[#5f6368] flex-1 truncate">
                  {synthesizing ? 'Gemma 4 analyzing…'
                   : patching ? 'SmolVLM2 scanning…'
                   : `Frame ${frameCount} · ${pendingCount}p pending`}
                </span>
                {liveRisk && <LiveRiskBadge risk={liveRisk} />}
              </div>
            </div>
          )}
        </div>

        {/* Camera toggle */}
        {!camActive
          ? <button onClick={startCamera}
              className="w-full py-2 rounded-xl border border-[#2d2d2d] text-sm text-[#9aa0a6] hover:text-white hover:border-[#1a73e8]/50 transition-colors flex items-center justify-center gap-2">
              <Camera size={14} /> Start Camera
            </button>
          : <button onClick={() => { stopAnalysis(); stopCamera() }}
              className="w-full py-2 rounded-xl border border-red-900 text-red-400 text-sm hover:bg-red-950/30 transition-colors flex items-center justify-center gap-2">
              <CameraOff size={14} /> Stop Camera
            </button>
        }

        {/* Analysis focus + mic */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[9px] font-semibold uppercase tracking-widest text-[#5f6368]">
              Analysis focus
            </label>
            <button
              onClick={stt.toggle}
              title={stt.recording ? 'Stop — transcribe & analyze' : 'Speak your question'}
              className={`p-1.5 rounded-lg transition-colors ${
                stt.recording
                  ? 'text-[#1a73e8] bg-[#1a73e8]/15 animate-pulse'
                  : stt.loading
                  ? 'text-[#9aa0a6]'
                  : 'text-[#5f6368] hover:text-white hover:bg-white/5'
              }`}>
              {stt.loading
                ? <Loader2 size={13} className="animate-spin" />
                : stt.recording
                ? <MicOff size={13} />
                : <Mic size={13} />}
            </button>
          </div>
          <textarea
            value={stt.recording ? '' : question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={stt.recording ? 'Listening…' : stt.loading ? 'Transcribing…' : ''}
            disabled={stt.recording || stt.loading}
            rows={2}
            className={`w-full bg-[#1e1e1e] border rounded-xl px-3 py-2 text-xs text-[#e8eaed] focus:outline-none resize-none transition-colors placeholder-[#5f6368] ${
              stt.recording ? 'border-[#1a73e8]/60' : 'border-[#2d2d2d] focus:border-[#1a73e8]/60'
            }`} />
        </div>

        {/* Focus presets */}
        <div className="flex flex-col gap-1">
          {[
            'What hazards are present?',
            'Assess flood risk',
            'People needing rescue?',
            'Structural damage?',
            'Fire or smoke visible?',
          ].map((q) => (
            <button key={q} onClick={() => setQuestion(q)}
              className="text-left text-[10px] px-3 py-1.5 rounded-lg border border-[#2d2d2d] text-[#9aa0a6] hover:text-white hover:border-[#1a73e8]/40 bg-[#1e1e1e] transition-colors">
              {q}
            </button>
          ))}
        </div>

        {/* Start / Stop */}
        {camReady && !running && (
          <button onClick={startAnalysis}
            className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Play size={13} /> Start Scanning
          </button>
        )}
        {running && (
          <button onClick={stopAnalysis}
            className="w-full py-2 rounded-xl border border-red-900 text-red-400 text-sm hover:bg-red-950/30 transition-colors flex items-center justify-center gap-2">
            <Square size={13} /> Stop
          </button>
        )}

        {/* Manual Analyze Scene */}
        {running && (
          <button
            onClick={() => runSynthesis('manual')}
            disabled={synthesizing || pendingCount === 0}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              synthesizing
                ? 'bg-[#1a73e8]/30 text-[#1a73e8] animate-pulse cursor-not-allowed'
                : pendingCount > 0
                ? 'bg-[#1a73e8] hover:bg-[#1557b0] text-white shadow-lg shadow-[#1a73e8]/20'
                : 'bg-[#1e1e1e] border border-[#2d2d2d] text-[#5f6368] cursor-not-allowed'
            }`}>
            <Zap size={14} />
            {synthesizing ? 'Analyzing…' : `Analyze Scene${pendingCount > 0 ? ` (${pendingCount}p)` : ''}`}
          </button>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-red-400 text-xs">{error}</div>
        )}

        <div className="mt-auto pt-2 text-[9px] text-[#5f6368] leading-relaxed border-t border-[#1e1e1e]">
          <p className="font-semibold mb-0.5 text-[#9aa0a6]">Auto-trigger logic</p>
          SmolVLM2 every 2s · emergency keywords → instant Gemma 4<br />
          12 patches accumulated → auto synthesis<br />
          CRITICAL/HIGH → Field AI escalation button
        </div>
      </div>

      {/* RIGHT — session feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[#5f6368]">
            <AlertTriangle size={32} className="opacity-20" />
            <div className="text-center max-w-sm">
              <p className="text-sm font-medium text-[#9aa0a6] mb-2">Live Scene Analysis</p>
              <p className="text-xs leading-relaxed">
                Start camera → Start Scanning → SmolVLM2 every 2s<br />
                Emergency keywords detected → Gemma 4 fires automatically<br />
                <strong className="text-red-400">CRITICAL</strong> result → Field AI escalation with pre-filled rescue query
              </p>
            </div>
          </div>
        ) : (
          sessions.map((session, idx) => (
            <SessionBlock
              key={session.id}
              session={session}
              isActive={idx === sessions.length - 1 && running}
              onEscalate={handleCardEscalate}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
