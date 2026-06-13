// Minimal ZIP writer (store / no compression) — dependency-free, works in every
// browser. Enough to export a project as a .zip the user can save to disk, which
// is the cross-browser "get my files onto my device" path (Firefox/Safari don't
// support the File System Access API's folder write-back).

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files: { path: string; content: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const entries: { nameBytes: Uint8Array; size: number; crc: number; offset: number }[] = [];
  let offset = 0;

  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };
  const u16 = (n: number) => {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n & 0xffff, true);
    return b;
  };
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    return b;
  };

  for (const f of files) {
    const nameBytes = enc.encode(f.path.replace(/^\/+/, ""));
    const data = typeof f.content === "string" ? enc.encode(f.content) : f.content;
    const crc = crc32(data);
    const localOffset = offset;
    // local file header
    push(u32(0x04034b50)); push(u16(20)); push(u16(0)); push(u16(0)); // sig, version, flags, method(store)
    push(u16(0)); push(u16(0)); // time, date
    push(u32(crc)); push(u32(data.length)); push(u32(data.length)); // crc, comp size, uncomp size
    push(u16(nameBytes.length)); push(u16(0)); // name len, extra len
    push(nameBytes);
    push(data);
    entries.push({ nameBytes, size: data.length, crc, offset: localOffset });
  }

  const cdStart = offset;
  for (const e of entries) {
    push(u32(0x02014b50)); push(u16(20)); push(u16(20)); push(u16(0)); push(u16(0)); // sig, made-by, needed, flags, method
    push(u16(0)); push(u16(0)); // time, date
    push(u32(e.crc)); push(u32(e.size)); push(u32(e.size));
    push(u16(e.nameBytes.length)); push(u16(0)); push(u16(0)); // name, extra, comment len
    push(u16(0)); push(u16(0)); push(u32(0)); // disk, internal attrs, external attrs
    push(u32(e.offset));
    push(e.nameBytes);
  }
  const cdSize = offset - cdStart;

  // end of central directory
  push(u32(0x06054b50)); push(u16(0)); push(u16(0));
  push(u16(entries.length)); push(u16(entries.length));
  push(u32(cdSize)); push(u32(cdStart)); push(u16(0));

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}

export function downloadZip(filename: string, files: { path: string; content: string | Uint8Array }[]) {
  const blob = zipFiles(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
