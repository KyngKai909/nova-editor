import { useAi, type AiMessage, type AiBlock } from "@/store/aiStore";
import { providerById } from "@/lib/aiProviders";
import { useEditor } from "@/store/editorStore";
import { fileKind } from "@/lib/importUtils";

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

// ── tool execution (against the live editor store; canvas auto-syncs) ─────────
function runTool(name: string, input: any): { content: string; is_error?: boolean } {
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

async function callAnthropic(key: string, model: string, messages: AiMessage[], baseURL: string, signal?: AbortSignal): Promise<AiBlock[]> {
  const res = await fetch(`${baseURL}/messages`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: SYSTEM, tools: TOOLS, messages: messages.map(toAnthropic) }),
  });
  if (!res.ok) throw new Error(await errText(res));
  const data = await res.json();
  return (data.content || []).map((b: any) =>
    b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input } : { type: "text", text: b.text }
  );
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

async function callOpenAI(key: string, model: string, messages: AiMessage[], baseURL: string, signal?: AbortSignal): Promise<AiBlock[]> {
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
    }),
  });
  if (!res.ok) throw new Error(await errText(res));
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const blocks: AiBlock[] = [];
  if (msg.content) blocks.push({ type: "text", text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input: any = {};
    try {
      input = JSON.parse(tc.function?.arguments || "{}");
    } catch {
      /* leave empty */
    }
    blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
  }
  return blocks;
}

// ── the agentic loop ──────────────────────────────────────────────────────────
export async function runAgent(opts: {
  projectId: string;
  userText: string;
  onUpdate?: (messages: AiMessage[]) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { projectId, userText, onUpdate, signal } = opts;
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
    const blocks =
      prov.transport === "anthropic"
        ? await callAnthropic(key, model, messages, prov.baseURL, signal)
        : await callOpenAI(key, model, messages, prov.baseURL, signal);

    messages = [...messages, { role: "assistant", content: blocks }];
    commit();

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (!toolUses.length) return; // model is done

    const results: AiBlock[] = toolUses.map((tu) => {
      const r = runTool(tu.name!, tu.input);
      return { type: "tool_result" as const, tool_use_id: tu.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) };
    });
    messages = [...messages, { role: "user", content: results }];
    commit();
  }

  messages = [...messages, { role: "assistant", content: [{ type: "text", text: "Stopped after reaching the step limit — ask me to continue if there's more to do." }] }];
  commit();
}
