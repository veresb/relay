# Relay

A minimal multi-model conversation router. Pick a model per message, then route any response to a different model with one click — no copy-pasting.

## Models included

- Claude Sonnet 4.5 / Opus 4 (Anthropic)
- Gemini 2.5 Pro / Flash (Google)
- Grok 3 / Grok 3 Mini (xAI)
- GPT-4o (OpenAI)

All routed through [OpenRouter](https://openrouter.ai) — one API key, one bill.

> **Note:** Model IDs can drift. If a model stops responding, check current IDs at [openrouter.ai/models](https://openrouter.ai/models) and update `MODELS` in `src/App.jsx`.

## Setup

```bash
npm install
npm run dev
```

Enter your OpenRouter API key on first load. It's stored in `localStorage` — never leaves your browser.

## Deploy to Vercel

```bash
# Push to GitHub, then connect the repo in vercel.com
# Build command:  npm run build
# Output dir:     dist
# No env vars needed
```

## How it works

1. Type a message, pick a model, send
2. See the response with its model tag
3. Use the **route to →** bar to feed the entire conversation to a different model
4. Or just reply yourself and continue normally
5. Repeat

System prompt (optional) applies to all models in the conversation.
