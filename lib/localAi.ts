// Nova Lite — the free, on-device AI. It runs Qwen2.5-Coder entirely in the
// user's browser via WebLLM (WebGPU): the quantized weights download once into
// the browser cache, then every prompt runs locally on their GPU. We host
// nothing and no prompt ever leaves the device.
//
// For snappiness we (1) STREAM tokens so output appears immediately, and
// (2) make edits with a search/replace patch instead of regenerating the whole
// file — so a small change writes a few lines, not thousands. Streaming also
// makes Stop instant: interrupting ends the token loop mid-flight.

import { fileKind } from "@/lib/importUtils";
import type { AiBlock, AiMessage } from "@/store/aiStore";

// 3B is the sweet spot; the 1.5B is an automatic fallback for low-VRAM GPUs.
const PRIMARY = "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC";
const FALLBACK = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";

export interface LoadProgress {
  text: string; // human-readable status from WebLLM
  progress: number; // 0..1
  cached?: boolean; // loading from the browser cache vs a fresh download
}

let enginePromise: Promise<any> | null = null;
let loadedModel: string | null = null;

// Ask the browser to keep our storage so the ~2 GB of weights survive reloads
// and aren't evicted under storage pressure (the usual cause of "it downloads
// again every time"). Best-effort — some browsers grant it silently.
async function requestPersistentStorage(): Promise<void> {
  try {
    const s = (navigator as any)?.storage;
    if (s?.persisted && s?.persist) {
      if (!(await s.persisted())) await s.persist();
    }
  } catch {
    /* not supported — caching still works, just evictable */
  }
}

export type GpuStatus = "ok" | "no-webgpu" | "no-adapter";

// What's the WebGPU situation? "no-webgpu" = the browser has no WebGPU at all
// (old browser / disabled); "no-adapter" = the API exists but no GPU was handed
// out (often hardware acceleration is off, or the GPU is blocklisted).
export async function webgpuStatus(): Promise<GpuStatus> {
  const gpu = typeof navigator !== "undefined" ? (navigator as any).gpu : undefined;
  if (!gpu) return "no-webgpu";
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" }).catch(() => null)
      || await gpu.requestAdapter().catch(() => null);
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
    await requestPersistentStorage();
    let lastErr: unknown;
    for (const model of [PRIMARY, FALLBACK]) {
      try {
        // Is this model already in the browser cache? Lets us label a quick
        // cache-load as "Loading" instead of a scary "Downloading ~2 GB".
        const cached = await webllm.hasModelInCache(model).catch(() => false);
        const initProgressCallback = (r: any) =>
          onProgress?.({ text: r?.text || "Loading…", progress: r?.progress ?? 0, cached });
        onProgress?.({ text: cached ? "Loading Nova Lite from cache…" : "Downloading Nova Lite (one-time)…", progress: 0, cached });
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

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + "\n<!-- …truncated for Nova Lite… -->" : s);

const SYSTEM = `You are Nova Lite, a fast on-device coding assistant inside a browser visual web IDE. The user's project is open and the active file is shown to you.

To ANSWER a question or explain something, reply briefly in plain text.

To CHANGE a file, output one or more patch blocks in EXACTLY this format (and nothing else inside them):
@@ <file path>
<<<<<<< SEARCH
<a few exact lines copied verbatim from the file, including indentation>
=======
<the replacement lines>
>>>>>>> REPLACE

Rules:
- Copy the SEARCH lines exactly as they appear so they can be found. Keep each block small — just the lines you change plus a little surrounding context.
- Only edit .html, .jsx or .tsx files. You may write one short sentence before the patch blocks.
- Make the smallest change that satisfies the request. Output multiple blocks for multiple edits.`;

// Parse search/replace patch blocks out of a model reply.
const PATCH_RE = /@@[ \t]*(.+?)[ \t]*\r?\n<<<<<<<[ \t]*SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>>[ \t]*REPLACE/g;

interface Patch { path: string; search: string; replace: string; }

function parsePatches(text: string): Patch[] {
  const out: Patch[] = [];
  let m: RegExpExecArray | null;
  PATCH_RE.lastIndex = 0;
  while ((m = PATCH_RE.exec(text))) out.push({ path: m[1].trim(), search: m[2], replace: m[3] });
  return out;
}

// Strip patch blocks (and any half-streamed trailing block) from the prose.
function prose(text: string): string {
  return text.replace(PATCH_RE, "").replace(/@@[ \t]*.+[\s\S]*$/g, "").trim();
}

// Apply one patch to a file's content, tolerating minor whitespace drift.
function applyPatch(content: string, search: string, replace: string): string | null {
  if (content.includes(search)) return content.replace(search, replace);
  const sTrim = search.trim();
  if (sTrim && content.includes(sTrim)) return content.replace(sTrim, replace.trim());
  // last resort: match ignoring trailing whitespace per line
  const norm = (s: string) => s.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n");
  const nc = norm(content);
  const ns = norm(search);
  const i = nc.indexOf(ns);
  if (i >= 0) {
    // map back to original by line count
    const before = nc.slice(0, i).split("\n").length - 1;
    const lines = content.split("\n");
    const count = ns.split("\n").length;
    lines.splice(before, count, ...replace.split("\n"));
    return lines.join("\n");
  }
  return null;
}

// Live transcript blocks while streaming: show prose, and a compact "writing…"
// chip for any patch block (so the user doesn't watch raw diff markers).
function liveBlocks(text: string): AiBlock[] {
  const blocks: AiBlock[] = [];
  const p = prose(text);
  if (p) blocks.push({ type: "text", text: p });
  // count patch starts (even partial) for a progress hint
  const starts = (text.match(/@@[ \t]*(.+)/g) || []).map((s) => s.replace(/@@[ \t]*/, "").trim());
  for (const path of starts) blocks.push({ type: "tool_use", name: "write_file", input: { path } });
  if (!blocks.length) blocks.push({ type: "text", text: "…" });
  return blocks;
}

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
  const base: AiMessage[] = [...ai.getMessages(projectId), { role: "user", content: [{ type: "text", text: userText }] }];
  ai.setMessages(projectId, base);

  const engine = await getLocalEngine(onProgress);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const active = ed.files.find((f) => f.path === ed.activePath) || ed.files[0];
  const fileList = ed.files.map((f) => f.path).join("\n") || "(none)";
  const context = active
    ? `Editable files:\n${fileList}\n\nActive file — ${active.path}:\n\`\`\`\n${clip(active.content, 8000)}\n\`\`\``
    : `Editable files:\n${fileList}\n\n(No file is currently open.)`;

  // STREAM the reply so tokens appear as they're produced.
  const stream = await engine.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${context}\n\nRequest: ${userText}` },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    stream: true,
  });

  let acc = "";
  let lastFlush = 0;
  const flush = (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < 50) return;
    lastFlush = now;
    ai.setMessages(projectId, [...base, { role: "assistant", content: liveBlocks(acc) }]);
  };

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        engine.interruptGenerate?.();
        break;
      }
      const delta: string = chunk?.choices?.[0]?.delta?.content || "";
      if (delta) {
        acc += delta;
        flush();
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    // streaming hiccup — keep whatever we have
  }

  if (signal?.aborted) {
    // leave the partial reply in place and stop
    ai.setMessages(projectId, [...base, { role: "assistant", content: liveBlocks(acc).length ? liveBlocks(acc) : [{ type: "text", text: acc || "Stopped." }] }]);
    throw new DOMException("Aborted", "AbortError");
  }

  // finalize: apply any patches, then show clean prose + edit chips
  const patches = parsePatches(acc);
  const blocks: AiBlock[] = [];
  const summary = prose(acc);
  if (summary) blocks.push({ type: "text", text: summary });

  const edited: string[] = [];
  const failed: string[] = [];
  for (const p of patches) {
    const file = ed.files.find((f) => f.path === p.path) || active;
    if (!file || (!ed.files.find((f) => f.path === p.path) && !fileKind(p.path))) {
      failed.push(p.path);
      continue;
    }
    const next = applyPatch(file.content, p.search, p.replace);
    if (next == null) {
      failed.push(file.path);
      continue;
    }
    ed.upsertFile(file.path, next);
    if (!edited.includes(file.path)) edited.push(file.path);
    blocks.push({ type: "tool_use", name: "write_file", input: { path: file.path } });
  }

  if (failed.length && !edited.length) {
    blocks.push({ type: "text", text: `I couldn't apply the change to ${failed.join(", ")} — the lines I targeted didn't match. Try again, or be more specific about what to change.` });
  }
  if (!blocks.length) {
    blocks.push({ type: "text", text: acc.trim() || "I couldn't put together a clear answer — try rephrasing." });
  }

  ai.setMessages(projectId, [...base, { role: "assistant", content: blocks }]);
}
