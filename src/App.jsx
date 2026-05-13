import { useState, useRef, useEffect, useCallback } from 'react'

// ── Model registry ──────────────────────────────────────────────────────────
// Check current IDs at https://openrouter.ai/models
const MODELS = [
  { id: 'anthropic/claude-sonnet-4-5',        name: 'Claude Sonnet',   tag: 'CLAUDE',  color: '#C4A472' },
  { id: 'anthropic/claude-opus-4',             name: 'Claude Opus',     tag: 'OPUS',    color: '#C4A472' },
  { id: 'google/gemini-2.5-pro-preview',       name: 'Gemini 2.5 Pro',  tag: 'GEMINI',  color: '#6BA3E0' },
  { id: 'google/gemini-2.0-flash',             name: 'Gemini Flash',    tag: 'FLASH',   color: '#6BA3E0' },
  { id: 'x-ai/grok-3',                         name: 'Grok 3',          tag: 'GROK',    color: '#E07070' },
  { id: 'x-ai/grok-3-mini',                    name: 'Grok 3 Mini',     tag: 'GROK·M',  color: '#E07070' },
  { id: 'openai/gpt-4o',                       name: 'GPT-4o',          tag: 'GPT-4o',  color: '#7DCF8A' },
]

const DEFAULT_MODEL = MODELS[0].id
const DEFAULT_ROUTE = MODELS[2].id

function getModelInfo(id) {
  return MODELS.find(m => m.id === id) ?? { tag: id.split('/')[1] ?? id, color: '#888', name: id }
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

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey]           = useState(() => localStorage.getItem('relay_key') || '')
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [model, setModel]             = useState(DEFAULT_MODEL)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading]         = useState(false)
  const [loadingModel, setLoadingModel] = useState(null)
  const [showSystem, setShowSystem]   = useState(false)

  const textareaRef = useRef(null)
  const bottomRef   = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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

  // Core API call — accepts an explicit message array and model ID
  const callAPI = useCallback(async (conversation, modelId) => {
    setLoading(true)
    setLoadingModel(modelId)

    const apiMessages = conversation.map(m => ({ role: m.role, content: m.content }))
    const payload = {
      model: modelId,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...apiMessages]
        : apiMessages,
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

      const content = data.choices?.[0]?.message?.content ?? '(no content in response)'
      const reply = { role: 'assistant', content, model: modelId }
      setMessages(prev => [...prev, reply])
    } catch (err) {
      const reply = { role: 'assistant', content: `⚠ Error: ${err.message}`, model: modelId }
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

    const userMsg = { role: 'user', content: text, model: null }
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
            onClick={() => { setMessages([]); setInput('') }}
            title="Clear conversation"
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
  )
}
