// Shared drag state for dragging a component (from the Components panel) into
// a page. Module-level so the layer tree and the canvas iframe handler both see
// it during a single drag operation.
let dragComponentPath: string | null = null;

export const setDragComponent = (p: string | null) => {
  dragComponentPath = p;
};
export const getDragComponent = () => dragComponentPath;
