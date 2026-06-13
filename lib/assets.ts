// Map of repo-relative path -> blob: URL for uploaded binary/css assets.
export type AssetMap = Record<string, string>;

// Rewrite references to local assets in an HTML string so they resolve to the
// blob URLs we created at import time. Covers href/src attributes and url(...)
// inside inline <style> and font-face declarations.
export function rewriteAssetUrls(html: string, assets: AssetMap): string {
  let out = html;
  // Replace the longest paths first so "assets/fonts/x.otf" wins over "assets".
  const paths = Object.keys(assets).sort((a, b) => b.length - a.length);
  for (const p of paths) {
    const blob = assets[p];
    for (const variant of [p, "./" + p, "/" + p]) {
      out = out.split(`"${variant}"`).join(`"${blob}"`);
      out = out.split(`'${variant}'`).join(`'${blob}'`);
      out = out.split(`(${variant})`).join(`(${blob})`);
    }
  }
  return out;
}
