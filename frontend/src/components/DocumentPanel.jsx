import { useState, useRef } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { parseDocument } from '../api/client'
import { Markdown } from './Markdown'

export function DocumentPanel() {
  const [file, setFile] = useState(null)
  const [prompt, setPrompt] = useState('Extract and summarize all text from this document.')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const onFile = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
  }

  const pickFile = async () => {
    if (window.aether?.openDocument) {
      // Electron native dialog — shows PDFs properly
      const path = await window.aether.openDocument()
      if (!path) return
      try {
        const res = await fetch(`file://${path}`)
        const blob = await res.blob()
        const name = path.split('/').pop()
        const ext = name.split('.').pop().toLowerCase()
        const mimeMap = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain' }
        onFile(new File([blob], name, { type: mimeMap[ext] || 'application/octet-stream' }))
      } catch (e) {
        setError(`Could not read file: ${e.message}`)
      }
    } else {
      inputRef.current?.click()
    }
  }

  const run = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      setResult(await parseDocument(file, prompt))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fileSizeKB = file ? Math.round(file.size / 1024) : 0

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">Document Parsing</h2>
        <p className="text-xs text-aether-dim mt-0.5">Granite-Docling 258M — PDF, Word, text extraction · fully offline</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

        {/* Drop zone */}
        {!file ? (
          <div
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
            onDragOver={(e) => e.preventDefault()}
            onClick={pickFile}
            className="border-2 border-dashed border-aether-border rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer hover:border-aether-accent/50 hover:bg-aether-card/30 transition-all">
            <FileText size={36} className="text-aether-muted" />
            <div className="text-center">
              <p className="text-sm font-medium text-aether-text">Drop file or click to browse</p>
              <p className="text-xs text-aether-dim mt-1">PDF · DOCX · TXT · Images of documents</p>
            </div>
            {/* Accept PDFs and images — both MIME types and extensions */}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt,image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-aether-card border border-aether-border">
            <FileText size={20} className="text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-aether-text font-medium truncate">{file.name}</p>
              <p className="text-xs text-aether-muted">{fileSizeKB} KB · {file.type || 'document'}</p>
            </div>
            <button onClick={() => { setFile(null); setResult(null) }}
              className="p-1.5 rounded-lg text-aether-muted hover:text-red-400 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Prompt */}
        <div>
          <label className="block text-xs font-medium text-aether-dim mb-2">Extraction prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full bg-aether-card border border-aether-border rounded-xl px-4 py-3 text-sm text-aether-text placeholder-aether-muted focus:outline-none focus:border-aether-accent transition-colors resize-none"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              'Summarize key points',
              'Extract all action items',
              'List resources and quantities',
              'Identify risks and warnings',
            ].map((p) => (
              <button key={p} onClick={() => setPrompt(p)}
                className="text-[10px] px-2.5 py-1 rounded-full bg-aether-card border border-aether-border text-aether-dim hover:text-aether-text transition-colors">
                {p}
              </button>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={!file || loading}
          className="w-full py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
          {loading ? 'Parsing document…' : 'Parse Document'}
        </button>

        {result && (
          <div className="space-y-4 animate-slide-up">
            {result.extracted_text && (
              <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
                <p className="text-xs font-medium text-aether-dim mb-2">Extracted text</p>
                <pre className="text-xs text-aether-text whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">{result.extracted_text}</pre>
              </div>
            )}
            <div className="p-4 rounded-xl bg-aether-card border border-aether-border">
              <p className="text-xs font-medium text-aether-dim mb-2">Summary · {result.model}</p>
              <Markdown text={result.summary} />
            </div>
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
