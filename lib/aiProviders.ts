// Catalog of AI providers/brands and their models. Two transport shapes cover
// nearly every provider: Anthropic's native Messages API, and the OpenAI
// chat-completions shape (which Google, xAI, DeepSeek, Mistral, Groq and
// OpenRouter all expose). OpenRouter + the per-provider "custom model id" field
// mean you can reach essentially any model with your own key.

export type Transport = "anthropic" | "openai" | "local";

export type Tier = "free" | "pro" | "studio";

export interface ModelDef {
  id: string;
  label: string;
  note?: string;
  local?: boolean; // runs on-device via WebLLM (no key, no server)
  managed?: boolean; // Nova-hosted managed model (key supplied by us)
  disabled?: boolean; // shown but not selectable yet ("coming soon")
  tier?: Tier; // plan this model belongs to
}

export interface ProviderDef {
  id: string;
  brand: string;
  transport: Transport;
  baseURL: string; // request base; we append /messages or /chat/completions
  accent: string; // brand color for the monogram chip
  keyPlaceholder: string;
  consoleURL: string;
  hint: string;
  allowCustom?: boolean; // show a "custom model id" entry
  managed?: boolean; // Nova's own family — no BYO key field in Settings
  models: ModelDef[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    // Nova's own family. "Lite" runs entirely on-device (WebLLM) and is free;
    // "Pro"/"Studio" are managed models we host later for paid plans.
    id: "nova",
    brand: "Nova",
    transport: "local",
    baseURL: "",
    accent: "#ccff02",
    keyPlaceholder: "",
    consoleURL: "",
    hint: "Built-in — runs on your device, no key",
    managed: true,
    models: [
      { id: "nova-lite", label: "Nova Lite", note: "On-device · free · runs on your GPU", local: true, tier: "free" },
      { id: "nova-pro", label: "Nova Pro", note: "Larger managed model · coming soon", managed: true, disabled: true, tier: "pro" },
      { id: "nova-studio", label: "Nova Studio", note: "Most capable · coming soon", managed: true, disabled: true, tier: "studio" },
    ],
  },
  {
    id: "anthropic",
    brand: "Anthropic",
    transport: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    accent: "#d97757",
    keyPlaceholder: "sk-ant-…",
    consoleURL: "https://console.anthropic.com/settings/keys",
    hint: "console.anthropic.com → API keys",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "Most capable" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "Fastest" },
    ],
  },
  {
    id: "openai",
    brand: "OpenAI",
    transport: "openai",
    baseURL: "https://api.openai.com/v1",
    accent: "#10a37f",
    keyPlaceholder: "sk-…",
    consoleURL: "https://platform.openai.com/api-keys",
    hint: "platform.openai.com → API keys",
    allowCustom: true,
    models: [
      { id: "gpt-4.1", label: "GPT-4.1", note: "Capable" },
      { id: "gpt-4o", label: "GPT-4o", note: "Balanced" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Fastest" },
    ],
  },
  {
    id: "google",
    brand: "Google",
    transport: "openai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    accent: "#4285f4",
    keyPlaceholder: "AIza…",
    consoleURL: "https://aistudio.google.com/apikey",
    hint: "aistudio.google.com → API keys",
    allowCustom: true,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Most capable" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Fast" },
    ],
  },
  {
    id: "xai",
    brand: "xAI",
    transport: "openai",
    baseURL: "https://api.x.ai/v1",
    accent: "#9ca3af",
    keyPlaceholder: "xai-…",
    consoleURL: "https://console.x.ai",
    hint: "console.x.ai → API keys",
    allowCustom: true,
    models: [
      { id: "grok-3", label: "Grok 3", note: "Capable" },
      { id: "grok-3-mini", label: "Grok 3 mini", note: "Fast" },
    ],
  },
  {
    id: "deepseek",
    brand: "DeepSeek",
    transport: "openai",
    baseURL: "https://api.deepseek.com",
    accent: "#4d6bfe",
    keyPlaceholder: "sk-…",
    consoleURL: "https://platform.deepseek.com/api_keys",
    hint: "platform.deepseek.com → API keys",
    allowCustom: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3", note: "Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek R1", note: "Reasoning" },
    ],
  },
  {
    id: "mistral",
    brand: "Mistral",
    transport: "openai",
    baseURL: "https://api.mistral.ai/v1",
    accent: "#ff7000",
    keyPlaceholder: "…",
    consoleURL: "https://console.mistral.ai/api-keys",
    hint: "console.mistral.ai → API keys",
    allowCustom: true,
    models: [
      { id: "mistral-large-latest", label: "Mistral Large", note: "Most capable" },
      { id: "mistral-small-latest", label: "Mistral Small", note: "Fast" },
    ],
  },
  {
    id: "groq",
    brand: "Groq",
    transport: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    accent: "#f55036",
    keyPlaceholder: "gsk_…",
    consoleURL: "https://console.groq.com/keys",
    hint: "console.groq.com → API keys · runs Llama & more",
    allowCustom: true,
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "Meta · versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", note: "Instant" },
    ],
  },
  {
    id: "openrouter",
    brand: "OpenRouter",
    transport: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    accent: "#6366f1",
    keyPlaceholder: "sk-or-…",
    consoleURL: "https://openrouter.ai/keys",
    hint: "openrouter.ai → one key, any model",
    allowCustom: true,
    models: [
      { id: "openrouter/auto", label: "Auto (best for prompt)", note: "Router picks" },
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", note: "via OpenRouter" },
      { id: "openai/gpt-4.1", label: "GPT-4.1", note: "via OpenRouter" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "via OpenRouter" },
    ],
  },
];

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// Resolve a model id to its human label (falls back to the raw id for custom).
export function modelLabel(providerId: string, modelId: string): string {
  const p = providerById(providerId);
  return p?.models.find((m) => m.id === modelId)?.label || modelId;
}

// Resolve a {provider, model} selection to both catalog records.
export function findModel(providerId: string, modelId: string): { provider: ProviderDef; model?: ModelDef } | undefined {
  const provider = providerById(providerId);
  if (!provider) return undefined;
  return { provider, model: provider.models.find((m) => m.id === modelId) };
}

// The on-device Nova Lite selection (free tier, WebLLM).
export const NOVA_LITE = { provider: "nova", model: "nova-lite" } as const;

// Best Nova model for a plan, falling back to whatever is actually available
// today (Pro/Studio are "coming soon", so they resolve to Lite for now).
export function novaModelForPlan(plan: string | null | undefined): string {
  const want = plan === "studio" ? "nova-studio" : plan === "pro" ? "nova-pro" : "nova-lite";
  const nova = providerById("nova");
  const m = nova?.models.find((x) => x.id === want);
  return m && !m.disabled ? m.id : "nova-lite";
}
