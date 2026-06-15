import type { EditorNode } from "./types";

// Script injected into the RUNNING app (served from the WebContainer). It maps a
// clicked DOM node back to its source location via React's Fiber `_debugSource`
// (populated in dev by the JSX transform — no build-config changes needed), then
// postMessages it to the parent /run page. Also does inline text editing.
export const APP_BRIDGE = `
(function(){
  function srcOf(el){
    var n=el;
    while(n){
      var k=Object.keys(n).find(function(x){return x.indexOf('__reactFiber$')===0||x.indexOf('__reactInternalInstance$')===0;});
      if(k){ var f=n[k]; while(f){ if(f._debugSource){return f._debugSource;} f=f.return; } }
      n=n.parentElement;
    }
    return null;
  }
  var sel=null, hov=null;
  function restore(el){ if(el&&el.__nvOutline!==undefined){ el.style.outline=el.__nvOutline; delete el.__nvOutline; } }
  document.addEventListener('mouseover',function(e){ var t=e.target; if(t===sel||t===hov)return; restore(hov); hov=t; t.__nvOutline=t.style.outline; t.style.outline='1px dashed #ccff02'; },true);
  document.addEventListener('mouseout',function(e){ if(e.target===hov){ restore(hov); hov=null; } },true);
  function stylesOf(t){
    try{ var c=getComputedStyle(t); return {
      display:c.display, color:c.color, background:c.backgroundColor,
      fontSize:c.fontSize, fontWeight:c.fontWeight, textAlign:c.textAlign,
      padding:c.padding, margin:c.margin, radius:c.borderRadius
    }; }catch(_){ return null; }
  }
  document.addEventListener('click',function(e){
    e.preventDefault(); e.stopPropagation();
    var t=e.target, s=srcOf(t);
    restore(sel); restore(hov); hov=null; sel=t; t.__nvOutline=t.style.outline||''; t.style.outline='2px solid #ccff02';
    parent.postMessage({type:'nova-select', file:s&&s.fileName, line:s&&s.lineNumber, col:s&&s.columnNumber,
      tag:t.tagName.toLowerCase(), className:(typeof t.className==='string'?t.className:''),
      text:(t.children.length?null:(t.textContent||'')), styles:stylesOf(t)},'*');
  },true);
  document.addEventListener('dblclick',function(e){
    var t=e.target; if(t.children.length)return;
    e.preventDefault(); e.stopPropagation();
    var s=srcOf(t);
    t.setAttribute('contenteditable','true'); t.focus();
    function done(){ t.removeAttribute('contenteditable'); t.removeEventListener('blur',done);
      parent.postMessage({type:'nova-text', file:s&&s.fileName, line:s&&s.lineNumber, text:t.textContent},'*'); }
    t.addEventListener('blur',done);
  },true);
  // optimistic apply from the inspector (so edits feel instant before HMR)
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='nova-apply'&&sel){
      if(e.data.className!=null) sel.className=e.data.className;
      if(e.data.text!=null) sel.textContent=e.data.text;
      // inline style gives an instant preview for values Tailwind hasn't built
      // yet (e.g. an arbitrary color) until HMR recompiles from source.
      if(e.data.style){ for(var k in e.data.style){ try{ sel.style[k]=e.data.style[k]; }catch(_){} } }
    }
  });
})();
`;

// 1-based (line, col) → byte offset in content.
export function offsetForLineCol(content: string, line: number, col: number): number {
  let l = 1;
  let i = 0;
  while (i < content.length && l < line) {
    if (content[i] === "\n") l++;
    i++;
  }
  return i + Math.max(0, (col || 1) - 1);
}

function lineOf(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

// Find the JSX element node whose opening tag is on `line` (the most specific /
// innermost match), so we can edit it. React's _debugSource points at the element.
export function findNodeByLine(tree: EditorNode[], content: string, line: number): EditorNode | null {
  let best: EditorNode | null = null;
  let bestStart = -1;
  const walk = (n: EditorNode) => {
    if (n.sourceLocation && lineOf(content, n.sourceLocation.start) === line && n.sourceLocation.start > bestStart) {
      best = n;
      bestStart = n.sourceLocation.start;
    }
    n.children.forEach(walk);
  };
  tree.forEach(walk);
  return best;
}

// Resolve a _debugSource path against the WebContainer FS by trying it as-is,
// then progressively stripping leading directories until a read succeeds.
export async function resolveWcPath(fs: any, filePath: string): Promise<string | null> {
  const candidates = new Set<string>();
  candidates.add(filePath);
  candidates.add(filePath.replace(/^\//, ""));
  const parts = filePath.replace(/^\//, "").split("/");
  for (let i = 0; i < parts.length; i++) candidates.add(parts.slice(i).join("/"));
  for (const c of candidates) {
    try {
      await fs.readFile(c, "utf-8");
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}
