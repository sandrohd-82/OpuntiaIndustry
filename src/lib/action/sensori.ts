import { z } from "zod";
import {
  ACTION_ESSICCATORE_IDS,
  ACTION_ESSICCATORI,
} from "@/lib/action/essiccatori";

export const ACTION_SENSORE_CATALOGO = [
  {
    codice: "TEMP-AMB",
    nome: "Temperatura Ambientale",
    unita: "°C",
    xPct: 18,
    yPct: 22,
    sort: 1,
  },
  {
    codice: "TEMP-BRUC",
    nome: "Temperatura Uscita Bruciatore",
    unita: "°C",
    xPct: 82,
    yPct: 22,
    sort: 2,
  },
  {
    codice: "PRESS-SOFF",
    nome: "Sensore di pressione Piano Soffiante",
    unita: "Bar",
    xPct: 18,
    yPct: 78,
    sort: 3,
  },
  {
    codice: "PESO",
    nome: "Peso prodotto",
    unita: "Kg",
    xPct: 82,
    yPct: 78,
    sort: 4,
  },
] as const;

export const ACTION_SENSORE_CATALOGO_CODICI = new Set(
  ACTION_SENSORE_CATALOGO.map((s) => s.codice)
);

export function catalogoSensoriPerEssiccatori(): Array<{
  essiccatoreId: string;
  codice: string;
  nome: string;
  unita: string;
  xPct: number;
  yPct: number;
}> {
  return ACTION_ESSICCATORI.flatMap((e) =>
    ACTION_SENSORE_CATALOGO.map((s) => ({
      essiccatoreId: e.id,
      codice: s.codice,
      nome: s.nome,
      unita: s.unita,
      xPct: s.xPct,
      yPct: s.yPct,
    }))
  );
}

export type ActionEssiccatoreSensore = {
  id: string;
  essiccatoreId: string;
  codice: string;
  nome: string;
  unita: string;
  xPct: number;
  yPct: number;
  valoreAttuale: string;
};

export const createSensoreInputSchema = z.object({
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  unita: z.string().trim().max(20).optional().default(""),
});

export const moveSensoreInputSchema = z.object({
  id: z.string().uuid(),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
});

export const renameSensoreInputSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  unita: z.string().trim().max(20).optional().default(""),
});

export const softDeleteSensoreInputSchema = z.object({
  id: z.string().uuid(),
  confermaTestuale: z.string().trim().min(1),
});

export function formatSensoreValore(s: ActionEssiccatoreSensore): string {
  const v = s.valoreAttuale.trim() || "—";
  return s.unita ? `${v} ${s.unita}` : v;
}
