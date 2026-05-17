import { useState } from 'react'
import { Mic, MicOff, Play, RefreshCw } from 'lucide-react'
import { voiceChat, getTTSVoices } from '../api/client'
import { useRecorder } from '../hooks/useRecorder'
import { SafetyBadge } from './SafetyBadge'

const VOICES = ['af_heart', 'af_bella', 'af_nicole', 'am_adam', 'am_michael', 'bf_emma', 'bm_george']

export function VoicePanel() {
  const { recording, audioBlob, audioURL, start, stop, clear } = useRecorder()
  const [voice, setVoice] = useState('af_heart')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const send = async () => {
    if (!audioBlob) return
    setLoading(true)
    setError(null)
    try {
      const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })
      const res = await voiceChat(file, voice)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { clear(); setResult(null); setError(null) }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">Voice Chat</h2>
        <p className="text-xs text-aether-dim mt-0.5">Speak → Whisper STT → Gemma 4 → Kokoro TTS · Fully offline</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
        {/* Voice selector */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Response voice</label>
          <div className="flex flex-wrap gap-2">
            {VOICES.map((v) => (
              <button key={v} onClick={() => setVoice(v)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${voice === v ? 'bg-aether-accent border-aether-accent text-white' : 'border-aether-border text-aether-dim hover:border-aether-accent/50'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Record button */}
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={recording ? stop : start}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg
              ${recording
                ? 'bg-red-600 hover:bg-red-700 scale-110 ring-4 ring-red-500/30 animate-pulse'
                : 'bg-aether-card border-2 border-aether-border hover:border-aether-accent hover:scale-105'}`}>
            {recording
              ? <MicOff size={32} className="text-white" />
              : <Mic size={32} className="text-aether-dim" />}
          </button>
          <p className="text-sm text-aether-dim">
            {recording ? '🔴 Recording… tap to stop' : audioBlob ? 'Recording ready' : 'Tap to record'}
          </p>

          {/* Playback */}
          {audioURL && !result && (
            <div className="w-full max-w-sm">
              <audio src={audioURL} controls className="w-full h-10" />
              <div className="flex gap-3 mt-3">
                <button onClick={reset} className="flex-1 py-2 rounded-xl border border-aether-border text-aether-dim text-sm hover:border-aether-accent/50 transition-colors">
                  <RefreshCw size={14} className="inline mr-1" /> Redo
                </button>
                <button onClick={send} disabled={loading}
                  className="flex-1 py-2 rounded-xl bg-aether-accent text-white text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Processing…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-4 animate-slide-up">
            <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-aether-dim">You said</span>
              </div>
              <p className="text-sm text-aether-text">{result.transcript}</p>
            </div>

            <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-aether-dim">Gemma 4 replied</span>
                <SafetyBadge level={result.safety} />
              </div>
              <p className="text-sm text-aether-text">{result.response}</p>
            </div>

            <div className="p-4 rounded-xl bg-aether-surface border border-aether-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-aether-dim">
                  Spoken response · {result.duration?.toFixed(1)}s
                </span>
                <span className="text-xs text-aether-muted">{voice}</span>
              </div>
              <audio src={result.url} controls className="w-full h-10" autoPlay />
            </div>

            <button onClick={reset} className="w-full py-2.5 rounded-xl border border-aether-border text-aether-dim text-sm hover:border-aether-accent/50 transition-colors">
              <RefreshCw size={14} className="inline mr-1" /> New recording
            </button>
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
