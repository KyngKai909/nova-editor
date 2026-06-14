"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Square, StretchHorizontal, StretchVertical, Rows3, EyeOff,
  CaseSensitive, Italic, Underline, Strikethrough,
} from "lucide-react";
import { Copy, Trash2, X, Plus, Component as ComponentIcon } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import type { EditorNode } from "@/lib/types";
import { readStyles } from "@/lib/canvasBridge";
import { componentNameFromPath } from "@/lib/jsxEdit";
import { extractComponentProps } from "@/lib/componentProps";
import { Section, Field, TextInput, NumberUnit, Slider, Segmented, Select, ColorField } from "./controls";

function find(nodes: EditorNode[], id: string | null): EditorNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = find(n.children, id);
    if (f) return f;
  }
  return null;
}

// Stacked field (label above a full-width control) — used in 2-column grids so
// the input has the whole column width and the value stays readable.
function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 truncate text-[10px] text-ink-3">{label}</div>
      {children}
    </div>
  );
}

export default function Inspector() {
  const tree = useEditor((s) => s.tree);
  const selectedId = useEditor((s) => s.selectedId);
  const files = useEditor((s) => s.files);
  const activePath = useEditor((s) => s.activePath);
  const device = useEditor((s) => s.device);
  const updateClassList = useEditor((s) => s.updateClassList);
  const updateText = useEditor((s) => s.updateText);
  const updateStyle = useEditor((s) => s.updateStyle);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const deleteNode = useEditor((s) => s.deleteNode);
  const updateProp = useEditor((s) => s.updateProp);
  const removeProp = useEditor((s) => s.removeProp);
  const updateAttr = useEditor((s) => s.updateAttr);
  const removeAttr = useEditor((s) => s.removeAttr);
  const assets = useEditor((s) => s.assets);
  const applyAsset = useEditor((s) => s.applyAsset);

  const node = find(tree, selectedId);
  const isHtml = files.find((f) => f.path === activePath)?.kind === "html";
  // a JSX component instance (uppercase tag) gets a Props editor, not styles
  const isComponentInstance =
    !isHtml && !!node && /^[A-Z]/.test(node.tag) && node.tag !== "{expr}";
  const [s, setS] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"style" | "settings">("style");

  const refresh = useCallback(() => {
    if (selectedId) readStyles(selectedId).then(setS);
  }, [selectedId]);

  // computed styles need the iframe laid out — read on select + after reflow.
  useEffect(() => {
    refresh();
    const t = setTimeout(refresh, 140);
    return () => clearTimeout(t);
  }, [refresh, device]);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface">
          <Square size={16} className="text-ink-3" />
        </div>
        <p className="max-w-[200px] text-[12px] leading-relaxed text-ink-3">
          Select an element on the canvas to edit its styles, or double-click text to rewrite it.
        </p>
      </div>
    );
  }

  const set = (prop: string, v: string) => {
    updateStyle(node.id, prop, v);
    setS((cur) => ({ ...cur, [prop]: v }));
  };

  const display = baseKeyword(s.display);
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid";
  const position = baseKeyword(s.position);
  const imageAssets = Object.entries(assets).filter(([p]) => /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(p));

  return (
    <div className="scroll-thin h-full overflow-y-auto pb-24">
      {/* element header + tabs (pinned) */}
      <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">
              {node.tag}
            </span>
            {node.classList[0] && (
              <span className="truncate font-mono text-[11px] text-ink-3">.{node.classList[0]}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button onClick={() => duplicateNode(node.id)} title="Duplicate" className="grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-raise hover:text-ink">
              <Copy size={13} />
            </button>
            <button onClick={() => deleteNode(node.id)} title="Delete" className="grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-raise hover:text-red-400">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div className="flex border-b border-line px-2">
          {(["style", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 border-b-2 py-2 text-[12px] font-medium capitalize transition-colors ${
                tab === t ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" ? (
        <SettingsPanel
          node={node}
          isHtml={!!isHtml}
          isComponentInstance={isComponentInstance}
          files={files}
          s={s}
          setStyle={set}
          onAttr={(name, v) => updateAttr(node.id, name, v)}
          onRemoveAttr={(name) => removeAttr(node.id, name)}
          onProp={(name, v) => updateProp(node.id, name, v)}
          onRemoveProp={(name) => removeProp(node.id, name)}
        />
      ) : isComponentInstance ? (
        <div className="px-3.5 py-5 text-[12px] leading-relaxed text-ink-3">
          <span className="font-mono text-accent">&lt;{node.tag}/&gt;</span> is a component instance — edit its props in the{" "}
          <button onClick={() => setTab("settings")} className="font-medium text-accent hover:underline">Settings</button> tab.
        </div>
      ) : (
        <>
          {!isHtml && (
            <div className="border-b border-line bg-accent/[0.06] px-3.5 py-2 text-[11px] leading-relaxed text-accent/80">
              JSX: style edits write to the element’s inline <span className="font-mono">style</span> object.
            </div>
          )}

          <Section title="Layout">
            <Field label="Display">
              <Segmented
                value={display}
                onChange={(v) => set("display", v)}
                options={[
                  { value: "block", icon: <Square size={13} />, title: "block" },
                  { value: "flex", icon: <StretchHorizontal size={13} />, title: "flex" },
                  { value: "grid", icon: <Rows3 size={13} />, title: "grid" },
                  { value: "inline-block", label: "in‑bl", title: "inline-block" },
                  { value: "none", icon: <EyeOff size={13} />, title: "none" },
                ]}
              />
            </Field>
            {(isFlex || isGrid) && (
              <>
                <Field label="Direction">
                  <Segmented
                    value={baseKeyword(s.flexDirection) || "row"}
                    onChange={(v) => set("flexDirection", v)}
                    options={[
                      { value: "row", icon: <StretchHorizontal size={13} />, title: "row" },
                      { value: "column", icon: <StretchVertical size={13} />, title: "column" },
                      { value: "row-reverse", label: "↤", title: "row-reverse" },
                      { value: "column-reverse", label: "↥", title: "column-reverse" },
                    ]}
                  />
                </Field>
                <Field label="Justify">
                  <Select
                    value={s.justifyContent}
                    onChange={(v) => set("justifyContent", v)}
                    options={kw(["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"])}
                  />
                </Field>
                <Field label="Align">
                  <Select
                    value={s.alignItems}
                    onChange={(v) => set("alignItems", v)}
                    options={kw(["stretch", "flex-start", "center", "flex-end", "baseline"])}
                  />
                </Field>
                <Field label="Gap">
                  <NumberUnit value={s.gap} onCommit={(v) => set("gap", v)} placeholder="0" />
                </Field>
                {isGrid && (
                  <>
                    <Field label="Columns">
                      <TextInput value={s.gridTemplateColumns === "none" ? "" : s.gridTemplateColumns} onCommit={(v) => set("gridTemplateColumns", v)} placeholder="repeat(3, 1fr)" mono />
                    </Field>
                    <Field label="Rows">
                      <TextInput value={s.gridTemplateRows === "none" ? "" : s.gridTemplateRows} onCommit={(v) => set("gridTemplateRows", v)} placeholder="auto" mono />
                    </Field>
                  </>
                )}
                {isFlex && (
                  <Field label="Wrap">
                    <Segmented
                      value={baseKeyword(s.flexWrap) || "nowrap"}
                      onChange={(v) => set("flexWrap", v)}
                      options={[
                        { value: "nowrap", label: "No wrap" },
                        { value: "wrap", label: "Wrap" },
                      ]}
                    />
                  </Field>
                )}
              </>
            )}
            <Field label="Position">
              <Select
                value={position}
                onChange={(v) => set("position", v)}
                options={kw(["static", "relative", "absolute", "fixed", "sticky"])}
              />
            </Field>
            {position && position !== "static" && (
              <div className="grid grid-cols-2 gap-1.5">
                <NumberUnit value={s.top} onCommit={(v) => set("top", v)} placeholder="top" />
                <NumberUnit value={s.right} onCommit={(v) => set("right", v)} placeholder="right" />
                <NumberUnit value={s.bottom} onCommit={(v) => set("bottom", v)} placeholder="bottom" />
                <NumberUnit value={s.left} onCommit={(v) => set("left", v)} placeholder="left" />
              </div>
            )}
          </Section>

          <Section title="Flex child" defaultOpen={false}>
            <Field label="Align self">
              <Select value={s.alignSelf} onChange={(v) => set("alignSelf", v)} options={kw(["auto", "flex-start", "center", "flex-end", "stretch", "baseline"])} />
            </Field>
            <div className="grid grid-cols-3 gap-x-2 gap-y-2">
              <Mini label="Grow"><TextInput value={s.flexGrow ?? ""} onCommit={(v) => set("flexGrow", v)} placeholder="0" /></Mini>
              <Mini label="Shrink"><TextInput value={s.flexShrink ?? ""} onCommit={(v) => set("flexShrink", v)} placeholder="1" /></Mini>
              <Mini label="Order"><TextInput value={s.order ?? ""} onCommit={(v) => set("order", v)} placeholder="0" /></Mini>
            </div>
          </Section>

          <Section title="Spacing">
            <BoxModel s={s} set={set} />
          </Section>

          <Section title="Size">
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
              <Mini label="Width"><NumberUnit value={s.width} onCommit={(v) => set("width", v)} /></Mini>
              <Mini label="Height"><NumberUnit value={s.height} onCommit={(v) => set("height", v)} /></Mini>
              <Mini label="Min W"><NumberUnit value={s.minWidth} onCommit={(v) => set("minWidth", v)} /></Mini>
              <Mini label="Min H"><NumberUnit value={s.minHeight} onCommit={(v) => set("minHeight", v)} /></Mini>
              <Mini label="Max W"><NumberUnit value={s.maxWidth} onCommit={(v) => set("maxWidth", v)} placeholder="none" /></Mini>
              <Mini label="Max H"><NumberUnit value={s.maxHeight} onCommit={(v) => set("maxHeight", v)} placeholder="none" /></Mini>
            </div>
            <Field label="Overflow">
              <Select value={s.overflow} onChange={(v) => set("overflow", v)} options={kw(["visible", "hidden", "scroll", "auto"])} />
            </Field>
          </Section>

          <Section title="Typography">
            <Field label="Font">
              <TextInput value={cleanFont(s.fontFamily)} onCommit={(v) => set("fontFamily", v)} placeholder="inherit" />
            </Field>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
              <Mini label="Size"><NumberUnit value={s.fontSize} onCommit={(v) => set("fontSize", v)} /></Mini>
              <Mini label="Weight">
                <Select value={s.fontWeight} onChange={(v) => set("fontWeight", v)}
                  options={["100","200","300","400","500","600","700","800","900"].map((w) => ({ value: w }))} />
              </Mini>
              <Mini label="Line height"><NumberUnit value={s.lineHeight} onCommit={(v) => set("lineHeight", v)} units={["px","%","em",""]} placeholder="1.5" /></Mini>
              <Mini label="Spacing"><NumberUnit value={s.letterSpacing} onCommit={(v) => set("letterSpacing", v)} units={["px","em"]} placeholder="0" /></Mini>
            </div>
            <Field label="Align">
              <Segmented
                value={baseKeyword(s.textAlign) || "left"}
                onChange={(v) => set("textAlign", v)}
                options={[
                  { value: "left", icon: <AlignLeft size={13} /> },
                  { value: "center", icon: <AlignCenter size={13} /> },
                  { value: "right", icon: <AlignRight size={13} /> },
                  { value: "justify", icon: <AlignJustify size={13} /> },
                ]}
              />
            </Field>
            <Field label="Transform">
              <Segmented
                value={baseKeyword(s.textTransform) || "none"}
                onChange={(v) => set("textTransform", v)}
                options={[
                  { value: "none", label: "—", title: "none" },
                  { value: "uppercase", icon: <CaseSensitive size={13} />, title: "uppercase" },
                  { value: "capitalize", label: "Ab", title: "capitalize" },
                  { value: "lowercase", label: "ab", title: "lowercase" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-x-2.5">
              <Mini label="Style">
                <Segmented
                  value={baseKeyword(s.fontStyle) === "italic" ? "italic" : "normal"}
                  onChange={(v) => set("fontStyle", v)}
                  options={[
                    { value: "normal", label: "Aa", title: "normal" },
                    { value: "italic", icon: <Italic size={13} />, title: "italic" },
                  ]}
                />
              </Mini>
              <Mini label="Decorate">
                <Segmented
                  value={baseKeyword(s.textDecorationLine) || "none"}
                  onChange={(v) => set("textDecorationLine", v)}
                  options={[
                    { value: "none", label: "—", title: "none" },
                    { value: "underline", icon: <Underline size={13} />, title: "underline" },
                    { value: "line-through", icon: <Strikethrough size={13} />, title: "line-through" },
                  ]}
                />
              </Mini>
            </div>
            <Field label="Color">
              <ColorField value={s.color} onChange={(v) => set("color", v)} />
            </Field>
          </Section>

          <Section title="Background">
            <Field label="Color">
              <ColorField value={s.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
            </Field>
            <Field label="Image">
              <TextInput value={s.backgroundImage === "none" ? "" : s.backgroundImage} onCommit={(v) => set("backgroundImage", v)} placeholder="url(...) / gradient" />
            </Field>
            {imageAssets.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] text-ink-3">From assets</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {imageAssets.map(([path, url]) => (
                    <button
                      key={path}
                      onClick={() => applyAsset(path, "background")}
                      title={`${path}\nUse as background`}
                      className="aspect-square overflow-hidden rounded border border-line transition-colors hover:border-accent/60"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Border">
            <Field label="Radius">
              <NumberUnit value={s.borderRadius} onCommit={(v) => set("borderRadius", v)} placeholder="0" />
            </Field>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberUnit value={s.borderTopLeftRadius} onCommit={(v) => set("borderTopLeftRadius", v)} placeholder="TL" />
              <NumberUnit value={s.borderTopRightRadius} onCommit={(v) => set("borderTopRightRadius", v)} placeholder="TR" />
              <NumberUnit value={s.borderBottomLeftRadius} onCommit={(v) => set("borderBottomLeftRadius", v)} placeholder="BL" />
              <NumberUnit value={s.borderBottomRightRadius} onCommit={(v) => set("borderBottomRightRadius", v)} placeholder="BR" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="Width"><NumberUnit value={s.borderWidth} onCommit={(v) => set("borderWidth", v)} placeholder="0" /></Field>
              <Field label="Style">
                <Select value={s.borderStyle} onChange={(v) => set("borderStyle", v)} options={kw(["solid", "dashed", "dotted", "none"])} />
              </Field>
            </div>
            <Field label="Color">
              <ColorField value={s.borderColor} onChange={(v) => set("borderColor", v)} />
            </Field>
          </Section>

          <Section title="Effects">
            <Field label="Opacity">
              <Slider
                value={Math.round((parseFloat(s.opacity || "1") || 1) * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => set("opacity", String(v / 100))}
              />
            </Field>
            <Field label="Radius blur">
              <TextInput value={s.filter === "none" ? "" : s.filter} onCommit={(v) => set("filter", v)} placeholder="blur(8px)" />
            </Field>
            <Field label="Shadow">
              <TextInput value={s.boxShadow === "none" ? "" : s.boxShadow} onCommit={(v) => set("boxShadow", v)} placeholder="0 8px 24px rgba(0,0,0,.3)" mono />
            </Field>
            <Field label="Transform">
              <TextInput value={s.transform === "none" ? "" : s.transform} onCommit={(v) => set("transform", v)} placeholder="translateY(-4px) scale(1.02)" mono />
            </Field>
            <Field label="Transition">
              <TextInput value={isDefaultTransition(s.transition) ? "" : s.transition} onCommit={(v) => set("transition", v)} placeholder="all .2s ease" mono />
            </Field>
          </Section>

          <Section title="Classes" defaultOpen={!isHtml}>
            <textarea
              rows={2}
              defaultValue={node.classList.join(" ")}
              key={node.id + node.classList.join(" ")}
              spellCheck={false}
              onBlur={(e) => updateClassList(node.id, e.target.value.split(/\s+/).filter(Boolean))}
              className="w-full resize-none rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-accent/60"
            />
          </Section>

          {node.children.length === 0 && (
            <Section title="Content">
              <textarea
                rows={3}
                defaultValue={node.textContent}
                key={node.id + node.textContent}
                onBlur={(e) => updateText(node.id, e.target.value)}
                className="w-full resize-none rounded-md border border-line bg-bg p-2 text-[12px] leading-relaxed text-ink outline-none focus:border-accent/60"
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/* ── Settings tab ────────────────────────────────────────────────────────── */
const RESERVED_ATTRS = new Set(["id", "class", "className", "style", "href", "target", "rel", "alt", "src", "hidden"]);

function SettingsPanel({
  node, isHtml, isComponentInstance, files, s, setStyle, onAttr, onRemoveAttr, onProp, onRemoveProp,
}: {
  node: EditorNode;
  isHtml: boolean;
  isComponentInstance: boolean;
  files: { path: string; content: string }[];
  s: Record<string, string>;
  setStyle: (prop: string, v: string) => void;
  onAttr: (name: string, value: string) => void;
  onRemoveAttr: (name: string) => void;
  onProp: (name: string, value: string) => void;
  onRemoveProp: (name: string) => void;
}) {
  // Component instances are configured through their props.
  if (isComponentInstance) {
    return (
      <PropsPanel
        node={node}
        suggested={suggestedProps(files, node.tag)}
        onSet={onProp}
        onRemove={onRemoveProp}
      />
    );
  }

  const tag = node.tag.toLowerCase();
  const isLink = tag === "a" || tag === "link";
  const isImg = tag === "img" || tag === "image";

  const attrVal = (name: string): string => {
    if (isHtml) return node.attributes?.[name] ?? "";
    const a = node.jsxAttrs?.find((x) => x.name === name);
    return a && !a.isExpr ? a.value : "";
  };

  const hidden = baseKeyword(s.display) === "none";

  const customAttrs: [string, string][] = isHtml
    ? Object.entries(node.attributes || {}).filter(([k]) => !RESERVED_ATTRS.has(k) && !k.startsWith("data-wfc"))
    : (node.jsxAttrs || [])
        .filter((a) => !RESERVED_ATTRS.has(a.name) && !a.isExpr)
        .map((a) => [a.name, a.value] as [string, string]);

  return (
    <>
      <Section title="Element">
        <Field label="ID">
          <TextInput value={attrVal("id")} onCommit={(v) => onAttr("id", v)} placeholder="for in-page linking" mono />
        </Field>
        <Field label="Visibility">
          <Segmented
            value={hidden ? "hidden" : "visible"}
            onChange={(v) => setStyle("display", v === "hidden" ? "none" : "")}
            options={[
              { value: "visible", label: "Visible" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </Field>
      </Section>

      {isLink && (
        <Section title="Link">
          <Field label="URL">
            <TextInput value={attrVal("href")} onCommit={(v) => onAttr("href", v)} placeholder="https:// · /page · #anchor" mono />
          </Field>
          <Field label="Opens in">
            <Segmented
              value={attrVal("target") === "_blank" ? "new" : "same"}
              onChange={(v) => {
                if (v === "new") { onAttr("target", "_blank"); onAttr("rel", "noopener noreferrer"); }
                else { onRemoveAttr("target"); onRemoveAttr("rel"); }
              }}
              options={[
                { value: "same", label: "Same tab" },
                { value: "new", label: "New tab" },
              ]}
            />
          </Field>
        </Section>
      )}

      {isImg && (
        <Section title="Image">
          <Field label="Source">
            <TextInput value={attrVal("src")} onCommit={(v) => onAttr("src", v)} placeholder="image url" mono />
          </Field>
          <Field label="Alt text">
            <TextInput value={attrVal("alt")} onCommit={(v) => onAttr("alt", v)} placeholder="describe the image" />
          </Field>
        </Section>
      )}

      <Section title="Custom attributes">
        <AttrList attrs={customAttrs} onSet={onAttr} onRemove={onRemoveAttr} />
      </Section>
    </>
  );
}

function AttrList({
  attrs, onSet, onRemove,
}: {
  attrs: [string, string][];
  onSet: (name: string, value: string) => void;
  onRemove: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [val, setVal] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      {attrs.length === 0 && <p className="text-[12px] text-ink-3">None yet. Add data-* / aria-* attributes below.</p>}
      {attrs.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="w-[72px] shrink-0 truncate font-mono text-[11px] text-ink-2" title={k}>{k}</span>
          <div className="min-w-0 flex-1"><TextInput value={v} onCommit={(nv) => onSet(k, nv)} mono /></div>
          <button onClick={() => onRemove(k)} title="Remove attribute" className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 hover:text-red-400"><X size={12} /></button>
        </div>
      ))}
      <div className="flex gap-1 pt-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" className="h-7 w-1/2 rounded-md border border-line bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent/60" />
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="value" className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-[11px] outline-none focus:border-accent/60" />
        <button
          onClick={() => { if (name.trim()) { onSet(name.trim(), val); setName(""); setVal(""); } }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-raise text-ink hover:bg-raise/70"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

/* ── Visual margin/padding box-model editor ──────────────────────────────── */
function BoxModel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: (prop: string, v: string) => void;
}) {
  const Cell = ({ prop, pos }: { prop: string; pos: string }) => {
    const cur = px(s[prop]);
    const [v, setV] = useState(cur);
    useEffect(() => setV(px(s[prop])), [s[prop]]);
    return (
      <input
        value={v}
        title={prop}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== cur && set(prop, v === "" ? "" : v + "px")}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`absolute ${pos} h-5 w-8 -translate-x-1/2 rounded bg-transparent text-center text-[10px] tabular-nums text-ink-2 outline-none hover:bg-raise focus:bg-raise focus:text-ink`}
      />
    );
  };
  return (
    <div className="relative mx-auto h-[120px] w-full max-w-[240px] rounded-lg border border-dashed border-line-2 bg-bg/40">
      <span className="absolute left-2 top-1 text-[9px] uppercase tracking-wide text-ink-3">margin</span>
      <Cell prop="marginTop" pos="left-1/2 top-0.5" />
      <Cell prop="marginBottom" pos="left-1/2 bottom-0.5" />
      <Cell prop="marginLeft" pos="left-[14px] top-1/2 -translate-y-1/2" />
      <Cell prop="marginRight" pos="right-[-2px] top-1/2 -translate-y-1/2" />
      <div className="absolute inset-7 rounded-md border border-dashed border-accent/30 bg-accent/[0.04]">
        <span className="absolute left-1.5 top-0.5 text-[9px] uppercase tracking-wide text-ink-3">padding</span>
        <Cell prop="paddingTop" pos="left-1/2 top-0" />
        <Cell prop="paddingBottom" pos="left-1/2 bottom-0" />
        <Cell prop="paddingLeft" pos="left-[10px] top-1/2 -translate-y-1/2" />
        <Cell prop="paddingRight" pos="right-[-6px] top-1/2 -translate-y-1/2" />
        <div className="absolute inset-5 grid place-items-center rounded bg-raise/60 text-[9px] text-ink-3">
          content
        </div>
      </div>
    </div>
  );
}

/* ── Component-instance props editor ─────────────────────────────────────── */
function suggestedProps(files: { path: string; content: string }[], tag: string): string[] {
  const f = files.find((x) => componentNameFromPath(x.path) === tag);
  return f ? extractComponentProps(f.content) : [];
}

function PropsPanel({
  node,
  suggested,
  onSet,
  onRemove,
}: {
  node: EditorNode;
  suggested: string[];
  onSet: (name: string, value: string) => void;
  onRemove: (name: string) => void;
}) {
  const attrs = node.jsxAttrs || [];
  const setNames = new Set(attrs.map((a) => a.name));
  const unused = suggested.filter((n) => !setNames.has(n));
  const [newName, setNewName] = useState("");
  const [newVal, setNewVal] = useState("");

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-line bg-accent/[0.06] px-3.5 py-2 text-[11px] text-accent/80">
        <ComponentIcon size={12} /> Component instance — editing props
      </div>
      <Section title="Props">
        {attrs.length === 0 && <p className="text-[12px] text-ink-3">No props set yet.</p>}
        {attrs.map((a) => (
          <div key={a.name} className="flex items-center gap-1.5">
            <span className="w-[72px] shrink-0 truncate font-mono text-[11px] text-ink-2">{a.name}</span>
            <div className="min-w-0 flex-1">
              {a.isExpr || a.valueLoc === null ? (
                <div className="flex h-7 items-center rounded-md border border-line bg-bg/60 px-2 font-mono text-[11px] text-ink-3">{a.value}</div>
              ) : (
                <TextInput value={a.value} onCommit={(v) => onSet(a.name, v)} mono />
              )}
            </div>
            <button onClick={() => onRemove(a.name)} title="Remove prop" className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 hover:text-red-400">
              <X size={12} />
            </button>
          </div>
        ))}

        {unused.length > 0 && (
          <div className="pt-1">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-3">From component</div>
            <div className="flex flex-wrap gap-1">
              {unused.map((n) => (
                <button key={n} onClick={() => onSet(n, "")} className="flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-accent/50 hover:text-accent">
                  <Plus size={10} /> {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-3">Custom prop</div>
          <div className="flex gap-1">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" className="h-7 w-1/2 rounded-md border border-line bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent/60" />
            <input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="value" className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-[11px] outline-none focus:border-accent/60" />
            <button
              onClick={() => { if (newName.trim()) { onSet(newName.trim(), newVal); setNewName(""); setNewVal(""); } }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-raise text-ink hover:bg-raise/70"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const kw = (arr: string[]) => arr.map((v) => ({ value: v }));
function baseKeyword(v?: string): string {
  return (v || "").split(" ")[0].trim();
}
function px(v?: string): string {
  if (!v || v === "0px") return v === "0px" ? "0" : "";
  const m = v.match(/^(-?[\d.]+)px$/);
  return m ? m[1] : "";
}
function cleanFont(v?: string): string {
  if (!v) return "";
  return v.split(",")[0].replace(/["']/g, "").trim();
}
// getComputedStyle returns "all 0s ease 0s" (or "all") when no transition is set.
function isDefaultTransition(v?: string): boolean {
  return !v || v === "all" || /^all 0s/.test(v) || /\b0s\b.*\b0s\b/.test(v);
}
