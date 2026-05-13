import { useState, useRef, useEffect, useCallback } from 'react'

// ── Model registry ──────────────────────────────────────────────────────────
// Check current IDs at https://openrouter.ai/models
const MODELS = [
  { id: 'anthropic/claude-sonnet-4.6',        name: 'Claude Sonnet',   tag: 'CLAUDE',  color: '#C4A472' },
  { id: 'anthropic/claude-opus-4',             name: 'Claude Opus',     tag: 'OPUS',    color: '#C4A472' },
  { id: 'google/gemini-2.5-pro-preview',       name: 'Gemini 2.5 Pro',  tag: 'GEMINI',  color: '#6BA3E0' },
  { id: 'google/gemini-2.0-flash-001',          name: 'Gemini Flash',    tag: 'FLASH',   color: '#6BA3E0' },
  { id: 'x-ai/grok-3',                         name: 'Grok 3',          tag: 'GROK',    color: '#E07070' },
  { id: 'x-ai/grok-3-mini',                    name: 'Grok 3 Mini',     tag: 'GROK·M',  color: '#E07070' },
  { id: 'openai/gpt-4o',                       name: 'GPT-4o',          tag: 'GPT-4o',  color: '#7DCF8A' },
]

const DEFAULT_MODEL = MODELS[0].id
const DEFAULT_ROUTE = MODELS[2].id

function getModelInfo(id) {
  return MODELS.find(m => m.id === id) ?? { tag: id.split('/')[1] ?? id, color: '#888', name: id }
}

// ── Conversation sanitizer ────────────────────────────────────────────────────
function sanitizeForModel(messages, modelId) {
  let result = messages
  if (modelId.startsWith('google/')) {
    result = result.map(m =>
      m.role === 'assistant'
        ? { ...m, content: m.content.replace(/^\[[^\]]+\]: /, '') }
        : m
    )
  }
  // Merge consecutive same-role messages (required by some models)
  result = result.reduce((acc, msg) => {
    const prev = acc[acc.length - 1]
    if (prev && prev.role === msg.role) {
      return [...acc.slice(0, -1), { ...prev, content: `${prev.content}\n${msg.content}` }]
    }
    return [...acc, msg]
  }, [])
  return result
}

// ── Setup screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [val, setVal] = useState('')
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-logo">Relay</div>
        <p className="setup-tagline">Multi-model conversation router</p>
        <div className="setup-field">
          <label>OpenRouter API Key</label>
          <input
            type="password"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && val.trim() && onSave(val.trim())}
            placeholder="sk-or-v1-…"
            autoFocus
          />
        </div>
        <button
          className="setup-btn"
          onClick={() => val.trim() && onSave(val.trim())}
          disabled={!val.trim()}
        >
          Connect →
        </button>
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="setup-link"
        >
          openrouter.ai/keys
        </a>
      </div>
    </div>
  )
}

// ── Message component ─────────────────────────────────────────────────────────
function Message({ msg, isLast, loading, onRoute }) {
  const [routeTarget, setRouteTarget] = useState(DEFAULT_ROUTE)
  const info = msg.model ? getModelInfo(msg.model) : null
  const isUser = msg.role === 'user'

  return (
    <div className={`msg ${isUser ? 'msg--user' : 'msg--assistant'}`}>
      <div className="msg-meta">
        {isUser ? (
          <span className="tag tag--user">YOU</span>
        ) : (
          <span className="tag" style={{ color: info?.color, borderColor: info?.color + '60' }}>
            {info?.tag}
          </span>
        )}
        {msg.seenBy?.length > 0 && (
          <div className="seen-by">
            {msg.seenBy.map(id => {
              const m = getModelInfo(id)
              return <span key={id} className="seen-dot" style={{ background: m.color }} title={m.name} />
            })}
          </div>
        )}
      </div>
      <div className="msg-body">{msg.content}</div>

      {/* Route bar — only on last assistant message when idle */}
      {!isUser && isLast && !loading && (
        <div className="route-bar">
          <span className="route-label">route to</span>
          <select
            value={routeTarget}
            onChange={e => setRouteTarget(e.target.value)}
            className="route-select"
          >
            {MODELS.filter(m => m.id !== msg.model).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button className="route-btn" onClick={() => onRoute(routeTarget)}>
            →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Loading indicator ─────────────────────────────────────────────────────────
function Thinking({ modelId }) {
  const info = getModelInfo(modelId)
  return (
    <div className="msg msg--assistant msg--thinking">
      <div className="msg-meta">
        <span className="tag" style={{ color: info.color, borderColor: info.color + '60' }}>
          {info.tag}
        </span>
      </div>
      <div className="thinking-dots">
        <span /><span /><span />
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ conversations, activeId, onNewChat, onLoad, onDelete }) {
  const formatDate = (ts) => {
    const now = new Date()
    const d = new Date(ts)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (d.toDateString() === now.toDateString()) return 'today'
    if (d.toDateString() === yesterday.toDateString()) return 'yesterday'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <aside className="sidebar">
      <button className="sidebar-new" onClick={onNewChat}>+ New chat</button>
      <div className="sidebar-list">
        {conversations.map(c => (
          <div
            key={c.id}
            className={`sidebar-item${c.id === activeId ? ' sidebar-item--active' : ''}`}
            onClick={() => onLoad(c)}
          >
            <div className="sidebar-item-title">{c.title || 'Untitled'}</div>
            <div className="sidebar-item-date">{formatDate(c.createdAt)}</div>
            <button
              className="sidebar-delete"
              onClick={e => { e.stopPropagation(); onDelete(c.id) }}
              title="Delete"
            >×</button>
          </div>
        ))}
      </div>
    </aside>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey]           = useState(() => localStorage.getItem('relay_key') || '')
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('relay_conversations') ?? '[]') }
    catch { return [] }
  })
  const [activeConversationId, setActiveConversationId] = useState(() => crypto.randomUUID())
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [model, setModel]             = useState(DEFAULT_MODEL)
  const [systemPrompt, setSystemPrompt] = useState('You are [MODEL_NAME], one of several AI models in a multi-model collaboration tool called Relay. The user can prompt you directly or route conversations between models to get diverse perspectives. Your role is to give your honest, independent assessment — not to repeat or validate what other models have said. If you see responses from other models in the conversation (marked with [MODEL responded]:), treat them as peer input: build on them if they\'re correct, respectfully challenge them if you disagree, and fill in gaps they missed. The goal is collective accuracy and quality, not consensus. Be concise and direct. Respond in the same language the user writes in, regardless of other models\' language choices.')
  const [loading, setLoading]         = useState(false)
  const [loadingModel, setLoadingModel] = useState(null)
  const [showSystem, setShowSystem]   = useState(false)

  const textareaRef = useRef(null)
  const bottomRef   = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Persist conversation whenever messages change
  useEffect(() => {
    if (messages.length === 0 || !activeConversationId) return
    const title = messages.find(m => m.role === 'user')?.content.slice(0, 50) ?? 'Untitled'
    setConversations(prev => {
      const exists = prev.some(c => c.id === activeConversationId)
      const updated = exists
        ? prev.map(c => c.id === activeConversationId ? { ...c, title, messages } : c)
        : [{ id: activeConversationId, title, createdAt: Date.now(), messages }, ...prev]
      localStorage.setItem('relay_conversations', JSON.stringify(updated))
      return updated
    })
  }, [messages, activeConversationId])

  const handleTextareaInput = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
    }
  }

  const saveKey = useCallback((key) => {
    localStorage.setItem('relay_key', key)
    setApiKey(key)
  }, [])

  const removeKey = () => {
    localStorage.removeItem('relay_key')
    setApiKey('')
  }

  const handleNewChat = useCallback(() => {
    setMessages([])
    setActiveConversationId(crypto.randomUUID())
  }, [])

  const handleLoadConversation = useCallback((conv) => {
    setMessages(conv.messages)
    setActiveConversationId(conv.id)
  }, [])

  const handleDeleteConversation = useCallback((id) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id)
      localStorage.setItem('relay_conversations', JSON.stringify(updated))
      return updated
    })
    if (id === activeConversationId) {
      setMessages([])
      setActiveConversationId(crypto.randomUUID())
    }
  }, [activeConversationId])

  // Core API call — accepts an explicit message array and model ID
  const callAPI = useCallback(async (conversation, modelId) => {
    setLoading(true)
    setLoadingModel(modelId)

    const apiMessages = conversation.map(m => {
      if (m.role === 'assistant' && m.model) {
        const tag = getModelInfo(m.model).tag
        return { role: 'assistant', content: `[${tag}]: ${m.content}` }
      }
      return { role: m.role, content: m.content }
    })
    const sanitizedMessages = sanitizeForModel(apiMessages, modelId)
    const modelName = getModelInfo(modelId).name
    const identityPrefix = `You are ${modelName}. You are not any other model. Never impersonate or speak as another model. Messages prefixed with [MODEL responded]: are responses from other AI models shown for context — treat them as reference only.`
    const fullSystemPrompt = systemPrompt
      ? `${identityPrefix}\n\n${systemPrompt}`
      : identityPrefix

    const payload = {
      model: modelId,
      messages: [{ role: 'system', content: fullSystemPrompt }, ...sanitizedMessages],
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : '',
          'X-Title': 'Relay',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message ?? `HTTP ${res.status}`)
      }

      const raw = data.choices?.[0]?.message?.content
      const content = Array.isArray(raw)
        ? raw.filter(b => b.type === 'text').map(b => b.text).join('')
        : (raw ?? '(no content in response)')
      const reply = { role: 'assistant', content, model: modelId, seenBy: [modelId] }
      const convoLen = conversation.length
      setMessages(prev => [
        ...prev.slice(0, convoLen).map(m =>
          m.seenBy?.includes(modelId) ? m : { ...m, seenBy: [...(m.seenBy ?? []), modelId] }
        ),
        ...prev.slice(convoLen),
        reply,
      ])
    } catch (err) {
      const reply = { role: 'assistant', content: `⚠ Error: ${err.message}`, model: modelId, seenBy: [modelId] }
      setMessages(prev => [...prev, reply])
    } finally {
      setLoading(false)
      setLoadingModel(null)
    }
  }, [apiKey, systemPrompt])

  // Send a new user message
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, model: null, seenBy: [] }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    callAPI(next, model)
  }, [input, loading, messages, model, callAPI])

  // Route existing conversation to a different model (no new user message)
  const handleRoute = useCallback((targetModel) => {
    if (loading) return
    callAPI(messages, targetModel)
  }, [loading, messages, callAPI])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!apiKey) return <SetupScreen onSave={saveKey} />

  return (
    <div className="shell">
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        onNewChat={handleNewChat}
        onLoad={handleLoadConversation}
        onDelete={handleDeleteConversation}
      />
      <div className="app">
        {/* ── Header ── */}
        <header className="header">
          <span className="header-logo">Relay</span>
          <div className="header-actions">
            <button
              className={`header-btn ${showSystem ? 'header-btn--active' : ''}`}
              onClick={() => setShowSystem(s => !s)}
              title="System prompt"
            >
              SYS
            </button>
            <button
              className="header-btn"
              onClick={handleNewChat}
              title="New conversation"
            >
              CLEAR
            </button>
            <button
              className="header-btn header-btn--key"
              onClick={removeKey}
              title="Change API key"
            >
              KEY
            </button>
          </div>
        </header>

        {/* ── System prompt panel ── */}
        {showSystem && (
          <div className="system-panel">
            <textarea
              className="system-textarea"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="System prompt (applies to all models in this conversation)…"
              rows={3}
            />
          </div>
        )}

        {/* ── Thread ── */}
        <main className="thread">
          {messages.length === 0 && !loading && (
            <div className="thread-empty">
              <span>Type a message, pick a model, then route responses anywhere.</span>
            </div>
          )}

          {messages.map((msg, i) => (
            <Message
              key={i}
              msg={msg}
              isLast={i === messages.length - 1}
              loading={loading}
              onRoute={handleRoute}
            />
          ))}

          {loading && <Thinking modelId={loadingModel} />}
          <div ref={bottomRef} />
        </main>

        {/* ── Input bar ── */}
        <div className="input-area">
          <div className="input-bar">
            <select
              className="model-select"
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={loading}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <textarea
              ref={textareaRef}
              className="input-textarea"
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={loading}
            />
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
