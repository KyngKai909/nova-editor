import {
  RectangleHorizontal, Box, Square, Columns2, Rows2, Grid3x3,
  Heading, Type, Link2, List, MousePointer2, Image as ImageIcon,
  TextCursorInput, Minus,
} from "lucide-react";

// Standard drag/click-to-insert elements, shared by the canvas left panel and
// the Run page's Components tab. `html` is inserted as-is into HTML pages and
// converted to JSX for .jsx/.tsx pages.
export const ELEMENTS: { group: string; items: { label: string; icon: React.ReactNode; html: string }[] }[] = [
  {
    group: "Layout",
    items: [
      { label: "Section", icon: <RectangleHorizontal size={14} />, html: `<section class="px-6 py-16"></section>` },
      { label: "Container", icon: <Box size={14} />, html: `<div class="mx-auto w-full max-w-5xl px-4"></div>` },
      { label: "Div block", icon: <Square size={14} />, html: `<div class="p-4"></div>` },
      { label: "Flex row", icon: <Columns2 size={14} />, html: `<div class="flex items-center gap-4"></div>` },
      { label: "Flex column", icon: <Rows2 size={14} />, html: `<div class="flex flex-col gap-4"></div>` },
      { label: "Grid", icon: <Grid3x3 size={14} />, html: `<div class="grid grid-cols-3 gap-4"></div>` },
    ],
  },
  {
    group: "Typography",
    items: [
      { label: "Heading", icon: <Heading size={14} />, html: `<h2 class="text-2xl font-semibold">Heading</h2>` },
      { label: "Paragraph", icon: <Type size={14} />, html: `<p class="leading-relaxed">Paragraph text goes here.</p>` },
      { label: "Text link", icon: <Link2 size={14} />, html: `<a href="#" class="text-blue-600 underline">Link</a>` },
      { label: "List", icon: <List size={14} />, html: `<ul class="list-disc pl-5"><li>Item one</li><li>Item two</li></ul>` },
    ],
  },
  {
    group: "Forms & media",
    items: [
      { label: "Button", icon: <MousePointer2 size={14} />, html: `<button class="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">Button</button>` },
      { label: "Image", icon: <ImageIcon size={14} />, html: `<img src="https://placehold.co/600x400" alt="" class="w-full" />` },
      { label: "Input", icon: <TextCursorInput size={14} />, html: `<input type="text" placeholder="Text" class="rounded-md border px-3 py-2" />` },
      { label: "Divider", icon: <Minus size={14} />, html: `<hr class="border-t border-gray-200" />` },
    ],
  },
];

// HTML → JSX for inserting into a .jsx/.tsx page (mirrors the editor's helper).
export function htmlToJsx(html: string): string {
  return html
    .replace(/\bclass=/g, "className=")
    .replace(/\bfor=/g, "htmlFor=")
    .replace(/<(img|input|br|hr)(\s[^>]*?)?(?<!\/)>/g, "<$1$2 />");
}
