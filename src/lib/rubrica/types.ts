import { z } from "zod";

export type RubricaRapporto = "dipendente" | "referente" | "altro";
export type RubricaAziendaTipo =
  | "cliente"
  | "fornitore"
  | "cliente_possibile"
  | "agrinsicilia";

export type RubricaModalita =
  | "chiamata"
  | "messaggi"
  | "mail"
  | "incontro";

export type RubricaContatto = {
  id: string;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  rapporto: RubricaRapporto;
  aziendaTipo: RubricaAziendaTipo;
  aziendaId: string | null;
  aziendaLabel: string;
  mansione: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type RubricaTimelineItem = {
  id: string;
  contattoId: string;
  occurredAt: string;
  riassunto: string;
  argomenti: string;
  descrizione: string;
  modalita: RubricaModalita;
  mapsUrl: string;
  webmailMessageId: string | null;
  linkedPromemoriaId: string | null;
  linkedAttivitaId: string | null;
  linkedNotaId: string | null;
  createdBy: string | null;
  createdAt: string;
};

export const createRubricaContattoSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  cognome: z.string().trim().min(1).max(80),
  telefono: z.string().trim().max(60).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  rapporto: z
    .enum(["dipendente", "referente", "altro"])
    .optional()
    .default("dipendente"),
  aziendaTipo: z.enum([
    "cliente",
    "fornitore",
    "cliente_possibile",
    "agrinsicilia",
  ]),
  aziendaId: z.string().uuid().nullable().optional(),
  aziendaLabel: z.string().trim().max(200).optional().default(""),
  mansione: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
});

export const createRubricaTimelineSchema = z.object({
  contattoId: z.string().uuid(),
  occurredAt: z.string().min(1),
  riassunto: z.string().trim().min(1).max(2000),
  argomenti: z.string().trim().max(2000).optional().default(""),
  descrizione: z.string().trim().max(8000).optional().default(""),
  modalita: z.enum(["chiamata", "messaggi", "mail", "incontro"]),
  mapsUrl: z.string().trim().max(1000).optional().default(""),
  webmailMessageId: z.string().uuid().nullable().optional(),
  linkedPromemoriaId: z.string().uuid().nullable().optional(),
  linkedAttivitaId: z.string().uuid().nullable().optional(),
  linkedNotaId: z.string().uuid().nullable().optional(),
});

export function displayContattoName(c: Pick<RubricaContatto, "nome" | "cognome">) {
  return `${c.nome} ${c.cognome}`.trim();
}

export const RAPPORTO_LABELS: Record<RubricaRapporto, string> = {
  dipendente: "Dipendente",
  referente: "Referente",
  altro: "Altro",
};

export const AZIENDA_TIPO_LABELS: Record<RubricaAziendaTipo, string> = {
  cliente: "Cliente",
  fornitore: "Fornitore",
  cliente_possibile: "Possibile cliente",
  agrinsicilia: "Agrinsicilia",
};

export const MODALITA_LABELS: Record<RubricaModalita, string> = {
  chiamata: "Chiamata",
  messaggi: "Messaggi",
  mail: "Mail",
  incontro: "Incontro",
};
