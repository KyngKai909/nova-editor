// Small networking helpers shared by the import paths. Real AI-generated repos
// (Bolt / Lovable / v0 output) can be hundreds of files, so imports need
// bounded concurrency, retry-with-backoff on transient failures, and a clean
// fast-fail on hard rate limits rather than hanging or dying on the first hiccup.

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Run `fn` over `items` with at most `limit` in flight at once. Preserves order.
export async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export class RateLimitError extends Error {
  constructor(public resetAt?: number, authed = false) {
    super(
      authed
        ? "GitHub API rate limit reached. Wait a few minutes and try again."
        : "GitHub rate limit reached (no token). Connect GitHub in Settings for a much higher limit, then re-import."
    );
    this.name = "RateLimitError";
  }
}

// fetch() with retry + exponential backoff. Retries network errors, 5xx, and
// 429/secondary-rate-limit (honoring Retry-After). A *primary* rate limit
// (x-ratelimit-remaining: 0) is non-recoverable in the short term, so we throw
// RateLimitError immediately instead of burning retries.
export async function fetchRetry(
  url: string,
  init?: RequestInit,
  opts: { retries?: number; baseDelay?: number; authed?: boolean } = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelay ?? 600;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.status === 403 || res.status === 429) {
        const remaining = res.headers.get("x-ratelimit-remaining");
        const retryAfter = Number(res.headers.get("retry-after"));
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        // hard primary rate limit — don't retry, surface a clear message
        if (remaining === "0") throw new RateLimitError(reset ? reset * 1000 : undefined, !!opts.authed);
        if (attempt < retries) {
          await sleep(retryAfter ? retryAfter * 1000 : baseDelay * 2 ** attempt + Math.random() * 250);
          continue;
        }
      }

      if (res.status >= 500 && attempt < retries) {
        await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
        continue;
      }

      return res;
    } catch (e) {
      if (e instanceof RateLimitError) throw e;
      lastErr = e; // network/DNS blip — retry
      if (attempt < retries) await sleep(baseDelay * 2 ** attempt);
      else throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed after retries.");
}
