"use client";

import { GitBranch, RefreshCw, Loader2, Check, HardDrive, Globe, GitMerge } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitSync } from "@/components/github/useGitSync";
import { useConflicts } from "@/store/conflictsStore";

// Keep in step with package.json.
const APP_VERSION = "0.1.0";

// Thin status bar at the bottom of the editor: GitHub sync on the left, the app
// version centered, local save/storage on the right. Text labels collapse to
// icons on small screens (titles keep them discoverable) so it never squashes.
export default function StatusFooter() {
  const { token, gh, changed, canPull, storage, behind, busy, pull, agentReady } = useGitSync();
  const projectId = useEditor((s) => s.projectId);
  const hasProject = useEditor((s) => s.files.length > 0);
  const setConflictsOpen = useConflicts((s) => s.setOpen);
  const conflicts = useConflicts((s) => (projectId ? (s.byProject[projectId] || []).length : 0));

  if (!hasProject) return null;

  const connected = !!gh && !!token;
  const StorageIcon = storage === "device" ? HardDrive : Globe;
  const storageLabel = storage === "device" ? "Folder" : "Browser";
  const chip = "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-line bg-surface px-2 text-[11px] text-ink-3 sm:px-3">
      {/* LEFT — GitHub sync, or storage for non-connected projects */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        {connected ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5" title={`${gh!.owner}/${gh!.repo} · ${gh!.branch}`}>
              <GitBranch size={12} className="shrink-0 text-ink-3" />
              <span className="hidden max-w-[150px] truncate text-ink-2 lg:inline">{gh!.owner}/{gh!.repo}</span>
              <span className="hidden shrink-0 text-ink-3/50 lg:inline">·</span>
              <span className="shrink-0 truncate max-w-[110px] font-mono text-[10.5px] text-ink-2">{gh!.branch}</span>
            </span>

            {/* remote sync state (local edits are on the right) */}
            {conflicts > 0 ? (
              <button onClick={() => setConflictsOpen(true)} title={`${conflicts} merge conflict${conflicts === 1 ? "" : "s"} — click to resolve`} className={`${chip} border border-amber-500/40 bg-amber-500/10 text-amber-300 transition-colors hover:bg-amber-500/20`}>
                <GitMerge size={11} /> {conflicts}<span className="hidden md:inline">&nbsp;conflict{conflicts === 1 ? "" : "s"}</span>
              </button>
            ) : behind ? (
              <span className={`${chip} text-accent`} title="Update available — Sync to pull"><span className="h-1.5 w-1.5 rounded-full bg-accent" /><span className="hidden md:inline">Update available</span></span>
            ) : (
              <span className={`${chip} text-emerald-400`} title="Up to date with the remote"><Check size={11} /><span className="hidden md:inline">Up to date</span></span>
            )}

            {canPull && (
              <button
                onClick={pull}
                disabled={busy}
                title={
                  agentReady
                    ? (behind ? "Pull with real git on your machine" : "Fetch & pull with real git on your machine")
                    : (behind ? "Pull & merge upstream changes" : "Check for and merge upstream changes")
                }
                className={`${chip} border transition-colors disabled:opacity-50 ${behind ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20" : "border-line text-ink-2 hover:bg-raise hover:text-ink"}`}
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}<span className="hidden sm:inline">Sync{agentReady ? " · git" : ""}</span>
              </button>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5" title={storage === "device" ? "Backed by a folder on your disk" : "Stored in your browser"}>
            <StorageIcon size={12} className="shrink-0" />
            <span className="truncate">{storage === "device" ? "Local folder" : "Stored in browser"}</span>
          </span>
        )}
      </div>

      {/* CENTER — app version */}
      <div className="hidden shrink-0 px-2 text-ink-3/60 sm:block">Nova v{APP_VERSION}</div>

      {/* RIGHT — local save + storage */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2.5">
        {changed > 0 ? (
          <span className="shrink-0 whitespace-nowrap text-ink-2" title={`${changed} file${changed === 1 ? "" : "s"} edited since last sync`}>{changed}<span className="hidden sm:inline">&nbsp;edited</span></span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-ink-3" title="All changes saved"><Check size={11} className="text-emerald-400/70" /><span className="hidden sm:inline">Saved</span></span>
        )}
        <span className="hidden shrink-0 text-ink-3/40 md:inline">·</span>
        <span className="flex shrink-0 items-center gap-1" title={storage === "device" ? "Auto-saving to your folder on disk" : "Saved in your browser"}>
          <StorageIcon size={11} />
          <span className="hidden md:inline">{storageLabel}</span>
        </span>
      </div>
    </footer>
  );
}
