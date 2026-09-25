import type { Cliente, SedeCliente } from "@/lib/amministrazione/clienti";
import {
  calcolaTotaliEmissione,
} from "@/lib/amministrazione/fattura-emissione";
import { importoRiga } from "@/lib/amministrazione/fatture";
import { emptySede, normalizeSede } from "@/lib/amministrazione/fornitori";
import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";

/** Riga documento fattura A4: listino + sconto, indipendente dall’ordine. */
export type FatturaA4Riga = {
  prodottoId: string | null;
  codice: string;
  descrizione: string;
  quantita: number;
  unitaMisura: string;
  /** Prezzo di listino (prima dello sconto). */
  prezzoUnitario: number;
  scontoPercentuale: number;
  ivaPercentuale: number;
  isSpedizione: boolean;
  note: string;
};

export type FatturaDestinatarioSnapshot = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  sede: SedeCliente;
  email: string;
};

export function destinatarioFromCliente(
  c: Cliente
): FatturaDestinatarioSnapshot {
  return {
    ragioneSociale: c.ragioneSociale,
    partitaIva: c.partitaIva,
    codiceFiscale: c.codiceFiscale,
    sede: normalizeSede(c.sedeAmministrativa),
    email: c.email ?? "",
  };
}

export function destinatarioFromPreventivo(
  d: DestinatarioPreventivo
): FatturaDestinatarioSnapshot {
  return {
    ragioneSociale: d.ragioneSociale,
    partitaIva: d.partitaIva,
    codiceFiscale: d.codiceFiscale,
    sede: normalizeSede(d.sede),
    email: d.email ?? "",
  };
}

export function destinatarioToPreventivo(
  s: FatturaDestinatarioSnapshot,
  fallback: DestinatarioPreventivo
): DestinatarioPreventivo {
  return {
    ...fallback,
    ragioneSociale: s.ragioneSociale,
    partitaIva: s.partitaIva,
    codiceFiscale: s.codiceFiscale,
    sede: normalizeSede(s.sede),
    email: s.email || fallback.email,
  };
}

export function parseDestinatarioSnapshot(
  raw: unknown
): FatturaDestinatarioSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ragione = String(o.ragioneSociale ?? "").trim();
  if (!ragione) return null;
  const sedeRaw = o.sede && typeof o.sede === "object" ? o.sede : {};
  const sede = normalizeSede({
    ...emptySede(),
    ...(sedeRaw as SedeCliente),
  });
  return {
    ragioneSociale: ragione,
    partitaIva: String(o.partitaIva ?? ""),
    codiceFiscale: String(o.codiceFiscale ?? ""),
    sede,
    email: String(o.email ?? ""),
  };
}

/** Listino da ordine: header se presente, altrimenti ricostruisce dal netto. */
export function listinoEScontoDaOrdine(input: {
  prezzoRiga: number;
  prezzoListinoHeader: number | null;
  scontoExtraPct: number;
  isSpedizione: boolean;
}): { prezzoUnitario: number; scontoPercentuale: number } {
  if (input.isSpedizione) {
    return { prezzoUnitario: input.prezzoRiga, scontoPercentuale: 0 };
  }
  const sconto = Math.min(100, Math.max(0, input.scontoExtraPct));
  if (input.prezzoListinoHeader != null && input.prezzoListinoHeader > 0) {
    return {
      prezzoUnitario: input.prezzoListinoHeader,
      scontoPercentuale: sconto,
    };
  }
  if (sconto > 0 && sconto < 100 && input.prezzoRiga > 0) {
    const listino = Math.round((input.prezzoRiga / (1 - sconto / 100)) * 100) / 100;
    return { prezzoUnitario: listino, scontoPercentuale: sconto };
  }
  return { prezzoUnitario: input.prezzoRiga, scontoPercentuale: sconto };
}

export function totalsFromFatturaRighe(righe: FatturaA4Riga[]): {
  imponibile: number;
  imposta: number;
  totale: number;
} {
  return calcolaTotaliEmissione(
    righe.map((r) => ({
      importo: importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale),
      ivaPercentuale: r.ivaPercentuale,
    }))
  );
}
