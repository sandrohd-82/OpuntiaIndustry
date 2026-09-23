import { z } from "zod";

export type ProduzioneCorriere = {
  id: string;
  nome: string;
  predefinito: boolean;
};

export const corriereCreateSchema = z.object({
  nome: z.string().trim().min(2, "Nome corriere obbligatorio").max(80),
});

export const ritiroSchema = z.object({
  schedaId: z.string().uuid(),
  ritiroAt: z.string().min(10, "Ora di ritiro obbligatoria"),
  corriereId: z.string().uuid("Seleziona un corriere"),
});

export const forzaConsegnaSchema = z.object({
  schedaId: z.string().uuid(),
  motivo: z
    .string()
    .trim()
    .min(5, "Indica perché forzi la consegna (almeno 5 caratteri).")
    .max(2000),
});

export type InAttesaRitiroRiga = {
  schedaId: string;
  numero: string;
  cliente: string;
  prodotto: string;
  entityTipo: "ordine" | "campionatura";
  entityId: string;
  prontoAt: string | null;
};
