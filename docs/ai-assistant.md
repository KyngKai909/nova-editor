# The AI assistant

Nova has a built-in coding assistant that reads and edits your real files. It's
**bring-your-own-key** and **model-agnostic** — connect any provider, pick any
model. Use AI for the big changes; use your mouse for the precise ones.

Open it with the **AI** button in the editor's top bar. Close and reopen it any
time — your conversation is saved per project.

## Connect a key

> **Important:** an API key is **not** the same as a ChatGPT Plus or Claude Pro
> subscription. Those don't include API access. You need a developer API key from
> the provider's console.

1. Open **Settings → AI assistant**.
2. Find your provider and click **Get a key** to open their console.
3. Paste the key. It's stored **only in your browser** and sent directly to the
   provider — nothing passes through a Nova server.

### Supported providers

| Provider | Notes |
|---|---|
| **Anthropic** | Claude (Opus / Sonnet / Haiku). |
| **OpenAI** | GPT-4.1, GPT-4o, … |
| **Google** | Gemini 2.5 Pro / Flash. |
| **xAI** | Grok. |
| **DeepSeek** | V3 / R1. |
| **Mistral** | Large / Small. |
| **Groq** | Llama and others, very fast. |
| **OpenRouter** | One key → almost **any** model. |

Need a model that isn't listed? Pick its provider in the model picker and use the
**Custom model ID** field — or use **OpenRouter** to reach nearly anything.

## Pick a model

In the AI panel, click the model button to open the **model picker**: search,
filter by brand in the left rail, and select. A green dot marks providers you have
a key for. Your selection is global and persists.

## What it can do

The assistant has tools to **list**, **read**, **search**, and **write** your
files. When it writes a file, the canvas updates immediately. Try things like:

- "Make the hero headline bigger and add a subtitle."
- "Add a dark footer with social links."
- "Change the primary button color to indigo across the site."

It shows each action as it works ("Read Hero.tsx", "Edited Hero.tsx"), and you can
**Stop** at any time.

## Scope & limits

- It edits the **`.html` / `.jsx` / `.tsx`** files open in the editor. CSS and
  config files aren't accessible to it yet.
- Responses aren't streamed token-by-token yet — you'll see progress per step.
- Cost is **on your key**. Visual edits in the inspector stay free; reach for AI
  when it saves you real work.

---

**Next:** [Running your app live →](./running.md)
