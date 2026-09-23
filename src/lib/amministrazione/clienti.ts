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
import {
  commercialeAssegnazioneSearchText,
  formatCommercialeAssegnazione,
  matchesCommercialeArea,
} from "@/lib/auth/commerciale";
import { normalizeContattiGenerici } from "@/lib/amministrazione/contatti-generici";
import {
  provinciaInRegione,
  regioneOfProvincia,
  sameProvincia,
} from "@/lib/address/province-regioni";
import type { ClientePossibileTrattativa } from "@/lib/promemorie-e-note/trattativa";
import type {
  AnagraficaBrandInput,
  AnagraficaSedeInput,
} from "@/lib/amministrazione/anagrafica-extra";
import {
  firstSedeOfTipo,
  primarySedeAddress,
} from "@/lib/amministrazione/anagrafica-extra";

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
  emailGeneriche: string[];
  telefoniGenerici: string[];
  sitiWebGenerici: string[];
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodottiAcquistati: string[];
  createdAt: string;
  createdBy: string | null;
  commercialeId: string | null;
  commercialeNome: string;
  commercialeGrado: "senior" | "professional" | "executive" | null;
  /** Solo possibile cliente: stato trattativa commerciale. */
  trattativa?: ClientePossibileTrattativa;
  /** Prenotazione cancellazione in attesa di Super Admin. */
  cancellazionePrenotata?: boolean;
  cancellazioneId?: string | null;
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
  emailGeneriche?: string[];
  telefoniGenerici?: string[];
  sitiWebGenerici?: string[];
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodottiAcquistati: string[];
  /** Se ripescata da archivio: id riga clienti_archivio da chiudere al salvataggio. */
  archivioId?: string | null;
  /** Solo in modifica Super Admin: null = azienda, uuid = commerciale. */
  commercialeId?: string | null;
  /** Solo possibile cliente. */
  trattativa?: ClientePossibileTrattativa;
  sedi?: AnagraficaSedeInput[];
  brand?: AnagraficaBrandInput[];
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
    ...normalizeContattiGenerici(input),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    consegneAltraAzienda: (input.consegneAltraAzienda ?? [])
      .map(normalizeConsegnaAltraAzienda)
      .filter(isConsegnaComplete),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
    archivioId: input.archivioId,
    commercialeId: input.commercialeId,
    trattativa: input.trattativa,
    sedi: input.sedi,
    brand: input.brand,
  };
}

export function applySediToLegacy(input: ClienteInput): ClienteInput {
  if (!input.sedi?.length) return input;
  const mapped = input.sedi.map((s, i) => ({
    id: s.id ?? `tmp-${i}`,
    tipo: s.tipo,
    nazione: s.nazione ?? "",
    provincia: s.provincia ?? "",
    citta: s.citta ?? "",
    cap: s.cap ?? "",
    indirizzo: s.indirizzo ?? "",
    sortOrder: s.sortOrder ?? i,
  }));
  return {
    ...input,
    sedeAmministrativa: primarySedeAddress(mapped),
    sedeMagazzino: firstSedeOfTipo(mapped, "magazzino"),
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

export function mapClienteRow(
  row: ClienteRow,
  commerciale?:
    | {
        nome?: string;
        grado?: "senior" | "professional" | "executive" | null;
      }
    | number
): Cliente {
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
    ...normalizeContattiGenerici({
      emailGeneriche: row.email_generiche,
      telefoniGenerici: row.telefoni_generici,
      sitiWebGenerici: row.siti_web_generici,
    }),
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
    createdBy: row.created_by ?? null,
    commercialeId: row.commerciale_id ?? null,
    commercialeNome:
      typeof commerciale === "object" && commerciale
        ? (commerciale.nome ?? "")
        : "",
    commercialeGrado:
      typeof commerciale === "object" && commerciale
        ? (commerciale.grado ?? null)
        : null,
    cancellazionePrenotata: false,
    cancellazioneId: null,
  };
}

/** Proxy volume acquisto: n. prodotti propri collegati al cliente. */
export type ClientiVolumeFilter = "" | "0" | "1-3" | "4+";

export type ClientiFilters = {
  letter: string;
  regione: string;
  provincia: string;
  citta: string;
  query: string;
  volume: ClientiVolumeFilter;
  /** "" = tutte, "azienda" = senza commerciale, altrimenti uuid. */
  commercialeArea: string;
};

export function emptyClientiFilters(
  defaults?: Partial<Pick<ClientiFilters, "commercialeArea">>
): ClientiFilters {
  return {
    letter: "",
    regione: "",
    provincia: "",
    citta: "",
    query: "",
    volume: "",
    commercialeArea: defaults?.commercialeArea ?? "",
  };
}

export function hasActiveClientiFilters(
  filters: ClientiFilters,
  baseline?: Partial<Pick<ClientiFilters, "commercialeArea">>
): boolean {
  const empty = emptyClientiFilters(baseline);
  return (
    Boolean(filters.letter) ||
    Boolean(filters.regione?.trim()) ||
    Boolean(filters.provincia?.trim()) ||
    Boolean(filters.citta.trim()) ||
    Boolean(filters.query.trim()) ||
    Boolean(filters.volume) ||
    filters.commercialeArea.trim() !== empty.commercialeArea.trim()
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Record minimo per gli stessi filtri di ricerca clienti / possibili. */
export type AnagraficaFiltroInput = {
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  codiceTarga?: string;
  email?: string;
  telefono?: string;
  sedeAmministrativa: { citta: string; provincia?: string };
  sedeMagazzino?: { citta: string; provincia?: string };
  consegneAltraAzienda?: Array<{
    ragioneSociale?: string;
    citta: string;
    provincia?: string;
  }>;
  prodottiAcquistati?: string[];
  prodottiInteressati?: string[];
  commercialeId: string | null;
  commercialeNome?: string | null;
  commercialeGrado?: "senior" | "professional" | "executive" | null;
};

function prodottiOf(item: AnagraficaFiltroInput): string[] {
  return item.prodottiAcquistati ?? item.prodottiInteressati ?? [];
}

export function volumeAcquistoClienteOf(cliente: AnagraficaFiltroInput): number {
  return prodottiOf(cliente).length;
}

function matchesVolume(count: number, volume: ClientiVolumeFilter): boolean {
  if (!volume) return true;
  if (volume === "0") return count === 0;
  if (volume === "1-3") return count >= 1 && count <= 3;
  if (volume === "4+") return count >= 4;
  return true;
}

function anagraficaProvince(cliente: AnagraficaFiltroInput): string[] {
  return [
    cliente.sedeAmministrativa.provincia,
    cliente.sedeMagazzino?.provincia,
    ...(cliente.consegneAltraAzienda ?? []).map((sede) => sede.provincia),
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
}

function anagraficaCitta(cliente: AnagraficaFiltroInput): string[] {
  return [
    cliente.sedeAmministrativa.citta,
    cliente.sedeMagazzino?.citta,
    ...(cliente.consegneAltraAzienda ?? []).map((sede) => sede.citta),
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
}

function clienteMatchesGeo(
  cliente: AnagraficaFiltroInput,
  filters: Pick<ClientiFilters, "regione" | "provincia" | "citta">
): boolean {
  const province = anagraficaProvince(cliente);
  const regione = filters.regione?.trim() ?? "";
  const provincia = filters.provincia?.trim() ?? "";
  const citta = normalizeSearch(filters.citta);

  if (regione && !province.some((value) => provinciaInRegione(value, regione))) {
    return false;
  }
  if (provincia && !province.some((value) => sameProvincia(value, provincia))) {
    return false;
  }
  if (
    citta &&
    !anagraficaCitta(cliente).some((value) =>
      normalizeSearch(value).includes(citta)
    )
  ) {
    return false;
  }
  return true;
}

export function filterClienti<T extends AnagraficaFiltroInput>(
  clienti: T[],
  filters: ClientiFilters
): T[] {
  const letter = filters.letter.trim().toUpperCase();
  const q = normalizeSearch(filters.query);

  return clienti.filter((c) => {
    if (letter) {
      const initial = normalizeSearch(c.ragioneSociale).charAt(0).toUpperCase();
      if (initial !== letter) return false;
    }

    if (!clienteMatchesGeo(c, filters)) return false;

    if (q) {
      const haystack = [
        c.ragioneSociale,
        c.partitaIva,
        c.codiceFiscale,
        c.codiceTarga ?? "",
        c.email ?? "",
        c.telefono ?? "",
        c.sedeAmministrativa.citta,
        c.sedeAmministrativa.provincia ?? "",
        c.sedeMagazzino?.citta ?? "",
        c.sedeMagazzino?.provincia ?? "",
        commercialeAssegnazioneSearchText(c),
        ...(c.consegneAltraAzienda ?? []).flatMap((consegna) => [
          consegna.ragioneSociale ?? "",
          consegna.citta,
          consegna.provincia ?? "",
        ]),
        ...prodottiOf(c),
      ]
        .map(normalizeSearch)
        .join(" ");
      if (!haystack.includes(q)) return false;
    }

    if (!matchesVolume(volumeAcquistoClienteOf(c), filters.volume)) {
      return false;
    }

    if (!matchesCommercialeArea(c, filters.commercialeArea)) {
      return false;
    }

    return true;
  });
}

export function uniqueClientiCitta(
  clienti: AnagraficaFiltroInput[],
  geo?: Pick<ClientiFilters, "regione" | "provincia">
): string[] {
  const set = new Set<string>();
  for (const c of clienti) {
    if (geo && !clienteMatchesGeo(c, { ...geo, citta: "" })) continue;
    for (const citta of anagraficaCitta(c)) set.add(citta);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

export function uniqueClientiProvince(
  clienti: AnagraficaFiltroInput[],
  regione = ""
): string[] {
  const set = new Set<string>();
  const wanted = regione.trim();
  for (const c of clienti) {
    for (const provincia of anagraficaProvince(c)) {
      if (wanted && !provinciaInRegione(provincia, wanted)) continue;
      set.add(provincia);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

export function uniqueClientiRegioni(clienti: AnagraficaFiltroInput[]): string[] {
  const set = new Set<string>();
  for (const c of clienti) {
    for (const provincia of anagraficaProvince(c)) {
      const regione = regioneOfProvincia(provincia);
      if (regione) set.add(regione);
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
  clienti: AnagraficaFiltroInput[],
  query: string,
  limit = 8
): ClienteSuggestion[] {
  const q = normalizeSearch(query);
  if (q.length < 1) return [];

  return clienti
    .map((c) => {
      const fields = [
        c.ragioneSociale,
        c.codiceTarga ?? "",
        c.partitaIva,
        c.codiceFiscale,
        c.email ?? "",
        c.sedeAmministrativa.citta,
        c.sedeAmministrativa.provincia ?? "",
        c.sedeMagazzino?.citta ?? "",
        c.sedeMagazzino?.provincia ?? "",
        commercialeAssegnazioneSearchText(c),
        ...(c.consegneAltraAzienda ?? []).map((x) => x.ragioneSociale ?? ""),
      ];
      const hit = fields.find((field) => normalizeSearch(field).includes(q));
      if (!hit) return null;
      return {
        id: c.id,
        label: c.ragioneSociale,
        meta: [
          c.codiceTarga,
          formatCommercialeAssegnazione(c),
          c.sedeAmministrativa.citta || "—",
        ]
          .filter(Boolean)
          .join(" · "),
      } satisfies ClienteSuggestion;
    })
    .filter((item): item is ClienteSuggestion => Boolean(item))
    .slice(0, limit);
}

export const CLIENTI_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
