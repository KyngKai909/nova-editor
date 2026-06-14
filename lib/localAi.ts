// Nova Lite — the free, on-device AI. It runs Qwen2.5-Coder entirely in the
// user's browser via WebLLM (WebGPU): the quantized weights download once into
// the browser cache, then every prompt runs locally on their GPU. We host
// nothing and no prompt ever leaves the device.
//
// Small local models are unreliable at sprawling multi-tool agent loops, so
// instead of the remote agent's read/write/search tools we use a *constrained
// single-file edit*: we hand the model the active file and ask for a JSON reply
// that's either an answer or the complete new contents of one file, then apply
// it deterministically. That's the reliable way to get real edits out of a 3B.

import { fileKind } from "@/lib/importUtils";
import type { AiBlock, AiMessage } from "@/store/aiStore";

// 3B is the sweet spot; the 1.5B is an automatic fallback for low-VRAM GPUs.
const PRIMARY = "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC";
const FALLBACK = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";

export interface LoadProgress {
  text: string; // human-readable status from WebLLM
  progress: number; // 0..1
}

let enginePromise: Promise<any> | null = null;
let loadedModel: string | null = null;

export type GpuStatus = "ok" | "no-webgpu" | "no-adapter";

// Is WebGPU usable in this browser? (Chrome/Edge/Arc yes; Safari shipping;
// Firefox behind a flag.) We don't WASM-fallback — too slow for chat.
export async function webgpuStatus(): Promise<GpuStatus> {
  const gpu = typeof navigator !== "undefined" ? (navigator as any).gpu : undefined;
  if (!gpu) return "no-webgpu";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "ok" : "no-adapter";
  } catch {
    return "no-adapter";
  }
}

export function localEngineReady(): boolean {
  return !!loadedModel;
}

export function loadedModelLabel(): string | null {
  if (!loadedModel) return null;
  if (loadedModel.includes("3B")) return "Qwen2.5-Coder 3B";
  if (loadedModel.includes("1.5B")) return "Qwen2.5-Coder 1.5B";
  return loadedModel;
}

// Lazily create (and cache) the engine. The big web-llm bundle is dynamically
// imported so it never weighs down the main app bundle. If the 3B can't fit in
// the GPU, we transparently retry with the smaller model.
export async function getLocalEngine(onProgress?: (p: LoadProgress) => void): Promise<any> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    const initProgressCallback = (r: any) => onProgress?.({ text: r?.text || "Loading…", progress: r?.progress ?? 0 });
    let lastErr: unknown;
    for (const model of [PRIMARY, FALLBACK]) {
      try {
        const engine = await webllm.CreateMLCEngine(model, { initProgressCallback });
        loadedModel = model;
        return engine;
      } catch (e) {
        lastErr = e; // most likely out of VRAM — fall through to the smaller model
      }
    }
    enginePromise = null;
    throw lastErr instanceof Error ? lastErr : new Error("Could not start the on-device model.");
  })();
  return enginePromise;
}

// Stop an in-flight generation (wired to the panel's Stop button).
export async function interruptLocal(): Promise<void> {
  if (!enginePromise) return;
  try {
    const engine = await enginePromise;
    engine.interruptGenerate?.();
  } catch {
    /* nothing running */
  }
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + "\n/* …truncated for Nova Lite… */" : s);

function safeParseJson(raw: string): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // models sometimes wrap JSON in prose or a ```json fence — grab the object
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* give up */
      }
    }
    return null;
  }
}

const SYSTEM = `You are Nova Lite, a small on-device coding assistant inside a browser visual web IDE. The user's project is already open.

Reply with ONE JSON object and nothing else, in this shape:
{"action":"answer"|"edit","summary":"<1-2 sentences>","path":"<file>","content":"<full new file>"}

Rules:
- Use "edit" to change a file: set "path" to one of the editable files and put the COMPLETE new file contents in "content" (never a diff or a fragment). Preserve the existing structure, imports and style; make the smallest correct change.
- Only .html, .jsx and .tsx files are editable. If a request needs anything else, use "answer" and say so.
- Use "answer" for questions or when no edit is needed; omit "path"/"content".
- Keep "summary" short. Do not include markdown fences or any text outside the JSON object.`;

// Run one Nova Lite turn against the live editor (canvas auto-syncs on write).
export async function runLocalAgent(opts: {
  projectId: string;
  userText: string;
  signal?: AbortSignal;
  onProgress?: (p: LoadProgress) => void;
}): Promise<void> {
  const { projectId, userText, signal, onProgress } = opts;
  const [{ useAi }, { useEditor }] = await Promise.all([import("@/store/aiStore"), import("@/store/editorStore")]);
  const ai = useAi.getState();
  const ed = useEditor.getState();

  // record the user's message right away so it shows in the transcript
  let messages: AiMessage[] = [...ai.getMessages(projectId), { role: "user", content: [{ type: "text", text: userText }] }];
  ai.setMessages(projectId, messages);

  const engine = await getLocalEngine(onProgress);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const active = ed.files.find((f) => f.path === ed.activePath) || ed.files[0];
  const fileList = ed.files.map((f) => f.path).join("\n") || "(none)";
  const context = active
    ? `Editable files:\n${fileList}\n\nActive file — ${active.path}:\n\`\`\`\n${clip(active.content, 8000)}\n\`\`\``
    : `Editable files:\n${fileList}\n\n(No file is currently open.)`;

  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${context}\n\nRequest: ${userText}` },
    ],
    temperature: 0.2,
    max_tokens: 3072,
    response_format: { type: "json_object" },
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const raw: string = completion?.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJson(raw);
  const blocks: AiBlock[] = [];

  if (parsed?.action === "edit" && typeof parsed.path === "string" && typeof parsed.content === "string") {
    const path = parsed.path.trim();
    const editable = !!ed.files.find((f) => f.path === path) || !!fileKind(path);
    if (editable) {
      ed.upsertFile(path, parsed.content);
      blocks.push({ type: "text", text: parsed.summary || `Edited ${path}.` });
      blocks.push({ type: "tool_use", name: "write_file", input: { path } });
    } else {
      blocks.push({ type: "text", text: `${parsed.summary ? parsed.summary + " " : ""}I can only edit .html, .jsx or .tsx files here, so I couldn't change ${path}.` });
    }
  } else {
    const text = typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary
      : raw.trim() && !raw.trim().startsWith("{")
        ? raw.trim()
        : "I couldn't put together a clear answer — try rephrasing, or switch to a more capable model.";
    blocks.push({ type: "text", text });
  }

  messages = [...messages, { role: "assistant", content: blocks }];
  ai.setMessages(projectId, messages);
}
