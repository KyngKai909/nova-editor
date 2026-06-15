// Line-level 3-way merge (diff3) for the conflict resolver. Given the three
// sides of a file — MINE (your edits), BASE (common ancestor), THEIRS (upstream)
// — it produces a region list: stable/auto-mergeable runs (`ok`) and regions
// changed on both sides (`conflict`). Non-overlapping line changes auto-merge;
// only lines edited differently on both sides become conflicts.

export type Region =
  | { ok: string[] }
  | { conflict: { mine: string[]; base: string[]; theirs: string[] } };

export type Choice = "mine" | "theirs" | "both";

// An edit turns base[start,end) into `lines` (insert when start===end).
type Edit = { start: number; end: number; lines: string[] };

// LCS diff of base→other, expressed as replacements over base line ranges.
function editsFromDiff(base: string[], other: string[]): Edit[] {
  const m = base.length;
  const n = other.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = base[i] === other[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  let pend: Edit | null = null;
  const flush = () => { if (pend) { edits.push(pend); pend = null; } };
  while (i < m && j < n) {
    if (base[i] === other[j]) { flush(); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { // delete base[i]
      if (!pend) pend = { start: i, end: i, lines: [] };
      pend.end = i + 1;
      i++;
    } else { // insert other[j]
      if (!pend) pend = { start: i, end: i, lines: [] };
      pend.lines.push(other[j]);
      j++;
    }
  }
  while (i < m) { if (!pend) pend = { start: i, end: i, lines: [] }; pend.end = i + 1; i++; }
  while (j < n) { if (!pend) pend = { start: i, end: i, lines: [] }; pend.lines.push(other[j]); j++; }
  flush();
  return edits;
}

function eq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function pushOk(regions: Region[], lines: string[]) {
  if (!lines.length) return;
  const last = regions[regions.length - 1];
  if (last && "ok" in last) last.ok.push(...lines);
  else regions.push({ ok: [...lines] });
}

export function diff3(mine: string[], base: string[], theirs: string[]): Region[] {
  const A = editsFromDiff(base, mine);
  const B = editsFromDiff(base, theirs);
  const N = base.length;
  const regions: Region[] = [];
  let pos = 0;
  let ai = 0;
  let bi = 0;

  // Reconstruct one side's text over base[from,to) by applying its edits.
  const apply = (edits: Edit[], from: number, to: number) => {
    const out: string[] = [];
    let p = from;
    for (const e of edits) {
      for (let k = p; k < e.start; k++) out.push(base[k]);
      out.push(...e.lines);
      p = e.end;
    }
    for (let k = p; k < to; k++) out.push(base[k]);
    return out;
  };

  while (pos < N || ai < A.length || bi < B.length) {
    const aStart = ai < A.length ? A[ai].start : Infinity;
    const bStart = bi < B.length ? B[bi].start : Infinity;
    const nextChange = Math.min(aStart, bStart);

    if (pos < nextChange) {
      const end = Math.min(nextChange, N);
      pushOk(regions, base.slice(pos, end));
      pos = end;
      continue;
    }

    // An edit starts here — gather all A/B edits that chain-overlap into one group.
    let groupEnd = pos;
    const takeA: Edit[] = [];
    const takeB: Edit[] = [];
    let grew = true;
    while (grew) {
      grew = false;
      while (ai < A.length && A[ai].start <= groupEnd) { takeA.push(A[ai]); groupEnd = Math.max(groupEnd, A[ai].end); ai++; grew = true; }
      while (bi < B.length && B[bi].start <= groupEnd) { takeB.push(B[bi]); groupEnd = Math.max(groupEnd, B[bi].end); bi++; grew = true; }
    }

    const mineLines = apply(takeA, pos, groupEnd);
    const theirsLines = apply(takeB, pos, groupEnd);

    if (eq(mineLines, theirsLines)) pushOk(regions, mineLines);       // same change both sides
    else if (takeB.length === 0) pushOk(regions, mineLines);          // only you changed it
    else if (takeA.length === 0) pushOk(regions, theirsLines);        // only upstream changed it
    else regions.push({ conflict: { mine: mineLines, base: base.slice(pos, groupEnd), theirs: theirsLines } });
    pos = groupEnd;
  }
  return regions;
}

export function conflictCount(regions: Region[]): number {
  return regions.reduce((n, r) => n + ("conflict" in r ? 1 : 0), 0);
}

// Build the resolved file text from per-conflict choices (in region order).
export function buildResolved(regions: Region[], choices: Choice[]): string {
  const out: string[] = [];
  let ci = 0;
  for (const r of regions) {
    if ("ok" in r) {
      out.push(...r.ok);
    } else {
      const c = choices[ci++] ?? "mine";
      if (c === "mine") out.push(...r.conflict.mine);
      else if (c === "theirs") out.push(...r.conflict.theirs);
      else out.push(...r.conflict.mine, ...r.conflict.theirs);
    }
  }
  return out.join("\n");
}

// Convenience: run diff3 on raw file strings.
export function diff3Strings(mine: string, base: string, theirs: string): Region[] {
  return diff3(mine.split("\n"), base.split("\n"), theirs.split("\n"));
}
