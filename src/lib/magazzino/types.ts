import { z } from "zod";

export type Reparto = {
  id: string;
  codice: string;
  nome: string;
  attivo: boolean;
  note: string;
  createdAt: string;
};

export type MagazzinoUnita = "kg" | "pz";

export type ScorteSemaforo = "ok" | "soglia" | "sotto" | "n/d";

export type MagazzinoProdottoRiga = {
  prodottoId: string;
  codice: string;
  nome: string;
  isBio: boolean;
  giacenzaId: string | null;
  quantita: number;
  quantitaRiserva: number | null;
  unita: MagazzinoUnita;
  repartoId: string | null;
  repartoNome: string | null;
  semaforo: ScorteSemaforo;
};

export type NotaAcquistoStato = "bozza" | "aperta" | "chiusa" | "annullata";

export type NotaAcquistoRiga = {
  id: string;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantitaRichiesta: number;
  unita: MagazzinoUnita;
  motivo: string;
};

export type NotaAcquisto = {
  id: string;
  numero: string;
  versione: number;
  documentoStato: NotaAcquistoStato;
  titolo: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  righe: NotaAcquistoRiga[];
};

export const updateMagazzinoProdottoSchema = z.object({
  prodottoId: z.string().uuid(),
  quantita: z.number().min(0),
  quantitaRiserva: z.number().min(0).nullable(),
  unita: z.enum(["kg", "pz"]),
  repartoId: z.string().uuid().nullable(),
});

export type UpdateMagazzinoProdottoInput = z.infer<
  typeof updateMagazzinoProdottoSchema
>;

export const repartoInputSchema = z.object({
  codice: z.string().trim().min(1).max(32),
  nome: z.string().trim().min(1).max(200),
  attivo: z.boolean().optional(),
  note: z.string().trim().optional(),
});

export type RepartoInput = z.infer<typeof repartoInputSchema>;

export function computeSemaforo(
  quantita: number,
  quantitaRiserva: number | null | undefined
): ScorteSemaforo {
  if (quantitaRiserva == null || !Number.isFinite(quantitaRiserva)) {
    return "n/d";
  }
  if (quantita < quantitaRiserva) return "sotto";
  if (quantita === quantitaRiserva) return "soglia";
  return "ok";
}

export function quantitaDaOrdinare(
  quantita: number,
  quantitaRiserva: number
): number {
  const delta = quantitaRiserva - quantita;
  return Math.max(1, Math.round(delta * 1000) / 1000);
}
