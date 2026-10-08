import { z } from "zod";

const nome = z.string().trim().min(1, "Indica il nome del sito.").max(160);
const url = z.string().trim().min(1, "Indica l'URL.").max(500);
const mail = z.string().trim().min(1, "Indica la mail di accesso.").max(200);

export const caveauSitoSchema = z.object({
  nome,
  url,
  mail,
  password: z.string().min(1, "Indica la password.").max(500),
});

export const caveauSitoUpdateSchema = z.object({
  id: z.string().uuid(),
  nome,
  url,
  mail,
  password: z.string().max(500).optional(),
});

export const caveauRivelaSchema = z.object({
  id: z.string().uuid(),
  codice: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Inserisci il codice di 6 cifre ricevuto per email."),
});

export const caveauEliminaSchema = z.object({
  id: z.string().uuid(),
  conferma: z.string().trim().min(1),
});

const acquistoUrl = z.string().trim().min(1, "Indica l'URL.").max(500);
const acquistoTitolo = z.string().trim().min(1, "Indica il titolo.").max(200);

export const caveauAcquistoSchema = z.object({
  sitoId: z.string().uuid(),
  url: acquistoUrl,
  titolo: acquistoTitolo,
  descrizione: z.string().trim().max(4000).optional().default(""),
  prezzo: z.string().max(20).optional().default(""),
  registratoAt: z.string().max(40).optional().default(""),
});

export const caveauAcquistoUpdateSchema = caveauAcquistoSchema.extend({
  id: z.string().uuid(),
});

export function prezzoAcquistoOrNull(
  raw: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const testo = raw.trim().replace(",", ".");
  if (!testo) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(testo)) {
    return { ok: false, error: "Il prezzo è un importo in euro, anche vuoto." };
  }
  const n = Number(testo);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Il prezzo non può essere negativo." };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function registratoAtOrNull(
  raw: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const testo = raw.trim();
  if (!testo) return { ok: true, value: null };
  const data = new Date(testo);
  if (Number.isNaN(data.getTime())) {
    return { ok: false, error: "Data non valida." };
  }
  return { ok: true, value: data.toISOString() };
}

export type CaveauAcquistoRiga = {
  id: string;
  sitoId: string;
  url: string;
  titolo: string;
  descrizione: string;
  prezzo: number | null;
  registratoAt: string | null;
  versione: number;
};

export type CaveauSitoRiga = {
  id: string;
  nome: string;
  url: string;
  mail: string;
  versione: number;
  updatedAt: string;
  acquisti: CaveauAcquistoRiga[];
};
