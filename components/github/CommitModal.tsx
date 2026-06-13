"use client";

import { useState } from "react";
import { X, GitCommitHorizontal, Loader2, Check, FileCode2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { commitFiles } from "@/lib/githubApi";

export default function CommitModal({ onClose }: { onClose: () => void }) {
  const token = useGitHub((s) => s.token)!;
  const files = useEditor((s) => s.files);
  const projectId = useEditor((s) => s.projectId);
  const markCommitted = useEditor((s) => s.markCommitted);
  const setNotice = useEditor((s) => s.setNotice);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));

  const changed = files.filter((f) => f.content !== f.original);
  const gh = project?.github;
  const [message, setMessage] = useState(`Update ${changed.length} file${changed.length === 1 ? "" : "s"} via Nova`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const push = async () => {
    if (!gh) return;
    setBusy(true);
    setError(null);
    try {
      const sha = await commitFiles(
        token,
        gh.owner,
        gh.repo,
        gh.branch,
        changed.map((f) => ({ path: f.path, content: f.content })),
        message
      );
      markCommitted();
      setDone(true);
      setNotice(`Pushed to ${gh.owner}/${gh.repo}@${gh.branch} · ${sha.slice(0, 7)}`);
      setTimeout(onClose, 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <GitCommitHorizontal size={16} className="text-accent" /> Commit &amp; push
          </h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-[12px] text-ink-3">
            Pushing to <span className="font-mono text-ink-2">{gh?.owner}/{gh?.repo}</span> on{" "}
            <span className="font-mono text-ink-2">{gh?.branch}</span>
          </div>

          <div className="scroll-thin max-h-32 overflow-y-auto rounded-lg border border-line bg-bg/40 p-2">
            {changed.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-ink-3">No changes to push.</p>
            ) : (
              changed.map((f) => (
                <div key={f.path} className="flex items-center gap-2 px-1 py-1 text-[12px] text-ink-2">
                  <FileCode2 size={12} className="text-accent" /> <span className="truncate">{f.path}</span>
                </div>
              ))
            )}
          </div>

          <div>
            <label className="text-[11px] text-ink-3">Commit message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-line bg-bg p-2.5 text-[13px] outline-none focus:border-accent/60"
            />
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button
            onClick={push}
            disabled={busy || done || !changed.length || !message.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : null}
            {busy ? "Pushing…" : done ? "Pushed!" : `Commit & push ${changed.length} file${changed.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
