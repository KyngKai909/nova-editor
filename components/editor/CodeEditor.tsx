"use client";

import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { FileCode2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";

function langFor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript";
  if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
  if (path.endsWith(".css")) return "css";
  return "plaintext";
}

export default function CodeEditor() {
  const files = useEditor((s) => s.files);
  const activePath = useEditor((s) => s.activePath);
  const setFileContent = useEditor((s) => s.setFileContent);
  const codeReveal = useEditor((s) => s.codeReveal);

  const file = files.find((f) => f.path === activePath);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    monaco.editor.defineTheme("nova", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0e0e11",
        "editor.lineHighlightBackground": "#16161c",
        "editorLineNumber.foreground": "#3a3a42",
        "editorGutter.background": "#0e0e11",
        "editor.selectionBackground": "#2a2a35",
      },
    });
    monaco.editor.setTheme("nova");
  };

  // reveal + highlight a line when "View in Code Editor" fires
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !codeReveal || codeReveal.path !== activePath) return;
    const line = codeReveal.line;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    const dec = editor.deltaDecorations(
      [],
      [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: "wfc-line-flash" },
        },
      ]
    );
    editor.focus();
    const t = setTimeout(() => editor.deltaDecorations(dec, []), 1600);
    return () => clearTimeout(t);
  }, [codeReveal, activePath]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-3">
        No file open.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg-2">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileCode2 size={13} className="text-accent" />
        <span className="font-mono text-[12px] text-ink-2">{file.path}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-3">{langFor(file.path)}</span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={file.path}
          language={langFor(file.path)}
          value={file.content}
          onMount={onMount}
          onChange={(val) => {
            if (val == null || val === file.content) return;
            clearTimeout(debounce.current);
            debounce.current = setTimeout(() => setFileContent(file.path, val), 450);
          }}
          options={{
            fontSize: 12.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            padding: { top: 12 },
            lineNumbersMinChars: 3,
            renderLineHighlight: "line",
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}
