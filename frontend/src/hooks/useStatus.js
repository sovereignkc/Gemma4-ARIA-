import { useState, useEffect, useRef } from 'react'
import { getStatus } from '../api/client'

export function useStatus(intervalMs = 8000) {
  const [status, setStatus] = useState(null)
  const [ready, setReady] = useState(false)
  const timerRef = useRef(null)

  const poll = async () => {
    try {
      const data = await getStatus()
      setStatus(data)
      setReady(data.ollama_running)
    } catch {
      setStatus(null)
      setReady(false)
    }
  }

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, intervalMs)
    return () => clearInterval(timerRef.current)
  }, [intervalMs])

  return { status, ready }
}
