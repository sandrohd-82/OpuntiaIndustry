import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import { encodeAvvioOut } from "@/lib/action/iot-mex";

export const AZIONE_IMMEDIATA_KEYS = ["avvio"] as const;
export type AzioneImmediataKey = (typeof AZIONE_IMMEDIATA_KEYS)[number];

export const TEMP_BRUCIATORE_MIN_C = 35;
export const TEMP_BRUCIATORE_MAX_C = 70;
export const TEMP_BRUCIATORE_DEFAULT_C = 50;
export const SONDA_USCITA_BRUCIATORE = "TEMP-BRUC";

export const IOT_CANALI = [
  "consenso_bruciatore",
  "temp_bruciatore",
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
  tempBruciatoreC: number;
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
    tempBruciatoreC: z
      .number()
      .int()
      .min(TEMP_BRUCIATORE_MIN_C)
      .max(TEMP_BRUCIATORE_MAX_C),
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
  const frames = encodeAvvioOut({
    essiccatoreId: input.essiccatoreId,
    consensoBruciatore: input.consensoBruciatore,
    tempBruciatoreC: input.tempBruciatoreC,
    consensoVentola: input.consensoVentola,
    percVentilazione: input.percVentilazione,
  });
  const [fanPower, fanOn, burnerTemp, burnerOn] = frames;
  return [
    {
      canale: "perc_ventilazione",
      comando: fanPower?.codice ?? "A04",
      payload: {
        percent: input.percVentilazione,
        mex: fanPower?.hex ?? "",
        codice: fanPower?.codice ?? "A04",
        uid: fanPower?.uidHex ?? "",
        cls: fanPower?.cls ?? "I",
      },
      sortOrder: 1,
    },
    {
      canale: "consenso_ventola",
      comando: fanOn?.codice ?? "A03",
      payload: {
        on: input.consensoVentola,
        mex: fanOn?.hex ?? "",
        codice: fanOn?.codice ?? "A03",
        uid: fanOn?.uidHex ?? "",
        cls: fanOn?.cls ?? "I",
      },
      sortOrder: 2,
    },
    {
      canale: "temp_bruciatore",
      comando: burnerTemp?.codice ?? "A02",
      payload: {
        celsius: input.tempBruciatoreC,
        sonda: SONDA_USCITA_BRUCIATORE,
        regolazione: "mantieni_setpoint",
        mex: burnerTemp?.hex ?? "",
        codice: burnerTemp?.codice ?? "A02",
        uid: burnerTemp?.uidHex ?? "",
        cls: burnerTemp?.cls ?? "I",
      },
      sortOrder: 3,
    },
    {
      canale: "consenso_bruciatore",
      comando: burnerOn?.codice ?? "A01",
      payload: {
        on: input.consensoBruciatore,
        mex: burnerOn?.hex ?? "",
        codice: burnerOn?.codice ?? "A01",
        uid: burnerOn?.uidHex ?? "",
        cls: burnerOn?.cls ?? "I",
      },
      sortOrder: 4,
    },
  ];
}

export const IOT_CANALE_LABELS: Record<IotCanaleAvvio, string> = {
  consenso_bruciatore: "Consenso bruciatore",
  temp_bruciatore: "Temperatura uscita bruciatore",
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
  if (m.canale === "temp_bruciatore") {
    const c =
      typeof m.payload.celsius === "number"
        ? `${m.payload.celsius}°C`
        : m.comando;
    return `${IOT_CANALE_LABELS[m.canale]} → ${c}`;
  }
  const pct =
    typeof m.payload.percent === "number" ? `${m.payload.percent}%` : m.comando;
  return `${IOT_CANALE_LABELS[m.canale]} → ${pct}`;
}
