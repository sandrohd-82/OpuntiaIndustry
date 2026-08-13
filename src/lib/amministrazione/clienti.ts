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
  codiceFiscale: string;
  isPrivato: boolean;
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
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
  codiceFiscale: string;
  isPrivato: boolean;
  email?: string;
  pec?: string;
  sdiCode?: string;
  telefono?: string;
  sitoWeb?: string;
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodottiAcquistati: string[];
  /** Se ripescata da archivio: id riga clienti_archivio da chiudere al salvataggio. */
  archivioId?: string | null;
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
  const isPrivato = Boolean(input.isPrivato);
  const partitaIva = isPrivato ? "" : input.partitaIva.trim();
  const codiceFiscale = (input.codiceFiscale ?? "").trim();
  return {
    codiceTarga:
      codice && /^C[0-9A-F]{3}$/.test(codice) && codice !== "C000"
        ? codice
        : undefined,
    ragioneSociale: input.ragioneSociale.trim(),
    partitaIva,
    codiceFiscale,
    isPrivato,
    email: (input.email ?? "").trim(),
    pec: (input.pec ?? "").trim(),
    sdiCode: (input.sdiCode ?? "").trim(),
    telefono: (input.telefono ?? "").trim(),
    sitoWeb: (input.sitoWeb ?? "").trim(),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    consegneAltraAzienda: (input.consegneAltraAzienda ?? [])
      .map(normalizeConsegnaAltraAzienda)
      .filter(isConsegnaComplete),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
    archivioId: input.archivioId,
  };
}

/** Validazione business: azienda → P.IVA+CF obbligatori; privato → CF facoltativo. */
export function validateClienteFiscali(
  input: Pick<ClienteInput, "ragioneSociale" | "partitaIva" | "codiceFiscale" | "isPrivato">
): string | null {
  if (!input.ragioneSociale.trim()) {
    return "La ragione sociale è obbligatoria.";
  }
  if (input.isPrivato) {
    return null;
  }
  if (!input.partitaIva.trim()) {
    return "La partita IVA è obbligatoria per i clienti azienda.";
  }
  if (!input.codiceFiscale.trim()) {
    return "Il codice fiscale è obbligatorio per i clienti azienda.";
  }
  return null;
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
    partitaIva: row.partita_iva ?? "",
    codiceFiscale: row.codice_fiscale ?? "",
    isPrivato: Boolean(row.is_privato),
    email: row.email ?? "",
    pec: row.pec ?? "",
    sdiCode: row.sdi_code ?? "",
    telefono: row.telefono ?? "",
    sitoWeb: row.sito_web ?? "",
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

/** Proxy volume acquisto: n. prodotti propri collegati al cliente. */
export type ClientiVolumeFilter = "" | "0" | "1-3" | "4+";

export type ClientiFilters = {
  letter: string;
  citta: string;
  query: string;
  volume: ClientiVolumeFilter;
};

export function emptyClientiFilters(): ClientiFilters {
  return {
    letter: "",
    citta: "",
    query: "",
    volume: "",
  };
}

export function hasActiveClientiFilters(filters: ClientiFilters): boolean {
  return (
    Boolean(filters.letter) ||
    Boolean(filters.citta.trim()) ||
    Boolean(filters.query.trim()) ||
    Boolean(filters.volume)
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function volumeAcquistoClienteOf(cliente: Cliente): number {
  return cliente.prodottiAcquistati.length;
}

function matchesVolume(count: number, volume: ClientiVolumeFilter): boolean {
  if (!volume) return true;
  if (volume === "0") return count === 0;
  if (volume === "1-3") return count >= 1 && count <= 3;
  if (volume === "4+") return count >= 4;
  return true;
}

export function filterClienti(
  clienti: Cliente[],
  filters: ClientiFilters
): Cliente[] {
  const letter = filters.letter.trim().toUpperCase();
  const cittaQ = normalizeSearch(filters.citta);
  const q = normalizeSearch(filters.query);

  return clienti.filter((c) => {
    if (letter) {
      const initial = normalizeSearch(c.ragioneSociale).charAt(0).toUpperCase();
      if (initial !== letter) return false;
    }

    if (cittaQ) {
      const cittaAmm = normalizeSearch(c.sedeAmministrativa.citta);
      const cittaMag = normalizeSearch(c.sedeMagazzino.citta);
      const cittaConsegne = c.consegneAltraAzienda.some((consegna) =>
        normalizeSearch(consegna.citta).includes(cittaQ)
      );
      if (
        !cittaAmm.includes(cittaQ) &&
        !cittaMag.includes(cittaQ) &&
        !cittaConsegne
      ) {
        return false;
      }
    }

    if (q) {
      const haystack = [
        c.ragioneSociale,
        c.partitaIva,
        c.codiceFiscale,
        c.codiceTarga,
        c.sedeAmministrativa.citta,
        c.sedeAmministrativa.provincia,
        c.sedeMagazzino.citta,
        ...c.consegneAltraAzienda.flatMap((consegna) => [
          consegna.ragioneSociale,
          consegna.citta,
        ]),
        ...c.prodottiAcquistati,
      ]
        .map(normalizeSearch)
        .join(" ");
      if (!haystack.includes(q)) return false;
    }

    if (!matchesVolume(volumeAcquistoClienteOf(c), filters.volume)) {
      return false;
    }

    return true;
  });
}

export function uniqueClientiCitta(clienti: Cliente[]): string[] {
  const set = new Set<string>();
  for (const c of clienti) {
    const a = c.sedeAmministrativa.citta.trim();
    const m = c.sedeMagazzino.citta.trim();
    if (a) set.add(a);
    if (m) set.add(m);
    for (const consegna of c.consegneAltraAzienda) {
      const citta = consegna.citta.trim();
      if (citta) set.add(citta);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

export type ClienteSuggestion = {
  id: string;
  label: string;
  meta: string;
};

export function suggestClienti(
  clienti: Cliente[],
  query: string,
  limit = 8
): ClienteSuggestion[] {
  const q = normalizeSearch(query);
  if (q.length < 1) return [];

  return clienti
    .map((c) => {
      const fields = [
        c.ragioneSociale,
        c.codiceTarga,
        c.partitaIva,
        c.codiceFiscale,
        c.sedeAmministrativa.citta,
        c.sedeMagazzino.citta,
        ...c.consegneAltraAzienda.map((x) => x.ragioneSociale),
      ];
      const hit = fields.find((field) => normalizeSearch(field).includes(q));
      if (!hit) return null;
      return {
        id: c.id,
        label: c.ragioneSociale,
        meta: [c.codiceTarga, c.sedeAmministrativa.citta || "—"]
          .filter(Boolean)
          .join(" · "),
      } satisfies ClienteSuggestion;
    })
    .filter((item): item is ClienteSuggestion => Boolean(item))
    .slice(0, limit);
}

export const CLIENTI_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
