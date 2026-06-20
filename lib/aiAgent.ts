import { useAi, type AiMessage, type AiBlock } from "@/store/aiStore";
import { providerById } from "@/lib/aiProviders";
import { useEditor } from "@/store/editorStore";
import { fileKind } from "@/lib/importUtils";
import type { FileBackend } from "@/lib/aiBackend";

const MAX_STEPS = 16;
const MAX_TOKENS = 8192;

const SYSTEM = `You are Nova's built-in coding assistant, embedded in a browser-based visual web IDE. The user's project is already open.

How you work:
- Use list_files to see what exists, and read_file to read a file BEFORE editing it.
- Edit by calling write_file with the COMPLETE new contents of the file — never a diff or a fragment.
- Make the smallest correct change that satisfies the request. Preserve the existing style, imports, and formatting.
- Only .html, .jsx and .tsx files are editable in this session. Other files (CSS, configs, assets) are not accessible here — if a change needs them, say so instead of guessing.
- The visual canvas re-renders automatically after every write_file, so the user sees changes immediately.
- Keep your prose short. When you finish, give a one or two sentence summary of what you changed.`;

interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, any>; required?: string[] };
}

const TOOLS: ToolDef[] = [
  {
    name: "list_files",
    description: "List every editable file in the open project with its category (page or component).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read the full current contents of one file by its exact path.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Exact path as shown by list_files" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Create or overwrite a file with the FULL new contents. Always pass the entire file, never a diff. Only .html/.jsx/.tsx paths are accepted.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "The complete new file contents" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "search",
    description: "Case-insensitive substring search across all editable files. Returns path:line: matches.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

// ── tool execution ───────────────────────────────────────────────────────────
// With a backend (Run tab → WebContainer + disk), route through it; otherwise
// operate on the live editor store as before (canvas auto-syncs).
async function runTool(name: string, input: any, backend?: FileBackend): Promise<{ content: string; is_error?: boolean }> {
  if (backend) return runToolBackend(name, input, backend);
  const ed = useEditor.getState();
  switch (name) {
    case "list_files":
      return {
        content: ed.files.length
          ? ed.files.map((f) => `${f.path} (${f.category})`).join("\n")
          : "No editable files in this project.",
      };
    case "read_file": {
      const f = ed.files.find((x) => x.path === input?.path);
      if (!f) return { content: `Not found: ${input?.path}. Call list_files for exact paths.`, is_error: true };
      return { content: f.content };
    }
    case "write_file": {
      if (typeof input?.path !== "string" || typeof input?.content !== "string")
        return { content: "write_file requires string `path` and `content`.", is_error: true };
      const exists = ed.files.find((x) => x.path === input.path);
      if (!exists && !fileKind(input.path))
        return { content: `Cannot create ${input.path}: only .html/.jsx/.tsx files are editable here.`, is_error: true };
      ed.upsertFile(input.path, input.content);
      return { content: `Wrote ${input.path} (${input.content.length} chars).` };
    }
    case "search": {
      const q = String(input?.query || "").toLowerCase();
      if (!q) return { content: "Empty query.", is_error: true };
      const hits: string[] = [];
      for (const f of ed.files) {
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) hits.push(`${f.path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
          if (hits.length >= 80) break;
        }
        if (hits.length >= 80) break;
      }
      return { content: hits.length ? hits.join("\n") : `No matches for "${input.query}".` };
    }
    default:
      return { content: `Unknown tool: ${name}`, is_error: true };
  }
}

// Same tools, against a pluggable backend (the running app's files in Run).
async function runToolBackend(name: string, input: any, b: FileBackend): Promise<{ content: string; is_error?: boolean }> {
  switch (name) {
    case "list_files": {
      const files = await b.list();
      return { content: files.length ? files.map((f) => `${f.path} (${f.category})`).join("\n") : "No editable files in this project." };
    }
    case "read_file": {
      const c = await b.read(input?.path);
      if (c == null) return { content: `Not found: ${input?.path}. Call list_files for exact paths.`, is_error: true };
      return { content: c };
    }
    case "write_file": {
      if (typeof input?.path !== "string" || typeof input?.content !== "string")
        return { content: "write_file requires string `path` and `content`.", is_error: true };
      if (!fileKind(input.path)) return { content: `Cannot create ${input.path}: only .html/.jsx/.tsx files are editable here.`, is_error: true };
      const r = await b.write(input.path, input.content);
      return r.ok
        ? { content: `Wrote ${input.path} (${input.content.length} chars).` }
        : { content: `Failed to write ${input.path}: ${r.error || "unknown error"}`, is_error: true };
    }
    case "search": {
      const q = String(input?.query || "").toLowerCase();
      if (!q) return { content: "Empty query.", is_error: true };
      const hits: string[] = [];
      for (const f of await b.list()) {
        const content = await b.read(f.path);
        if (!content) continue;
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) hits.push(`${f.path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
          if (hits.length >= 80) break;
        }
        if (hits.length >= 80) break;
      }
      return { content: hits.length ? hits.join("\n") : `No matches for "${input.query}".` };
    }
    default:
      return { content: `Unknown tool: ${name}`, is_error: true };
  }
}

// ── provider error formatting ─────────────────────────────────────────────────
async function errText(res: Response): Promise<string> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  let msg = body;
  try {
    msg = JSON.parse(body)?.error?.message || body;
  } catch {
    /* not json */
  }
  if (res.status === 401) return "Invalid API key (401). Check it in Settings → AI.";
  if (res.status === 429) return "Rate limited or out of credit (429). Check your provider account.";
  return `API error ${res.status}: ${String(msg).slice(0, 220)}`;
}

// Read an SSE response body and yield each `data:` payload as it arrives.
async function* sseEvents(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error("No response stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type OnDelta = (blocks: AiBlock[]) => void;

// ── Anthropic (canonical format maps almost 1:1) ──────────────────────────────
function toAnthropic(m: AiMessage) {
  return {
    role: m.role,
    content: m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: b.text || "" };
      if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input || {} };
      return { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content || "", ...(b.is_error ? { is_error: true } : {}) };
    }),
  };
}

async function callAnthropic(key: string, model: string, messages: AiMessage[], baseURL: string, signal?: AbortSignal, onDelta?: OnDelta): Promise<AiBlock[]> {
  const res = await fetch(`${baseURL}/messages`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: SYSTEM, tools: TOOLS, messages: messages.map(toAnthropic), stream: true }),
  });
  if (!res.ok) throw new Error(await errText(res));

  // Assemble content blocks as they stream in, indexed by content-block index.
  const blocks: AiBlock[] = [];
  const partialJson: Record<number, string> = {};
  const live = () => blocks.filter(Boolean);

  for await (const data of sseEvents(res)) {
    if (data === "[DONE]") break;
    let ev: any;
    try { ev = JSON.parse(data); } catch { continue; }
    if (ev.type === "content_block_start") {
      const cb = ev.content_block || {};
      if (cb.type === "tool_use") { blocks[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, input: {} }; partialJson[ev.index] = ""; }
      else blocks[ev.index] = { type: "text", text: cb.text || "" };
      onDelta?.(live());
    } else if (ev.type === "content_block_delta") {
      const d = ev.delta || {};
      if (d.type === "text_delta") {
        const b = blocks[ev.index];
        if (b) { b.text = (b.text || "") + d.text; onDelta?.(live()); }
      } else if (d.type === "input_json_delta") {
        partialJson[ev.index] = (partialJson[ev.index] || "") + (d.partial_json || "");
      }
    } else if (ev.type === "content_block_stop") {
      const b = blocks[ev.index];
      if (b?.type === "tool_use") { try { b.input = JSON.parse(partialJson[ev.index] || "{}"); } catch { b.input = {}; } onDelta?.(live()); }
    } else if (ev.type === "error") {
      throw new Error(ev.error?.message || "Streaming error.");
    }
  }
  return live();
}

// ── OpenAI (adapter to/from canonical Anthropic-style transcript) ─────────────
function toOpenAI(m: AiMessage): any[] {
  if (m.role === "user") {
    const results = m.content.filter((b) => b.type === "tool_result");
    if (results.length) return results.map((b) => ({ role: "tool", tool_call_id: b.tool_use_id, content: b.content || "" }));
    return [{ role: "user", content: m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") }];
  }
  const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const toolUses = m.content.filter((b) => b.type === "tool_use");
  const out: any = { role: "assistant", content: text || null };
  if (toolUses.length)
    out.tool_calls = toolUses.map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
  return [out];
}

async function callOpenAI(key: string, model: string, messages: AiMessage[], baseURL: string, signal?: AbortSignal, onDelta?: OnDelta): Promise<AiBlock[]> {
  const oa = [{ role: "system", content: SYSTEM }, ...messages.flatMap(toOpenAI)];
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      // harmless extras some providers (OpenRouter) like for attribution
      "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://nova.dev",
      "X-Title": "Nova",
    },
    body: JSON.stringify({
      model,
      messages: oa,
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      tool_choice: "auto",
      stream: true,
    }),
  });
  if (!res.ok) throw new Error(await errText(res));

  // Accumulate streamed text + tool_calls (which arrive in indexed fragments).
  let text = "";
  const calls: Record<number, { id?: string; name?: string; args: string }> = {};
  const snapshot = (): AiBlock[] => {
    const out: AiBlock[] = [];
    if (text) out.push({ type: "text", text });
    for (const i of Object.keys(calls).map(Number).sort((a, b) => a - b)) {
      const c = calls[i];
      let input: any = {};
      try { input = JSON.parse(c.args || "{}"); } catch { /* still streaming */ }
      out.push({ type: "tool_use", id: c.id, name: c.name, input });
    }
    return out;
  };

  for await (const data of sseEvents(res)) {
    if (data === "[DONE]") break;
    let ev: any;
    try { ev = JSON.parse(data); } catch { continue; }
    const delta = ev.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) { text += delta.content; onDelta?.(snapshot()); }
    for (const tc of delta.tool_calls || []) {
      const i = tc.index ?? 0;
      const c = (calls[i] ||= { args: "" });
      if (tc.id) c.id = tc.id;
      if (tc.function?.name) c.name = tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
      onDelta?.(snapshot());
    }
  }
  return snapshot();
}

// ── the agentic loop ──────────────────────────────────────────────────────────
export async function runAgent(opts: {
  projectId: string;
  userText: string;
  onUpdate?: (messages: AiMessage[]) => void;
  signal?: AbortSignal;
  backend?: FileBackend; // Run tab → WebContainer + disk; omitted → editor store
}): Promise<void> {
  const { projectId, userText, onUpdate, signal, backend } = opts;
  const st = useAi.getState();
  const prov = providerById(st.selected.provider);
  if (!prov) throw new Error("Unknown model provider. Pick a model in the AI panel.");
  const key = st.keys[prov.id];
  const model = st.selected.model;
  if (!key) throw new Error(`No ${prov.brand} API key set. Add one in Settings → AI.`);

  let messages: AiMessage[] = [...st.getMessages(projectId), { role: "user", content: [{ type: "text", text: userText }] }];
  const commit = () => {
    useAi.getState().setMessages(projectId, messages);
    onUpdate?.(messages);
  };
  commit();

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Stream this turn into a live assistant message. Throttle commits to ~50ms
    // (matches the on-device path) so the canvas/UI stays smooth.
    const base = messages;
    let lastPartial: AiBlock[] = [];
    let lastFlush = 0;
    const onDelta: OnDelta = (partial) => {
      lastPartial = partial;
      const now = Date.now();
      if (now - lastFlush < 50) return;
      lastFlush = now;
      messages = [...base, { role: "assistant", content: partial }];
      commit();
    };

    let blocks: AiBlock[];
    try {
      blocks =
        prov.transport === "anthropic"
          ? await callAnthropic(key, model, base, prov.baseURL, signal, onDelta)
          : await callOpenAI(key, model, base, prov.baseURL, signal, onDelta);
    } catch (e: any) {
      // On abort, keep the partial TEXT but drop any half-formed tool_use — a
      // tool_use with no matching tool_result would corrupt the next turn.
      if (e?.name === "AbortError") {
        const textOnly = lastPartial.filter((b) => b.type === "text" && b.text?.trim());
        messages = textOnly.length ? [...base, { role: "assistant", content: textOnly }] : base;
        commit();
      }
      throw e;
    }

    messages = [...base, { role: "assistant", content: blocks }];
    commit();

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (!toolUses.length) return; // model is done

    const results: AiBlock[] = await Promise.all(
      toolUses.map(async (tu) => {
        const r = await runTool(tu.name!, tu.input, backend);
        return { type: "tool_result" as const, tool_use_id: tu.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) };
      })
    );
    messages = [...messages, { role: "user", content: results }];
    commit();
  }

  messages = [...messages, { role: "assistant", content: [{ type: "text", text: "Stopped after reaching the step limit — ask me to continue if there's more to do." }] }];
  commit();
}
