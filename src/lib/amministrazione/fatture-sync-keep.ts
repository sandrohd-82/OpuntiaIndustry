import { z } from "zod";
import type { FatturaKind } from "@/lib/amministrazione/fatture";

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

export type FattureSyncSkipped = {
  ficId: number;
  number: string;
  motivo: string;
};

export const fattureSyncKeepKindSchema = z.enum(["emessa", "ricevuta"]);
export const fattureSyncModalitaSchema = z.enum(["precisa", "veloce", "keep"]);
export const fattureSyncStopMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Mese non valido");

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

export function monthKeyFromIso(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso.slice(0, 7);
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
  for (const d of docs) {
    const date = d.date || "";
    if (!date || date > today) continue;
    if (!lastRegisteredDate || date >= lastRegisteredDate) {
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
  const from = monthStartIso(stopMonth);
  return docs.filter((d) => {
    const date = d.date || "";
    return Boolean(date) && date >= from && date <= today;
  });
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
