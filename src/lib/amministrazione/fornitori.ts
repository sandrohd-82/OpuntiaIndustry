import type { FornitoreRow } from "@/types/database";

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
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
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
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
  bioCertificatoPath?: string;
  bioCodice?: string;
  /** Se true, rimuove il PDF bio esistente (senza sostituirlo). */
  removeBioCertificato?: boolean;
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
    partitaIva: input.partitaIva.trim(),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
    bioCertificatoPath: input.bioCertificatoPath?.trim() ?? "",
    bioCodice: input.bioCodice?.trim() ?? "",
    removeBioCertificato: Boolean(input.removeBioCertificato),
  };
}

export function mapFornitoreRow(row: FornitoreRow): Fornitore {
  return {
    id: row.id,
    codiceTarga: row.codice_targa,
    ragioneSociale: row.ragione_sociale,
    partitaIva: row.partita_iva,
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
