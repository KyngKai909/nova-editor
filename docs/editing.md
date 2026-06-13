# Editing: visual & code

Nova keeps the visual canvas and the code perfectly in sync. Edit either side;
the other updates.

## View modes

In the top bar, switch between:

- **Design** — the visual canvas only.
- **Split** — canvas and code side by side.
- **Code** — the full Monaco editor.

## Selecting & the inspector

Click any element on the canvas to select it. The **inspector** on the right
exposes Webflow-grade controls, grouped into:

- **Layout** — display, position, flex/grid.
- **Spacing** — margin and padding (visual box editor).
- **Size** — width/height, min/max, overflow.
- **Typography** — font, size, weight, line height, spacing, color.
- **Color** — text, background, borders.

Every change is written into your source immediately. In Tailwind projects, edits
are emitted as **utility classes** (and become responsive per breakpoint) rather
than inline styles, so the output looks hand-written.

## Editing text

**Double-click** any text element to edit it inline. Press Escape or click away to
commit.

## The layers panel

The left panel shows the **layer tree** of the current file. Use it to:

- Navigate nested structure and collapse branches.
- Select an element that's hard to click on the canvas.
- **Right-click** a layer for actions (duplicate, delete, view in code).
- **Drag** to reorder (HTML), and drag a component in from the Components tab.

The left panel also has tabs for **Pages**, **Components**, and **Files**.

## Breakpoints & preview

- Switch **desktop / tablet / mobile** in the top bar to design responsively.
- Hit **Preview** to interact with the page as a visitor would (selection off).

## Structural edits & shortcuts

- **Delete / Backspace** — remove the selected element.
- **Cmd/Ctrl + D** — duplicate it.
- Drag layers to reorder; drop a component to insert it.

## The code editor

The built-in **Monaco** editor (the same engine as VS Code) gives you real
autocomplete and syntax highlighting. Edits there re-parse and update the canvas
on a short debounce. Right-click a layer → **View in code** to jump straight to the
source line.

This is the "developer escape hatch": when a change is faster to type than to
click, type it — and the visual layer stays in sync.

---

**Next:** [The AI assistant →](./ai-assistant.md)
