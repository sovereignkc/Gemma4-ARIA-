/**
 * useChatHistory — persistent chat sessions in localStorage.
 *
 * Structure:
 *   localStorage['g4g_chats'] = JSON array of Chat objects:
 *   { id, title, createdAt, updatedAt, messages: [{role, content, mode, safety}] }
 */
import { useState, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'g4g_chats'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function save(chats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
  } catch (e) {
    // localStorage full — drop oldest chats until it fits
    if (e.name === 'QuotaExceededError' && chats.length > 1) {
      save(chats.slice(1))
    }
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function titleFrom(messages) {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return 'New chat'
  return first.content.slice(0, 60) + (first.content.length > 60 ? '…' : '')
}

export function useChatHistory() {
  const [chats, setChats] = useState(() => load())
  // Auto-select most recent chat on load so history renders immediately
  const [activeChatId, setActiveChatId] = useState(() => {
    const saved = load()
    return saved.length > 0 ? saved[0].id : null
  })

  // Current chat messages (derived from chats + activeChatId)
  const activeChat = chats.find((c) => c.id === activeChatId) || null
  const messages = activeChat?.messages || []

  // Persist whenever chats change
  useEffect(() => { save(chats) }, [chats])

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    const id = makeId()
    const chat = { id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }
    setChats((prev) => [chat, ...prev])
    setActiveChatId(id)
    return id
  }, [])

  const deleteChat = useCallback((id) => {
    setChats((prev) => prev.filter((c) => c.id !== id))
    setActiveChatId((cur) => cur === id ? null : cur)
  }, [])

  const selectChat = useCallback((id) => setActiveChatId(id), [])

  // ── Message management ───────────────────────────────────────────────────

  const appendMessage = useCallback((chatId, msg) => {
    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c
      const messages = [...c.messages, msg]
      return { ...c, messages, title: titleFrom(messages), updatedAt: Date.now() }
    }))
  }, [])

  const updateLastBot = useCallback((chatId, updater) => {
    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c
      const messages = [...c.messages]
      const last = messages.length - 1
      if (last >= 0 && messages[last].role === 'bot') {
        messages[last] = typeof updater === 'function' ? updater(messages[last]) : { ...messages[last], ...updater }
      }
      return { ...c, messages, updatedAt: Date.now() }
    }))
  }, [])

  // Ensure there's always an active chat
  const ensureChat = useCallback(() => {
    if (activeChatId && chats.find((c) => c.id === activeChatId)) return activeChatId
    if (chats.length > 0) { setActiveChatId(chats[0].id); return chats[0].id }
    return newChat()
  }, [activeChatId, chats, newChat])

  return {
    chats,
    activeChatId,
    activeChat,
    messages,
    newChat,
    deleteChat,
    selectChat,
    appendMessage,
    updateLastBot,
    ensureChat,
  }
}
