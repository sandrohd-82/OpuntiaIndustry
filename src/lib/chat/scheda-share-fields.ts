import type { SchedaPayload } from "@/lib/chat/share";
import type { SedeFornitore } from "@/lib/amministrazione/fornitori";

export type SchedaShareFieldOption = {
  key: string;
  label: string;
  value: string;
  /** Selezionato di default (anagrafica base). */
  defaultSelected: boolean;
};

export type SchedaShareReferenteOption = {
  id: string;
  label: string;
  dettaglio: string;
  defaultSelected: boolean;
};

export type SchedaSharePriceOption = {
  label: string;
  value: string;
  defaultSelected: boolean;
};

export type SchedaSharePreview = {
  entityType: SchedaPayload["entityType"];
  entityId: string;
  title: string;
  subtitle: string;
  fields: SchedaShareFieldOption[];
  referenti: SchedaShareReferenteOption[];
  price: SchedaSharePriceOption | null;
};

const BASIC_ANAGRAFICA_KEYS = new Set([
  "codice_targa",
  "partita_iva",
  "codice_fiscale",
  "email",
  "telefono",
]);

const BASIC_PRODUCT_KEYS = new Set(["codice", "nome"]);

export function isBasicAnagraficaKey(key: string): boolean {
  return BASIC_ANAGRAFICA_KEYS.has(key);
}

export function isBasicProductKey(key: string): boolean {
  return BASIC_PRODUCT_KEYS.has(key);
}

export function formatSedeShare(sede: SedeFornitore): string {
  const parts = [
    sede.indirizzo?.trim(),
    [sede.cap, sede.citta].filter(Boolean).join(" ").trim(),
    sede.provincia?.trim() ? `(${sede.provincia.trim()})` : "",
    sede.nazione?.trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

export function formatEuroIt(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function pushFieldIfValue(
  fields: SchedaShareFieldOption[],
  key: string,
  label: string,
  value: string | null | undefined,
  defaultSelected: boolean
) {
  const v = (value ?? "").trim();
  if (!v) return;
  fields.push({ key, label, value: v, defaultSelected });
}
