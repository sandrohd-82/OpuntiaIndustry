import type { ClienteRow } from "@/types/database";
import {
  emptySede,
  formatSedeBreve,
  normalizeSede,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";

export type SedeCliente = SedeFornitore;

export type Cliente = {
  id: string;
  codiceTarga: string;
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  prodottiAcquistati: string[];
  createdAt: string;
};

export type ClienteInput = {
  codiceTarga?: string;
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  prodottiAcquistati: string[];
};

export { emptySede, formatSedeBreve };

export function normalizeClienteInput(input: ClienteInput): ClienteInput {
  const codice = input.codiceTarga?.trim().toUpperCase();
  return {
    codiceTarga:
      codice && /^C[0-9A-F]{3}$/.test(codice) && codice !== "C000"
        ? codice
        : undefined,
    ragioneSociale: input.ragioneSociale.trim(),
    partitaIva: input.partitaIva.trim(),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
  };
}

export function mapClienteRow(row: ClienteRow): Cliente {
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
    createdAt: row.created_at,
  };
}
