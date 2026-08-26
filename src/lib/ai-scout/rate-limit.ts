/** Rate-limit in-memory per processo (protezione reputazione dominio). */

const WINDOW_MS = 60_000;
const MAX_SENDS_PER_WINDOW = 8;
const MIN_GAP_MS = 2_500;

type Bucket = { timestamps: number[]; lastSendAt: number };

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [], lastSendAt: 0 };
    buckets.set(key, b);
  }
  return b;
}

export function checkSendRateLimit(key = "global"): {
  ok: true;
} | {
  ok: false;
  retryAfterMs: number;
  error: string;
} {
  const now = Date.now();
  const b = getBucket(key);
  b.timestamps = b.timestamps.filter((t) => now - t < WINDOW_MS);

  if (b.timestamps.length >= MAX_SENDS_PER_WINDOW) {
    const oldest = b.timestamps[0] ?? now;
    const retryAfterMs = Math.max(1_000, WINDOW_MS - (now - oldest));
    return {
      ok: false,
      retryAfterMs,
      error: `Rate limit: max ${MAX_SENDS_PER_WINDOW} invii/minuto. Riprova tra ${Math.ceil(retryAfterMs / 1000)}s.`,
    };
  }

  const sinceLast = now - b.lastSendAt;
  if (b.lastSendAt > 0 && sinceLast < MIN_GAP_MS) {
    const retryAfterMs = MIN_GAP_MS - sinceLast;
    return {
      ok: false,
      retryAfterMs,
      error: `Attendi ${Math.ceil(retryAfterMs / 1000)}s tra un invio e l'altro (protezione dominio).`,
    };
  }

  return { ok: true };
}

export function recordSend(key = "global"): void {
  const now = Date.now();
  const b = getBucket(key);
  b.timestamps.push(now);
  b.lastSendAt = now;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
