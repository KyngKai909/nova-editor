"use client";

import { useEffect, useState } from "react";
import { Search, Lock, GitBranch, Loader2, ChevronLeft } from "lucide-react";
import { useGitHub } from "@/store/githubStore";
import { listRepos, listBranches, importRepoFilesAuth, cloneRepoFiles, type Repo } from "@/lib/githubApi";
import { isAsset } from "@/lib/importUtils";
import type { AssetMap } from "@/lib/assets";
import { useCreateProject } from "@/lib/useCreateProject";
import { fsSupported } from "@/lib/fileSystem";
import { hasWorkspace } from "@/lib/workspace";

export default function RepoBrowser({ onDone }: { onDone: () => void }) {
  const token = useGitHub((s) => s.token)!;
  const createProject = useCreateProject();

  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listRepos(token).then(setRepos).catch((e) => setError(e.message));
  }, [token]);

  const pickRepo = async (r: Repo) => {
    setSelected(r);
    setBranches(null);
    setBranch(r.defaultBranch);
    try {
      setBranches(await listBranches(token, r.owner, r.name));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doImport = async () => {
    if (!selected) return;
    setBusy("Importing…");
    setError(null);
    try {
      const baseHref = selected.private
        ? null
        : `https://cdn.jsdelivr.net/gh/${selected.owner}/${selected.name}@${branch}/`;
      // full clone to disk when a projects folder is set; else editable-only
      const fullClone = fsSupported() && (await hasWorkspace());
      let files; let allFiles; let assets: AssetMap = {}; let commitSha: string;
      if (fullClone) {
        const res = await cloneRepoFiles(token, selected.owner, selected.name, branch, setBusy);
        files = res.editable;
        allFiles = res.all;
        commitSha = res.commitSha;
        // the full clone already has the binary bytes — turn assets into blobs
        for (const f of res.all) if (isAsset(f.path)) assets[f.path] = URL.createObjectURL(new Blob([f.content as unknown as BlobPart]));
      } else {
        const r = await importRepoFilesAuth(token, selected.owner, selected.name, branch, setBusy);
        files = r.files;
        assets = r.assets;
        commitSha = r.commitSha;
      }
      await createProject({
        name: selected.name,
        kind: "github",
        files,
        assets,
        baseHref,
        repoUrl: `https://github.com/${selected.fullName}`,
        github: { owner: selected.owner, repo: selected.name, branch, commitSha },
        allFiles,
      });
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  // ── repo detail (branch + import) ──
  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="mb-3 flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          <ChevronLeft size={13} /> All repos
        </button>
        <div className="flex items-center gap-2">
          {selected.private && <Lock size={13} className="text-ink-3" />}
          <span className="font-mono text-[13px] text-ink">{selected.fullName}</span>
        </div>
        <div className="mt-4">
          <label className="text-[11px] text-ink-3">Branch</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
            <GitBranch size={14} className="text-ink-3" />
            {branches ? (
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10 flex-1 bg-transparent text-[13px] outline-none">
                {branches.map((b) => (
                  <option key={b} value={b} className="bg-surface">{b}</option>
                ))}
              </select>
            ) : (
              <span className="flex h-10 items-center gap-2 text-[12px] text-ink-3"><Loader2 size={13} className="animate-spin" /> loading…</span>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
        <button
          onClick={doImport}
          disabled={!!busy || !branch}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <><Loader2 size={15} className="animate-spin" /> {busy}</> : "Import project"}
        </button>
      </div>
    );
  }

  // ── repo list ──
  const filtered = (repos || []).filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
        <Search size={14} className="text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your repositories…"
          className="h-10 flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>
      {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
      <div className="scroll-thin mt-2 max-h-64 overflow-y-auto">
        {!repos && !error && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-ink-3">
            <Loader2 size={14} className="animate-spin" /> Loading repositories…
          </div>
        )}
        {filtered.map((r) => (
          <button
            key={r.fullName}
            onClick={() => pickRepo(r)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-raise"
          >
            {r.private ? <Lock size={13} className="shrink-0 text-ink-3" /> : <GitBranch size={13} className="shrink-0 text-ink-3" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{r.name}</span>
              <span className="block truncate text-[11px] text-ink-3">{r.owner}{r.description ? ` · ${r.description}` : ""}</span>
            </span>
          </button>
        ))}
        {repos && !filtered.length && <p className="py-6 text-center text-[12px] text-ink-3">No matching repos.</p>}
      </div>
    </div>
  );
}
