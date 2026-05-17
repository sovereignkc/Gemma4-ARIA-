/**
 * useSTT — MediaRecorder → POST /stt → faster-whisper-tiny transcript
 * Click mic to start recording, click again to stop and transcribe.
 * No Web Speech API — uses the FastAPI backend which is stable and offline.
 */
import { useState, useRef } from 'react'

const BASE = 'http://localhost:8000'

// Pick the best supported audio MIME type for this browser/Electron build
function pickMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    '',
  ]
  return candidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) || ''
}

export function useSTT(onTranscript, onError) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mime = pickMime()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {})

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Stop all mic tracks so the OS indicator goes away
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        if (blob.size < 1000) return  // too short, skip

        setLoading(true)
        try {
          const fd = new FormData()
          fd.append('file', blob, 'recording.webm')
          const res = await fetch(`${BASE}/stt`, { method: 'POST', body: fd })
          if (!res.ok) throw new Error(`STT failed: ${res.statusText}`)
          const data = await res.json()
          const text = (data.transcript || '').trim()
          if (text) onTranscript(text)
        } catch (e) {
          onError?.(e.message)
        } finally {
          setLoading(false)
        }
      }

      // Collect data every 250ms so we don't lose audio if stop fires early
      recorder.start(250)
      recorderRef.current = recorder
      setRecording(true)
    } catch (e) {
      onError?.(e.name === 'NotAllowedError' ? 'Mic access denied' : e.message)
    }
  }

  const stop = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  const toggle = () => (recording ? stop() : start())

  return { recording, loading, toggle }
}
