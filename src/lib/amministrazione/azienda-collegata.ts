import { formatSedeBreve, type Cliente } from "@/lib/amministrazione/clienti";
import { compareSortValues, type SortDir } from "@/lib/ui/list-sort";

function normalizeVatKey(vat: string): string {
  let key = vat.replace(/[\s.\-/]/g, "").toUpperCase();
  if (key.startsWith("IT") && key.length > 2) key = key.slice(2);
  return key;
}

/** Scelte fatte prima di aprire la scheda figlia. */
export type CollegamentoScelte = {
  inviaPreventivi: boolean;
  fatturare: boolean;
  inviaCampionature: boolean;
  inviaProdotti: boolean;
  tipologia: string;
};

export type CollegamentoPreferenza =
  | "preventivi"
  | "fatture"
  | "campionature"
  | "prodotti";

export type AziendaCollegabile = {
  id: string;
  aziendaMadreId: string | null;
  inviaPreventivi: boolean;
  fatturare: boolean;
  inviaCampionature: boolean;
  inviaProdotti: boolean;
  tipologiaRispettoMadre: string;
};

export function campiCollegamentoVuoti() {
  return {
    aziendaMadreId: null as string | null,
    inviaPreventivi: true,
    fatturare: true,
    inviaCampionature: true,
    inviaProdotti: true,
    tipologiaRispettoMadre: "",
  };
}

export function collegamentoAttivo(
  row: AziendaCollegabile,
  preferenza: CollegamentoPreferenza
): boolean {
  if (!row.aziendaMadreId) return false;
  if (preferenza === "preventivi") return row.inviaPreventivi;
  if (preferenza === "fatture") return row.fatturare;
  if (preferenza === "campionature") return row.inviaCampionature;
  return row.inviaProdotti;
}

export function figlioConsigliato<T extends AziendaCollegabile>(
  rows: T[],
  madreId: string,
  preferenza: CollegamentoPreferenza
): T | null {
  return (
    rows.find(
      (row) => row.aziendaMadreId === madreId && collegamentoAttivo(row, preferenza)
    ) ?? null
  );
}

/** Prima scelta sulla madre: propone la figlia consigliata. Una seconda scelta sulla madre la tiene. */
export function sceltaConConsiglio<
  T extends AziendaCollegabile & { ragioneSociale: string },
>(
  rows: T[],
  picked: T,
  preferenza: CollegamentoPreferenza | undefined,
  alreadyBouncedFrom: string | null
): { next: T; bouncedFrom: string | null; notice: string | null } {
  if (!preferenza || picked.aziendaMadreId) {
    return { next: picked, bouncedFrom: null, notice: null };
  }
  const child = figlioConsigliato(rows, picked.id, preferenza);
  if (!child || alreadyBouncedFrom === picked.id) {
    return { next: picked, bouncedFrom: null, notice: null };
  }
  return {
    next: child,
    bouncedFrom: picked.id,
    notice: `Consigliato: ${child.ragioneSociale}. Puoi scegliere un’altra azienda.`,
  };
}

export function etichetteConsiglio(scelte: CollegamentoScelte): string[] {
  const out: string[] = [];
  if (scelte.inviaPreventivi) out.push("Preventivi");
  if (scelte.fatturare) out.push("Fatture");
  if (scelte.inviaCampionature) out.push("Campionature");
  if (scelte.inviaProdotti) out.push("Prodotti acquistati");
  return out;
}

export type ElencoCollegatoRiga<T> = {
  item: T;
  nested: boolean;
  hasFiglie: boolean;
};

/** Madre e figlie restano insieme: la figlia è sempre subito sotto, anche con i filtri. */
export function elencoCollegato<T extends { id: string; aziendaMadreId: string | null }>(
  all: T[],
  visible: T[]
): ElencoCollegatoRiga<T>[] {
  const visibleIds = new Set(visible.map((item) => item.id));
  const keep = new Set(visibleIds);
  for (const item of visible) {
    if (item.aziendaMadreId) keep.add(item.aziendaMadreId);
  }
  for (const item of all) {
    if (item.aziendaMadreId && visibleIds.has(item.aziendaMadreId)) {
      keep.add(item.id);
    }
  }
  const shown = all.filter((item) => keep.has(item.id));
  const ids = new Set(shown.map((item) => item.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of shown) {
    if (item.aziendaMadreId && ids.has(item.aziendaMadreId)) {
      const list = children.get(item.aziendaMadreId) ?? [];
      list.push(item);
      children.set(item.aziendaMadreId, list);
    } else {
      roots.push(item);
    }
  }
  const out: ElencoCollegatoRiga<T>[] = [];
  for (const root of roots) {
    const figlie = children.get(root.id) ?? [];
    out.push({ item: root, nested: false, hasFiglie: figlie.length > 0 });
    for (const child of figlie) {
      out.push({ item: child, nested: true, hasFiglie: false });
    }
  }
  return out;
}

/** Ordina i gruppi madre/figlie. Le figlie restano sotto la madre. */
export function sortElencoCollegato<T>(
  rows: ElencoCollegatoRiga<T>[],
  dir: SortDir,
  valueOf: (item: T) => string | number | null | undefined
): ElencoCollegatoRiga<T>[] {
  const groups: {
    root: ElencoCollegatoRiga<T>;
    children: ElencoCollegatoRiga<T>[];
  }[] = [];
  for (const row of rows) {
    if (!row.nested || groups.length === 0) {
      groups.push({ root: row, children: [] });
    } else {
      groups[groups.length - 1].children.push(row);
    }
  }
  const by = (a: T, b: T) => compareSortValues(valueOf(a), valueOf(b), dir);
  groups.sort((a, b) => by(a.root.item, b.root.item));
  for (const group of groups) {
    group.children.sort((a, b) => by(a.item, b.item));
  }
  return groups.flatMap((group) => [group.root, ...group.children]);
}

type FiscalRow = {
  id: string;
  aziendaMadreId: string | null;
  partitaIva: string;
  codiceFiscale: string;
  codiceTarga?: string;
  ragioneSociale: string;
};

function sameFamilyValue(
  rows: FiscalRow[],
  value: string,
  madreId: string,
  field: "partitaIva" | "codiceFiscale"
): boolean {
  const key = normalizeVatKey(value);
  const madre = rows.find((row) => row.id === madreId);
  if (!madre || !key) return false;
  return normalizeVatKey(madre[field]) === key;
}

/** Stessa P.IVA o CF consentiti solo dentro la famiglia della madre, se coincidono con i suoi. */
export function fiscalConflictMessage(input: {
  rows: FiscalRow[];
  selfId?: string;
  madreId?: string | null;
  partitaIva: string;
  codiceFiscale: string;
}): string | null {
  const madreId = input.madreId?.trim() || null;
  if (madreId && !input.rows.some((row) => row.id === madreId)) {
    return "Azienda madre non trovata o non più attiva.";
  }

  const check = (
    field: "partitaIva" | "codiceFiscale",
    label: string
  ): string | null => {
    const key = normalizeVatKey(input[field]);
    if (!key) return null;
    const shared =
      Boolean(madreId) && sameFamilyValue(input.rows, input[field], madreId as string, field);
    for (const row of input.rows) {
      if (input.selfId && row.id === input.selfId) continue;
      if (normalizeVatKey(row[field]) !== key) continue;
      if (shared && madreId && (row.aziendaMadreId ?? row.id) === madreId) {
        continue;
      }
      if (
        !madreId &&
        input.selfId &&
        row.aziendaMadreId === input.selfId
      ) {
        continue;
      }
      const who = row.codiceTarga
        ? `${row.codiceTarga} — ${row.ragioneSociale}`
        : row.ragioneSociale;
      return `${label} già presente su ${who}.`;
    }
    return null;
  };

  return check("partitaIva", "P. IVA") ?? check("codiceFiscale", "Codice fiscale");
}

export type AziendaEsistenteCandidata = {
  id: string;
  ragioneSociale: string;
  codice: string;
  partitaIva: string;
  hasFiglie: boolean;
};

/** Aziende già in elenco che possono entrare nella famiglia, un solo livello. */
export function elencoPerCollegamentoEsistente<
  T extends {
    id: string;
    ragioneSociale: string;
    partitaIva: string;
    isPrivato: boolean;
    aziendaMadreId: string | null;
  },
>(
  all: T[],
  origineId: string,
  codiceDi: (row: T) => string
): { origineHaFiglie: boolean; candidate: AziendaEsistenteCandidata[] } {
  const origineHaFiglie = all.some((row) => row.aziendaMadreId === origineId);
  const conFiglie = new Set(
    all.flatMap((row) => (row.aziendaMadreId ? [row.aziendaMadreId] : []))
  );
  const candidate = all
    .filter(
      (row) =>
        row.id !== origineId &&
        !row.isPrivato &&
        !row.aziendaMadreId &&
        !(origineHaFiglie && conFiglie.has(row.id))
    )
    .map((row) => ({
      id: row.id,
      ragioneSociale: row.ragioneSociale,
      codice: codiceDi(row),
      partitaIva: row.partitaIva,
      hasFiglie: conFiglie.has(row.id),
    }))
    .sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale, "it"));
  return { origineHaFiglie, candidate };
}

export function anteprimaSediMadre(madre: Cliente): string {
  const legale = formatSedeBreve(madre.sedeAmministrativa);
  const mag = formatSedeBreve(madre.sedeMagazzino);
  return `Sede legale: ${legale}. Sede magazzino: ${mag}.`;
}
