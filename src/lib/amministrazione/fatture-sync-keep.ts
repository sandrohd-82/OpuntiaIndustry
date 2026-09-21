import { z } from "zod";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { normalizeFatturaNumeroEsterno } from "@/lib/amministrazione/fatture-sync";

export type FattureSyncKeepKind = "emessa" | "ricevuta";
export type FattureSyncModalita = "precisa" | "veloce" | "keep";
export type FattureSyncFase = "prospettiva" | "retroso" | "mista";

export type FattureSyncPendingMeta = {
  ficId: number;
  kind: FatturaKind;
  date: string;
  number: string;
  entityName: string;
  entityVat: string;
  amountGross: number;
};

export type FattureSyncMonthOption = {
  key: string;
  year: number;
  month: number;
  label: string;
  pendingCount: number;
  enabled: boolean;
};

export type FattureSyncAnagraficaCreata = {
  tipo: "fornitore" | "cliente";
  ragioneSociale: string;
  partitaIva: string;
  codiceTarga: string;
};

export type FattureSyncFatturaRegistrata = {
  numero: string;
  ragioneSociale: string;
  partitaIva: string;
  importo: number;
};

export type FattureSyncAziendaGruppo = {
  ragioneSociale: string;
  partitaIva: string;
  nuova: boolean;
  fatture: FattureSyncFatturaRegistrata[];
};

function chiaveAzienda(partitaIva: string, ragioneSociale: string): string {
  const vat = partitaIva.replace(/\s+/g, "").toUpperCase();
  if (vat) return `vat:${vat}`;
  return `nome:${ragioneSociale.trim().toLowerCase()}`;
}

/** Fornitori/clienti del resoconto, raggruppati con le fatture appena registrate. */
export function raggruppaFatturePerAzienda(
  fatture: FattureSyncFatturaRegistrata[],
  anagrafiche: FattureSyncAnagraficaCreata[]
): FattureSyncAziendaGruppo[] {
  const map = new Map<string, FattureSyncAziendaGruppo>();
  for (const a of anagrafiche) {
    const k = chiaveAzienda(a.partitaIva, a.ragioneSociale);
    const prev = map.get(k);
    if (prev) {
      prev.nuova = true;
      if (!prev.partitaIva) prev.partitaIva = a.partitaIva;
      if (!prev.ragioneSociale) prev.ragioneSociale = a.ragioneSociale;
    } else {
      map.set(k, {
        ragioneSociale: a.ragioneSociale,
        partitaIva: a.partitaIva,
        nuova: true,
        fatture: [],
      });
    }
  }
  for (const f of fatture) {
    const k = chiaveAzienda(f.partitaIva, f.ragioneSociale);
    const prev = map.get(k);
    if (prev) {
      prev.fatture.push(f);
      if (!prev.ragioneSociale) prev.ragioneSociale = f.ragioneSociale;
      if (!prev.partitaIva) prev.partitaIva = f.partitaIva;
    } else {
      map.set(k, {
        ragioneSociale: f.ragioneSociale,
        partitaIva: f.partitaIva,
        nuova: false,
        fatture: [f],
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.ragioneSociale.localeCompare(b.ragioneSociale, "it")
  );
}

export type FattureSyncSkipped = {
  ficId: number;
  number: string;
  motivo: string;
};

export type FattureSyncEccezione = {
  ficId: number;
  number: string;
  motivo: string;
};

export const fattureSyncKeepKindSchema = z.enum(["emessa", "ricevuta"]);
export const fattureSyncModalitaSchema = z.enum(["precisa", "veloce", "keep"]);
export const fattureSyncStopMonthSchema = z
  .string()
  .regex(/^(\d{4}-\d{2})(,\d{4}-\d{2})*$/, "Mesi non validi");

const MESI_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

export function todayIsoRome(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

export function normalizeIsoDate(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? "";
}

export function monthKeyFromIso(iso: string): string | null {
  const day = normalizeIsoDate(iso);
  return day ? day.slice(0, 7) : null;
}

function compactNumeroFattura(value: string): string {
  return normalizeFatturaNumeroEsterno(value).replace(/[^A-Z0-9]/g, "");
}

function numeriCompatibili(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.endsWith(b) || b.endsWith(a));
}

export type FatturaSyncRegisteredHint = {
  id?: string;
  ficId: number | null;
  numeroEsterno: string;
  numeroInterno?: string;
  dataEmissione: string;
  totale: number;
};

/** FiC già in gestionale: fic_id, oppure numero+data/anno+importo (anche inserita a mano). */
export function ficDocGiaInGestionale(
  doc: {
    ficId: number;
    number: string;
    date: string | null;
    amountGross: number;
  },
  registered: FatturaSyncRegisteredHint[]
): boolean {
  return Boolean(findRegisteredHintForFicDoc(doc, registered));
}

export function findRegisteredHintForFicDoc(
  doc: {
    ficId: number;
    number: string;
    date: string | null;
    amountGross: number;
  },
  registered: FatturaSyncRegisteredHint[]
): FatturaSyncRegisteredHint | null {
  const byFic = registered.find(
    (r) => r.ficId != null && Number.isFinite(r.ficId) && r.ficId === doc.ficId
  );
  if (byFic) return byFic;

  const num = compactNumeroFattura(doc.number);
  const date = normalizeIsoDate(doc.date);
  const amount = Math.abs(Number(doc.amountGross) || 0);

  for (const r of registered) {
    const rNum = compactNumeroFattura(r.numeroEsterno);
    const rInt = compactNumeroFattura(r.numeroInterno ?? "");
    const sameNum =
      numeriCompatibili(num, rNum) || numeriCompatibili(num, rInt);
    if (!sameNum && !num) continue;
    const rDate = normalizeIsoDate(r.dataEmissione);
    const rAmt = Math.abs(Number(r.totale) || 0);
    const sameAmt = amount > 0 && rAmt > 0 && Math.abs(amount - rAmt) <= 0.05;
    const sameDay = Boolean(date && rDate && date === rDate);
    const sameMonth = Boolean(
      date && rDate && date.slice(0, 7) === rDate.slice(0, 7)
    );
    const sameYear = Boolean(
      date && rDate && date.slice(0, 4) === rDate.slice(0, 4)
    );
    if (sameNum && sameDay) return r;
    if (sameNum && sameMonth && sameAmt) return r;
    if (sameNum && sameYear && sameAmt) return r;
  }
  return null;
}

export function isDuplicateFicIdError(message: string): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("fatture_ricevute_fic_id_active_uidx") ||
    m.includes("fatture_emesse_fic_id_active_uidx") ||
    (m.includes("duplicate key") && m.includes("fic_id")) ||
    (m.includes("unique") && m.includes("fic_id"))
  );
}

type SoftQueryClient = {
  from: (table: string) => {
    select: (cols: string) => any;
  };
};

/** PostgREST taglia a 1000: senza pagine le fatture già in DB spariscono dai hint. */
export async function pageAllSoftRows(
  supabase: unknown,
  table: "fatture_ricevute" | "fatture_emesse",
  columns: string
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const client = supabase as SoftQueryClient;
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .is("deleted_at", null)
      .range(from, from + page - 1);
    if (error) return { rows, error: error.message };
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return { rows, error: null };
}

export async function findActiveFatturaIdByFicId(
  supabase: unknown,
  table: "fatture_ricevute" | "fatture_emesse",
  ficId: number | null | undefined
): Promise<{ id: string; numeroInterno: string } | null> {
  const n = Number(ficId);
  if (!Number.isFinite(n) || n <= 0) return null;
  const client = supabase as SoftQueryClient;
  const { data, error } = await client
    .from(table)
    .select("id, numero_interno")
    .eq("fic_id", n)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    numeroInterno: String(data.numero_interno ?? ""),
  };
}

export function monthStartIso(key: string): string {
  return `${key}-01`;
}

export function labelMeseIt(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || m < 1 || m > 12) return key;
  const nome = MESI_IT[m - 1] ?? key;
  return `${nome} ${y}`;
}

export function splitForwardRetro(
  docs: FattureSyncPendingMeta[],
  lastRegisteredDate: string | null,
  today: string
): { forward: FattureSyncPendingMeta[]; retro: FattureSyncPendingMeta[] } {
  const forward: FattureSyncPendingMeta[] = [];
  const retro: FattureSyncPendingMeta[] = [];
  const todayDay = normalizeIsoDate(today) || today;
  const last = lastRegisteredDate ? normalizeIsoDate(lastRegisteredDate) : "";
  for (const d of docs) {
    const date = normalizeIsoDate(d.date) || d.date || "";
    if (!date || date > todayDay) continue;
    if (!last || date >= last) {
      forward.push(d);
    } else {
      retro.push(d);
    }
  }
  return { forward, retro };
}

export function filterFromStopMonth(
  docs: FattureSyncPendingMeta[],
  stopMonth: string,
  today: string
): FattureSyncPendingMeta[] {
  const months = stopMonth
    .split(",")
    .map((k) => k.trim())
    .filter((k) => /^\d{4}-\d{2}$/.test(k));
  if (months.length === 0) return [];
  if (months.length > 1) {
    return filterFromMonths(docs, months, today);
  }
  const from = monthStartIso(months[0]!);
  const todayDay = normalizeIsoDate(today) || today;
  return docs.filter((d) => {
    const date = normalizeIsoDate(d.date) || d.date || "";
    return Boolean(date) && date >= from && date <= todayDay;
  });
}

export function filterFromMonths(
  docs: FattureSyncPendingMeta[],
  months: string[],
  today: string
): FattureSyncPendingMeta[] {
  const set = new Set(
    months.filter((k) => /^\d{4}-\d{2}$/.test(k))
  );
  if (!set.size) return [];
  const todayDay = normalizeIsoDate(today) || today;
  return docs.filter((d) => {
    const date = normalizeIsoDate(d.date) || d.date || "";
    const key = monthKeyFromIso(date);
    return Boolean(date) && date <= todayDay && Boolean(key && set.has(key));
  });
}

export function labelMesiIt(keys: string[]): string {
  return [...keys]
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort()
    .map(labelMeseIt)
    .join(", ");
}

export function stopMonthsAuditValue(keys: string[]): string | null {
  const list = [...keys]
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort();
  return list.length ? list.join(",") : null;
}

export function buildMonthOptions(
  pending: FattureSyncPendingMeta[],
  today: string
): FattureSyncMonthOption[] {
  const counts = new Map<string, number>();
  let minKey: string | null = null;
  for (const d of pending) {
    const key = monthKeyFromIso(d.date);
    if (!key || d.date > today) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!minKey || key < minKey) minKey = key;
  }
  const todayKey = today.slice(0, 7);
  if (!minKey) minKey = todayKey;

  const out: FattureSyncMonthOption[] = [];
  let [y, m] = minKey.split("-").map(Number);
  const [ty, tm] = todayKey.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const pendingCount = counts.get(key) ?? 0;
    out.push({
      key,
      year: y,
      month: m,
      label: labelMeseIt(key),
      pendingCount,
      enabled: pendingCount > 0,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

export function defaultStopMonth(months: FattureSyncMonthOption[]): string | null {
  return months.find((m) => m.enabled)?.key ?? null;
}
