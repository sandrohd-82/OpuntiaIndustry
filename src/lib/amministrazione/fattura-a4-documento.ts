import type { Cliente, SedeCliente } from "@/lib/amministrazione/clienti";
import {
  calcolaTotaliEmissione,
} from "@/lib/amministrazione/fattura-emissione";
import { importoRiga, prezzoNettoRiga, prezzoScontatoUnitario, roundMoney } from "@/lib/amministrazione/fatture";
import {
  prezzoNettoDueSconti,
  scontoSommaPct,
} from "@/lib/amministrazione/sconto-fuori-listino";
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
  /** Imponibile già registrato. Se manca, si ricalcola sulla riga. */
  importo?: number;
  /** Sconto di listino, applicato prima dell'extra. */
  scontoListinoPct?: number;
  /** Sconto extra, applicato sul prezzo già scontato di listino. */
  scontoExtraPct?: number;
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

/** Listino e i due sconti, in sequenza come il preventivo. */
export function listinoEScontoDaOrdine(input: {
  prezzoRiga: number;
  prezzoListinoHeader: number | null;
  scontoExtraPct: number;
  scontoListinoPct?: number;
  isSpedizione: boolean;
}): {
  prezzoUnitario: number;
  scontoPercentuale: number;
  scontoListinoPct: number;
  scontoExtraPct: number;
} {
  const fermo = {
    prezzoUnitario: input.prezzoRiga,
    scontoPercentuale: 0,
    scontoListinoPct: 0,
    scontoExtraPct: 0,
  };
  if (input.isSpedizione) return fermo;
  const listino = Number.isFinite(input.scontoListinoPct)
    ? Math.max(0, input.scontoListinoPct ?? 0)
    : 0;
  const extra = Number.isFinite(input.scontoExtraPct)
    ? Math.max(0, input.scontoExtraPct)
    : 0;
  if (listino <= 0 && extra <= 0) return fermo;
  const header =
    input.prezzoListinoHeader != null && input.prezzoListinoHeader > 0
      ? input.prezzoListinoHeader
      : 0;
  if (header <= 0) return fermo;
  const sequenziale = prezzoNettoDueSconti(header, listino, extra);
  const sommato = scontoSommaPct(listino, extra);
  const vicino =
    Math.abs(sequenziale - input.prezzoRiga) <= 0.02 ||
    Math.abs(prezzoScontatoUnitario(header, sommato) - input.prezzoRiga) <= 0.02 ||
    Math.abs(prezzoNettoRiga(header, sommato) - input.prezzoRiga) <= 0.02;
  if (!vicino) return fermo;
  return {
    prezzoUnitario: header,
    scontoPercentuale: 0,
    scontoListinoPct: listino,
    scontoExtraPct: extra,
  };
}

/**
 * Voce verso Fatture in Cloud.
 * Due sconti in sequenza non hanno un campo proprio: il prezzo inviato è il
 * netto già arrotondato al centesimo e la descrizione riporta le percentuali.
 * Un solo sconto resta prezzo di listino + percentuale, come calcola FiC.
 * `coerente` è vero solo se sia il totale riga sia l'unità arrotondata
 * danno lo stesso imponibile: altrimenti l'invio va bloccato.
 */
export function voceScontoFattureInCloud(r: {
  prezzoUnitario: number;
  quantita: number;
  scontoPercentuale: number;
  scontoListinoPct?: number;
  scontoExtraPct?: number;
}): {
  netPrice: number;
  discount: number;
  imponibile: number;
  dettaglio: string;
  coerente: boolean;
} {
  const listino = r.scontoListinoPct ?? 0;
  const extra = r.scontoExtraPct ?? 0;
  if (listino > 0 || extra > 0) {
    const unit = prezzoNettoDueSconti(r.prezzoUnitario, listino, extra);
    const imponibile = roundMoney(r.quantita * unit);
    const daRiga = roundMoney(unit * r.quantita);
    const daUnita = roundMoney(r.quantita * roundMoney(unit));
    const etichetta = etichettaScontoDocumento({
      prodottoId: null,
      codice: "",
      descrizione: "",
      quantita: r.quantita,
      unitaMisura: "",
      prezzoUnitario: r.prezzoUnitario,
      scontoPercentuale: 0,
      scontoListinoPct: listino,
      scontoExtraPct: extra,
      ivaPercentuale: 0,
      isSpedizione: false,
      note: "",
    });
    const listinoTxt = r.prezzoUnitario.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return {
      netPrice: unit,
      discount: 0,
      imponibile,
      dettaglio: `Sconto ${etichetta} sul listino di ${listinoTxt} €`,
      coerente: daRiga === imponibile && daUnita === imponibile,
    };
  }
  const imponibile = importoRiga(
    r.quantita,
    r.prezzoUnitario,
    r.scontoPercentuale
  );
  const daRiga = roundMoney(
    r.prezzoUnitario * r.quantita * (1 - r.scontoPercentuale / 100)
  );
  return {
    netPrice: r.prezzoUnitario,
    discount: r.scontoPercentuale,
    imponibile,
    dettaglio: "",
    coerente: daRiga === imponibile,
  };
}

export function etichettaScontoDocumento(r: FatturaA4Riga): string {
  const listino = r.scontoListinoPct ?? 0;
  const extra = r.scontoExtraPct ?? 0;
  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  if (listino > 0 && extra > 0) return `${fmt(listino)}% + ${fmt(extra)}%`;
  if (listino > 0) return `${fmt(listino)}%`;
  if (extra > 0) return `${fmt(extra)}%`;
  if (r.scontoPercentuale > 0) return `${r.scontoPercentuale} %`;
  return "—";
}

export function nettoUnitarioDocumento(r: FatturaA4Riga): number {
  const listino = r.scontoListinoPct ?? 0;
  const extra = r.scontoExtraPct ?? 0;
  if (listino > 0 || extra > 0) {
    return prezzoNettoDueSconti(r.prezzoUnitario, listino, extra);
  }
  return prezzoScontatoUnitario(r.prezzoUnitario, r.scontoPercentuale);
}

export function imponibileDocumentoRiga(r: FatturaA4Riga): number {
  if (r.importo != null && Number.isFinite(r.importo)) return roundMoney(r.importo);
  const listino = r.scontoListinoPct ?? 0;
  const extra = r.scontoExtraPct ?? 0;
  if (listino > 0 || extra > 0) {
    return roundMoney(
      r.quantita * prezzoNettoDueSconti(r.prezzoUnitario, listino, extra)
    );
  }
  return importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale);
}

export function totalsFromFatturaRighe(righe: FatturaA4Riga[]): {
  imponibile: number;
  imposta: number;
  totale: number;
} {
  return calcolaTotaliEmissione(
    righe.map((r) => ({
      importo: imponibileDocumentoRiga(r),
      ivaPercentuale: r.ivaPercentuale,
    }))
  );
}

export const CONTRIBUTO_SPESE_SPEDIZIONE_CODICE = "SPED";
export const CONTRIBUTO_SPESE_SPEDIZIONE_DESCRIZIONE =
  "Contributo Spese di spedizione";

export function isRigaContributoSpedizione(r: FatturaA4Riga): boolean {
  return (
    r.isSpedizione ||
    r.codice.trim().toUpperCase() === CONTRIBUTO_SPESE_SPEDIZIONE_CODICE
  );
}

export function isRigaContributoSpedizionePredefinita(
  r: FatturaA4Riga
): boolean {
  if (!isRigaContributoSpedizione(r)) return false;
  const d = r.descrizione.trim().toLowerCase();
  return (
    d === CONTRIBUTO_SPESE_SPEDIZIONE_DESCRIZIONE.toLowerCase() ||
    d === "spedizione"
  );
}

/**
 * Dall'importo già comprensivo di IVA ricava l'imponibile.
 * Imponibile arrotondato + IVA arrotondata, e il totale di riga, coincidono col lordo.
 */
export function imponibileDaImportoComprensivo(
  lordo: number,
  aliquota: number
): number {
  const lordoArrotondato = roundMoney(
    Number.isFinite(lordo) ? Math.max(0, lordo) : 0
  );
  const rate = aliquota / 100;
  if (!(rate > 0) || !(lordoArrotondato > 0)) return lordoArrotondato;
  const lordoCenti = Math.round(lordoArrotondato * 100);
  const stimato = Math.round(lordoCenti / (1 + rate));
  let migliore = roundMoney(lordoArrotondato / (1 + rate));
  let erroreMigliore = Number.POSITIVE_INFINITY;
  for (let delta = -5; delta <= 5; delta += 1) {
    const centi = stimato + delta;
    if (centi < 0) continue;
    const imponibile = centi / 100;
    const impostaRaw = (imponibile * aliquota) / 100;
    const imposta = roundMoney(impostaRaw);
    const totaleCenti = Math.round(roundMoney(imponibile + impostaRaw) * 100);
    const sommaCenti = Math.round((imponibile + imposta) * 100);
    if (sommaCenti === lordoCenti && totaleCenti === lordoCenti) {
      return imponibile;
    }
    const errore = Math.abs(totaleCenti - lordoCenti);
    if (errore < erroreMigliore) {
      erroreMigliore = errore;
      migliore = imponibile;
    }
  }
  return migliore;
}

export function rigaContributoSpeseSpedizione(input: {
  importo: number;
  ivaInclusa: boolean;
  ivaAliquota?: number;
}): FatturaA4Riga {
  const importo = Number.isFinite(input.importo) ? Math.max(0, input.importo) : 0;
  const aliquota = input.ivaAliquota ?? 22;
  let prezzoUnitario = importo;
  let ivaPercentuale = aliquota;
  if (input.ivaInclusa && aliquota > 0) {
    prezzoUnitario = imponibileDaImportoComprensivo(importo, aliquota);
  } else if (input.ivaInclusa) {
    ivaPercentuale = 0;
  }
  return {
    prodottoId: null,
    codice: CONTRIBUTO_SPESE_SPEDIZIONE_CODICE,
    descrizione: CONTRIBUTO_SPESE_SPEDIZIONE_DESCRIZIONE,
    quantita: 1,
    unitaMisura: "nr",
    prezzoUnitario,
    scontoPercentuale: 0,
    ivaPercentuale,
    isSpedizione: true,
    note: "",
  };
}

/** Aggiunge/aggiorna/togli la voce spedizione se è ancora quella predefinita. */
export function applyContributoSpeseSpedizione(
  righe: FatturaA4Riga[],
  opts: {
    aCaricoCliente: boolean;
    importo: number;
    ivaInclusa: boolean;
    ivaAliquota?: number;
    rimosso?: boolean;
  }
): FatturaA4Riga[] {
  const others = righe.filter((r) => !isRigaContributoSpedizione(r));
  const existing = righe.find((r) => isRigaContributoSpedizione(r));
  if (!opts.aCaricoCliente) {
    if (existing && !isRigaContributoSpedizionePredefinita(existing)) {
      return righe;
    }
    return others;
  }
  if (opts.rimosso && !existing) return righe;
  if (existing && !isRigaContributoSpedizionePredefinita(existing)) {
    return righe;
  }
  return [...others, rigaContributoSpeseSpedizione(opts)];
}
