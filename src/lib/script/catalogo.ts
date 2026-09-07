import { z } from "zod";

export const SCRIPT_FUNZIONI = ["pesata"] as const;
export type ScriptFunzione = (typeof SCRIPT_FUNZIONI)[number];

export const SCRIPT_DOCUMENTO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
] as const;
export type ScriptDocumentoStato = (typeof SCRIPT_DOCUMENTO_STATI)[number];

export type GestionaleScript = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  funzione: ScriptFunzione;
  attivo: boolean;
  note: string;
  versione: number;
  documentoStato: ScriptDocumentoStato;
  createdAt: string;
};

export type AttivitaScriptLink = {
  id: string;
  codice: string;
  nome: string;
  funzione: ScriptFunzione;
};

export const scriptInputSchema = z.object({
  codice: z.string().trim().min(1, "Codice obbligatorio.").max(64),
  nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
  descrizione: z.string().trim().max(2000).optional().default(""),
  funzione: z.enum(SCRIPT_FUNZIONI),
  note: z.string().trim().max(2000).optional().default(""),
  attivo: z.boolean().optional().default(true),
});

export type ScriptInput = z.infer<typeof scriptInputSchema>;

export function labelScriptFunzione(funzione: ScriptFunzione): string {
  if (funzione === "pesata") return "Pesata";
  return funzione;
}

export function isScriptFunzione(v: string): v is ScriptFunzione {
  return (SCRIPT_FUNZIONI as readonly string[]).includes(v);
}
