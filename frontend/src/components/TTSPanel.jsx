import { useState, useRef } from 'react'
import { Volume2, Download, Play, Pause } from 'lucide-react'
import { textToSpeech } from '../api/client'

const VOICES = [
  { id: 'af_heart',   label: 'Heart (F)',   lang: 'en-US' },
  { id: 'af_bella',   label: 'Bella (F)',   lang: 'en-US' },
  { id: 'af_nicole',  label: 'Nicole (F)',  lang: 'en-US' },
  { id: 'af_sarah',   label: 'Sarah (F)',   lang: 'en-US' },
  { id: 'am_adam',    label: 'Adam (M)',    lang: 'en-US' },
  { id: 'am_michael', label: 'Michael (M)', lang: 'en-US' },
  { id: 'bf_emma',    label: 'Emma (F)',    lang: 'en-GB' },
  { id: 'bf_isabella',label: 'Isabella (F)',lang: 'en-GB' },
  { id: 'bm_george',  label: 'George (M)',  lang: 'en-GB' },
  { id: 'bm_lewis',   label: 'Lewis (M)',   lang: 'en-GB' },
]

export function TTSPanel() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1.0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  const generate = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setResult(null)
    try { setResult(await textToSpeech(text.trim(), voice, speed)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  const download = () => {
    const a = document.createElement('a'); a.href = result.url; a.download = 'aether-speech.wav'; a.click()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">Text to Speech</h2>
        <p className="text-xs text-aether-dim mt-0.5">Kokoro 82M — fast local TTS, 11 voices, no internet required</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {/* Text input */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Text to speak</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to convert to speech…"
            rows={5}
            className="w-full bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors resize-none"
          />
          <p className="text-xs text-aether-muted mt-1">{text.length} / 4096 characters</p>
        </div>

        {/* Voice grid */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Voice</label>
          <div className="grid grid-cols-2 gap-2">
            {VOICES.map(({ id, label, lang }) => (
              <button key={id} onClick={() => setVoice(id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors
                  ${voice === id ? 'bg-aether-accent/20 border-aether-accent text-aether-text' : 'border-aether-border text-aether-dim hover:border-aether-accent/40'}`}>
                <span>{label}</span>
                <span className="text-aether-muted">{lang}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Speed */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Speed — {speed.toFixed(1)}×</label>
          <input type="range" min={0.5} max={2.0} step={0.1} value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-aether-accent" />
          <div className="flex justify-between text-[10px] text-aether-muted mt-1"><span>0.5×</span><span>2.0×</span></div>
        </div>

        <button onClick={generate} disabled={!text.trim() || loading}
          className="w-full py-3 rounded-xl bg-pink-700 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
          <Volume2 size={16} />
          {loading ? 'Generating speech…' : 'Generate Speech'}
        </button>

        {/* Result */}
        {result && (
          <div className="p-4 rounded-xl bg-aether-card border border-aether-border animate-slide-up space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-aether-dim">{result.voice} · {result.duration?.toFixed(1)}s · {result.model}</span>
              <button onClick={download} className="flex items-center gap-1 text-xs text-aether-dim hover:text-aether-text transition-colors">
                <Download size={12} /> Save WAV
              </button>
            </div>
            <audio ref={audioRef} src={result.url} onEnded={() => setPlaying(false)} className="hidden" />
            <button onClick={togglePlay}
              className="w-full py-2.5 rounded-lg bg-aether-surface border border-aether-border text-sm text-aether-text hover:border-aether-accent/50 transition-colors flex items-center justify-center gap-2">
              {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
            </button>
          </div>
        )}

        {error && <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">{error}</div>}
      </div>
    </div>
  )
}
