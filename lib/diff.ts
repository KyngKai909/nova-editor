export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

// Minimal LCS-based line diff — enough to preview what changed before export.
export function lineDiff(a: string, b: string): DiffLine[] {
  const oldLines = a.split("\n");
  const newLines = b.split("\n");
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "ctx", text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: oldLines[i] });
      i++;
    } else {
      out.push({ type: "add", text: newLines[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", text: oldLines[i++] });
  while (j < n) out.push({ type: "add", text: newLines[j++] });
  return out;
}
