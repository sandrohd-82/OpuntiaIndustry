import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import type { DocumentoStatoCatalogo } from "@/lib/action/azioni-catalogo";

export const IOT_ATTUATORE_TIPI = [
  "on_off",
  "on_off_temporizzato",
  "inverter",
  "inverter_consenso",
  "setpoint_temperatura",
] as const;
export type IotAttuatoreTipo = (typeof IOT_ATTUATORE_TIPI)[number];

export const IOT_ATTUATORE_LABEL: Record<IotAttuatoreTipo, string> = {
  on_off: "On / Off",
  on_off_temporizzato: "On / Off temporizzato",
  inverter: "Inverter (potenza %)",
  inverter_consenso: "Inverter + consenso On/Off",
  setpoint_temperatura: "Setpoint temperatura",
};

export const IOT_PRECONDIZIONI = [
  "nessuna",
  "chiuso",
  "aperto",
  "spento",
  "acceso",
] as const;
export type IotPrecondizione = (typeof IOT_PRECONDIZIONI)[number];

export const IOT_PRECONDIZIONE_LABEL: Record<IotPrecondizione, string> = {
  nessuna: "Nessuna",
  chiuso: "Solo se chiuso",
  aperto: "Solo se aperto",
  spento: "Solo se spento",
  acceso: "Solo se acceso",
};

export type ActionIotComponente = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  tipoAttuatore: IotAttuatoreTipo;
  essiccatoreId: string | null;
  areaSlug: string;
  richiedeConsenso: boolean;
  valoreMin: number;
  valoreMax: number;
  valoreDefault: number;
  unita: string;
  precondizione: IotPrecondizione;
  mexCmd: number | null;
  durataImpulsoDefaultSec: number | null;
  impostazioni: Record<string, unknown>;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  createdAt: string;
};

export function attuatoreHaOnOff(tipo: IotAttuatoreTipo): boolean {
  return (
    tipo === "on_off" ||
    tipo === "on_off_temporizzato" ||
    tipo === "inverter_consenso"
  );
}

export function attuatoreHaValore(tipo: IotAttuatoreTipo): boolean {
  return (
    tipo === "inverter" ||
    tipo === "inverter_consenso" ||
    tipo === "setpoint_temperatura"
  );
}

export function attuatoreHaDurataComando(tipo: IotAttuatoreTipo): boolean {
  return tipo === "on_off_temporizzato";
}

export const componenteInputSchema = z.object({
  id: z.string().uuid().optional(),
  codice: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Codice: lettere, numeri, . _ -"),
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(2000).optional().default(""),
  tipoAttuatore: z.enum(IOT_ATTUATORE_TIPI),
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS).nullable().optional(),
  areaSlug: z.string().trim().max(40).optional().default("essiccatori"),
  richiedeConsenso: z.boolean().optional().default(false),
  valoreMin: z.number().optional(),
  valoreMax: z.number().optional(),
  valoreDefault: z.number().optional(),
  unita: z.string().trim().max(12).optional().default(""),
  precondizione: z.enum(IOT_PRECONDIZIONI).optional().default("nessuna"),
  mexCmd: z.number().int().min(0).max(255).nullable().optional(),
  durataImpulsoDefaultSec: z.number().int().min(1).max(86400).nullable().optional(),
});

export function defaultRangeForTipo(tipo: IotAttuatoreTipo): {
  min: number;
  max: number;
  def: number;
  unita: string;
} {
  switch (tipo) {
    case "setpoint_temperatura":
      return { min: 35, max: 70, def: 50, unita: "°C" };
    case "inverter":
    case "inverter_consenso":
      return { min: 0, max: 100, def: 70, unita: "%" };
    default:
      return { min: 0, max: 1, def: 0, unita: "" };
  }
}
