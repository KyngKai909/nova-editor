"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Trash2, Pencil, MessageSquare, Eye, Lock } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useAuth } from "@/store/authStore";
import { useProjects } from "@/store/projectsStore";
import { pushProject } from "@/lib/cloudSync";
import { inviteCollaborator, listCollaborators, removeCollaborator, type Collaborator, type Role } from "@/lib/collab";

const ROLES: { id: Role; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "viewer", label: "Viewer", icon: <Eye size={13} />, desc: "Can view" },
  { id: "commentor", label: "Commenter", icon: <MessageSquare size={13} />, desc: "View + comment" },
  { id: "editor", label: "Editor", icon: <Pencil size={13} />, desc: "Full editing" },
];

export default function CollaboratorsModal({ onClose }: { onClose: () => void }) {
  const projectId = useEditor((s) => s.projectId);
  const profile = useAuth((s) => s.profile);
  const isStudio = profile?.plan === "studio" || !!profile?.is_admin;

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("commentor");
  const [list, setList] = useState<Collaborator[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => { if (projectId) listCollaborators(projectId).then(setList); };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId]);

  const invite = async () => {
    if (!projectId || !email.trim()) return;
    setErr(null); setNote(null); setBusy(true);
    try {
      const status = await inviteCollaborator(projectId, email, role);
      // Make sure the project is in the cloud so the collaborator can open it.
      const rec = useProjects.getState().getProject(projectId);
      if (rec) pushProject(rec).catch(() => {});
      setNote(status === "active" ? `Shared with ${email.trim()}` : `Invited ${email.trim()} — they get access when they sign in`);
      setEmail("");
      refresh();
    } catch (e: any) {
      setErr(e?.message || "Could not invite.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: string) => {
    if (!projectId) return;
    await removeCollaborator(projectId, e);
    refresh();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold tracking-tight">Share project</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink"><X size={16} /></button>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Invite people by email — they use Nova with their own account, and this project shows up in their dashboard.
        </p>

        {/* role picker */}
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {ROLES.map((r) => {
            const locked = r.id === "editor" && !isStudio;
            return (
              <button
                key={r.id}
                disabled={locked}
                onClick={() => setRole(r.id)}
                title={locked ? "Editor invites require the Studio plan" : r.desc}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  role === r.id ? "border-accent/60 bg-accent/[0.07]" : "border-line hover:border-line-2"
                } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <span className="text-accent">{locked ? <Lock size={12} /> : r.icon}</span> {r.label}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-3">{r.desc}</div>
              </button>
            );
          })}
        </div>
        {role === "editor" && !isStudio && (
          <p className="mt-1.5 text-[11px] text-accent">Editor access is a Studio-plan feature — viewers & commenters are free.</p>
        )}

        {/* invite row */}
        <div className="mt-3 flex gap-1.5">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="email@example.com"
            type="email"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 text-[13px] text-ink outline-none focus:border-accent/60"
          />
          <button
            onClick={invite}
            disabled={busy || !email.trim()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Invite"}
          </button>
        </div>
        {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
        {note && <p className="mt-2 text-[12px] text-accent">{note}</p>}

        {/* current collaborators */}
        <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-[12px] text-ink-3">No collaborators yet.</p>
          ) : (
            list.map((c) => (
              <div key={c.email} className="flex items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] text-ink">{c.email}</div>
                  <div className="text-[10.5px] capitalize text-ink-3">{c.role}{c.status === "pending" ? " · pending" : ""}</div>
                </div>
                <button onClick={() => remove(c.email)} title="Remove" className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-3 hover:bg-raise hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
