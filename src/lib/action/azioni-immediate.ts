import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";

export const AZIONE_IMMEDIATA_KEYS = ["avvio"] as const;
export type AzioneImmediataKey = (typeof AZIONE_IMMEDIATA_KEYS)[number];

export const IOT_CANALI = [
  "consenso_bruciatore",
  "perc_bruciatore",
  "consenso_ventola",
  "perc_ventilazione",
] as const;
export type IotCanaleAvvio = (typeof IOT_CANALI)[number];

export const IOT_STATI = [
  "in_attesa_dispositivo",
  "accodato",
  "inviato",
  "errore",
] as const;
export type IotStatoMessaggio = (typeof IOT_STATI)[number];

export const DOCUMENTO_STATI_AZIONE = [
  "bozza",
  "approvato",
  "eseguito",
  "errore",
] as const;

export type ActionEssiccatoreIotMessaggio = {
  id: string;
  azioneId: string;
  canale: IotCanaleAvvio;
  comando: string;
  payload: Record<string, unknown>;
  sortOrder: number;
  stato: IotStatoMessaggio;
};

export type ActionEssiccatoreAzione = {
  id: string;
  essiccatoreId: string;
  azioneKey: AzioneImmediataKey;
  versione: number;
  documentoStato: (typeof DOCUMENTO_STATI_AZIONE)[number];
  consensoBruciatore: boolean;
  percBruciatore: number;
  consensoVentola: boolean;
  percVentilazione: number;
  iotStato: IotStatoMessaggio;
  createdAt: string;
  messaggi: ActionEssiccatoreIotMessaggio[];
};

export const avvioEssiccatoreInputSchema = z
  .object({
    essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
    consensoBruciatore: z.boolean(),
    percBruciatore: z.number().int().min(0).max(100),
    consensoVentola: z.boolean(),
    percVentilazione: z.number().int().min(0).max(100),
  })
  .superRefine((data, ctx) => {
    if (!data.consensoBruciatore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consensoBruciatore"],
        message: "Per l’accensione il consenso bruciatore deve passare a On.",
      });
    }
    if (!data.consensoVentola) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consensoVentola"],
        message: "Per l’accensione il consenso ventola deve passare a On.",
      });
    }
  });

export type AvvioEssiccatoreInput = z.infer<typeof avvioEssiccatoreInputSchema>;

export type MessaggioAvvioDraft = {
  canale: IotCanaleAvvio;
  comando: string;
  payload: Record<string, unknown>;
  sortOrder: number;
};

export function buildMessaggiAvvio(
  input: AvvioEssiccatoreInput
): MessaggioAvvioDraft[] {
  return [
    {
      canale: "consenso_bruciatore",
      comando: input.consensoBruciatore
        ? "BURNER_CONSENT_ON"
        : "BURNER_CONSENT_OFF",
      payload: { on: input.consensoBruciatore },
      sortOrder: 1,
    },
    {
      canale: "perc_bruciatore",
      comando: `BURNER_PERCENT:${input.percBruciatore}`,
      payload: { percent: input.percBruciatore },
      sortOrder: 2,
    },
    {
      canale: "consenso_ventola",
      comando: input.consensoVentola ? "FAN_CONSENT_ON" : "FAN_CONSENT_OFF",
      payload: { on: input.consensoVentola },
      sortOrder: 3,
    },
    {
      canale: "perc_ventilazione",
      comando: `VENT_PERCENT:${input.percVentilazione}`,
      payload: { percent: input.percVentilazione },
      sortOrder: 4,
    },
  ];
}

export const IOT_CANALE_LABELS: Record<IotCanaleAvvio, string> = {
  consenso_bruciatore: "Consenso bruciatore",
  perc_bruciatore: "Percentuale bruciatore",
  consenso_ventola: "Consenso ventola",
  perc_ventilazione: "Percentuale ventilazione",
};

export function etichettaMessaggio(m: {
  canale: IotCanaleAvvio;
  comando: string;
  payload: Record<string, unknown>;
}): string {
  if (m.canale === "consenso_bruciatore" || m.canale === "consenso_ventola") {
    return `${IOT_CANALE_LABELS[m.canale]} → ${m.payload.on ? "On" : "Off"}`;
  }
  const pct =
    typeof m.payload.percent === "number" ? `${m.payload.percent}%` : m.comando;
  return `${IOT_CANALE_LABELS[m.canale]} → ${pct}`;
}
