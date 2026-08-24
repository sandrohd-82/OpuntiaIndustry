import { z } from "zod";

export const pnEntityTypeSchema = z.enum([
  "cliente",
  "fornitore",
  "cliente_possibile",
  "ordine",
  "altro",
]);
export type PnEntityType = z.infer<typeof pnEntityTypeSchema>;

export type PnPromemoria = {
  id: string;
  titolo: string;
  descrizione: string;
  dueAt: string;
  stato: "attivo" | "completato" | "archiviato";
  createdAt: string;
};

export type PnAttivita = {
  id: string;
  titolo: string;
  descrizione: string;
  luogo: string;
  dueAt: string;
  stato: "pianificata" | "in_corso" | "completata" | "archiviata";
  mentionUserIds: string[];
  createdAt: string;
};

export type PnNota = {
  id: string;
  titolo: string;
  body: string;
  colore: "giallo" | "verde" | "blu" | "rosa" | "grigio";
  dueAt: string | null;
  entityType: PnEntityType | null;
  entityId: string | null;
  entityLabel: string;
  stato: "attiva" | "archiviata";
  createdAt: string;
};

export type ClientePossibile = {
  id: string;
  ragioneSociale: string;
  referente: string;
  telefono: string;
  email: string;
  noteInterne: string;
  stato: "da_valutare" | "in_contatto" | "convertito" | "scartato";
  clienteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const createPromemoriaSchema = z.object({
  titolo: z.string().trim().min(1).max(200),
  descrizione: z.string().trim().max(2000).optional().default(""),
  dueAt: z.string().min(1),
});

export const createAttivitaSchema = z.object({
  titolo: z.string().trim().min(1).max(200),
  descrizione: z.string().trim().max(5000).optional().default(""),
  luogo: z.string().trim().max(300).optional().default(""),
  dueAt: z.string().min(1),
  mentionUserIds: z.array(z.string().uuid()).optional().default([]),
});

export const createNotaSchema = z.object({
  titolo: z.string().trim().max(200).optional().default(""),
  body: z.string().trim().min(1).max(8000),
  colore: z
    .enum(["giallo", "verde", "blu", "rosa", "grigio"])
    .optional()
    .default("giallo"),
  dueAt: z.string().nullable().optional(),
  entityType: pnEntityTypeSchema.nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  entityLabel: z.string().trim().max(200).optional().default(""),
});

export const createClientePossibileSchema = z.object({
  ragioneSociale: z.string().trim().min(1).max(200),
  referente: z.string().trim().max(120).optional().default(""),
  telefono: z.string().trim().max(60).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  noteInterne: z.string().trim().max(2000).optional().default(""),
});

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}
