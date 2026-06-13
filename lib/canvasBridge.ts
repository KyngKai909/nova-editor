// Coordinates between the parent app and the canvas iframe. Because the iframe
// is rendered from srcDoc (same-origin) we can read its live DOM directly to
// pull computed styles, and mirror edits into it without a reload (no flicker).

let iframeEl: HTMLIFrameElement | null = null;

export function setIframe(el: HTMLIFrameElement | null) {
  iframeEl = el;
}

function doc(): Document | null {
  try {
    return iframeEl?.contentDocument ?? null;
  } catch {
    return null;
  }
}

function el(id: string): HTMLElement | null {
  return (doc()?.querySelector(`[data-wfc-id="${id}"]`) as HTMLElement) ?? null;
}

// Properties the style panel reads/writes.
export const STYLE_PROPS = [
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap",
  "position", "top", "right", "bottom", "left", "zIndex",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
  "letterSpacing", "textAlign", "textTransform", "textDecorationLine", "color",
  "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomRightRadius", "borderBottomLeftRadius",
  "borderWidth", "borderStyle", "borderColor",
  "opacity", "boxShadow", "filter", "transform", "overflow", "cursor",
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];

// Read inline style first (what the user set), falling back to computed.
export function readStyles(id: string): Record<string, string> {
  const node = el(id);
  if (!node) return {};
  const computed = node.ownerDocument!.defaultView!.getComputedStyle(node);
  const out: Record<string, string> = {};
  for (const prop of STYLE_PROPS) {
    const kebab = camelToKebab(prop);
    const inline = node.style.getPropertyValue(kebab);
    out[prop] = inline || computed.getPropertyValue(kebab);
  }
  return out;
}

export function applyStyleToIframe(id: string, prop: string, value: string) {
  const node = el(id);
  if (!node) return;
  if (value === "") node.style.removeProperty(camelToKebab(prop));
  else node.style.setProperty(camelToKebab(prop), value);
}

export function applyTextToIframe(id: string, text: string) {
  const node = el(id);
  if (node) setLeafText(node, text);
}

export function applyClassToIframe(id: string, classStr: string) {
  const node = el(id);
  if (!node) return;
  if (classStr.trim()) node.setAttribute("class", classStr);
  else node.removeAttribute("class");
}

export function highlight(id: string | null) {
  const d = doc();
  if (!d) return;
  d.querySelectorAll("[data-wfc-sel]").forEach((n) => n.removeAttribute("data-wfc-sel"));
  if (id) {
    const node = d.querySelector(`[data-wfc-id="${id}"]`);
    if (node) {
      node.setAttribute("data-wfc-sel", "1");
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

// Outline an element when its layer row is hovered (parent → iframe).
export function hoverElement(id: string | null) {
  const d = doc();
  if (!d) return;
  d.querySelectorAll("[data-wfc-peek]").forEach((n) => n.removeAttribute("data-wfc-peek"));
  if (id) d.querySelector(`[data-wfc-id="${id}"]`)?.setAttribute("data-wfc-peek", "1");
}

export function setPreview(preview: boolean) {
  iframeEl?.contentWindow?.postMessage({ type: "wfc-mode", preview }, "*");
}

export function setLeafText(node: Element, text: string) {
  const firstText = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
  if (firstText) firstText.textContent = text;
  else node.insertBefore(node.ownerDocument!.createTextNode(text), node.firstChild);
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

// Injected into the iframe: hover/click selection, double-click inline text
// editing, and a preview mode that disables editing affordances.
export const BRIDGE_SCRIPT = `
(function(){
  var preview=false, hovered=null, editing=null;
  function post(m){ parent.postMessage(m,'*'); }
  function leaf(t){ return t && !t.querySelector('[data-wfc-id]') && t.children.length===0; }

  document.addEventListener('mouseover',function(e){
    if(preview)return;
    var t=e.target.closest('[data-wfc-id]'); if(t===hovered)return;
    if(hovered)hovered.removeAttribute('data-wfc-hover');
    hovered=t;
    if(t){ t.setAttribute('data-wfc-hover','1'); post({type:'wfc-hover',id:t.getAttribute('data-wfc-id')}); }
    else post({type:'wfc-hover',id:null});
  });
  document.addEventListener('mouseleave',function(){ if(hovered){hovered.removeAttribute('data-wfc-hover');hovered=null;} post({type:'wfc-hover',id:null}); });

  document.addEventListener('click',function(e){
    if(preview)return;
    var t=e.target.closest('[data-wfc-id]'); if(!t)return;
    if(t===editing)return;
    e.preventDefault(); e.stopPropagation();
    post({type:'wfc-select',id:t.getAttribute('data-wfc-id')});
  },true);

  document.addEventListener('dblclick',function(e){
    if(preview)return;
    var t=e.target.closest('[data-wfc-id]'); if(!t||!leaf(t))return;
    e.preventDefault(); e.stopPropagation();
    editing=t; t.setAttribute('contenteditable','true'); t.setAttribute('data-wfc-editing','1'); t.focus();
    var r=document.createRange(); r.selectNodeContents(t);
    var s=getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  function commit(){
    if(!editing)return;
    var node=editing, id=node.getAttribute('data-wfc-id'), text=node.textContent;
    node.removeAttribute('contenteditable'); node.removeAttribute('data-wfc-editing'); editing=null;
    post({type:'wfc-text',id:id,text:text});
  }
  document.addEventListener('blur',function(e){ if(editing&&e.target===editing)commit(); },true);
  document.addEventListener('keydown',function(e){
    if(editing&&e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); commit(); }
    if(editing&&e.key==='Escape'){ commit(); }
  });

  // drag-to-reuse: accept a component dragged in from the panel
  document.addEventListener('dragover',function(e){ if(preview)return; e.preventDefault(); });
  document.addEventListener('drop',function(e){
    if(preview)return; e.preventDefault();
    var t=e.target.closest('[data-wfc-id]');
    post({type:'wfc-drop',id:t?t.getAttribute('data-wfc-id'):null});
  });

  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='wfc-mode'){
      preview=e.data.preview;
      if(preview&&hovered){hovered.removeAttribute('data-wfc-hover');hovered=null;}
      document.documentElement.setAttribute('data-wfc-preview',preview?'1':'0');
    }
  });
})();
`;
