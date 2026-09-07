import { z } from "zod";

export const ORGANIGRAMMA_DOC_TIPI = [
  "cf_fronte",
  "cf_retro",
  "ci_fronte",
  "ci_retro",
  "corso",
  "certificato",
  "busta_paga",
  "fattura",
  "altro",
] as const;
export type OrganigrammaDocTipo = (typeof ORGANIGRAMMA_DOC_TIPI)[number];

export const ORGANIGRAMMA_PERMESSO_TIPI = [
  "ferie",
  "permesso",
  "malattia",
  "altro",
] as const;
export type OrganigrammaPermessoTipo = (typeof ORGANIGRAMMA_PERMESSO_TIPI)[number];

export const ORGANIGRAMMA_PERMESSO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
  "rifiutato",
] as const;
export type OrganigrammaPermessoStato =
  (typeof ORGANIGRAMMA_PERMESSO_STATI)[number];

export function docTipoLabel(tipo: OrganigrammaDocTipo): string {
  if (tipo === "cf_fronte") return "Codice fiscale fronte";
  if (tipo === "cf_retro") return "Codice fiscale retro";
  if (tipo === "ci_fronte") return "Carta d’identità fronte";
  if (tipo === "ci_retro") return "Carta d’identità retro";
  if (tipo === "corso") return "Corso";
  if (tipo === "certificato") return "Certificato";
  if (tipo === "busta_paga") return "Busta paga";
  if (tipo === "fattura") return "Fattura";
  return "Altro";
}

export function permessoTipoLabel(tipo: OrganigrammaPermessoTipo): string {
  if (tipo === "ferie") return "Ferie";
  if (tipo === "permesso") return "Permesso";
  if (tipo === "malattia") return "Malattia";
  return "Altro";
}

export type OrganigrammaMansione = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
};

export type OrganigrammaReparto = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
};

export type OrganigrammaPersona = {
  id: string;
  nome: string;
  cognome: string;
  codiceFiscale: string;
  cartaIdentita: string;
  userId: string | null;
  parentId: string | null;
  superioreIds: string[];
  sortOrder: number;
  fotoPath: string | null;
  fotoUrl: string | null;
  documentoStato: "bozza" | "approvato" | "chiuso";
  note: string;
  repartoId: string | null;
  repartoNome: string;
  inForza: boolean;
  cessatoAt: string | null;
  mansioni: OrganigrammaMansione[];
  figli?: OrganigrammaPersona[];
};

export type OrganigrammaCertificatoCatalogo = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  validitaAnniDefault: number;
};

export type OrganigrammaDocumento = {
  id: string;
  personaId: string;
  tipo: OrganigrammaDocTipo;
  titolo: string;
  periodo: string;
  note: string;
  fileName: string;
  mime: string;
  createdAt: string;
  catalogoId: string | null;
  dataRilascio: string | null;
  validitaAnni: number | null;
  dataScadenza: string | null;
};

export const CERTIFICATO_ALERT_LIVELLI = [
  "6mesi",
  "3mesi",
  "mese",
  "scaduto",
] as const;
export type CertificatoAlertLivello = (typeof CERTIFICATO_ALERT_LIVELLI)[number];

export type CertificatoScadenzaAlert = {
  personaId: string;
  personaNome: string;
  documentoId: string;
  titolo: string;
  dataScadenza: string;
  livello: CertificatoAlertLivello;
};

export function calcolaScadenzaCertificato(
  dataRilascio: string,
  validitaAnni: number
): string {
  const [y, m, d] = dataRilascio.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCFullYear(dt.getUTCFullYear() + validitaAnni);
  return dt.toISOString().slice(0, 10);
}

export function certificatoAlertLivello(
  dataScadenza: string,
  now = new Date()
): CertificatoAlertLivello | null {
  const [y, m, d] = dataScadenza.split("-").map(Number);
  const exp = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return "scaduto";
  if (days <= 31) return "mese";
  if (days <= 92) return "3mesi";
  if (days <= 183) return "6mesi";
  return null;
}

export function certificatoAlertLabel(livello: CertificatoAlertLivello): string {
  if (livello === "scaduto") return "Scaduto";
  if (livello === "mese") return "Scade entro un mese";
  if (livello === "3mesi") return "Scade entro 3 mesi";
  return "Scade entro 6 mesi";
}

export type ValiditaDocumento = "scaduto" | "in_essere";

export function validitaDocumentoLabel(stato: ValiditaDocumento): string {
  return stato === "scaduto" ? "Scaduto" : "In essere";
}

/** Confronta solo la data (YYYY-MM-DD) con oggi. null = nessuna scadenza. */
export function isDataScaduta(
  iso: string | null | undefined,
  now = new Date()
): boolean | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const exp = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return exp < today;
}

export function validitaDaScadenza(
  iso: string | null | undefined,
  opts?: { senzaFine?: boolean; now?: Date }
): ValiditaDocumento | null {
  if (opts?.senzaFine) return "in_essere";
  const scaduta = isDataScaduta(iso, opts?.now);
  if (scaduta === null) return null;
  return scaduta ? "scaduto" : "in_essere";
}

export type OrganigrammaAttivita = {
  id: string;
  personaId: string;
  azione: string;
  origine: string;
  actorNome: string;
  note: string;
  createdAt: string;
  areaNome: string;
  riferimento: string;
};

export type OrganigrammaPermesso = {
  id: string;
  personaId: string;
  tipo: OrganigrammaPermessoTipo;
  dal: string;
  al: string;
  note: string;
  documentoStato: OrganigrammaPermessoStato;
  createdAt: string;
};

export type PostoAutorizzato = {
  id: string;
  postoId: string;
  personaId: string;
  postoNome: string;
  areaNome: string;
  personaNome: string;
};

export type PostoOrganigrammaOption = {
  id: string;
  nome: string;
  areaNome: string;
};

export type PersonaMinima = {
  id: string;
  nome: string;
  cognome: string;
};

export const ORGANIGRAMMA_AZIONI = [
  "create",
  "update",
  "delete",
  "import_profile",
  "albero",
  "foto",
  "documento",
  "busta",
  "permesso",
  "autorizzazione",
  "cessazione",
  "certificato",
  "contratto",
  "export_pdf",
] as const;

/** Attività operative in azienda (non anagrafica/documenti). */
export const OPERATIVE_AZIONI = [
  "entrata_lavorazione",
  "uscita_lavorazione",
  "arresto",
  "iot",
  "evento_linea",
  "foglio",
  "assenza",
] as const;

export function attivitaPersonaLabel(azione: string): string {
  if (azione === "entrata_lavorazione") return "Entrata in lavorazione";
  if (azione === "uscita_lavorazione") return "Uscita da lavorazione";
  if (azione === "arresto") return "Arresto";
  if (azione === "iot") return "Comando IoT";
  if (azione === "evento_linea") return "Evento di linea";
  if (azione === "foglio") return "Foglio di lavorazione";
  if (azione === "assenza") return "Assenza / permesso";
  if (azione === "create") return "Creazione";
  if (azione === "update") return "Aggiornamento";
  if (azione === "delete") return "Rimozione";
  if (azione === "import_profile") return "Import da profilo";
  if (azione === "albero") return "Albero";
  if (azione === "foto") return "Foto";
  if (azione === "documento") return "Documento";
  if (azione === "busta") return "Busta paga";
  if (azione === "permesso") return "Permesso / ferie";
  if (azione === "autorizzazione") return "Autorizzazione postazione";
  if (azione === "cessazione") return "Stato in azienda";
  if (azione === "certificato") return "Certificato";
  if (azione === "contratto") return "Contratto";
  if (azione === "export_pdf") return "Export PDF scheda";
  return azione;
}

const emptyOr = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    schema.optional()
  );

export const personaInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(80),
  codiceFiscale: z
    .string()
    .trim()
    .toUpperCase()
    .max(16)
    .regex(/^([A-Z0-9]{16})?$/, "Codice fiscale: 16 caratteri")
    .optional()
    .default(""),
  cartaIdentita: z.string().trim().max(40).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
  mansioneIds: z.array(z.string().uuid()).optional().default([]),
  parentId: z.string().uuid().nullable().optional(),
  repartoId: emptyOr(z.string().uuid()),
});

export const personaUpdateSchema = personaInputSchema.extend({
  id: z.string().uuid(),
});

export const mansioneInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  descrizione: z.string().trim().max(400).optional().default(""),
});

export const mansioneUpdateSchema = mansioneInputSchema.extend({
  id: z.string().uuid(),
});

export const repartoInputSchema = mansioneInputSchema;
export const repartoUpdateSchema = mansioneUpdateSchema;

export const permessoInputSchema = z.object({
  personaId: z.string().uuid(),
  tipo: z.enum(ORGANIGRAMMA_PERMESSO_TIPI),
  dal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  al: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  note: z.string().trim().max(2000).optional().default(""),
});

export const attivitaPersonaFilterSchema = z.object({
  personaId: z.string().uuid(),
  dateFrom: emptyOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dateTo: emptyOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  azione: emptyOr(z.string().min(1).max(40)),
});

export const treeMoveSchema = z.object({
  personaId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().optional(),
});

export const treeReorderSchema = z.object({
  parentId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(2).max(200),
});

export const treeMoveManySchema = z.object({
  parentIds: z.array(z.string().uuid()).min(1).max(20),
  childIds: z.array(z.string().uuid()).min(1).max(80),
});

export const ORGANIGRAMMA_CONTRATTO_TIPI = [
  "tempo_indeterminato",
  "tempo_determinato",
  "collaborazione",
  "ingaggio",
  "stage",
  "altro",
] as const;
export type OrganigrammaContrattoTipo =
  (typeof ORGANIGRAMMA_CONTRATTO_TIPI)[number];

export const ORGANIGRAMMA_CONTRATTO_STATI = [
  "proposto",
  "accettato",
  "respinto",
] as const;
export type OrganigrammaContrattoStato =
  (typeof ORGANIGRAMMA_CONTRATTO_STATI)[number];

export type OrganigrammaContratto = {
  id: string;
  personaId: string;
  tipologia: OrganigrammaContrattoTipo;
  titolo: string;
  dataInizio: string;
  dataFine: string | null;
  importo: number | null;
  note: string;
  fileName: string;
  mime: string;
  documentoStato: OrganigrammaContrattoStato;
  tacitoRinnovo: boolean;
  rinnovatoDaId: string | null;
  versione: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export function contrattoTipoLabel(tipo: OrganigrammaContrattoTipo): string {
  if (tipo === "tempo_indeterminato") return "Tempo indeterminato";
  if (tipo === "tempo_determinato") return "Tempo determinato";
  if (tipo === "collaborazione") return "Collaborazione";
  if (tipo === "ingaggio") return "Ingaggio";
  if (tipo === "stage") return "Stage";
  return "Altro";
}

export function contrattoStatoLabel(stato: OrganigrammaContrattoStato): string {
  if (stato === "accettato") return "Accettato";
  if (stato === "respinto") return "Respinto";
  return "Proposto";
}

export function contrattoAlertLivello(
  dataFine: string | null,
  stato: OrganigrammaContrattoStato,
  now = new Date()
): "30gg" | "scaduto" | null {
  if (!dataFine || stato === "respinto" || stato === "proposto") return null;
  const [y, m, d] = dataFine.split("-").map(Number);
  const exp = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return "scaduto";
  if (days <= 30) return "30gg";
  return null;
}

export function contrattoAlertLabel(livello: "30gg" | "scaduto"): string {
  return livello === "scaduto" ? "Scaduto" : "Scade entro 30 giorni";
}

export function validitaContratto(c: {
  tipologia: OrganigrammaContrattoTipo;
  dataFine: string | null;
  documentoStato?: OrganigrammaContrattoStato;
  now?: Date;
}): ValiditaDocumento | null {
  if (c.documentoStato && c.documentoStato !== "accettato") return null;
  if (c.tipologia === "tempo_indeterminato") return "in_essere";
  return validitaDaScadenza(c.dataFine, { now: c.now }) ?? "in_essere";
}

function parseYmd(iso: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addOneDay(iso: string): string {
  const p = parseYmd(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function spanEndFromStart(
  nextStart: string,
  origStart: string,
  origEnd: string
): string {
  const ns = parseYmd(nextStart);
  const os = parseYmd(origStart);
  const oe = parseYmd(origEnd);
  if (!ns || !os || !oe) return nextStart;
  const y = ns.y + (oe.y - os.y);
  const last = new Date(Date.UTC(y, oe.m, 0)).getUTCDate();
  return formatYmd(y, oe.m, Math.min(oe.d, last));
}

/** Periodi successivi, stessa durata, fino a coprire oggi. */
export function periodiTacitoRinnovo(input: {
  origInizio: string;
  origFine: string;
  dopoFine?: string;
  now?: Date;
}): Array<{ dataInizio: string; dataFine: string }> {
  const dataInizio = input.origInizio;
  const dataFine = input.origFine;
  const now = input.now ?? new Date();
  const start = parseYmd(dataInizio);
  const end = parseYmd(dataFine);
  if (!start || !end || dataFine < dataInizio) return [];
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const lastEnd = input.dopoFine ?? dataFine;
  const last = parseYmd(lastEnd);
  if (!last) return [];
  const lastEndUtc = Date.UTC(last.y, last.m - 1, last.d);
  if (lastEndUtc >= today) return [];
  const out: Array<{ dataInizio: string; dataFine: string }> = [];
  let nextStart = addOneDay(lastEnd);
  for (let i = 0; i < 40; i++) {
    const nextEnd = spanEndFromStart(nextStart, dataInizio, dataFine);
    if (nextEnd < nextStart) break;
    out.push({ dataInizio: nextStart, dataFine: nextEnd });
    const ns = parseYmd(nextStart);
    const ne = parseYmd(nextEnd);
    if (!ns || !ne) break;
    const startUtc = Date.UTC(ns.y, ns.m - 1, ns.d);
    const endUtc = Date.UTC(ne.y, ne.m - 1, ne.d);
    if (startUtc <= today && today <= endUtc) break;
    if (endUtc >= today) break;
    nextStart = addOneDay(nextEnd);
  }
  return out;
}

export function puoApplicareTacitoRinnovo(c: {
  tipologia: OrganigrammaContrattoTipo;
  dataFine: string | null;
  documentoStato: OrganigrammaContrattoStato;
}): boolean {
  if (c.tipologia === "tempo_indeterminato") return false;
  if (!c.dataFine) return false;
  if (c.documentoStato === "respinto") return false;
  return true;
}

export function parseImportoContratto(
  raw: string
): { ok: true; value: number | undefined } | { ok: false } {
  const s = raw.trim();
  if (!s) return { ok: true, value: undefined };
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/\s/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

export const contrattoInputSchema = z
  .object({
    personaId: z.string().uuid(),
    tipologia: z.enum(ORGANIGRAMMA_CONTRATTO_TIPI),
    titolo: z.string().trim().min(1, "Titolo obbligatorio").max(200),
    dataInizio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inizio non valida"),
    dataFine: emptyOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data fine non valida")),
    importo: z.number().finite().nonnegative().optional(),
    note: z.string().trim().max(2000).optional().default(""),
    documentoStato: z.enum(ORGANIGRAMMA_CONTRATTO_STATI).optional().default("proposto"),
    tacitoRinnovo: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.tipologia === "tempo_indeterminato" && v.dataFine) {
      ctx.addIssue({
        code: "custom",
        message: "Il tempo indeterminato non ha data di fine.",
        path: ["dataFine"],
      });
    }
    if (v.dataFine && v.dataFine < v.dataInizio) {
      ctx.addIssue({
        code: "custom",
        message: "La data di fine non può precedere l’inizio.",
        path: ["dataFine"],
      });
    }
  });

export function personaLabel(p: { nome: string; cognome: string }): string {
  return `${p.cognome} ${p.nome}`.trim();
}

export function superioriDi(p: OrganigrammaPersona): string[] {
  if (p.superioreIds?.length) return p.superioreIds;
  return p.parentId ? [p.parentId] : [];
}

export type AlberoNodo = {
  id: string;
  kind: "persona" | "gruppo";
  membri: OrganigrammaPersona[];
  membriFigli: AlberoNodo[][];
  figli: AlberoNodo[];
};

export function nestPersone(items: OrganigrammaPersona[]): OrganigrammaPersona[] {
  const byId = new Map(items.map((p) => [p.id, { ...p, figli: [] as OrganigrammaPersona[] }]));
  const roots: OrganigrammaPersona[] = [];
  for (const p of byId.values()) {
    if (p.parentId && byId.has(p.parentId)) {
      byId.get(p.parentId)!.figli!.push(p);
    } else {
      roots.push(p);
    }
  }
  const sortFn = (a: OrganigrammaPersona, b: OrganigrammaPersona) =>
    a.sortOrder - b.sortOrder || a.cognome.localeCompare(b.cognome, "it");
  function sortTree(nodes: OrganigrammaPersona[]) {
    nodes.sort(sortFn);
    for (const n of nodes) sortTree(n.figli ?? []);
  }
  sortTree(roots);
  return roots;
}

export function nestAlbero(items: OrganigrammaPersona[]): AlberoNodo[] {
  const byId = new Map(items.map((p) => [p.id, p]));
  const sortPersone = (a: OrganigrammaPersona, b: OrganigrammaPersona) =>
    a.sortOrder - b.sortOrder || a.cognome.localeCompare(b.cognome, "it");

  function parentKey(ids: string[]): string {
    return [...ids].sort().join(",");
  }

  const byParents = new Map<string, OrganigrammaPersona[]>();
  const senzaSuperiori: OrganigrammaPersona[] = [];
  for (const p of items) {
    const parents = superioriDi(p).filter((id) => byId.has(id));
    if (!parents.length) {
      senzaSuperiori.push(p);
      continue;
    }
    const key = parentKey(parents);
    const cur = byParents.get(key) ?? [];
    cur.push(p);
    byParents.set(key, cur);
  }

  const groupSpecs: Array<{ parentIds: string[]; children: OrganigrammaPersona[] }> =
    [];
  const memberOfGroup = new Set<string>();
  for (const [key, children] of byParents) {
    const parentIds = key.split(",").filter(Boolean);
    if (parentIds.length < 2) continue;
    parentIds.forEach((id) => memberOfGroup.add(id));
    groupSpecs.push({ parentIds, children });
  }

  function hostOfMembers(parentIds: string[]): string | null {
    const hosts = parentIds.map((id) => {
      const m = byId.get(id);
      const host = m?.parentId ?? null;
      return host && byId.has(host) ? host : null;
    });
    if (hosts.length && hosts.every((h) => h === hosts[0])) return hosts[0];
    return null;
  }

  function buildPersonaNodo(p: OrganigrammaPersona): AlberoNodo {
    const exclusive = (byParents.get(p.id) ?? []).filter(
      (c) => !memberOfGroup.has(c.id)
    );
    exclusive.sort(sortPersone);
    const figli: AlberoNodo[] = exclusive.map((c) => buildPersonaNodo(c));
    for (const g of groupSpecs) {
      if (hostOfMembers(g.parentIds) === p.id) {
        figli.push(buildGruppoNodo(g));
      }
    }
    figli.sort((a, b) => {
      const aa = a.membri[0];
      const bb = b.membri[0];
      if (!aa || !bb) return 0;
      return sortPersone(aa, bb);
    });
    return {
      id: p.id,
      kind: "persona",
      membri: [p],
      membriFigli: [[]],
      figli,
    };
  }

  function buildGruppoNodo(g: {
    parentIds: string[];
    children: OrganigrammaPersona[];
  }): AlberoNodo {
    const membri = g.parentIds
      .map((id) => byId.get(id))
      .filter((p): p is OrganigrammaPersona => Boolean(p));
    membri.sort(sortPersone);
    const membriFigli = membri.map((m) => {
      const exclusive = (byParents.get(m.id) ?? []).filter(
        (c) => !memberOfGroup.has(c.id)
      );
      exclusive.sort(sortPersone);
      return exclusive.map((c) => buildPersonaNodo(c));
    });
    const shared = g.children.slice().sort(sortPersone).map((c) => buildPersonaNodo(c));
    return {
      id: `gruppo:${[...g.parentIds].sort().join("+")}`,
      kind: "gruppo",
      membri,
      membriFigli,
      figli: shared,
    };
  }

  const roots: AlberoNodo[] = [];
  for (const g of groupSpecs) {
    if (hostOfMembers(g.parentIds) === null) {
      roots.push(buildGruppoNodo(g));
    }
  }
  for (const p of senzaSuperiori) {
    if (memberOfGroup.has(p.id)) continue;
    roots.push(buildPersonaNodo(p));
  }
  roots.sort((a, b) => {
    const aa = a.membri[0];
    const bb = b.membri[0];
    if (!aa || !bb) return 0;
    return sortPersone(aa, bb);
  });

  const placed = new Set<string>();
  function collect(n: AlberoNodo) {
    for (const m of n.membri) placed.add(m.id);
    for (const f of n.figli) collect(f);
    for (const arr of n.membriFigli) {
      for (const f of arr) collect(f);
    }
  }
  function findPersonaNodo(nodes: AlberoNodo[], id: string): AlberoNodo | null {
    for (const n of nodes) {
      if (n.kind === "persona" && n.membri[0]?.id === id) return n;
      const inFigli = findPersonaNodo(n.figli, id);
      if (inFigli) return inFigli;
      for (const arr of n.membriFigli) {
        const hit = findPersonaNodo(arr, id);
        if (hit) return hit;
      }
    }
    return null;
  }
  for (const r of roots) collect(r);
  for (const p of items) {
    if (placed.has(p.id)) continue;
    const orphan = buildPersonaNodo(p);
    collect(orphan);
    const host = p.parentId ? findPersonaNodo(roots, p.parentId) : null;
    if (host) host.figli.push(orphan);
    else roots.push(orphan);
  }
  return roots;
}

export const personaSchedaExportSchema = z
  .object({
    personaId: z.string().uuid(),
    anagrafica: z.boolean(),
    foto: z.boolean(),
    identitaElenco: z.boolean(),
    identitaFile: z.boolean(),
    certificatiElenco: z.boolean(),
    certificatiFile: z.boolean(),
    contrattiElenco: z.boolean().optional().default(true),
    contrattiFile: z.boolean().optional().default(true),
    busteElenco: z.boolean(),
    busteFile: z.boolean(),
    autorizzazioni: z.boolean(),
    permessi: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const any =
      v.anagrafica ||
      v.foto ||
      v.identitaElenco ||
      v.identitaFile ||
      v.certificatiElenco ||
      v.certificatiFile ||
      v.contrattiElenco ||
      v.contrattiFile ||
      v.busteElenco ||
      v.busteFile ||
      v.autorizzazioni ||
      v.permessi;
    if (!any) {
      ctx.addIssue({
        code: "custom",
        message: "Seleziona almeno una sezione da esportare.",
      });
    }
  });

export type PersonaSchedaExportSelection = z.infer<
  typeof personaSchedaExportSchema
>;

export const defaultPersonaSchedaExport = {
  anagrafica: true,
  foto: true,
  identitaElenco: true,
  identitaFile: false,
  certificatiElenco: true,
  certificatiFile: false,
  contrattiElenco: true,
  contrattiFile: true,
  busteElenco: true,
  busteFile: false,
  autorizzazioni: true,
  permessi: true,
} as const;

export type PersonaSchedaExportFile = {
  id: string;
  gruppo: "identita" | "certificati" | "contratti" | "buste";
  titolo: string;
  fileName: string;
  mime: string;
  url: string;
};

export type PersonaSchedaExportPayload = {
  exportedAt: string;
  exportedBy: string;
  selection: PersonaSchedaExportSelection;
  persona: OrganigrammaPersona;
  identita: OrganigrammaDocumento[];
  certificati: OrganigrammaDocumento[];
  contratti: OrganigrammaContratto[];
  buste: OrganigrammaDocumento[];
  autorizzazioni: PostoAutorizzato[];
  permessi: OrganigrammaPermesso[];
  files: PersonaSchedaExportFile[];
};
