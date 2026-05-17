import { useState } from 'react'
import { AriaChat } from './components/AriaChat'
import { HopeTab } from './components/HopeTab'
import { useStatus } from './hooks/useStatus'

const TABS = [
  { id: 'aria',  label: '◆ ARIA' },
  { id: 'hope',  label: '✦ Hope' },
]

export default function App() {
  const { ready } = useStatus()
  const [tab, setTab] = useState('aria')

  return (
    <div className="flex flex-col h-screen bg-black text-[#e8eaed] overflow-hidden select-none">
      {/* Electron drag region */}
      <div className="h-8 shrink-0 w-full" style={{ WebkitAppRegion: 'drag' }} />

      {/* Top bar */}
      <header className="shrink-0 flex items-center px-6 py-2 border-b border-[#1e1e1e]" style={{ WebkitAppRegion: 'no-drag' }}>
        <div className="flex items-center gap-2">
          <span className="text-[#1a73e8] text-lg leading-none">◆</span>
          <span className="font-semibold text-white text-sm tracking-wide">Gemma ARIA</span>
          <span className="text-[10px] text-[#5f6368] ml-1 hidden sm:block">
            Adaptive Resilience Infrastructure Intelligence
          </span>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mx-6 bg-[#111] border border-[#2d2d2d] rounded-lg p-0.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t.id
                  ? t.id === 'hope'
                    ? 'bg-amber-400 text-black'
                    : 'bg-[#1a73e8] text-white'
                  : 'text-[#5f6368] hover:text-[#e8eaed]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-[#22c55e]' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-[10px] text-[#5f6368]">{ready ? 'Ollama ready' : 'Connecting…'}</span>
        </div>
      </header>

      {/* Ollama offline banner */}
      {!ready && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-amber-950/40 border-b border-amber-900/50 text-amber-400 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Waiting for Ollama — make sure it's running on port 11434
        </div>
      )}

      {/* Main panel */}
      <main className="flex-1 min-h-0">
        {tab === 'aria' ? <AriaChat /> : <HopeTab />}
      </main>

      <footer className="shrink-0 flex items-center justify-center px-6 py-1.5 border-t border-[#1e1e1e] text-[10px] text-[#5f6368]">
        Gemma ARIA v1.0 · 100% Offline · Powered by Gemma 4
      </footer>
    </div>
  )
}
