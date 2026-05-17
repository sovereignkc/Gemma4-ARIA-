export function StatusBar({ status, ready }) {
  const dot = ready
    ? 'bg-safe animate-pulse-slow'
    : 'bg-red-500 animate-pulse'

  const missing = status?.models_missing ?? []

  return (
    <footer className="flex items-center justify-between px-4 py-1.5 bg-aether-surface border-t border-aether-border text-xs text-aether-dim select-none">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span>{ready ? 'Ollama connected' : 'Connecting to Ollama…'}</span>
        {missing.length > 0 && (
          <span className="text-warn">⚠ Missing: {missing.join(', ')}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {status && (
          <>
            <span>{status.models_available?.length ?? 0} models loaded</span>
            <span className="text-aether-muted">|</span>
            <span>Gemma 4 Good v1.0 · localhost:8000</span>
          </>
        )}
      </div>
    </footer>
  )
}
