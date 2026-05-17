import { useState, useRef } from 'react'
import { Layers, Copy, Check } from 'lucide-react'
import { ocr } from '../api/client'

export function OCRPanel() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const onFile = (f) => {
    if (!f?.type.startsWith('image/')) return
    setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError(null)
  }

  const run = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try { setResult(await ocr(file)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const copy = () => {
    navigator.clipboard.writeText(result?.extracted_text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-aether-border">
        <h2 className="font-semibold text-aether-text">OCR — Image to Text</h2>
        <p className="text-xs text-aether-dim mt-0.5">GLM-OCR extracts text from any image — signs, documents, handwriting</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        <div
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-aether-border rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-aether-accent/50 hover:bg-aether-card/30 transition-all">
          {preview
            ? <img src={preview} alt="" className="max-h-48 rounded-xl object-contain" />
            : <><Layers size={32} className="text-aether-muted" /><p className="text-sm text-aether-dim">Drop image or click to browse</p></>}
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onFile(e.target.files[0])} />
        </div>

        {file && (
          <button onClick={run} disabled={loading}
            className="w-full py-3 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Extracting text…' : 'Extract Text'}
          </button>
        )}

        {result && (
          <div className="p-4 rounded-xl bg-aether-card border border-aether-border animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-aether-dim">Extracted text · {result.model}</p>
              <button onClick={copy} className="flex items-center gap-1 text-xs text-aether-dim hover:text-aether-text transition-colors">
                {copied ? <><Check size={12} className="text-safe" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <pre className="text-sm text-aether-text whitespace-pre-wrap font-mono leading-relaxed">{result.extracted_text}</pre>
          </div>
        )}

        {error && <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">{error}</div>}
      </div>
    </div>
  )
}
