# Publishing & GitHub

Nova never hosts your project — **your Git is the source of truth.** When you're
happy with a change, you review a diff and send it wherever you want.

## Review the diff

Click **Publish** in the top bar. You'll see a **clean diff** of exactly what
changed across all files — what you'd commit, nothing hidden. From here you can:

- **Download** the changed files.
- **Save to folder** (folder-backed projects).
- Push to **GitHub** (connected projects — see below).

## Push to GitHub

If the project is connected to a GitHub repo, the Publish panel lets you:

- **Commit & push** directly to the current branch.
- **Create a pull request** — Nova makes a new branch, commits, and opens the PR.
- Switch or create branches from the **branch control** in the top bar.

Pushing triggers whatever CI/CD you already have (Vercel, Netlify, Amplify) — Nova
stays out of your deploy pipeline entirely.

> **Imported vs. connected:** importing from a public URL gives you the files;
> *connecting* GitHub (with a token) is what enables pushing back. Connect in
> **Settings → GitHub**.

## Publish a new repo

Not connected to a repo yet? The Publish panel can **create a new GitHub repo**
from your project and push to it.

## Saving to disk

On Chromium browsers, projects stored in a **projects folder** behave like a normal
IDE:

- Edits **auto-save** to the folder on a debounce (toggle in **Settings → Storage**).
- **Cmd/Ctrl + S** saves immediately.
- The folder is a real working copy you can open in any other editor or run locally.

New projects get their own subfolder created inside your chosen **Nova Editor**
workspace folder.

---

**Next:** [FAQ & troubleshooting →](./faq.md)
