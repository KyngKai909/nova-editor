"use client";

import { useState } from "react";
import {
  X, Download, FileCode2, Check, HardDrive, Loader2, GitCommitHorizontal,
  GitPullRequest, GitBranch, ExternalLink, UploadCloud,
} from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { useGitHub } from "@/store/githubStore";
import { lineDiff } from "@/lib/diff";
import { fsSupported } from "@/lib/fileSystem";
import { saveProjectToDevice } from "@/lib/deviceProject";
import { commitFiles, commitToNewBranchAndPR } from "@/lib/githubApi";
import ConnectModal from "@/components/github/ConnectModal";
import PublishModal from "@/components/github/PublishModal";

export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const files = useEditor((s) => s.files);
  const projectId = useEditor((s) => s.projectId);
  const markCommitted = useEditor((s) => s.markCommitted);
  const setNotice = useEditor((s) => s.setNotice);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjects((s) => s.updateProject);
  const token = useGitHub((s) => s.token);
  const ghUser = useGitHub((s) => s.user);

  const changed = files.filter((f) => f.content !== f.original);
  const [active, setActive] = useState(changed[0]?.path ?? null);
  const file = changed.find((f) => f.path === active);

  const gh = project?.github;
  const isGithubSourced = !!gh || !!project?.repoUrl;

  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"commit" | "pr">("commit");
  const [message, setMessage] = useState(`Update ${changed.length} file${changed.length === 1 ? "" : "s"} via Nova`);
  const [prBranch, setPrBranch] = useState(`nova/update-${Date.now().toString(36).slice(-4)}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [publishRepo, setPublishRepo] = useState(false);

  const download = (path: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToDevice = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const { linked } = await saveProjectToDevice(projectId, files.map((f) => ({ path: f.path, content: f.content })));
      if (linked) updateProject(projectId, { storage: "device" });
      markCommitted();
      setNotice("Saved to folder on disk");
      onClose();
    } catch (e: any) {
      if (e?.name !== "AbortError") setNotice(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const changes = changed.map((f) => ({ path: f.path, content: f.content }));

  const commitPush = async () => {
    if (!gh || !token) return;
    setBusy("Pushing…");
    setError(null);
    try {
      const sha = await commitFiles(token, gh.owner, gh.repo, gh.branch, changes, message);
      markCommitted();
      setNotice(`Pushed to ${gh.owner}/${gh.repo}@${gh.branch} · ${sha.slice(0, 7)}`);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const openPR = async () => {
    if (!gh || !token) return;
    setBusy("Opening pull request…");
    setError(null);
    try {
      const url = await commitToNewBranchAndPR(token, gh.owner, gh.repo, gh.branch, prBranch.trim(), changes, message, message);
      markCommitted();
      setPrUrl(url);
      setNotice("Pull request opened");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <UploadCloud size={16} className="text-accent" /> Publish
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {changed.length} file{changed.length === 1 ? "" : "s"} changed since import.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fsSupported() && (
              <button onClick={saveToDevice} disabled={!changed.length || saving} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink disabled:opacity-40">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                {project?.storage === "device" ? "Save to folder" : "Save to device…"}
              </button>
            )}
            <button onClick={() => changed.forEach((f) => download(f.path, f.content))} disabled={!changed.length} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink disabled:opacity-40">
              <Download size={14} /> Download
            </button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* diff */}
        {!changed.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-3">
            <Check size={28} /> <p className="text-[13px]">No changes yet — edit something first.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="scroll-thin w-56 shrink-0 overflow-y-auto border-r border-line py-2">
              {changed.map((f) => (
                <button key={f.path} onClick={() => setActive(f.path)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${active === f.path ? "bg-raise text-ink" : "text-ink-2 hover:bg-raise/50"}`}>
                  <FileCode2 size={13} className="shrink-0 text-accent" /> <span className="truncate">{f.path}</span>
                </button>
              ))}
            </div>
            <div className="scroll-thin min-w-0 flex-1 overflow-auto bg-bg/60">
              {file && (
                <pre className="min-w-full py-2 font-mono text-[11.5px] leading-[1.7]">
                  {lineDiff(file.original, file.content).map((l, i) => (
                    <div key={i} className={l.type === "add" ? "bg-accent/[0.08] text-accent" : l.type === "del" ? "bg-red-500/10 text-red-300/90" : "text-ink-3"}>
                      <span className="inline-block w-9 select-none pr-3 text-right text-ink-3/50">{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</span>
                      {l.text || " "}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* github publish footer */}
        {!!changed.length && isGithubSourced && (
          <div className="shrink-0 border-t border-line bg-bg/40 px-5 py-4">
            {prUrl ? (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] text-ink"><GitPullRequest size={15} className="text-accent" /> Pull request opened.</span>
                <a href={prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-accent-ink hover:opacity-90">
                  View PR <ExternalLink size={13} />
                </a>
              </div>
            ) : !ghUser ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink-3">
                  Imported from <span className="font-mono text-ink-2">{gh ? `${gh.owner}/${gh.repo}` : project?.repoUrl}</span> — connect your account to commit &amp; push.
                </span>
                <button onClick={() => setConnectOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12px] font-semibold text-bg transition-colors hover:bg-white">
                  <GitBranch size={13} /> Connect to push
                </button>
              </div>
            ) : gh ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-ink-3">
                  <GitBranch size={13} /> <span className="font-mono text-ink-2">{gh.owner}/{gh.repo}</span> · base branch <span className="font-mono text-ink-2">{gh.branch}</span>
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Commit message" className="w-full resize-none rounded-lg border border-line bg-bg p-2.5 text-[13px] outline-none focus:border-accent/60" />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-line p-0.5">
                    {([["commit", "Commit & push", <GitCommitHorizontal key="c" size={13} />], ["pr", "Pull request", <GitPullRequest key="p" size={13} />]] as const).map(([m, label, icon]) => (
                      <button key={m} onClick={() => setMode(m)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${mode === m ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                  {mode === "pr" && (
                    <input value={prBranch} onChange={(e) => setPrBranch(e.target.value.replace(/\s+/g, "-"))} placeholder="new-branch" className="h-9 w-44 rounded-lg border border-line bg-bg px-2.5 font-mono text-[12px] outline-none focus:border-accent/60" />
                  )}
                  <button
                    onClick={mode === "commit" ? commitPush : openPR}
                    disabled={!!busy || !message.trim() || (mode === "pr" && !prBranch.trim())}
                    className="ml-auto flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : mode === "commit" ? <GitCommitHorizontal size={15} /> : <GitPullRequest size={15} />}
                    {busy || (mode === "commit" ? `Commit & push to ${gh.branch}` : "Create pull request")}
                  </button>
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink-3">Push these changes to a new GitHub repository.</span>
                <button onClick={() => setPublishRepo(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-accent-ink hover:opacity-90">
                  <UploadCloud size={13} /> Publish to new repo
                </button>
              </div>
            )}
          </div>
        )}

        {/* connected but project not linked to a repo */}
        {!!changed.length && !isGithubSourced && ghUser && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-bg/40 px-5 py-4">
            <span className="text-[12.5px] text-ink-3">Publish this project to a new GitHub repository.</span>
            <button onClick={() => setPublishRepo(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-accent-ink hover:opacity-90">
              <UploadCloud size={13} /> Publish to GitHub
            </button>
          </div>
        )}
      </div>

      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
      {publishRepo && <PublishModal onClose={() => setPublishRepo(false)} />}
    </div>
  );
}
