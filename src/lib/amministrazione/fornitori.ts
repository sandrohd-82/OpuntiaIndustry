import {
  labelFornitoreTipologia,
  normalizeTipologie,
} from "@/lib/amministrazione/catalogo-offerta";
import type { FornitoreRow, FornitoreTipologia } from "@/types/database";

export const FORNITORI_BIO_BUCKET = "fornitori-bio";

export type SedeFornitore = {
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
};

export type Fornitore = {
  id: string;
  codiceTarga: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
  tipologie: FornitoreTipologia[];
  serviziOfferti: string[];
  prodottiFornitore: string[];
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
  contributiOfferti: string[];
  /** Path Storage del PDF certificato bio. */
  bioCertificatoPath: string;
  bioCodice: string;
  createdAt: string;
};

export type FornitoreInput = {
  /** Anteprima mostrata in modale; associata in DB solo al salvataggio. */
  codiceTarga?: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  email?: string;
  pec?: string;
  sdiCode?: string;
  telefono?: string;
  sitoWeb?: string;
  tipologie?: FornitoreTipologia[];
  serviziOfferti?: string[];
  prodottiFornitore?: string[];
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
  contributiOfferti?: string[];
  bioCertificatoPath?: string;
  bioCodice?: string;
  /** Se true, rimuove il PDF bio esistente (senza sostituirlo). */
  removeBioCertificato?: boolean;
  /** Se ripescata da archivio: id riga fornitori_archivio da chiudere al salvataggio. */
  archivioId?: string | null;
  /** Fonte enrichment (ISO). */
  anagraficaFonte?:
    | "manuale"
    | "locale"
    | "archivio"
    | "fic_supplier"
    | "fic_client"
    | "fic_fattura"
    | null;
  /** Operatore ha verificato i dati precompilati. */
  anagraficaVerificata?: boolean;
  enrichmentSnapshot?: Record<string, unknown> | null;
};

export function emptySede(): SedeFornitore {
  return {
    nazione: "",
    provincia: "",
    citta: "",
    cap: "",
    indirizzo: "",
  };
}

export function normalizeSede(sede: SedeFornitore): SedeFornitore {
  return {
    nazione: sede.nazione.trim(),
    provincia: sede.provincia.trim(),
    citta: sede.citta.trim(),
    cap: sede.cap.trim(),
    indirizzo: sede.indirizzo.trim(),
  };
}

export function normalizeFornitoreInput(input: FornitoreInput): FornitoreInput {
  const codice = input.codiceTarga?.trim().toUpperCase();
  return {
    codiceTarga:
      codice && /^F[0-9A-F]{3}$/.test(codice) && codice !== "F000"
        ? codice
        : undefined,
    ragioneSociale: input.ragioneSociale.trim(),
    partitaIva: input.partitaIva.trim().toUpperCase(),
    codiceFiscale: (input.codiceFiscale ?? "").trim().toUpperCase(),
    email: (input.email ?? "").trim(),
    pec: (input.pec ?? "").trim(),
    sdiCode: (input.sdiCode ?? "").trim(),
    telefono: (input.telefono ?? "").trim(),
    sitoWeb: (input.sitoWeb ?? "").trim(),
    tipologie: normalizeTipologie(input.tipologie),
    serviziOfferti: (input.serviziOfferti ?? [])
      .map((p) => p.trim())
      .filter(Boolean),
    prodottiFornitore: (input.prodottiFornitore ?? [])
      .map((p) => p.trim())
      .filter(Boolean),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
    contributiOfferti: (input.contributiOfferti ?? [])
      .map((p) => p.trim())
      .filter(Boolean),
    bioCertificatoPath: input.bioCertificatoPath?.trim() ?? "",
    bioCodice: input.bioCodice?.trim() ?? "",
    removeBioCertificato: Boolean(input.removeBioCertificato),
    archivioId: input.archivioId ?? null,
    anagraficaFonte: input.anagraficaFonte ?? null,
    anagraficaVerificata: Boolean(input.anagraficaVerificata),
    enrichmentSnapshot: input.enrichmentSnapshot ?? null,
  };
}

/** Validazione business scheda fornitore (opzione A: P.IVA + CF obbligatori). */
export function validateFornitoreAnagrafica(
  input: Pick<FornitoreInput, "ragioneSociale" | "partitaIva" | "codiceFiscale">
): string | null {
  if (!input.ragioneSociale.trim() || input.ragioneSociale.trim().length < 2) {
    return "La ragione sociale è obbligatoria.";
  }
  const vat = input.partitaIva.trim().toUpperCase().replace(/[\s.\-\/]/g, "");
  const vatKey = vat.startsWith("IT") ? vat.slice(2) : vat;
  if (!/^\d{11}$/.test(vatKey)) {
    return "La partita IVA è obbligatoria (11 cifre).";
  }
  const cf = input.codiceFiscale.trim().toUpperCase().replace(/[\s.\-\/]/g, "");
  if (!/^[A-Z0-9]{11,16}$/.test(cf)) {
    return "Il codice fiscale è obbligatorio (11–16 caratteri).";
  }
  return null;
}

export function mapFornitoreRow(row: FornitoreRow): Fornitore {
  const snap = (row.enrichment_snapshot ?? {}) as Record<string, unknown>;
  const cfFromSnap =
    typeof snap.codiceFiscale === "string" ? snap.codiceFiscale : "";
  return {
    id: row.id,
    codiceTarga: row.codice_targa,
    ragioneSociale: row.ragione_sociale,
    partitaIva: row.partita_iva,
    codiceFiscale: row.codice_fiscale || cfFromSnap || "",
    email: row.email ?? "",
    pec: row.pec ?? "",
    sdiCode: row.sdi_code ?? "",
    telefono: row.telefono ?? "",
    sitoWeb: row.sito_web ?? "",
    tipologie: normalizeTipologie(row.tipologie),
    serviziOfferti: row.servizi_offerti ?? [],
    prodottiFornitore: row.prodotti_fornitore ?? [],
    sedeAmministrativa: {
      nazione: row.sede_amm_nazione,
      provincia: row.sede_amm_provincia,
      citta: row.sede_amm_citta,
      cap: row.sede_amm_cap,
      indirizzo: row.sede_amm_indirizzo,
    },
    sedeMagazzino: {
      nazione: row.sede_mag_nazione,
      provincia: row.sede_mag_provincia,
      citta: row.sede_mag_citta,
      cap: row.sede_mag_cap,
      indirizzo: row.sede_mag_indirizzo,
    },
    prodottiAcquistati: row.prodotti_acquistati ?? [],
    contributiOfferti: row.contributi_offerti ?? [],
    bioCertificatoPath: row.bio_certificato_path ?? "",
    bioCodice: row.bio_codice ?? "",
    createdAt: row.created_at,
  };
}

export function formatSedeBreve(sede: SedeFornitore): string {
  const parts = [sede.citta, sede.provincia, sede.nazione].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function bioCertificatoStoragePath(fornitoreId: string): string {
  return `${fornitoreId}/certificato-bio.pdf`;
}

/** Proxy volume acquisto: n. prodotti/materie collegati al fornitore. */
export type FornitoriVolumeFilter = "" | "0" | "1-3" | "4+";

export type FornitoriFilters = {
  letter: string;
  citta: string;
  query: string;
  volume: FornitoriVolumeFilter;
  /** Filtro offerta: servizio / prodotto / materia_prima */
  tipology: FornitoreTipologia | "";
};

export function emptyFornitoriFilters(): FornitoriFilters {
  return {
    letter: "",
    citta: "",
    query: "",
    volume: "",
    tipology: "",
  };
}

export function hasActiveFornitoriFilters(filters: FornitoriFilters): boolean {
  return (
    Boolean(filters.letter) ||
    Boolean(filters.citta.trim()) ||
    Boolean(filters.query.trim()) ||
    Boolean(filters.volume) ||
    Boolean(filters.tipology)
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function volumeAcquistoOf(fornitore: Fornitore): number {
  return (
    fornitore.prodottiAcquistati.length +
    fornitore.serviziOfferti.length +
    fornitore.prodottiFornitore.length +
    fornitore.contributiOfferti.length
  );
}

export function filterFornitoriByTipologia(
  fornitori: Fornitore[],
  tipologia: FornitoreTipologia | null
): Fornitore[] {
  if (!tipologia) return fornitori;
  return fornitori.filter((f) => f.tipologie.includes(tipologia));
}

function matchesVolume(
  count: number,
  volume: FornitoriVolumeFilter
): boolean {
  if (!volume) return true;
  if (volume === "0") return count === 0;
  if (volume === "1-3") return count >= 1 && count <= 3;
  if (volume === "4+") return count >= 4;
  return true;
}

export function filterFornitori(
  fornitori: Fornitore[],
  filters: FornitoriFilters
): Fornitore[] {
  const letter = filters.letter.trim().toUpperCase();
  const cittaQ = normalizeSearch(filters.citta);
  const q = normalizeSearch(filters.query);

  return fornitori.filter((f) => {
    if (letter) {
      const initial = normalizeSearch(f.ragioneSociale).charAt(0).toUpperCase();
      if (initial !== letter) return false;
    }

    if (cittaQ) {
      const cittaAmm = normalizeSearch(f.sedeAmministrativa.citta);
      const cittaMag = normalizeSearch(f.sedeMagazzino.citta);
      if (!cittaAmm.includes(cittaQ) && !cittaMag.includes(cittaQ)) {
        return false;
      }
    }

    if (q) {
      const haystack = [
        f.ragioneSociale,
        f.partitaIva,
        f.codiceFiscale,
        f.codiceTarga,
        f.sedeAmministrativa.citta,
        f.sedeAmministrativa.provincia,
        f.sedeMagazzino.citta,
        f.bioCodice,
        ...f.tipologie,
        ...f.prodottiAcquistati,
        ...f.serviziOfferti,
        ...f.prodottiFornitore,
        ...f.contributiOfferti,
      ]
        .map(normalizeSearch)
        .join(" ");
      if (!haystack.includes(q)) return false;
    }

    if (!matchesVolume(volumeAcquistoOf(f), filters.volume)) return false;

    if (filters.tipology && !f.tipologie.includes(filters.tipology)) {
      return false;
    }

    return true;
  });
}

/** Etichette offerta per colonna elenco (Servizi, Prodotti, …). */
export function formatFornitoreOfferta(tipologie: FornitoreTipologia[]): string {
  if (!tipologie.length) return "—";
  return tipologie.map(labelFornitoreTipologia).join(", ");
}

export function uniqueFornitoriCitta(fornitori: Fornitore[]): string[] {
  const set = new Set<string>();
  for (const f of fornitori) {
    const a = f.sedeAmministrativa.citta.trim();
    const m = f.sedeMagazzino.citta.trim();
    if (a) set.add(a);
    if (m) set.add(m);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

export type FornitoreSuggestion = {
  id: string;
  label: string;
  meta: string;
};

/** Suggerimenti istantanei mentre si digita. */
export function suggestFornitori(
  fornitori: Fornitore[],
  query: string,
  limit = 8
): FornitoreSuggestion[] {
  const q = normalizeSearch(query);
  if (q.length < 1) return [];

  return fornitori
    .map((f) => {
      const fields = [
        f.ragioneSociale,
        f.codiceTarga,
        f.partitaIva,
        f.sedeAmministrativa.citta,
        f.sedeMagazzino.citta,
      ];
      const hit = fields.find((field) => normalizeSearch(field).includes(q));
      if (!hit) return null;
      return {
        id: f.id,
        label: f.ragioneSociale,
        meta: [f.codiceTarga, f.sedeAmministrativa.citta || "—"]
          .filter(Boolean)
          .join(" · "),
      } satisfies FornitoreSuggestion;
    })
    .filter((item): item is FornitoreSuggestion => Boolean(item))
    .slice(0, limit);
}

export const FORNITORI_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
