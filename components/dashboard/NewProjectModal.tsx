"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, GitBranch, Clipboard, Sparkles, X, Loader2, HardDrive, FolderCog, Check } from "lucide-react";
import { useGitHub } from "@/store/githubStore";
import { useSettings } from "@/store/settingsStore";
import { importFolder, importGithub, importPaste, importSample, type ImportResult } from "@/lib/importFlow";
import { fsSupported } from "@/lib/fileSystem";
import { openFolder } from "@/lib/deviceProject";
import { pickWorkspace } from "@/lib/workspace";
import { useCreateProject } from "@/lib/useCreateProject";
import type { ProjectKind } from "@/store/projectsStore";
import RepoBrowser from "@/components/github/RepoBrowser";
import ConnectModal from "@/components/github/ConnectModal";

type Tab = "upload" | "github" | "paste";

export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const ghUser = useGitHub((s) => s.user);
  const workspaceName = useSettings((s) => s.workspaceName);
  const setWorkspaceName = useSettings((s) => s.setWorkspaceName);
  const createProject = useCreateProject();
  const [connectOpen, setConnectOpen] = useState(false);

  const [tab, setTab] = useState<Tab>("upload");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [pasteName, setPasteName] = useState("page.html");
  const [pasteCode, setPasteCode] = useState("");

  const run = async (fn: () => Promise<ImportResult> | ImportResult, kind: ProjectKind) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      await createProject({
        name: res.suggestedName,
        kind,
        files: res.files,
        assets: res.assets,
        baseHref: res.baseHref,
        repoUrl: res.repoUrl,
        github: res.github,
      });
    } catch (e: any) {
      setError(e.message || "Import failed.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  // Open a live folder from disk — that folder backs the project directly.
  const openDeviceFolder = async () => {
    setError(null);
    setBusy(true);
    try {
      const { handle, name, files, assets } = await openFolder();
      await createProject({ name, kind: "folder", files, assets, deviceHandle: handle });
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e.message || "Could not open folder.");
      setBusy(false);
    }
  };

  const chooseWorkspace = async () => {
    try {
      const name = await pickWorkspace();
      setWorkspaceName(name);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e.message || "Could not set folder.");
    }
  };

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "upload", icon: <FolderUp size={15} />, label: "Upload" },
    { id: "github", icon: <GitBranch size={15} />, label: "GitHub" },
    { id: "paste", icon: <Clipboard size={15} />, label: "Paste" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">New project</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex gap-1 rounded-xl border border-line bg-bg p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-medium transition-colors ${
                  tab === t.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "upload" && (
              <div className="flex flex-col gap-3">
                {fsSupported() && (
                  <button
                    onClick={openDeviceFolder}
                    disabled={busy}
                    className="group flex items-center gap-3 rounded-xl border border-line-2 bg-accent/[0.04] px-4 py-3.5 text-left transition-colors hover:border-accent/50 disabled:opacity-60"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
                    </span>
                    <span>
                      <span className="block text-[14px] font-medium">Open a folder on your device</span>
                      <span className="block text-[12px] text-ink-3">Live link — edits save back to the files on disk.</span>
                    </span>
                  </button>
                )}
                <button
                  onClick={() => folderRef.current?.click()}
                  className="group flex items-center gap-3 rounded-xl border border-dashed border-line-2 px-4 py-3.5 text-left transition-colors hover:border-accent/50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-bg text-ink-3 group-hover:text-accent">
                    <FolderUp size={16} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium">Upload a copy</span>
                    <span className="block text-[12px] text-ink-3">Imports .html / .jsx / .tsx into the browser{fsSupported() ? "" : " (works in all browsers)"}.</span>
                  </span>
                </button>
                <input
                  ref={folderRef}
                  type="file"
                  // @ts-expect-error non-standard
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && run(() => importFolder(e.target.files!), "folder")}
                />
              </div>
            )}

            {tab === "github" && (
              ghUser ? (
                <RepoBrowser onDone={onClose} />
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setConnectOpen(true)}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg bg-ink text-[14px] font-semibold text-bg transition-colors hover:bg-white"
                  >
                    <GitBranch size={16} /> Connect GitHub account
                  </button>
                  <p className="text-[11px] text-ink-3">
                    Connect to browse and import your private &amp; organization repos. Or import any public repo by URL:
                  </p>
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && run(() => importGithub(repoUrl, setStatus), "github")}
                    placeholder="https://github.com/owner/repo"
                    className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-[14px] outline-none focus:border-accent/60"
                  />
                  <button
                    onClick={() => run(() => importGithub(repoUrl, setStatus), "github")}
                    disabled={busy}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-[14px] font-medium text-ink transition-colors hover:bg-raise disabled:opacity-60"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                    {busy ? status || "Importing…" : "Import public repo"}
                  </button>
                </div>
              )
            )}

            {tab === "paste" && (
              <div className="flex flex-col gap-3">
                <input
                  value={pasteName}
                  onChange={(e) => setPasteName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-[13px] outline-none focus:border-accent/60"
                />
                <textarea
                  value={pasteCode}
                  onChange={(e) => setPasteCode(e.target.value)}
                  rows={6}
                  placeholder="Paste HTML or a JSX/TSX component…"
                  className="w-full resize-none rounded-lg border border-line bg-bg p-3 font-mono text-[12px] outline-none focus:border-accent/60"
                />
                <button
                  onClick={() => run(() => importPaste(pasteName, pasteCode), "paste")}
                  className="h-11 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
                >
                  Create project
                </button>
              </div>
            )}

            {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}

            <button
              onClick={() => run(importSample, "sample")}
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-ink-3 transition-colors hover:text-accent"
            >
              <Sparkles size={13} /> or start from the sample landing page
            </button>
          </div>

          {/* where the project will be stored */}
          {fsSupported() && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {workspaceName ? <Check size={14} className="shrink-0 text-accent" /> : <HardDrive size={14} className="shrink-0 text-ink-3" />}
                <span className="min-w-0 text-[12px] text-ink-2">
                  {workspaceName ? (
                    <>Saves to <span className="font-medium text-ink">{workspaceName}/</span> on your device</>
                  ) : (
                    <>Stored in this browser — pick a folder to save projects to disk</>
                  )}
                </span>
              </div>
              <button
                onClick={chooseWorkspace}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink"
              >
                <FolderCog size={12} /> {workspaceName ? "Change" : "Choose folder"}
              </button>
            </div>
          )}
        </div>
      </div>
      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
    </div>
  );
}
