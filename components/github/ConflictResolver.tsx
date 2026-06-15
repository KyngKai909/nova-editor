"use client";

import { useEffect, useMemo, useState } from "react";
import { GitMerge, X, Check, FileCode2, Trash2, ChevronRight } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useConflicts } from "@/store/conflictsStore";
import { diff3Strings, buildResolved, type Region, type Choice } from "@/lib/diff3";

// Hunk-by-hunk resolver for merge conflicts left by a GitHub Pull. Stable lines
// show as context; each region changed on both sides offers Use yours / theirs /
// both. Files deleted upstream + edited locally are resolved at file level.
export default function ConflictResolver() {
  const projectId = useEditor((s) => s.projectId);
  const open = useConflicts((s) => s.open);
  const list = useConflicts((s) => (projectId ? s.byProject[projectId] || [] : []));
  const resolveOne = useConflicts((s) => s.resolveOne);
  const setOpen = useConflicts((s) => s.setOpen);
  const setFileContent = useEditor((s) => s.setFileContent);
  const removeFile = useEditor((s) => s.removeFile);
  const selectFile = useEditor((s) => s.selectFile);
  const setNotice = useEditor((s) => s.setNotice);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice[]>>({});

  // keep a valid selection as files get resolved
  useEffect(() => {
    if (!list.length) return;
    if (!activePath || !list.some((c) => c.path === activePath)) setActivePath(list[0].path);
  }, [list, activePath]);

  const active = list.find((c) => c.path === activePath) || list[0];

  const regions: Region[] = useMemo(
    () => (active && !active.deleted ? diff3Strings(active.mine, active.base, active.theirs) : []),
    [active]
  );
  const conflictIdx = useMemo(() => regions.map((r, i) => ("conflict" in r ? i : -1)).filter((i) => i >= 0), [regions]);

  if (!open || !projectId || !list.length || !active) return null;

  const curChoices: Choice[] = choices[active.path] ?? conflictIdx.map(() => "mine");
  const setChoice = (k: number, c: Choice) =>
    setChoices((prev) => {
      const arr = [...(prev[active.path] ?? conflictIdx.map(() => "mine"))];
      arr[k] = c;
      return { ...prev, [active.path]: arr };
    });
  const setAll = (c: Choice) => setChoices((prev) => ({ ...prev, [active.path]: conflictIdx.map(() => c) }));

  const done = (msg: string) => {
    resolveOne(projectId, active.path);
    setChoices((prev) => { const n = { ...prev }; delete n[active.path]; return n; });
    setNotice(msg);
  };
  const applyContent = () => {
    setFileContent(active.path, buildResolved(regions, curChoices));
    selectFile(active.path);
    done(`Resolved ${active.path}`);
  };
  const keepMine = () => done(`Kept your ${active.path}`);
  const acceptDeletion = () => { removeFile(active.path); done(`Removed ${active.path} (matched upstream)`); };

  let ci = -1; // running index into curChoices as we render conflict regions

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <GitMerge size={16} className="text-amber-300" /> Resolve conflicts
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {list.length} file{list.length === 1 ? "" : "s"} changed both in Nova and upstream. Pick what to keep.
            </p>
          </div>
          <button onClick={() => setOpen(false)} title="Resolve later" className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-raise hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* file list */}
          <div className="w-56 shrink-0 overflow-y-auto border-r border-line py-1">
            {list.map((c) => (
              <button
                key={c.path}
                onClick={() => setActivePath(c.path)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${c.path === active.path ? "bg-raise text-ink" : "text-ink-2 hover:bg-raise/50"}`}
              >
                <FileCode2 size={13} className="shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1 truncate font-mono" title={c.path}>{c.path}</span>
                {c.deleted && <span className="shrink-0 rounded bg-red-500/15 px-1 text-[9px] text-red-300">del</span>}
                {c.path === active.path && <ChevronRight size={12} className="shrink-0 text-ink-3" />}
              </button>
            ))}
          </div>

          {/* resolution pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            {active.deleted ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <Trash2 size={22} className="text-red-300" />
                <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
                  <span className="font-mono text-ink">{active.path}</span> was deleted upstream, but you edited it in Nova. Keep your version, or accept the deletion?
                </p>
                <div className="flex gap-2">
                  <button onClick={keepMine} className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[12.5px] font-semibold text-accent-ink hover:opacity-90">
                    <Check size={14} /> Keep my version
                  </button>
                  <button onClick={acceptDeletion} className="flex h-9 items-center gap-1.5 rounded-lg border border-red-500/40 px-4 text-[12.5px] font-medium text-red-300 hover:bg-red-500/10">
                    <Trash2 size={14} /> Accept deletion
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
                  <span className="truncate font-mono text-[12px] text-ink-2">{active.path}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] text-ink-3">{conflictIdx.length} conflict{conflictIdx.length === 1 ? "" : "s"}</span>
                    <button onClick={() => setAll("mine")} className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:bg-raise">All yours</button>
                    <button onClick={() => setAll("theirs")} className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:bg-raise">All theirs</button>
                  </div>
                </div>

                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11.5px] leading-relaxed">
                  {regions.map((r, ri) => {
                    if ("ok" in r) {
                      return (
                        <pre key={ri} className="whitespace-pre-wrap px-2 text-ink-3">{r.ok.join("\n")}</pre>
                      );
                    }
                    ci += 1;
                    const k = ci;
                    const choice = curChoices[k] ?? "mine";
                    return (
                      <div key={ri} className="my-2 overflow-hidden rounded-lg border border-amber-500/40">
                        <div className="flex items-center justify-between bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          <span>Conflict {k + 1}</span>
                          <div className="flex gap-1">
                            {(["mine", "theirs", "both"] as Choice[]).map((c) => (
                              <button
                                key={c}
                                onClick={() => setChoice(k, c)}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium normal-case transition-colors ${choice === c ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raise"}`}
                              >
                                {c === "mine" ? "Use yours" : c === "theirs" ? "Use theirs" : "Use both"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <pre className={`whitespace-pre-wrap border-l-2 px-2 py-1 ${choice === "theirs" ? "border-line opacity-40" : "border-accent bg-accent/[0.05] text-ink"}`}>
                          <span className="select-none text-ink-3">yours › </span>{r.conflict.mine.join("\n") || "(empty)"}
                        </pre>
                        <pre className={`whitespace-pre-wrap border-l-2 px-2 py-1 ${choice === "mine" ? "border-line opacity-40" : "border-sky-400 bg-sky-400/[0.05] text-ink"}`}>
                          <span className="select-none text-ink-3">theirs › </span>{r.conflict.theirs.join("\n") || "(empty)"}
                        </pre>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
                  <button onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line px-3 text-[12.5px] text-ink-2 hover:bg-raise">Later</button>
                  <button onClick={applyContent} className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[12.5px] font-semibold text-accent-ink hover:opacity-90">
                    <Check size={14} /> Apply to {active.path.split("/").pop()}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
