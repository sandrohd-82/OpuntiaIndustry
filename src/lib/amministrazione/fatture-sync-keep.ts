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

/** FiC già in gestionale: stesso fic_id, oppure stesso numero + data/importo. */
export function ficDocGiaInGestionale(
  doc: {
    ficId: number;
    number: string;
    date: string | null;
    amountGross: number;
  },
  registered: Array<{
    ficId: number | null;
    numeroEsterno: string;
    dataEmissione: string;
    totale: number;
  }>
): boolean {
  if (
    registered.some(
      (r) => r.ficId != null && Number.isFinite(r.ficId) && r.ficId === doc.ficId
    )
  ) {
    return true;
  }
  const num = normalizeFatturaNumeroEsterno(doc.number);
  const date = normalizeIsoDate(doc.date);
  if (!num) return false;
  return registered.some((r) => {
    if (normalizeFatturaNumeroEsterno(r.numeroEsterno) !== num) return false;
    const rDate = normalizeIsoDate(r.dataEmissione);
    if (date && rDate && date === rDate) return true;
    if (date && rDate && date.slice(0, 7) === rDate.slice(0, 7)) {
      const a = Math.abs(Number(doc.amountGross) || 0);
      const b = Math.abs(Number(r.totale) || 0);
      if (a > 0 && b > 0 && Math.abs(a - b) <= 0.05) return true;
    }
    return false;
  });
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
