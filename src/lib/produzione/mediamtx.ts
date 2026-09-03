export type MediaMtxEnsureResult =
  | { ok: true; synced: boolean }
  | { ok: false; error: string };

function apiBase(): string | null {
  const raw = process.env.MEDIAMTX_API_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

export function whepBaseUrl(): string | null {
  const raw = process.env.MEDIAMTX_WHEP_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8889";
  return null;
}

/** HLS pubblico (Cloudflare Tunnel → :8888) o LAN. */
export function hlsBaseUrl(): string | null {
  const raw = process.env.MEDIAMTX_HLS_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const whep = process.env.MEDIAMTX_WHEP_BASE_URL?.trim();
  if (whep) {
    const cleaned = whep.replace(/\/$/, "");
    if (cleaned.startsWith("https://")) return cleaned;
    return cleaned.replace(/:8889$/, ":8888");
  }
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8888";
  return null;
}

export function whepPlaybackUrl(pathName: string): string | null {
  const base = whepBaseUrl();
  if (!base || base.startsWith("https://")) return null;
  return `${base}/${pathName}/whep`;
}

export function hlsPlaybackUrl(pathName: string): string | null {
  const base = hlsBaseUrl();
  if (!base) return null;
  return `${base}/${pathName}/index.m3u8`;
}

/** Crea/aggiorna il path on-demand su MediaMTX (solo se API raggiungibile). */
export async function ensureMediamtxOnDemandPath(input: {
  pathName: string;
  rtspUrl: string;
}): Promise<MediaMtxEnsureResult> {
  const base = apiBase();
  if (!base) return { ok: true, synced: false };

  const body = {
    source: input.rtspUrl,
    sourceOnDemand: true,
    sourceOnDemandCloseAfter: "10s",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.MEDIAMTX_API_TOKEN?.trim();
  if (token) headers.Authorization = `Basic ${token}`;

  try {
    const patch = await fetch(
      `${base}/v3/config/paths/patch/${encodeURIComponent(input.pathName)}`,
      { method: "PATCH", headers, body: JSON.stringify(body) }
    );
    if (patch.ok) return { ok: true, synced: true };

    const add = await fetch(
      `${base}/v3/config/paths/add/${encodeURIComponent(input.pathName)}`,
      { method: "POST", headers, body: JSON.stringify(body) }
    );
    if (add.ok) return { ok: true, synced: true };

    const text = await add.text();
    return {
      ok: false,
      error: `MediaMTX non ha accettato il path (${add.status}): ${text.slice(0, 180)}`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Gateway MediaMTX non raggiungibile: ${e.message}`
          : "Gateway MediaMTX non raggiungibile.",
    };
  }
}
