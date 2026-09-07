import { z } from "zod";
import type { ProcessoPasso } from "@/lib/produzione/processi";

export const FOGLIO_ESECUZIONE_STATI = [
  "in_corso",
  "completato",
  "annullato",
] as const;

export type FoglioEsecuzioneStato = (typeof FOGLIO_ESECUZIONE_STATI)[number];

export type FoglioPesata = {
  id: string;
  kg: number;
  createdAt: string;
};

export type FoglioProcessoEsecuzione = {
  id: string;
  stato: FoglioEsecuzioneStato;
  kgObiettivo: number;
  kgCaricati: number;
  startedAt: string;
  completedAt: string | null;
};

export type FoglioProcessoDisponibile = {
  processoId: string;
  codice: string;
  nome: string;
  descrizione: string;
  areaId: string | null;
  areaNome: string;
  passi: ProcessoPasso[];
  hasPesata: boolean;
  esecuzione: FoglioProcessoEsecuzione | null;
  pesate: FoglioPesata[];
};

export const avviaEsecuzioneProcessoSchema = z.object({
  foglioId: z.string().uuid("Foglio non valido."),
  processoId: z.string().uuid("Processo non valido."),
  kgObiettivo: z.number().min(0, "Totale da caricare non valido."),
});

export type AvviaEsecuzioneProcessoInput = z.infer<
  typeof avviaEsecuzioneProcessoSchema
>;

export const registraPesataSchema = z.object({
  esecuzioneId: z.string().uuid("Esecuzione non valida."),
  attivitaId: z.string().uuid("Attività non valida."),
  kg: z.number().positive("La pesata deve essere maggiore di zero."),
});

export type RegistraPesataInput = z.infer<typeof registraPesataSchema>;

export function formatKg(value: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function labelEsecuzioneStato(stato: FoglioEsecuzioneStato): string {
  switch (stato) {
    case "in_corso":
      return "In corso";
    case "completato":
      return "Completato";
    case "annullato":
      return "Annullato";
    default:
      return stato;
  }
}
