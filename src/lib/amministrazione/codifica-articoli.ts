import { z } from "zod";
import type { CatalogoAcquistoKind } from "@/lib/sku-generator";

/** Soglia di affinità (%) per revisione manuale / deduplica. */
export const CODIFICA_SIMILARITY_THRESHOLD_PCT = 80;

export type CatalogoMatchHit = {
  catalogoKind: CatalogoAcquistoKind;
  catalogoId: string;
  codice: string;
  nome: string;
  affinitaPercentuale: number;
};

export type CodificaAzione = "associa_esistente" | "crea_nuovo";

export const confirmCodificaArticoloSchema = z.object({
  testoOriginale: z.string().trim().min(1, "Testo fattura obbligatorio"),
  testoNormalizzato: z.string().trim().optional(),
  codiceAssegnato: z.string().trim().min(2, "Codice obbligatorio"),
  catalogoKind: z.enum(["servizio", "prodotto", "materia"]),
  catalogoId: z.string().uuid().nullable().optional(),
  affinitaPercentuale: z.number().min(0).max(100).nullable().optional(),
  azione: z.enum(["associa_esistente", "crea_nuovo"]),
  nomeArticolo: z.string().trim().min(1).optional(),
  note: z.string().trim().optional(),
  isBio: z.boolean().optional(),
  fatturaRicevutaId: z.string().uuid().nullable().optional(),
  fatturaRigaId: z.string().uuid().nullable().optional(),
});

export type ConfirmCodificaArticoloInput = z.infer<
  typeof confirmCodificaArticoloSchema
>;

export type FatturaRicevutaCodificaArticoloRow = {
  id: string;
  fattura_ricevuta_id: string | null;
  fattura_riga_id: string | null;
  testo_originale: string;
  testo_normalizzato: string;
  codice_assegnato: string;
  catalogo_kind: CatalogoAcquistoKind;
  catalogo_id: string | null;
  affinita_percentuale: number | null;
  azione: CodificaAzione;
  note: string;
  created_by: string | null;
  created_at: string;
};
