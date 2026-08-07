import type {
  ClienteConsegnaAltraAziendaRow,
  ClienteRow,
} from "@/types/database";
import {
  emptySede,
  formatSedeBreve,
  normalizeSede,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";

export type SedeCliente = SedeFornitore;

export type ConsegnaAltraAzienda = SedeCliente & {
  ragioneSociale: string;
};

export type Cliente = {
  id: string;
  codiceTarga: string;
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodottiAcquistati: string[];
  createdAt: string;
};

export type ClienteInput = {
  codiceTarga?: string;
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodottiAcquistati: string[];
};

export { emptySede, formatSedeBreve };

export function emptyConsegnaAltraAzienda(): ConsegnaAltraAzienda {
  return {
    ragioneSociale: "",
    ...emptySede(),
  };
}

export function normalizeConsegnaAltraAzienda(
  item: ConsegnaAltraAzienda
): ConsegnaAltraAzienda {
  return {
    ragioneSociale: item.ragioneSociale.trim(),
    ...normalizeSede(item),
  };
}

function isConsegnaComplete(item: ConsegnaAltraAzienda): boolean {
  return Boolean(
    item.ragioneSociale.trim() &&
      item.nazione.trim() &&
      item.provincia.trim() &&
      item.citta.trim() &&
      item.cap.trim() &&
      item.indirizzo.trim()
  );
}

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
    consegneAltraAzienda: (input.consegneAltraAzienda ?? [])
      .map(normalizeConsegnaAltraAzienda)
      .filter(isConsegnaComplete),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
  };
}

export function consegneToDb(
  items: ConsegnaAltraAzienda[]
): ClienteConsegnaAltraAziendaRow[] {
  return items.map((item) => ({
    ragione_sociale: item.ragioneSociale,
    nazione: item.nazione,
    provincia: item.provincia,
    citta: item.citta,
    cap: item.cap,
    indirizzo: item.indirizzo,
  }));
}

function mapConsegnaRow(
  row: ClienteConsegnaAltraAziendaRow | Record<string, unknown>
): ConsegnaAltraAzienda {
  const r = row as ClienteConsegnaAltraAziendaRow;
  return {
    ragioneSociale: String(r.ragione_sociale ?? ""),
    nazione: String(r.nazione ?? ""),
    provincia: String(r.provincia ?? ""),
    citta: String(r.citta ?? ""),
    cap: String(r.cap ?? ""),
    indirizzo: String(r.indirizzo ?? ""),
  };
}

export function mapClienteRow(row: ClienteRow): Cliente {
  const rawConsegne = Array.isArray(row.consegne_altra_azienda)
    ? row.consegne_altra_azienda
    : [];

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
    consegneAltraAzienda: rawConsegne.map(mapConsegnaRow),
    prodottiAcquistati: row.prodotti_acquistati ?? [],
    createdAt: row.created_at,
  };
}
