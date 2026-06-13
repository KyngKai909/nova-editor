# Importing a project

Nova opens an existing project — it doesn't start from a blank page. There are
four ways in.

## From GitHub (public URL)

Paste any of these into the **GitHub** tab; Nova figures out the rest:

```
https://github.com/owner/repo
https://github.com/owner/repo/tree/some-branch
https://github.com/owner/repo/blob/main/src/App.tsx
git@github.com:owner/repo.git
owner/repo
```

The default branch is detected automatically if you don't specify one. This path
needs no token, but GitHub's anonymous rate limit is low — for anything but small
repos, connect GitHub (below).

## From GitHub (connected — private repos & full clone)

Open **Settings → GitHub → Connect GitHub** and paste a personal access token
(`repo` scope). Once connected you can:

- Browse and search **all** your repos, including **private** and org repos.
- Switch branches before importing.
- Do a **full clone** to disk (a real working copy, not just the editable files),
  which is required for [Running your app live](./running.md).

## From a folder

Click **Folder** and choose a directory. On Chromium browsers (Chrome, Edge, Arc)
Nova can also save changes straight back to that folder like a normal IDE — see
[Publishing & GitHub](./publishing.md#saving-to-disk).

## Paste a component

Drop a single `.html`, `.jsx`, or `.tsx` snippet into the **Paste** tab. Great for
iterating on one component.

## Working with AI-generated repos (Bolt, Lovable, v0, Claude…)

Nova is designed to catch the output of AI app builders. The smoothest path:

1. Generate your app in the tool of your choice and push it to GitHub (most have a
   one-click "push to GitHub").
2. In Nova, **connect GitHub** and import the repo (clone it if you want to run it).
3. Tweak visually, then push back — your existing Vercel/Netlify deploy picks it up.

**Tips**
- Connecting GitHub avoids rate limits on larger generated repos.
- Very large repos may have their file list **truncated** by GitHub; Nova warns
  you when this happens. A connected full clone is the most complete import.

## What's editable

The **visual editor** works on **`.html`, `.jsx`, and `.tsx`** files. A full clone
brings every file to disk (CSS, configs, assets, etc.), but only HTML/JSX/TSX open
on the canvas. CSS and config files aren't yet editable inside Nova.

## Common import errors

| Message | What it means | Fix |
|---|---|---|
| *Rate limit reached (no token)* | Too many anonymous GitHub requests. | Connect GitHub in Settings. |
| *Repo or branch not found — it may be private* | 404 from GitHub. | Check the URL/branch, or connect GitHub for private repos. |
| *No editable .html/.jsx/.tsx files* | The repo has no files Nova can open visually. | Check the branch, or clone to work with the full project. |
| *Large repo — GitHub truncated the file list* | The repo is big; some files were omitted. | Connect GitHub and clone for the complete project. |

---

**Next:** [Editing: visual & code →](./editing.md)
