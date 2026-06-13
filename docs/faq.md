# FAQ & troubleshooting

## Frequently asked questions

**Is Nova free?**
Yes — the editor is free and runs in your browser. The only thing that ever costs
money is your **own** AI API usage (if you use the assistant), billed by your
provider on your own key.

**Do I need an account?**
No. Projects are stored locally in your browser. You only connect GitHub (a token)
if you want to import private repos or push changes.

**Where are my files and keys stored?**
Locally. Projects live in your browser's storage (and, optionally, a folder on your
disk). API keys and your GitHub token are stored **only in your browser** and are
sent **directly** to GitHub / the AI provider — never through a Nova server.

**Does Nova lock me in?**
No. Nova edits your actual files, not a proprietary format. The output is clean
code you can take anywhere. Git stays the source of truth.

**What frameworks/file types work?**
The visual editor edits **HTML, JSX, and TSX**, with first-class **Tailwind**
support. A full clone brings every file to disk; CSS/config files aren't editable
in the canvas yet.

**Is my AI subscription (ChatGPT Plus / Claude Pro) enough?**
No — those don't include API access. You need a developer **API key** from the
provider's console. See [the AI assistant guide](./ai-assistant.md).

**Which browsers are supported?**
Any modern browser works for importing and editing. **Folder storage** and
**Run app** (live preview) require a **Chromium** browser (Chrome, Edge, Arc).

## Troubleshooting

**"GitHub rate limit reached (no token)."**
Anonymous GitHub requests are limited. Open **Settings → GitHub → Connect GitHub**
and import again — connected requests have a far higher limit.

**"Repo or branch not found — it may be private."**
Check the URL and branch. Private and org repos require connecting GitHub.

**"No editable .html/.jsx/.tsx files."**
Nova's canvas opens HTML/JSX/TSX. Confirm the branch, or do a full clone to work
with the entire project on disk.

**Import seems to be missing files / "truncated" warning.**
Very large repos get truncated by GitHub's tree API. Connect GitHub and **clone**
for the most complete import.

**The AI assistant errors immediately.**
- *Invalid API key (401):* re-check the key in **Settings → AI**.
- *Rate limited / out of credit (429):* check your provider account.
- Make sure you selected a model for a provider you actually have a key for (a
  green dot in the model picker marks connected providers).

**"Run app" won't start / says it needs a folder.**
Run mode needs a folder-backed full clone on a Chromium browser. Set a projects
folder in **Settings → Storage**, then re-import the repo there.

**Visual changes aren't saving to disk.**
Folder auto-save is Chromium-only and toggleable in **Settings → Storage**. You can
always **Cmd/Ctrl + S** to save, or **Publish → Save to folder**.

---

Still stuck? Nova is in **alpha** — please send feedback so we can fix it.
