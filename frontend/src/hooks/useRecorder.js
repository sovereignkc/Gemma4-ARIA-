import { useState, useRef, useCallback } from 'react'

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioURL, setAudioURL] = useState(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioURL(url)
      stream.getTracks().forEach((t) => t.stop())
    }
    recorder.start(250)
    mediaRef.current = recorder
    setRecording(true)
    setAudioBlob(null)
    setAudioURL(null)
  }, [])

  const stop = useCallback(() => {
    mediaRef.current?.stop()
    setRecording(false)
  }, [])

  const clear = useCallback(() => {
    setAudioBlob(null)
    setAudioURL(null)
  }, [])

  return { recording, audioBlob, audioURL, start, stop, clear }
}
