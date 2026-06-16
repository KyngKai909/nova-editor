"use client";

import { GitBranch, RefreshCw, Loader2, Check, HardDrive, Globe, GitMerge } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitSync } from "@/components/github/useGitSync";
import { useConflicts } from "@/store/conflictsStore";

// Keep in step with package.json.
const APP_VERSION = "0.1.0";

// Thin status bar at the bottom of the editor: GitHub sync (repo · branch ·
// in-sync state · a one-click Sync) on the left, the app version centered, and
// local save/storage on the right.
export default function StatusFooter() {
  const { token, gh, changed, canPull, storage, behind, busy, pull } = useGitSync();
  const projectId = useEditor((s) => s.projectId);
  const hasProject = useEditor((s) => s.files.length > 0);
  const setConflictsOpen = useConflicts((s) => s.setOpen);
  const conflicts = useConflicts((s) => (projectId ? (s.byProject[projectId] || []).length : 0));

  if (!hasProject) return null;

  const connected = !!gh && !!token;
  const pill = "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium";

  return (
    <footer className="flex h-7 shrink-0 items-center border-t border-line bg-surface px-3 text-[11px] text-ink-3">
      {/* LEFT — GitHub sync, or storage for non-connected projects */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {connected ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <GitBranch size={12} className="shrink-0 text-ink-3" />
              <span className="truncate max-w-[160px] text-ink-2" title={`${gh!.owner}/${gh!.repo}`}>{gh!.owner}/{gh!.repo}</span>
              <span className="shrink-0 text-ink-3/50">·</span>
              <span className="shrink-0 truncate max-w-[90px] font-mono text-[10.5px] text-ink-2">{gh!.branch}</span>
            </span>

            {/* remote sync state (local edits are shown on the right) */}
            {conflicts > 0 ? (
              <button onClick={() => setConflictsOpen(true)} className={`${pill} border border-amber-500/40 bg-amber-500/10 text-amber-300 transition-colors hover:bg-amber-500/20`}>
                <GitMerge size={11} /> {conflicts} conflict{conflicts === 1 ? "" : "s"}
              </button>
            ) : behind ? (
              <span className={`${pill} text-accent`}><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Update available</span>
            ) : (
              <span className={`${pill} text-emerald-400`}><Check size={11} /> Up to date</span>
            )}

            {canPull && (
              <button
                onClick={pull}
                disabled={busy}
                title={behind ? "Pull & merge upstream changes" : "Check for and merge upstream changes"}
                className={`${pill} border transition-colors disabled:opacity-50 ${behind ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20" : "border-line text-ink-2 hover:bg-raise hover:text-ink"}`}
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync
              </button>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            {storage === "device" ? <HardDrive size={12} /> : <Globe size={12} />}
            {storage === "device" ? "Local folder" : "Stored in browser"}
          </span>
        )}
      </div>

      {/* CENTER — app version */}
      <div className="hidden shrink-0 px-3 text-ink-3/60 sm:block">Nova v{APP_VERSION}</div>

      {/* RIGHT — local save + storage */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
        <span className="truncate">{changed > 0 ? `${changed} edited` : "All changes saved"}</span>
        <span className="shrink-0 text-ink-3/50">·</span>
        <span className="flex shrink-0 items-center gap-1" title={storage === "device" ? "Auto-saving to your folder on disk" : "Saved in your browser"}>
          {storage === "device" ? <HardDrive size={11} /> : <Globe size={11} />}
          <span className="hidden md:inline">{storage === "device" ? "Folder" : "Browser"}</span>
        </span>
      </div>
    </footer>
  );
}
