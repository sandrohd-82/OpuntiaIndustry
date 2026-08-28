import { z } from "zod";

export const SHIPPING_STATUS_VALUES = [
  "registrato",
  "in_transito",
  "in_consegna",
  "consegnato",
  "anomalia",
  "sconosciuto",
] as const;

export type ShippingStatus = (typeof SHIPPING_STATUS_VALUES)[number];

export const SHIPPING_STATUS_LABEL: Record<ShippingStatus, string> = {
  registrato: "Registrato",
  in_transito: "In Transito",
  in_consegna: "In Consegna",
  consegnato: "Consegnato",
  anomalia: "Anomalia",
  sconosciuto: "Stato non rilevato",
};

export const SHIPPING_STATUS_BADGE: Record<
  ShippingStatus,
  { dot: string; className: string }
> = {
  registrato: {
    dot: "bg-slate-400",
    className: "bg-slate-100 text-slate-800 border-slate-200",
  },
  in_transito: {
    dot: "bg-sky-500",
    className: "bg-sky-50 text-sky-900 border-sky-200",
  },
  in_consegna: {
    dot: "bg-emerald-500",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  consegnato: {
    dot: "bg-green-600",
    className: "bg-green-50 text-green-900 border-green-200",
  },
  anomalia: {
    dot: "bg-red-500",
    className: "bg-red-50 text-red-900 border-red-200",
  },
  sconosciuto: {
    dot: "bg-amber-400",
    className: "bg-amber-50 text-amber-950 border-amber-200",
  },
};

/** Throttle auto-check (ms) se non forzato. */
export const SHIPPING_CHECK_THROTTLE_MS = 15 * 60 * 1000;

export type ShippingTracking = {
  id: string;
  notaId: string | null;
  entityType: string | null;
  entityId: string | null;
  trackingUrl: string;
  carrier: string;
  trackingCode: string;
  currentStatus: ShippingStatus;
  lastCheckedAt: string | null;
  lastCheckNote: string;
  createdAt: string;
};

export type ShippingTrackingLog = {
  id: string;
  trackingId: string;
  status: ShippingStatus;
  details: Record<string, unknown>;
  createdAt: string;
};

export const createShippingTrackingSchema = z.object({
  trackingUrl: z
    .string()
    .trim()
    .url("URL tracking non valido")
    .refine((u) => /^https?:\/\//i.test(u), "Usa http(s)"),
  carrier: z.string().trim().min(1, "Corriere obbligatorio").max(120),
  trackingCode: z.string().trim().max(120).optional().default(""),
  notaId: z.string().uuid().nullable().optional(),
  entityType: z
    .enum(["cliente", "fornitore", "cliente_possibile", "ordine", "altro"])
    .nullable()
    .optional(),
  entityId: z.string().uuid().nullable().optional(),
  runCheck: z.boolean().optional().default(true),
});

export const checkShippingTrackingSchema = z.object({
  trackingId: z.string().uuid(),
  force: z.boolean().optional().default(false),
  /** Override manuale stato (opzionale). */
  manualStatus: z.enum(SHIPPING_STATUS_VALUES).optional(),
});

export const linkShippingToNotaSchema = z.object({
  notaId: z.string().uuid(),
  trackingIds: z.array(z.string().uuid()).min(1).max(20),
});

export function mapShippingTrackingRow(
  r: Record<string, unknown>
): ShippingTracking {
  const status = String(r.current_status ?? "sconosciuto");
  return {
    id: String(r.id),
    notaId: r.nota_id ? String(r.nota_id) : null,
    entityType: r.entity_type ? String(r.entity_type) : null,
    entityId: r.entity_id ? String(r.entity_id) : null,
    trackingUrl: String(r.tracking_url ?? ""),
    carrier: String(r.carrier ?? ""),
    trackingCode: String(r.tracking_code ?? ""),
    currentStatus: (SHIPPING_STATUS_VALUES as readonly string[]).includes(
      status
    )
      ? (status as ShippingStatus)
      : "sconosciuto",
    lastCheckedAt: r.last_checked_at ? String(r.last_checked_at) : null,
    lastCheckNote: String(r.last_check_note ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

export function mapShippingLogRow(
  r: Record<string, unknown>
): ShippingTrackingLog {
  const status = String(r.status ?? "sconosciuto");
  return {
    id: String(r.id),
    trackingId: String(r.tracking_id),
    status: (SHIPPING_STATUS_VALUES as readonly string[]).includes(status)
      ? (status as ShippingStatus)
      : "sconosciuto",
    details:
      r.details && typeof r.details === "object" && !Array.isArray(r.details)
        ? (r.details as Record<string, unknown>)
        : {},
    createdAt: String(r.created_at ?? ""),
  };
}

export function formatUltimoAggiornamento(iso: string | null | undefined): string {
  if (!iso) return "Mai aggiornato";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Ultimo aggiornamento: ${date} alle ${time}`;
  } catch {
    return `Ultimo aggiornamento: ${iso}`;
  }
}

/**
 * Best-effort: scarica la pagina tracking e cerca parole chiave di stato.
 * Non è uno scraping dedicato per corriere (Opzione A).
 */
export async function fetchTrackingStatusHint(input: {
  url: string;
  previous?: ShippingStatus;
}): Promise<{
  status: ShippingStatus;
  note: string;
  details: Record<string, unknown>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(input.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "User-Agent":
          "OpuntiaIndustry-ShippingCheck/1.0 (+internal; ISO-quality tracking)",
      },
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    const text = raw.slice(0, 120_000).toLowerCase();

    const detected = detectStatusFromText(text);
    const note = detected
      ? `Rilevato da pagina corriere (HTTP ${res.status}).`
      : res.ok
        ? "Pagina raggiunta; stato non riconosciuto automaticamente — verifica sul sito del corriere."
        : `Risposta HTTP ${res.status}; stato non aggiornato automaticamente.`;

    return {
      status: detected ?? input.previous ?? "sconosciuto",
      note,
      details: {
        httpStatus: res.status,
        contentType,
        detected: detected ?? null,
        previous: input.previous ?? null,
        sampleLength: text.length,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch fallito";
    return {
      status: input.previous ?? "sconosciuto",
      note: `Check non riuscito: ${msg}. Usa «Vai al sito del corriere».`,
      details: {
        error: msg,
        previous: input.previous ?? null,
        checkedAt: new Date().toISOString(),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectStatusFromText(text: string): ShippingStatus | null {
  if (
    /consegnat[oa]|delivered|consegna effettuata|ritirato dal destinatario/.test(
      text
    )
  ) {
    return "consegnato";
  }
  if (
    /in consegna|out for delivery|in distribuzione|in consegna al destinatario/.test(
      text
    )
  ) {
    return "in_consegna";
  }
  if (
    /anomalia|giacenza|mancata consegna|failed delivery|exception|non consegnat/.test(
      text
    )
  ) {
    return "anomalia";
  }
  if (
    /in transito|in transit|spedizione in corso|partit[oa]|hub|sorting|transit/.test(
      text
    )
  ) {
    return "in_transito";
  }
  if (/registrat[oa]|accettat[oa]|shipment created|etichetta/.test(text)) {
    return "registrato";
  }
  return null;
}

export function trackingAllegatoId(trackingId: string): string {
  return trackingId;
}

export function isTrackingAllegato(kind: string): boolean {
  return (kind || "").toLowerCase() === "tracking";
}

export function buildTrackingInsertText(input: {
  carrier: string;
  trackingUrl: string;
  trackingCode?: string;
}): string {
  const code = (input.trackingCode || "").trim();
  return [
    "",
    `📦 Tracking spedizione — ${input.carrier}${code ? ` (${code})` : ""}`,
    input.trackingUrl,
    "",
  ].join("\n");
}
