export function SafetyBadge({ level }) {
  if (!level || level === 'safe') return null
  const styles = {
    warn:    'bg-warn/20 text-warn border border-warn/30',
    block:   'bg-blocked/20 text-blocked-badge border border-blocked/30',
    blocked: 'bg-blocked/20 text-blocked-badge border border-blocked/30',
  }
  const labels = { warn: 'Review Recommended', block: 'Blocked', blocked: 'Blocked' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${styles[level] || ''}`}>
      {level === 'warn' ? '⚠️' : '🚫'} {labels[level] || level}
    </span>
  )
}
