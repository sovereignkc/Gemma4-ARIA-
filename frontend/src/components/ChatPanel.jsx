import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, StopCircle, AlertTriangle, Zap, Plus, Trash2 } from 'lucide-react'
import { chatStream } from '../api/client'
import { SafetyBadge } from './SafetyBadge'
import { Markdown } from './Markdown'
import { useChatHistory } from '../hooks/useChatHistory'

function ModelTag({ mode }) {
  if (mode === 'disaster') return (
    <span className="flex items-center gap-1 text-xs text-disaster font-medium">
      <AlertTriangle size={11} /> Disaster
    </span>
  )
  if (mode === 'moonshot') return (
    <span className="flex items-center gap-1 text-xs text-moonshot font-medium">
      <Zap size={11} /> Moonshot
    </span>
  )
  return mode ? <span className="text-xs text-aether-dim">{mode}</span> : null
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
        ${isUser ? 'bg-green-700 text-white' : 'bg-aether-muted text-aether-dim'}`}>
        {isUser ? 'U' : 'G'}
      </div>
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {!isUser && (msg.mode || msg.safety) && (
          <div className="flex items-center gap-2">
            <ModelTag mode={msg.mode} />
            <SafetyBadge level={msg.safety} />
          </div>
        )}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-green-800 text-white rounded-tr-sm whitespace-pre-wrap'
            : 'bg-aether-card text-aether-text rounded-tl-sm border border-aether-border'}`}>
          {isUser
            ? msg.content
            : <Markdown text={msg.content || ''} streaming={msg.streaming} />
          }
        </div>
      </div>
    </div>
  )
}

// ── Chat history sidebar ──────────────────────────────────────────────────────

function HistorySidebar({ chats, activeChatId, onSelect, onNew, onDelete }) {
  return (
    <div className="w-52 shrink-0 flex flex-col border-r border-aether-border bg-aether-surface overflow-hidden">
      <div className="px-3 py-3 border-b border-aether-border">
        <button onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-aether-accent text-white text-xs font-medium hover:bg-blue-700 transition-colors">
          <Plus size={13} /> New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {chats.length === 0 && (
          <p className="text-center text-xs text-aether-muted py-6">No chats yet</p>
        )}
        {chats.map((c) => (
          <div key={c.id}
            className={`group flex items-center gap-1 mx-2 mb-0.5 rounded-lg cursor-pointer transition-colors
              ${c.id === activeChatId ? 'bg-aether-card' : 'hover:bg-aether-card/50'}`}
            onClick={() => onSelect(c.id)}>
            <div className="flex-1 min-w-0 px-2 py-2">
              <p className="text-xs text-aether-text truncate">{c.title}</p>
              <p className="text-[10px] text-aether-muted">
                {new Date(c.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
              className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 text-aether-muted hover:text-red-400 transition-all">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

const STARTERS = [
  'How do I purify flood water with chlorine tablets?',
  'Design a solar microgrid for a 500-person refugee camp',
  'Earthquake evacuation checklist for a coastal town',
  'Build a biogas digester for 50 families — materials list',
]

export function ChatPanel({ forcedMode }) {
  const history = useChatHistory()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const stopRef = useRef(null)
  const bottomRef = useRef(null)

  // Temp streaming messages shown before they're committed to history
  const [streamingMsgs, setStreamingMsgs] = useState([])
  const [thinking, setThinking] = useState(false)  // true while waiting for Ollama to start

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history.messages, streamingMsgs])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const chatId = history.ensureChat()
    const userMsg = { role: 'user', content: text, id: Date.now() }
    history.appendMessage(chatId, { role: 'user', content: text })

    const botId = `bot-${Date.now()}`
    setStreamingMsgs([{ id: botId, role: 'bot', content: '', streaming: true, mode: null, safety: null }])
    setStreaming(true)
    setThinking(true)

    stopRef.current = chatStream(
      text,
      chatId,
      // onToken — first token means Ollama started responding
      (token) => {
        setThinking(false)
        setStreamingMsgs((prev) =>
          prev.map((m) => m.id === botId ? { ...m, content: m.content + token } : m)
        )
      },
      // onDone — receives optional meta {mode, safety, model}
      (meta) => {
        setThinking(false)
        setStreamingMsgs((prev) => {
          const botMsg = prev.find((m) => m.id === botId)
          if (botMsg) {
            history.appendMessage(chatId, {
              role: 'bot',
              content: botMsg.content,
              mode: meta?.mode || null,
              safety: meta?.safety || null,
            })
          }
          return []
        })
        setStreaming(false)
      },
      // onError
      (err) => {
        setThinking(false)
        history.appendMessage(chatId, {
          role: 'bot',
          content: `Error: ${err.message}`,
          mode: null,
          safety: null,
        })
        setStreamingMsgs([])
        setStreaming(false)
      },
      // onThinking heartbeat — keep indicator alive
      () => setThinking(true),
    )
  }, [input, streaming, history])

  const stop = () => { stopRef.current?.(); setStreaming(false); setThinking(false); setStreamingMsgs([]) }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const allMessages = [...(history.messages || []), ...streamingMsgs]

  return (
    <div className="flex h-full">
      {/* Chat history sidebar */}
      <HistorySidebar
        chats={history.chats}
        activeChatId={history.activeChatId}
        onSelect={history.selectChat}
        onNew={history.newChat}
        onDelete={history.deleteChat}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="px-6 py-3 border-b border-aether-border">
          <h2 className="font-semibold text-aether-text text-sm">
            {history.activeChat?.title || 'Infrastructure AI'}
          </h2>
          <p className="text-xs text-aether-dim mt-0.5">
            Auto-routed · Disaster Response + Moonshot Infrastructure
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-aether-dim animate-fade-in">
              <div className="text-center space-y-2">
                <p className="text-2xl font-bold text-aether-text leading-tight">
                  Point camera at your field situation,<br />
                  or describe what you're facing.
                </p>
                <p className="text-sm text-aether-dim">
                  Disaster response · Clean water · Energy · Food security — all offline
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg mt-2">
                {STARTERS.map((q) => (
                  <button key={q} onClick={() => setInput(q)}
                    className="text-left text-xs px-3 py-3 rounded-xl bg-aether-card border border-aether-border text-aether-dim hover:text-aether-text hover:border-aether-accent/50 transition-colors leading-relaxed">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {allMessages.map((msg) => <Message key={msg.id || msg.role + msg.content?.slice(0, 10)} msg={msg} />)}

          {/* Thinking indicator — shown while Ollama loads the model and generates */}
          {thinking && streamingMsgs.length > 0 && !streamingMsgs[0]?.content && (
            <div className="flex gap-3 animate-slide-up">
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-aether-muted text-aether-dim">G</div>
              <div className="px-4 py-3 rounded-2xl bg-aether-card border border-aether-border text-sm text-aether-dim flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-aether-dim animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-aether-dim animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-aether-dim animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-xs text-aether-muted">Generating… first response may take 30–60s while model loads</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-aether-border">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Describe your situation or ask about water, energy, shelter, evacuation…"
              rows={1}
              className="flex-1 resize-none bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors min-h-[48px] max-h-36"
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
            />
            {streaming
              ? <button onClick={stop} className="p-3 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors shrink-0">
                  <StopCircle size={18} />
                </button>
              : <button onClick={send} disabled={!input.trim()}
                  className="p-3 rounded-xl bg-aether-accent hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors shrink-0">
                  <Send size={18} />
                </button>
            }
          </div>
          <p className="text-[10px] text-aether-muted mt-2">⏎ Send · Shift+⏎ New line · Safety layer always active</p>
        </div>
      </div>
    </div>
  )
}
