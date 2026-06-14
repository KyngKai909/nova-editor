"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encryptedStorage } from "@/lib/secureStorage";
import { novaModelForPlan } from "@/lib/aiProviders";

// Canonical transcript = Anthropic content-block format. The OpenAI-shape
// transport converts to/from this at request time, so we persist one shape.
export interface AiBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string; // tool_use id
  name?: string; // tool name
  input?: any; // tool input
  tool_use_id?: string; // links a tool_result to its tool_use
  content?: string; // tool_result content
  is_error?: boolean;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: AiBlock[];
}

export interface Selection {
  provider: string; // ProviderDef id
  model: string; // model id (catalog or custom)
}

interface AiState {
  keys: Record<string, string>; // providerId -> API key
  customModels: Record<string, string>; // providerId -> remembered custom model id
  selected: Selection;
  conversations: Record<string, AiMessage[]>; // keyed by projectId
  open: boolean;

  setKey: (providerId: string, key: string) => void;
  setCustomModel: (providerId: string, model: string) => void;
  select: (sel: Selection) => void;
  applyPlanDefault: (plan: string | null | undefined) => void;
  setOpen: (v: boolean) => void;

  getMessages: (projectId: string) => AiMessage[];
  setMessages: (projectId: string, msgs: AiMessage[]) => void;
  clearConversation: (projectId: string) => void;
}

export const useAi = create<AiState>()(
  persist(
    (set, get) => ({
      keys: {},
      customModels: {},
      // Every new user starts on the free, on-device Nova Lite.
      selected: { provider: "nova", model: "nova-lite" },
      conversations: {},
      open: false,

      setKey: (providerId, key) => set({ keys: { ...get().keys, [providerId]: key.trim() } }),
      setCustomModel: (providerId, model) => set({ customModels: { ...get().customModels, [providerId]: model } }),
      select: (selected) => set({ selected }),
      // When the user's plan is known, upgrade their Nova selection to the
      // plan's model (Lite/Pro/Studio). Never overrides a BYO-key choice.
      applyPlanDefault: (plan) => {
        const sel = get().selected;
        if (sel.provider !== "nova") return;
        const model = novaModelForPlan(plan);
        if (model !== sel.model) set({ selected: { provider: "nova", model } });
      },
      setOpen: (open) => set({ open }),

      getMessages: (projectId) => get().conversations[projectId] || [],
      setMessages: (projectId, msgs) => set({ conversations: { ...get().conversations, [projectId]: msgs } }),
      clearConversation: (projectId) => {
        const next = { ...get().conversations };
        delete next[projectId];
        set({ conversations: next });
      },
    }),
    {
      name: "nova-ai",
      storage: createJSONStorage(() => encryptedStorage()),
      version: 2,
      partialize: (s) => ({
        keys: s.keys,
        customModels: s.customModels,
        selected: s.selected,
        conversations: s.conversations,
      }),
      migrate: (persisted: any, version) => {
        let p = persisted;
        // v0 → v1: { provider, model:{anthropic,openai}, keys:{anthropic,openai} }
        if (version === 0 && p) {
          const keys: Record<string, string> = {};
          if (p.keys?.anthropic) keys.anthropic = p.keys.anthropic;
          if (p.keys?.openai) keys.openai = p.keys.openai;
          const provider = p.provider || "anthropic";
          const model = p.model?.[provider] || "claude-sonnet-4-6";
          p = { keys, customModels: {}, selected: { provider, model }, conversations: p.conversations || {} };
        }
        // → v2: anyone parked on a model they have no key for moves to the free,
        // on-device Nova Lite (the new default). Keeps a working BYOK choice.
        if (p?.selected && p.selected.provider !== "nova" && !p.keys?.[p.selected.provider]) {
          p.selected = { provider: "nova", model: "nova-lite" };
        }
        return p;
      },
    }
  )
);
