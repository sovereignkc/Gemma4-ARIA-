import { AlertTriangle, Zap, Wrench, Heart, Radio } from 'lucide-react'

const MODES = [
  {
    id: 'chat',
    icon: AlertTriangle,
    label: 'Infrastructure AI',
    sub: 'Water · Energy · Food · Disaster',
    color: 'text-disaster',
    desc: 'Gemma 4 auto-routed chat with memory',
  },
  {
    id: 'live',
    icon: Radio,
    label: 'Field Analysis',
    sub: 'Live CV · Voice · Image',
    color: 'text-cyan-400',
    desc: 'Saliency crops → SmolVLM2 → real-time risk',
  },
  {
    id: 'tools',
    icon: Wrench,
    label: 'Field Tools',
    sub: 'Docs · OCR · Search · TTS',
    color: 'text-amber-400',
    desc: 'Offline document + speech tools',
  },
]

// Sub-items shown when a top-level mode is active
const SUB_ITEMS = {
  live: [
    { id: 'live',       label: 'Live Scene AI',  dot: 'bg-disaster' },
    { id: 'multimodal', label: 'Image + Chat',   dot: 'bg-cyan-400' },
    { id: 'voice',      label: 'Voice Chat',     dot: 'bg-blue-400' },
  ],
  tools: [
    { id: 'ocr',      label: 'OCR',            dot: 'bg-teal-400' },
    { id: 'document', label: 'Documents',      dot: 'bg-indigo-400' },
    { id: 'tts',      label: 'Text to Speech', dot: 'bg-pink-400' },
    { id: 'rag',      label: 'RAG / Embed',    dot: 'bg-amber-400' },
  ],
}

// Map leaf ids to their parent group
const PARENT = {
  chat: 'chat', disaster: 'chat', moonshot: 'chat',
  live: 'live', multimodal: 'live', voice: 'live',
  tools: 'tools', ocr: 'tools', document: 'tools', tts: 'tools', rag: 'tools',
}

export function Sidebar({ mode, setMode }) {
  const activeGroup = PARENT[mode] || mode

  return (
    <nav className="w-52 shrink-0 flex flex-col bg-aether-surface border-r border-aether-border overflow-y-auto">
      {/* Logo */}
      <div className="px-4 pt-7 pb-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-700 flex items-center justify-center text-white">
            <Heart size={14} strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-bold text-aether-text text-sm leading-tight">Gemma 4 Good</p>
            <p className="text-[9px] text-aether-muted">Humanitarian AI · Offline</p>
          </div>
        </div>
      </div>

      {/* Top-level 3 modes */}
      <div className="px-2 space-y-1">
        {MODES.map(({ id, icon: Icon, label, sub, color }) => {
          const isActive = activeGroup === id
          return (
            <div key={id}>
              <button
                onClick={() => setMode(id === 'tools' ? 'ocr' : id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                  ${isActive ? 'bg-aether-card shadow-sm' : 'hover:bg-aether-card/40'}`}
              >
                <Icon size={16} className={isActive ? color : 'text-aether-muted'} strokeWidth={2} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${isActive ? 'text-aether-text' : 'text-aether-dim'}`}>{label}</p>
                  <p className="text-[10px] text-aether-muted leading-tight mt-0.5">{sub}</p>
                </div>
              </button>

              {/* Sub-items expand when group is active */}
              {isActive && SUB_ITEMS[id] && (
                <div className="ml-6 mt-1 mb-2 space-y-0.5 border-l border-aether-border pl-3">
                  {SUB_ITEMS[id].map(({ id: subId, label: subLabel, dot }) => (
                    <button key={subId} onClick={() => setMode(subId)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-xs
                        ${mode === subId ? 'text-aether-text font-medium bg-aether-card/60' : 'text-aether-dim hover:text-aether-text'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mode === subId ? dot : 'bg-aether-muted'}`} />
                      {subLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex-1" />

      {/* Safety notice */}
      <div className="mx-3 mb-4 p-3 rounded-xl bg-aether-card border border-aether-border text-[10px] text-aether-dim leading-relaxed">
        <p className="font-semibold text-aether-text mb-1">Safety Layer Active</p>
        Blocks harmful content. Medical + engineering disclaimers auto-added.
      </div>
    </nav>
  )
}
