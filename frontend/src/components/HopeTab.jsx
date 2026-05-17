import { useState, useRef } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

const BASE = 'http://localhost:8000'

const LANGS = [
  // Demo set — first in scroll row, always visible
  { id: 'English',            flag: '🇺🇸' },
  { id: 'Japanese',           flag: '🇯🇵' },
  { id: 'Filipino',           flag: '🇵🇭' },
  { id: 'Swahili',            flag: '🇰🇪' },
  // Global / widely spoken
  { id: 'Spanish',            flag: '🇪🇸' },
  { id: 'French',             flag: '🇫🇷' },
  { id: 'Arabic',             flag: '🇸🇦' },
  { id: 'Hindi',              flag: '🇮🇳' },
  { id: 'Portuguese',         flag: '🇧🇷' },
  // Southeast Asia
  { id: 'Indonesian',         flag: '🇮🇩' },
  { id: 'Indonesian',         flag: '🇮🇩' },
  { id: 'Malay',              flag: '🇲🇾' },
  { id: 'Vietnamese',         flag: '🇻🇳' },
  { id: 'Thai',               flag: '🇹🇭' },
  { id: 'Burmese',            flag: '🇲🇲' },
  { id: 'Khmer',              flag: '🇰🇭' },
  { id: 'Lao',                flag: '🇱🇦' },
  // East Asia
  { id: 'Chinese',            flag: '🇨🇳' },
  { id: 'Japanese',           flag: '🇯🇵' },
  { id: 'Korean',             flag: '🇰🇷' },
  { id: 'Mongolian',          flag: '🇲🇳' },
  { id: 'Tibetan',            flag: '🏔️' },
  // South Asia
  { id: 'Bengali',            flag: '🇧🇩' },
  { id: 'Urdu',               flag: '🇵🇰' },
  { id: 'Tamil',              flag: '🇱🇰' },
  { id: 'Telugu',             flag: '🇮🇳' },
  { id: 'Marathi',            flag: '🇮🇳' },
  { id: 'Gujarati',           flag: '🇮🇳' },
  { id: 'Kannada',            flag: '🇮🇳' },
  { id: 'Malayalam',          flag: '🇮🇳' },
  { id: 'Sinhala',            flag: '🇱🇰' },
  { id: 'Nepali',             flag: '🇳🇵' },
  // Central Asia
  { id: 'Kazakh',             flag: '🇰🇿' },
  { id: 'Uzbek',              flag: '🇺🇿' },
  { id: 'Kyrgyz',             flag: '🇰🇬' },
  { id: 'Tajik',              flag: '🇹🇯' },
  { id: 'Turkmen',            flag: '🇹🇲' },
  { id: 'Azerbaijani',        flag: '🇦🇿' },
  { id: 'Armenian',           flag: '🇦🇲' },
  { id: 'Georgian',           flag: '🇬🇪' },
  // Middle East
  { id: 'Persian',            flag: '🇮🇷' },
  { id: 'Turkish',            flag: '🇹🇷' },
  { id: 'Kurdish',            flag: '🏳️' },
  { id: 'Hebrew',             flag: '🇮🇱' },
  { id: 'Pashto',             flag: '🇦🇫' },
  // Eastern Europe
  { id: 'Russian',            flag: '🇷🇺' },
  { id: 'Ukrainian',          flag: '🇺🇦' },
  { id: 'Polish',             flag: '🇵🇱' },
  { id: 'Czech',              flag: '🇨🇿' },
  { id: 'Slovak',             flag: '🇸🇰' },
  { id: 'Bulgarian',          flag: '🇧🇬' },
  { id: 'Romanian',           flag: '🇷🇴' },
  { id: 'Serbian',            flag: '🇷🇸' },
  { id: 'Croatian',           flag: '🇭🇷' },
  { id: 'Bosnian',            flag: '🇧🇦' },
  { id: 'Slovenian',          flag: '🇸🇮' },
  { id: 'Macedonian',         flag: '🇲🇰' },
  { id: 'Albanian',           flag: '🇦🇱' },
  { id: 'Belarusian',         flag: '🇧🇾' },
  { id: 'Moldovan',           flag: '🇲🇩' },
  { id: 'Lithuanian',         flag: '🇱🇹' },
  { id: 'Latvian',            flag: '🇱🇻' },
  { id: 'Estonian',           flag: '🇪🇪' },
  { id: 'Hungarian',          flag: '🇭🇺' },
  // Western Europe
  { id: 'German',             flag: '🇩🇪' },
  { id: 'Italian',            flag: '🇮🇹' },
  { id: 'Dutch',              flag: '🇳🇱' },
  { id: 'Greek',              flag: '🇬🇷' },
  { id: 'Swedish',            flag: '🇸🇪' },
  { id: 'Norwegian',          flag: '🇳🇴' },
  { id: 'Danish',             flag: '🇩🇰' },
  { id: 'Finnish',            flag: '🇫🇮' },
  { id: 'Catalan',            flag: '🏴' },
  { id: 'Basque',             flag: '🏴' },
  { id: 'Welsh',              flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { id: 'Irish',              flag: '🇮🇪' },
  // Sub-Saharan Africa
  { id: 'Amharic',            flag: '🇪🇹' },
  { id: 'Hausa',              flag: '🇳🇬' },
  { id: 'Yoruba',             flag: '🇳🇬' },
  { id: 'Igbo',               flag: '🇳🇬' },
  { id: 'Zulu',               flag: '🇿🇦' },
  { id: 'Xhosa',              flag: '🇿🇦' },
  { id: 'Afrikaans',          flag: '🇿🇦' },
  { id: 'Somali',             flag: '🇸🇴' },
  { id: 'Oromo',              flag: '🇪🇹' },
  { id: 'Tigrinya',           flag: '🇪🇷' },
  { id: 'Kinyarwanda',        flag: '🇷🇼' },
  { id: 'Shona',              flag: '🇿🇼' },
  { id: 'Lingala',            flag: '🇨🇩' },
  { id: 'Wolof',              flag: '🇸🇳' },
  { id: 'Bambara',            flag: '🇲🇱' },
  { id: 'Twi',                flag: '🇬🇭' },
  { id: 'Malagasy',           flag: '🇲🇬' },
  // Americas
  { id: 'Haitian Creole',     flag: '🇭🇹' },
  { id: 'Quechua',            flag: '🇵🇪' },
  { id: 'Guaraní',            flag: '🇵🇾' },
  { id: 'Nahuatl',            flag: '🇲🇽' },
  // Pacific
  { id: 'Māori',              flag: '🇳🇿' },
  { id: 'Hawaiian',           flag: '🇺🇸' },
  { id: 'Samoan',             flag: '🇼🇸' },
  { id: 'Tongan',             flag: '🇹🇴' },
]

const PROMPTS = [
  'A village powered entirely by solar energy built by its own people',
  'A child in a refugee camp who becomes an engineer',
  'Robots that rebuild bridges after a flood',
  'A young woman who launches the first satellite from her country',
  'Clean water delivered by drones to remote mountains',
  'A community that turned disaster into a thriving city',
]

async function streamStory(prompt, language, onToken, signal) {
  const res = await fetch(`${BASE}/hope/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, language }),
    signal,
  })
  if (!res.ok) throw new Error(res.statusText)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]' || raw[0] === '[') continue
      try { const t = JSON.parse(raw); if (typeof t === 'string') onToken(t) } catch {}
    }
  }
}

export function HopeTab() {
  const [prompt, setPrompt]       = useState('')
  const [selected, setSelected]   = useState(['English', 'Japanese', 'Filipino', 'Swahili'])
  const [custom, setCustom]       = useState('')    // free-text language input
  const [stories, setStories]     = useState({})   // lang → text
  const [loading, setLoading]     = useState({})   // lang → bool
  const [error, setError]         = useState(null)
  const abortRef = useRef({})

  const toggleLang = (lang) =>
    setSelected(prev =>
      prev.includes(lang)
        ? prev.length > 1 ? prev.filter(l => l !== lang) : prev
        : [...prev, lang]
    )

  const addCustom = () => {
    const lang = custom.trim()
    if (!lang) return
    if (!selected.includes(lang)) setSelected(prev => [...prev, lang])
    setCustom('')
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setStories({})
    setError(null)
    const langs = [...selected]
    setLoading(Object.fromEntries(langs.map(l => [l, true])))

    // Sequential — Ollama is single-threaded, parallel just causes timeouts
    for (const lang of langs) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 240_000) // 4 min per language
      try {
        await streamStory(prompt.trim(), lang, (token) =>
          setStories(prev => ({ ...prev, [lang]: (prev[lang] || '') + token }))
        , ctrl.signal)
      } catch (e) {
        if (e.name !== 'AbortError')
          setStories(prev => ({ ...prev, [lang]: `[error: ${e.message}]` }))
      } finally {
        clearTimeout(timer)
        setLoading(prev => ({ ...prev, [lang]: false }))
      }
    }
  }

  const anyLoading = Object.values(loading).some(Boolean)
  const hasStories = Object.keys(stories).length > 0

  return (
    <div className="flex flex-col h-full bg-black text-[#e8eaed]">

      {/* Top controls */}
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[#1e1e1e] space-y-3">

        {/* Language chips — scrollable */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {LANGS.map(({ id, flag }) => {
            const on = selected.includes(id)
            return (
              <button key={id} onClick={() => toggleLang(id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
                  on
                    ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                    : 'border-[#2d2d2d] text-[#5f6368] hover:border-[#444] hover:text-[#9aa0a6]'
                }`}>
                {flag} {id}
              </button>
            )
          })}
        </div>

        {/* Custom language input */}
        <div className="flex items-center gap-2">
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="Any language… Yoruba, Vietnamese, Tagalog, Amharic…"
            className="flex-1 bg-[#111] border border-[#2d2d2d] rounded-lg px-3 py-1.5 text-xs text-[#e8eaed] placeholder-[#444] focus:outline-none focus:border-amber-400/40"
          />
          <button onClick={addCustom} disabled={!custom.trim()}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#2d2d2d] text-[#9aa0a6] hover:border-amber-400/40 hover:text-amber-400 transition-colors disabled:opacity-30">
            + Add
          </button>
        </div>

        {/* Selected langs (shows any custom ones too) */}
        {selected.some(l => !LANGS.find(x => x.id === l)) && (
          <div className="flex flex-wrap gap-1.5">
            {selected.filter(l => !LANGS.find(x => x.id === l)).map(lang => (
              <span key={lang} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-amber-400 bg-amber-400/10 text-amber-300">
                {lang}
                <button onClick={() => setSelected(prev => prev.filter(l => l !== lang))} className="hover:text-white ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        {/* Prompt chips */}
        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map(p => (
            <button key={p} onClick={() => setPrompt(p)}
              className="text-[10px] px-2.5 py-1 rounded-full border border-[#2d2d2d] text-[#5f6368] hover:border-amber-400/40 hover:text-[#9aa0a6] transition-colors">
              {p}
            </button>
          ))}
        </div>

        {/* Input + button */}
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            placeholder="Describe a dream, a technology, a person…"
            className="flex-1 bg-[#111] border border-[#2d2d2d] rounded-xl px-4 py-2 text-sm text-[#e8eaed] placeholder-[#5f6368] focus:outline-none focus:border-amber-400/50"
          />
          <button onClick={generate} disabled={!prompt.trim() || anyLoading}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-medium transition-colors shrink-0 ${
              !prompt.trim() || anyLoading
                ? 'bg-[#1e1e1e] text-[#5f6368] cursor-not-allowed'
                : 'bg-amber-400 text-black hover:bg-amber-300'
            }`}>
            {anyLoading
              ? <><Loader2 size={12} className="animate-spin" /> Writing…</>
              : <><Sparkles size={12} /> Tell the story</>}
          </button>
        </div>
      </div>

      {/* Stories grid */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {error && (
          <div className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {hasStories ? (
          <div className={`grid gap-4 h-full ${selected.length === 1 ? 'grid-cols-1' : selected.length === 2 ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-3'}`}>
            {selected.map(lang => {
              const flag = LANGS.find(l => l.id === lang)?.flag
              return (
                <div key={lang} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-4 flex flex-col min-h-0">
                  <div className="flex items-center gap-1.5 mb-3 shrink-0">
                    {flag && <span className="text-sm">{flag}</span>}
                    <span className="text-xs font-medium text-[#9aa0a6]">{lang}</span>
                    {loading[lang] && <Loader2 size={11} className="animate-spin text-amber-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-[#c8cace] leading-relaxed whitespace-pre-wrap overflow-y-auto flex-1">
                    {stories[lang] || ''}
                    {loading[lang] && <span className="inline-block w-1 h-3 bg-amber-400 animate-pulse ml-0.5 align-middle rounded-sm" />}
                  </p>
                </div>
              )
            })}
          </div>
        ) : !anyLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
            <Sparkles size={28} className="text-amber-400" />
            <p className="text-xs text-[#9aa0a6] text-center max-w-xs">
              Select languages above, enter a dream or innovation, press Enter.
              <br />Every story generates in all selected languages at once.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
