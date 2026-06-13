"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FolderUp, GitBranch, Clipboard, Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { toSourceFiles, isAsset, stripCommonRoot } from "@/lib/importUtils";
import { fetchRepoFiles, parseRepoUrl } from "@/lib/github";
import type { AssetMap } from "@/lib/assets";

type Tab = "upload" | "github" | "paste";

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "upload", icon: <FolderUp size={15} />, label: "Upload" },
  { id: "github", icon: <GitBranch size={15} />, label: "GitHub" },
  { id: "paste", icon: <Clipboard size={15} />, label: "Paste" },
];

export default function ImportPanel() {
  const loadFiles = useEditor((s) => s.loadFiles);
  const [tab, setTab] = useState<Tab>("upload");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [pasteName, setPasteName] = useState("page.html");
  const [pasteCode, setPasteCode] = useState("");

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);
    const all = Array.from(fileList);
    const strip = stripCommonRoot(all.map((f) => (f as any).webkitRelativePath || f.name));
    const entries: { path: string; content: string }[] = [];
    const assets: AssetMap = {};
    for (const f of all) {
      const rel = (f as any).webkitRelativePath || f.name;
      const path = strip(rel);
      if (/\.(html?|jsx|tsx)$/i.test(path)) entries.push({ path: rel, content: await f.text() });
      else if (isAsset(path)) assets[path] = URL.createObjectURL(f);
    }
    const sf = toSourceFiles(entries);
    if (!sf.length) return setError("No .html / .jsx / .tsx files found in that selection.");
    loadFiles(sf, assets);
  };

  const handleGitBranch = async () => {
    setError(null);
    const ref = parseRepoUrl(repoUrl);
    if (!ref) return setError("Enter a GitHub URL like https://github.com/owner/repo");
    setBusy(true);
    try {
      const { files, baseHref, truncated } = await fetchRepoFiles(ref, setStatus);
      loadFiles(files, {}, baseHref);
      if (truncated) {
        useEditor.getState().setNotice("Large repo — GitHub truncated the file list; some files may be missing. Connect GitHub to clone the full project.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to import repo.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const handlePaste = () => {
    setError(null);
    if (!pasteCode.trim()) return setError("Paste some HTML or JSX first.");
    const sf = toSourceFiles([{ path: pasteName, content: pasteCode }]);
    if (!sf.length) return setError("File name must end in .html, .jsx or .tsx.");
    loadFiles(sf);
  };

  const loadSample = async () => {
    setError(null);
    const res = await fetch("/samples/landing.html");
    loadFiles(toSourceFiles([{ path: "landing.html", content: await res.text() }]));
  };

  return (
    <div className="relative min-h-[100dvh] bg-bg">
      <div className="grain" />
      <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-6 py-16">
        <Link href="/dashboard" className="mb-10 inline-flex items-center gap-2 text-[13px] text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-tightest">
          Open a project
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-2">
          Import a folder, pull a public GitHub repo, or paste a component. Everything runs
          locally in your browser — no account, no upload.
        </p>

        <div className="mt-8 flex gap-1 rounded-xl border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-line bg-surface p-5">
          {tab === "upload" && (
            <div
              onClick={() => folderRef.current?.click()}
              className="group cursor-pointer rounded-lg border border-dashed border-line-2 px-6 py-10 text-center transition-colors hover:border-accent/50 hover:bg-accent/[0.03]"
            >
              <FolderUp size={26} className="mx-auto text-ink-3 transition-colors group-hover:text-accent" />
              <p className="mt-3 text-[14px] font-medium">Choose a folder</p>
              <p className="mt-1 text-[12px] text-ink-3">
                We keep the .html / .jsx / .tsx files and load local fonts &amp; images.
              </p>
              <input
                ref={folderRef}
                type="file"
                // @ts-expect-error non-standard but widely supported
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {tab === "github" && (
            <div className="flex flex-col gap-3">
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGitBranch()}
                placeholder="https://github.com/owner/repo"
                className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-[14px] outline-none focus:border-accent/60"
              />
              <button
                onClick={handleGitBranch}
                disabled={busy}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />}
                {busy ? "Importing…" : "Import public repo"}
              </button>
              <p className="text-[12px] text-ink-3">
                Any public repo via GitHub&apos;s API — assets resolve through jsDelivr. Capped at 40 files.
              </p>
            </div>
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
                rows={7}
                placeholder="Paste HTML or a JSX/TSX component…"
                className="w-full resize-none rounded-lg border border-line bg-bg p-3 font-mono text-[12px] outline-none focus:border-accent/60"
              />
              <button
                onClick={handlePaste}
                className="h-11 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
              >
                Load code
              </button>
            </div>
          )}

          {status && <p className="mt-3 text-[12px] text-accent">{status}</p>}
          {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
        </div>

        <button
          onClick={loadSample}
          className="mt-4 inline-flex items-center gap-1.5 self-start text-[13px] text-ink-3 transition-colors hover:text-accent"
        >
          <Sparkles size={14} /> or try the sample landing page
        </button>
      </div>
    </div>
  );
}
