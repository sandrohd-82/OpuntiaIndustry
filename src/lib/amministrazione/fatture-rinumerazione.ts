import { buildNumeroInternoFattura } from "@/lib/amministrazione/fatture";

export type FatturaRinumeraRow = {
  id: string;
  clienteId: string;
  codiceTarga: string;
  dataEmissione: string;
  numeroInterno: string;
  tipoDocumento: "fattura" | "nota_credito";
  createdAt: string;
};

export type RinumeraChange = {
  id: string;
  da: string;
  a: string;
  dataEmissione: string;
};

/** Confronta per data emissione (poi created_at, id). */
export function compareFatturaCronologica(
  a: Pick<FatturaRinumeraRow, "dataEmissione" | "createdAt" | "id">,
  b: Pick<FatturaRinumeraRow, "dataEmissione" | "createdAt" | "id">
): number {
  const d = (a.dataEmissione || "").localeCompare(b.dataEmissione || "");
  if (d !== 0) return d;
  const c = (a.createdAt || "").localeCompare(b.createdAt || "");
  if (c !== 0) return c;
  return a.id.localeCompare(b.id);
}

/**
 * Calcola i nuovi numeri interni: progressivo 1…n per azienda e tipo
 * (Ft / Nc) in ordine di data emissione.
 */
export function planRinumeraFattureEmesse(
  rows: FatturaRinumeraRow[]
): RinumeraChange[] {
  const byClienteTipo = new Map<string, FatturaRinumeraRow[]>();
  for (const r of rows) {
    const tipo =
      r.tipoDocumento === "nota_credito" ||
      r.numeroInterno.toUpperCase().startsWith("NC-")
        ? "nota_credito"
        : "fattura";
    const key = `${r.clienteId}::${tipo}`;
    const list = byClienteTipo.get(key) ?? [];
    list.push({ ...r, tipoDocumento: tipo });
    byClienteTipo.set(key, list);
  }

  const changes: RinumeraChange[] = [];
  for (const [, list] of byClienteTipo) {
    list.sort(compareFatturaCronologica);
    let seq = 1;
    for (const row of list) {
      const kind =
        row.tipoDocumento === "nota_credito" ? "nota_credito" : "emessa";
      const next = buildNumeroInternoFattura({
        dataEmissione: row.dataEmissione,
        codiceTarga: row.codiceTarga,
        seq,
        kind,
      });
      seq += 1;
      if (next !== row.numeroInterno) {
        changes.push({
          id: row.id,
          da: row.numeroInterno,
          a: next,
          dataEmissione: row.dataEmissione,
        });
      }
    }
  }
  return changes;
}

export type FatturaRicevutaRinumeraRow = {
  id: string;
  fornitoreId: string;
  codiceTarga: string;
  dataEmissione: string;
  numeroInterno: string;
  createdAt: string;
};

/**
 * Progressivi Ft ricevute per fornitore in ordine di data emissione
 * (anche se registrate a ritroso dalla più recente).
 */
export function planRinumeraFattureRicevute(
  rows: FatturaRicevutaRinumeraRow[]
): RinumeraChange[] {
  const byFornitore = new Map<string, FatturaRicevutaRinumeraRow[]>();
  for (const r of rows) {
    const key = r.fornitoreId;
    if (!key) continue;
    const list = byFornitore.get(key) ?? [];
    list.push(r);
    byFornitore.set(key, list);
  }

  const changes: RinumeraChange[] = [];
  for (const [, list] of byFornitore) {
    list.sort(compareFatturaCronologica);
    let seq = 1;
    for (const row of list) {
      const next = buildNumeroInternoFattura({
        dataEmissione: row.dataEmissione,
        codiceTarga: row.codiceTarga,
        seq,
        kind: "ricevuta",
      });
      seq += 1;
      if (next !== row.numeroInterno) {
        changes.push({
          id: row.id,
          da: row.numeroInterno,
          a: next,
          dataEmissione: row.dataEmissione,
        });
      }
    }
  }
  return changes;
}

export function tempNumeroInterno(id: string): string {
  return `TMP-${id}`;
}
