import { z } from "zod";

export const ORGANIGRAMMA_DOC_TIPI = [
  "cf_fronte",
  "cf_retro",
  "ci_fronte",
  "ci_retro",
  "corso",
  "certificato",
  "busta_paga",
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
  if (livello === "scaduto") return "Certificato scaduto";
  if (livello === "mese") return "Scade entro un mese";
  if (livello === "3mesi") return "Scade entro 3 mesi";
  return "Scade entro 6 mesi";
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

export function personaLabel(p: { nome: string; cognome: string }): string {
  return `${p.cognome} ${p.nome}`.trim();
}

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
