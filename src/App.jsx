import { useState, useRef, useEffect, useCallback } from 'react'

// ── Model registry ──────────────────────────────────────────────────────────
// Check current IDs at https://openrouter.ai/models
const MODEL_GROUPS = [
  { label: 'FREE', models: [
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', tag: 'NV·S',   color: '#76B900' },
    { id: 'openrouter/owl-alpha',                   name: 'Owl Alpha',        tag: 'OWL',    color: '#888' },
    { id: 'openai/gpt-oss-120b:free',               name: 'GPT OSS 120B',     tag: 'OSS',    color: '#7DCF8A' },
    { id: 'poolside/laguna-m.1:free',               name: 'Laguna M.1',       tag: 'POOL',   color: '#888' },
    { id: 'inclusionai/ring-2.6-1t:free',           name: 'Ring 2.6',         tag: 'RING',   color: '#888' },
  ]},
  { label: 'FAST', models: [
    { id: 'mistralai/mistral-nemo',                 name: 'Mistral Nemo',     tag: 'NEMO',   color: '#F97316' },
    { id: 'deepseek/deepseek-v4-flash',             name: 'DeepSeek V4 Flash',tag: 'DS·F',   color: '#7ECEC4' },
    { id: 'google/gemini-2.5-flash-lite',           name: 'Gemini 2.5 Flash Lite', tag: 'G·FL', color: '#6BA3E0' },
    { id: 'google/gemini-2.5-flash',                name: 'Gemini 2.5 Flash', tag: 'FLASH',  color: '#6BA3E0' },
    { id: 'google/gemini-3-flash-preview',          name: 'Gemini 3 Flash',   tag: 'G3·F',   color: '#6BA3E0' },
    { id: 'x-ai/grok-4.1-fast',                    name: 'Grok 4.1 Fast',    tag: 'G4·F',   color: '#E07070' },
    { id: 'openai/gpt-4o-mini',                     name: 'GPT-4o Mini',      tag: 'GPT·M',  color: '#7DCF8A' },
    { id: 'anthropic/claude-haiku-4.5',             name: 'Claude Haiku',     tag: 'HAIKU',  color: '#C4A472' },
  ]},
  { label: 'BALANCED', models: [
    { id: 'deepseek/deepseek-v3.2',                 name: 'DeepSeek V3.2',    tag: 'DS·3',   color: '#7ECEC4' },
    { id: 'deepseek/deepseek-v4-pro',               name: 'DeepSeek V4 Pro',  tag: 'DS·4',   color: '#7ECEC4' },
    { id: 'moonshotai/kimi-k2.6',                   name: 'Kimi K2.6',        tag: 'KIMI',   color: '#A78BFA' },
    { id: 'google/gemini-3.1-pro-preview',          name: 'Gemini 3.1 Pro',   tag: 'G3·P',   color: '#6BA3E0' },
    { id: 'anthropic/claude-sonnet-4.6',            name: 'Claude Sonnet',    tag: 'SONNET', color: '#C4A472' },
    { id: 'openai/gpt-5.4',                         name: 'GPT-5.4',          tag: 'GPT·4',  color: '#7DCF8A' },
    { id: 'perplexity/sonar',                       name: 'Sonar',            tag: 'SONAR',  color: '#20B2AA' },
    { id: 'x-ai/grok-3',                            name: 'Grok 3',           tag: 'GROK',   color: '#E07070' },
  ]},
  { label: 'POWERFUL', models: [
    { id: 'anthropic/claude-opus-4.6',              name: 'Claude Opus 4.6',  tag: 'OPUS',   color: '#C4A472' },
    { id: 'openai/gpt-5.5',                         name: 'GPT-5.5',          tag: 'GPT·5',  color: '#7DCF8A' },
    { id: 'openai/gpt-5.3-codex',                   name: 'GPT Codex',        tag: 'CODEX',  color: '#7DCF8A' },
    { id: 'perplexity/sonar-pro',                   name: 'Sonar Pro',        tag: 'SONAR·P',color: '#20B2AA' },
  ]},
  { label: 'MAXIMUM', models: [
    { id: 'anthropic/claude-opus-4.7',              name: 'Claude Opus 4.7',  tag: 'OPUS·7', color: '#C4A472' },
  ]},
]

const MODELS = MODEL_GROUPS.flatMap(g => g.models)

const DEFAULT_MODEL = MODELS[0].id
const DEFAULT_ROUTE = MODELS[2].id

function getModelInfo(id) {
  return MODELS.find(m => m.id === id) ?? { tag: id.split('/')[1] ?? id, color: '#888', name: id }
}

// ── Conversation sanitizer ────────────────────────────────────────────────────
function sanitizeForModel(messages, modelId) {
  let msgs = messages.map(m => ({ ...m }));

  // Strip [MODEL responded]: prefixes for Google models
  if (modelId.startsWith('google/')) {
    msgs = msgs.map(m => ({
      ...m,
      content: m.content.replace(/^\[.*?responded\]:\s*/i, '')
    }));
  }

  // Merge consecutive same-role messages
  const merged = [];
  for (const msg of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n\n' + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure first message is always user role
  if (merged.length > 0 && merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: '(conversation context)' });
  }

  // Truncate very long messages to avoid provider errors (e.g. routed Perplexity responses)
  if (!modelId.startsWith('perplexity/')) {
    for (const msg of merged) {
      if (msg.content.length > 4000) {
        msg.content = msg.content.slice(0, 4000) + '... [truncated]';
      }
    }
  }

  return merged;
}

// ── Setup screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [val, setVal] = useState('')
  const [pplxVal, setPplxVal] = useState('')
  const submit = () => val.trim() && onSave(val.trim(), pplxVal.trim())
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
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="sk-or-v1-…"
            autoFocus
          />
        </div>
        <div className="setup-field">
          <label>Perplexity API Key (optional)</label>
          <input
            type="password"
            value={pplxVal}
            onChange={e => setPplxVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="pplx-…"
          />
        </div>
        <button
          className="setup-btn"
          onClick={submit}
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
function Message({ msg, isLast, loading, onRoute, onRegenerate }) {
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
            {MODEL_GROUPS.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.models.filter(m => m.id !== msg.model).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="route-btn" onClick={() => onRoute(routeTarget)}>
            →
          </button>
          <button className="regen-btn" onClick={onRegenerate}>
            ↺
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
  const [perplexityKey, setPerplexityKey] = useState(() => localStorage.getItem('relay_perplexity_key') || '')
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('relay_conversations') ?? '[]') }
    catch { return [] }
  })
  const [activeConversationId, setActiveConversationId] = useState(() => crypto.randomUUID())
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

  const saveKey = useCallback((key, pplxKey) => {
    localStorage.setItem('relay_key', key)
    setApiKey(key)
    if (pplxKey) {
      localStorage.setItem('relay_perplexity_key', pplxKey)
      setPerplexityKey(pplxKey)
    }
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
    const identityPrefix = `You are ${modelName}, one of several AI models in a multi-model collaboration tool called Relay. The user can prompt you directly or route conversations between models to get diverse perspectives. Your role is to give your honest, independent assessment — not to repeat or validate what other models have said. If you see responses from other models in the conversation (marked with [MODEL responded]:), treat them as peer input: build on them if they're correct, respectfully challenge them if you disagree, and fill in gaps they missed. The goal is collective accuracy and quality, not consensus. Be concise and direct. Respond in the same language the user writes in, regardless of other models' language choices.`
    const fullSystemPrompt = systemPrompt
      ? `${identityPrefix}\n\n${systemPrompt}`
      : identityPrefix

    const isPerplexity = modelId.startsWith('perplexity/')
    const endpoint = isPerplexity
      ? 'https://api.perplexity.ai/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
    const authKey = isPerplexity ? perplexityKey : apiKey
    const actualModelId = isPerplexity ? modelId.replace('perplexity/', '') : modelId

    const payload = {
      model: actualModelId,
      messages: [{ role: 'system', content: fullSystemPrompt }, ...sanitizedMessages],
    }

    try {
      const headers = {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json',
      }
      if (!isPerplexity) {
        headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.href : ''
        headers['X-Title'] = 'Relay'
      }

      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) })

      const data = await res.json()

      if (!res.ok) {
        console.error('API error response:', data)
        const errorMsg = data.error?.message ?? data.error?.code ?? `HTTP ${res.status}`
        throw new Error(errorMsg)
      }

      const raw = data.choices?.[0]?.message?.content
      const text = Array.isArray(raw)
        ? raw.filter(b => b.type === 'text').map(b => b.text).join('')
        : (raw ?? '(no content in response)')
      const citations = data.citations
      const content = citations?.length
        ? text + '\n\nSources:\n' + citations.map((url, i) => `${i + 1}. ${url}`).join('\n')
        : text
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
  }, [apiKey, perplexityKey, systemPrompt])

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

  // Regenerate last assistant message with the same model
  const handleRegenerate = useCallback((modelId) => {
    if (loading) return
    const trimmed = messages.slice(0, -1)
    setMessages(trimmed)
    callAPI(trimmed, modelId)
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
              onRegenerate={() => handleRegenerate(msg.model)}
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
              {MODEL_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
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
