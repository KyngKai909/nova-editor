// Coordinates between the parent app and the canvas iframe.
//
// SECURITY: the canvas renders user-imported (potentially untrusted) code, so
// the iframe is sandboxed WITHOUT `allow-same-origin` → it runs in an opaque
// origin and physically cannot reach `window.parent` (where API keys live).
// Because of that, the parent can't touch the iframe's `contentDocument` either,
// so ALL communication goes over postMessage: the parent sends commands
// (select / hover / style / class / text / get-styles / preview) and the iframe
// sends events (select / hover / text-commit / drop / styles-response / ready).

let iframeEl: HTMLIFrameElement | null = null;
let ready = false;
const queue: any[] = [];
const pending = new Map<number, (s: Record<string, string>) => void>();
let reqSeq = 0;

function win(): Window | null {
  try {
    return iframeEl?.contentWindow ?? null;
  } catch {
    return null;
  }
}

function post(m: any) {
  const w = win();
  if (ready && w) w.postMessage(m, "*");
  else queue.push(m); // sent before the iframe's bridge is up — flush on ready
}

export function setIframe(el: HTMLIFrameElement | null) {
  iframeEl = el;
}

// Called by the canvas when the iframe reports `wfc-ready` (after each load).
export function markCanvasReady() {
  ready = true;
  const w = win();
  if (w) while (queue.length) w.postMessage(queue.shift(), "*");
}

// Called by the canvas right before a new srcDoc loads.
export function resetCanvasReady() {
  ready = false;
  queue.length = 0;
}

// Resolve get-styles responses coming back from the iframe.
if (typeof window !== "undefined") {
  window.addEventListener("message", (e: MessageEvent) => {
    const d = e.data;
    if (d?.type === "wfc-styles" && pending.has(d.reqId)) {
      pending.get(d.reqId)!(d.styles || {});
      pending.delete(d.reqId);
    }
  });
}

// Properties the style panel reads/writes.
export const STYLE_PROPS = [
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap",
  "alignSelf", "flexGrow", "flexShrink", "order",
  "gridTemplateColumns", "gridTemplateRows",
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
  "opacity", "boxShadow", "filter", "transform", "transition", "overflow", "cursor",
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];

// Ask the iframe to compute the selected element's styles (async round-trip).
export function readStyles(id: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const reqId = ++reqSeq;
    pending.set(reqId, resolve);
    post({ type: "wfc-getstyles", id, reqId });
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        resolve({});
      }
    }, 1500);
  });
}

export function applyStyleToIframe(id: string, prop: string, value: string) {
  post({ type: "wfc-style", id, prop, value });
}
export function applyTextToIframe(id: string, text: string) {
  post({ type: "wfc-settext", id, text });
}
export function applyClassToIframe(id: string, classStr: string) {
  post({ type: "wfc-class", id, classStr });
}
export function applyAttrToIframe(id: string, name: string, value: string) {
  post({ type: "wfc-attr", id, name, value });
}
// Show/replace the comment pins drawn on commented elements (empty = hide all).
export function applyCommentPins(pins: { id: string; key: string; commentId: string; x?: number; y?: number }[]) {
  post({ type: "wfc-comments", pins });
}
export function highlight(id: string | null) {
  post({ type: "wfc-sel", id });
}
export function hoverElement(id: string | null) {
  post({ type: "wfc-peek", id });
}
export function setPreview(preview: boolean) {
  post({ type: "wfc-mode", preview });
}

// Set the editable text of a leaf node (operates on the parent's clean
// Document, not the iframe — used by the HTML editing path in editorStore).
export function setLeafText(node: Element, text: string) {
  const firstText = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
  if (firstText) firstText.textContent = text;
  else node.insertBefore(node.ownerDocument!.createTextNode(text), node.firstChild);
}

// MUST run as the FIRST script in the canvas document. The canvas is an opaque
// origin (sandbox without allow-same-origin), where touching localStorage /
// sessionStorage throws a SecurityError in Chrome — which crashes the imported
// site's scripts (theme toggles, analytics, etc.) and leaves the canvas blank.
// We replace those with an ephemeral in-memory store so real sites render. This
// keeps the security boundary: the fake store is per-iframe and the canvas still
// cannot reach the parent's real localStorage (or its keys).
export const STORAGE_SHIM = `(function(){function mk(){var m={};var s={getItem:function(k){return m[k]!==undefined?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null}};try{Object.defineProperty(s,'length',{get:function(){return Object.keys(m).length}});}catch(e){}return s;}['localStorage','sessionStorage'].forEach(function(n){try{var t=window[n];if(t){t.length;}}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true});}catch(_){}}});})();`;

// Injected into the iframe. Handles selection/hover/inline-text editing and
// responds to parent commands. Runs in the iframe's opaque origin — it cannot
// reach the parent except via postMessage.
export const BRIDGE_SCRIPT = `
(function(){
  var PROPS=${JSON.stringify(STYLE_PROPS)};
  var preview=false, hovered=null, editing=null, selEl=null, peekEl=null;
  var commentPins=[], pinLayer=null;
  function post(m){ parent.postMessage(m,'*'); }
  function byId(id){ return id?document.querySelector('[data-wfc-id="'+id+'"]'):null; }
  function ensurePinLayer(){ if(!pinLayer){ pinLayer=document.createElement('div'); pinLayer.setAttribute('data-wfc-pinlayer','1'); pinLayer.style.cssText='position:fixed;left:0;top:0;width:0;height:0;z-index:2147483646'; document.documentElement.appendChild(pinLayer); } return pinLayer; }
  function renderPins(){ if(!commentPins.length){ if(pinLayer)pinLayer.innerHTML=''; return; } var layer=ensurePinLayer(); layer.innerHTML=''; var placed=[]; for(var i=0;i<commentPins.length;i++){ (function(p){ var el=byId(p.id); if(!el)return; var r=el.getBoundingClientRect(); var cx,cy; if(typeof p.x==='number'&&typeof p.y==='number'){ cx=r.left+p.x*r.width; cy=r.top+p.y*r.height; } else { cx=r.right-12; cy=r.top+10; } var guard=0; while(guard<12){ var clash=false; for(var j=0;j<placed.length;j++){ if(Math.abs(placed[j][0]-cx)<22&&Math.abs(placed[j][1]-cy)<22){clash=true;break;} } if(!clash)break; cx+=22; guard++; } placed.push([cx,cy]); var b=document.createElement('div'); b.textContent=p.key; b.style.cssText='position:fixed;left:'+(cx-10)+'px;top:'+(cy-10)+'px;min-width:20px;height:20px;padding:0 5px;border-radius:11px;background:#ccff02;color:#0a0a0a;font:600 11px/20px ui-sans-serif,system-ui,sans-serif;text-align:center;cursor:pointer;pointer-events:auto;box-shadow:0 1px 5px rgba(0,0,0,.35);white-space:nowrap'; b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); post({type:'wfc-comment-click',commentId:p.commentId,id:p.id}); }); layer.appendChild(b); })(commentPins[i]); } }
  function kebab(s){ return s.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase();}); }
  function leaf(t){ return t && !t.querySelector('[data-wfc-id]') && t.children.length===0; }
  function setLeaf(node,text){ var tn=null,i; for(i=0;i<node.childNodes.length;i++){ if(node.childNodes[i].nodeType===3){tn=node.childNodes[i];break;} } if(tn)tn.textContent=text; else node.insertBefore(document.createTextNode(text),node.firstChild); }
  function computeStyles(id){ var n=byId(id); if(!n)return {}; var cs=getComputedStyle(n),out={},i,p,k; for(i=0;i<PROPS.length;i++){ p=PROPS[i]; k=kebab(p); out[p]=n.style.getPropertyValue(k)||cs.getPropertyValue(k); } return out; }

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
    var r=document.createRange(); r.selectNodeContents(t); var s=getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  function commit(){ if(!editing)return; var node=editing,id=node.getAttribute('data-wfc-id'),text=node.textContent; node.removeAttribute('contenteditable'); node.removeAttribute('data-wfc-editing'); editing=null; post({type:'wfc-text',id:id,text:text}); }
  document.addEventListener('blur',function(e){ if(editing&&e.target===editing)commit(); },true);
  document.addEventListener('keydown',function(e){ if(editing&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();commit();} if(editing&&e.key==='Escape')commit(); });

  document.addEventListener('dragover',function(e){ if(preview)return; e.preventDefault(); });
  document.addEventListener('drop',function(e){ if(preview)return; e.preventDefault(); var t=e.target.closest('[data-wfc-id]'); post({type:'wfc-drop',id:t?t.getAttribute('data-wfc-id'):null}); });

  document.addEventListener('contextmenu',function(e){ if(preview)return; var t=e.target.closest('[data-wfc-id]'); if(!t)return; e.preventDefault(); var r=t.getBoundingClientRect(); var fx=Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width))); var fy=Math.min(1,Math.max(0,(e.clientY-r.top)/Math.max(1,r.height))); post({type:'wfc-context',id:t.getAttribute('data-wfc-id'),x:fx,y:fy}); });

  window.addEventListener('message',function(e){
    var d=e.data; if(!d||!d.type)return;
    if(d.type==='wfc-mode'){ preview=d.preview; if(preview&&hovered){hovered.removeAttribute('data-wfc-hover');hovered=null;} document.documentElement.setAttribute('data-wfc-preview',preview?'1':'0'); }
    else if(d.type==='wfc-sel'){ if(selEl)selEl.removeAttribute('data-wfc-sel'); selEl=byId(d.id); if(selEl){ selEl.setAttribute('data-wfc-sel','1'); try{selEl.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){} } }
    else if(d.type==='wfc-peek'){ if(peekEl)peekEl.removeAttribute('data-wfc-peek'); peekEl=byId(d.id); if(peekEl)peekEl.setAttribute('data-wfc-peek','1'); }
    else if(d.type==='wfc-style'){ var n=byId(d.id); if(n){ if(d.value==='')n.style.removeProperty(kebab(d.prop)); else n.style.setProperty(kebab(d.prop),d.value); } }
    else if(d.type==='wfc-class'){ var n2=byId(d.id); if(n2){ if((d.classStr||'').trim())n2.setAttribute('class',d.classStr); else n2.removeAttribute('class'); } }
    else if(d.type==='wfc-attr'){ var na=byId(d.id); if(na){ if(d.value==='')na.removeAttribute(d.name); else na.setAttribute(d.name,d.value); } }
    else if(d.type==='wfc-comments'){ commentPins=d.pins||[]; renderPins(); }
    else if(d.type==='wfc-settext'){ var n3=byId(d.id); if(n3)setLeaf(n3,d.text); }
    else if(d.type==='wfc-getstyles'){ post({type:'wfc-styles',reqId:d.reqId,styles:computeStyles(d.id)}); }
  });

  window.addEventListener('scroll',function(){ if(commentPins.length)renderPins(); },true);
  window.addEventListener('resize',function(){ if(commentPins.length)renderPins(); });

  post({type:'wfc-ready'});
})();
`;
