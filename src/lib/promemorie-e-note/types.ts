import { z } from "zod";
import {
  emptySede,
  type Cliente,
  type ConsegnaAltraAzienda,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";

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
  /** Equivalente a prodottiAcquistati sul cliente reale */
  prodottiInteressati: string[];
  referente: string;
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

const sedeSchema = z.object({
  nazione: z.string(),
  provincia: z.string(),
  citta: z.string(),
  cap: z.string(),
  indirizzo: z.string(),
});

export const createClientePossibileSchema = z.object({
  ragioneSociale: z.string().trim().min(1).max(200),
  partitaIva: z.string().trim().max(20).optional().default(""),
  codiceFiscale: z.string().trim().max(20).optional().default(""),
  isPrivato: z.boolean().optional().default(false),
  email: z.string().trim().max(120).optional().default(""),
  pec: z.string().trim().max(120).optional().default(""),
  sdiCode: z.string().trim().max(10).optional().default(""),
  telefono: z.string().trim().max(60).optional().default(""),
  sitoWeb: z.string().trim().max(200).optional().default(""),
  sedeAmministrativa: sedeSchema,
  sedeMagazzino: sedeSchema.optional(),
  consegneAltraAzienda: z
    .array(
      z.object({
        ragioneSociale: z.string(),
        nazione: z.string(),
        provincia: z.string(),
        citta: z.string(),
        cap: z.string(),
        indirizzo: z.string(),
      })
    )
    .optional()
    .default([]),
  /** Accetta anche prodottiAcquistati dal ClienteFormModal */
  prodottiInteressati: z.array(z.string()).optional().default([]),
  prodottiAcquistati: z.array(z.string()).optional(),
  referente: z.string().trim().max(120).optional().default(""),
  noteInterne: z.string().trim().max(2000).optional().default(""),
});

export function emptyClientePossibileSedi() {
  return { sedeAmministrativa: emptySede(), sedeMagazzino: emptySede() };
}

/** Prefill form cliente reale da un lead (prodotti interessati → acquistati). */
export function clienteFromPossibile(lead: ClientePossibile): Cliente {
  return {
    id: "",
    codiceTarga: "",
    ragioneSociale: lead.ragioneSociale,
    partitaIva: lead.partitaIva,
    codiceFiscale: lead.codiceFiscale,
    isPrivato: lead.isPrivato,
    email: lead.email,
    pec: lead.pec,
    sdiCode: lead.sdiCode,
    telefono: lead.telefono,
    sitoWeb: lead.sitoWeb,
    sedeAmministrativa: lead.sedeAmministrativa,
    sedeMagazzino: lead.sedeMagazzino,
    consegneAltraAzienda: lead.consegneAltraAzienda,
    prodottiAcquistati: lead.prodottiInteressati,
    createdAt: "",
  };
}

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}
