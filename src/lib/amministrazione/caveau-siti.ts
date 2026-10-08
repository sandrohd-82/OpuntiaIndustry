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
  codice: z.string().trim().min(1, "Inserisci il codice.").max(200),
});

export const caveauEliminaSchema = z.object({
  id: z.string().uuid(),
  conferma: z.string().trim().min(1),
});

export type CaveauSitoRiga = {
  id: string;
  nome: string;
  url: string;
  mail: string;
  versione: number;
  updatedAt: string;
};
