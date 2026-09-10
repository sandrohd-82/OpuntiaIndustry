import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";

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
  const v = s.valoreAttuale.trim();
  if (!v) return "—";
  return s.unita ? `${v} ${s.unita}` : v;
}
