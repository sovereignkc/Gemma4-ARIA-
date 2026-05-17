/**
 * Lightweight markdown renderer — no external deps.
 * Handles: headings, bold, italic, inline code, code blocks, bullets, numbered lists, horizontal rules.
 */
export function Markdown({ text, streaming }) {
  if (!text) {
    return streaming ? <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse rounded-sm" /> : null
  }

  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="my-2 p-3 rounded-lg bg-black/40 border border-aether-border overflow-x-auto text-xs font-mono text-green-300 leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }

    // Heading
    const hMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const sizes = ['text-base font-bold', 'text-sm font-bold', 'text-sm font-semibold', 'text-xs font-semibold']
      elements.push(
        <p key={i} className={`mt-3 mb-1 ${sizes[level - 1] || 'text-sm font-semibold'} text-aether-text`}>
          {inlineFormat(hMatch[2])}
        </p>
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^[-*]{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-3 border-aether-border" />)
      i++
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ''))
        i++
      }
      elements.push(
        <ul key={i} className="my-1 ml-4 space-y-0.5 list-disc list-outside">
          {items.map((it, j) => <li key={j} className="text-sm">{inlineFormat(it)}</li>)}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={i} className="my-1 ml-4 space-y-0.5 list-decimal list-outside">
          {items.map((it, j) => <li key={j} className="text-sm">{inlineFormat(it)}</li>)}
        </ol>
      )
      continue
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
      i++
      continue
    }

    // Normal paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed">{inlineFormat(line)}</p>
    )
    i++
  }

  return (
    <div className="space-y-0.5">
      {elements}
      {streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse rounded-sm" />}
    </div>
  )
}

function inlineFormat(text) {
  // Split on bold (**text**), italic (*text*), inline code (`text`)
  const parts = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const raw = m[0]
    if (raw.startsWith('**')) {
      parts.push(<strong key={m.index} className="font-semibold text-aether-text">{raw.slice(2, -2)}</strong>)
    } else if (raw.startsWith('*')) {
      parts.push(<em key={m.index} className="italic">{raw.slice(1, -1)}</em>)
    } else {
      parts.push(<code key={m.index} className="px-1 py-0.5 rounded bg-black/40 font-mono text-xs text-green-300">{raw.slice(1, -1)}</code>)
    }
    last = m.index + raw.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}
