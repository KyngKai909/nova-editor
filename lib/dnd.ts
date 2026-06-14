// Shared drag state for the editor's drag-to-insert flows. Module-level so the
// layer tree and the canvas iframe handler both see it during a single drag.

// Dragging a project component (from the Components panel) into a page.
let dragComponentPath: string | null = null;
export const setDragComponent = (p: string | null) => {
  dragComponentPath = p;
};
export const getDragComponent = () => dragComponentPath;

// Dragging a standard element (from the Elements palette) — carries the raw
// HTML snippet to insert (converted to JSX automatically for JSX pages).
let dragElementSnippet: string | null = null;
export const setDragElement = (html: string | null) => {
  dragElementSnippet = html;
};
export const getDragElement = () => dragElementSnippet;
