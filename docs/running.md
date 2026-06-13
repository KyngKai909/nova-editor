# Running your app live

For full apps (Vite/React and similar), Nova can boot the **real** project in your
browser and let you click-to-edit it as it runs. This uses
[WebContainers](https://webcontainer.io) — a Node.js runtime that runs entirely
client-side. Nothing is uploaded to a server.

## Requirements

- A **folder-backed project** (a full clone on disk). Set a projects folder in
  **Settings → Storage**, then import/clone the repo there.
- A **Chromium browser** (Chrome, Edge, Arc) — WebContainers needs cross-origin
  isolation, which Nova scopes to the run view.

## Start it

1. Open the project in the editor.
2. Click **Run app** in the top bar (opens the run view in a new tab).
3. Nova installs dependencies and starts the dev server, streaming logs into the
   console. When it's ready, the live app appears.

## Click-to-edit the running app

In the run view, **Editing** mode is on by default:

- **Click** an element in the running app — Nova maps it back to its source file
  and line and shows it in the **Selection** inspector.
- Edit the element's **className** or **text** there; Nova writes the change to the
  source file and the dev server hot-reloads.
- **Double-click** text to edit it inline.
- Toggle **Interact** to use the app normally without selecting.

This works on React dev builds (it reads React's source mapping). Vite + React is
the best-supported setup today; other frameworks are on the roadmap.

## Tips

- First boot is the slow part (dependency install). Subsequent reloads are fast.
- If the app doesn't start, check the **console** panel for the dev server's error
  output — it's usually a missing script or dependency in the project itself.

---

**Next:** [Publishing & GitHub →](./publishing.md)
