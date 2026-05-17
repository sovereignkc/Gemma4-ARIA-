import { useState } from 'react'
import { Search, Plus, Trash2, X } from 'lucide-react'
import { embed, cosineSimilarity, chatStream } from '../api/client'

export function RAGPanel() {
  const [docs, setDocs] = useState([])  // { id, text, embedding }
  const [newDoc, setNewDoc] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [answer, setAnswer] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const addDoc = async () => {
    const text = newDoc.trim()
    if (!text) return
    setLoading(true)
    try {
      const res = await embed([text])
      setDocs((d) => [...d, { id: Date.now(), text, embedding: res.embeddings[0] }])
      setNewDoc('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const search = async () => {
    const q = query.trim()
    if (!q || docs.length === 0) return
    setLoading(true); setError(null); setAnswer(''); setResults([])
    try {
      const res = await embed([q])
      const queryVec = res.embeddings[0]
      const ranked = docs
        .map((d) => ({ ...d, score: cosineSimilarity(queryVec, d.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      setResults(ranked)

      // Feed top context into chat
      const context = ranked.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n')
      const prompt = `Using only the following context, answer the question.\n\nContext:\n${context}\n\nQuestion: ${q}`
      setStreaming(true)
      chatStream(prompt, null,
        (token) => setAnswer((a) => a + token),
        () => setStreaming(false),
        (err) => { setError(err.message); setStreaming(false) },
      )
    } catch (e) { setError(e.message); setLoading(false) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">RAG — Retrieval-Augmented Generation</h2>
        <p className="text-xs text-aether-dim mt-0.5">Nomic Embed v2 MoE · semantic search over your documents · offline</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Add document */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Add knowledge ({docs.length} documents indexed)</label>
          <div className="flex gap-2">
            <textarea
              value={newDoc}
              onChange={(e) => setNewDoc(e.target.value)}
              placeholder="Paste field report, protocol, or any text to index…"
              rows={3}
              className="flex-1 bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors resize-none"
            />
            <button onClick={addDoc} disabled={!newDoc.trim() || loading}
              className="px-4 rounded-xl bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Document list */}
        {docs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-aether-dim">Indexed documents</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {docs.map((d) => (
                <div key={d.id} className="flex items-start gap-2 p-3 rounded-xl bg-aether-card border border-aether-border">
                  <p className="flex-1 text-xs text-aether-text line-clamp-2">{d.text}</p>
                  <button onClick={() => setDocs((ds) => ds.filter((x) => x.id !== d.id))}
                    className="shrink-0 text-aether-muted hover:text-red-400 transition-colors mt-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Query */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Query</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder={docs.length === 0 ? 'Add documents first…' : 'Search and ask…'}
              disabled={docs.length === 0}
              className="flex-1 bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors disabled:opacity-40"
            />
            <button onClick={search} disabled={!query.trim() || docs.length === 0 || loading || streaming}
              className="px-4 rounded-xl bg-aether-accent hover:bg-blue-700 disabled:opacity-30 text-white transition-colors">
              <Search size={16} />
            </button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-aether-dim">Top matches</p>
            {results.map((r, i) => (
              <div key={r.id} className="p-3 rounded-xl bg-aether-card border border-aether-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-aether-accent">#{i + 1}</span>
                  <span className="text-[10px] text-aether-muted">similarity {r.score.toFixed(3)}</span>
                </div>
                <p className="text-xs text-aether-text">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {answer && (
          <div className="p-4 rounded-xl bg-aether-card border border-aether-border animate-slide-up">
            <p className="text-xs font-medium text-aether-dim mb-2">Grounded answer</p>
            <p className="text-sm text-aether-text leading-relaxed whitespace-pre-wrap">
              {answer}
              {streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse rounded-sm" />}
            </p>
          </div>
        )}

        {error && <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">{error}</div>}
      </div>
    </div>
  )
}
