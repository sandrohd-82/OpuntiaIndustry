import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import {
  DOCUMENTO_STATI_CATALOGO,
  type DocumentoStatoCatalogo,
} from "@/lib/action/azioni-catalogo";
import {
  IOT_PRECONDIZIONI,
  type ActionIotComponente,
  type IotPrecondizione,
} from "@/lib/action/iot-componenti";
import { coppiaLettereDaPasso } from "@/lib/action/iot-lettere";
import {
  encodeAckAtteso,
  encodeMex,
  titoloOperatoreMex,
  uidPerEssiccatore,
  type MexFrame,
} from "@/lib/action/iot-mex";

export const SEQUENZA_TIPI = ["azione", "chiusura", "sicurezza"] as const;
export type SequenzaTipo = (typeof SEQUENZA_TIPI)[number];

export const SEQUENZA_TIPO_LABEL: Record<SequenzaTipo, string> = {
  azione: "Azione",
  chiusura: "Chiusura",
  sicurezza: "Sicurezza",
};

export const SEQUENZA_COMANDI = ["on", "off", "setpoint"] as const;
export type SequenzaComando = (typeof SEQUENZA_COMANDI)[number];

export const SEQUENZA_ESECUZIONE_STATI = ["ferma", "in_corso"] as const;
export type SequenzaEsecuzioneStato = (typeof SEQUENZA_ESECUZIONE_STATI)[number];

export type SequenzaPasso = {
  id: string;
  sequenzaId: string;
  componenteId: string;
  componenteNome: string;
  componenteTipo: ActionIotComponente["tipoAttuatore"] | string;
  mexCmd: number | null;
  sortOrder: number;
  comando: SequenzaComando;
  valore: number | null;
  durataComandoSec: number | null;
  stalloDopoSec: number | null;
  precondizione: IotPrecondizione;
};

export type ActionSequenza = {
  id: string;
  essiccatoreId: string;
  nome: string;
  descrizione: string;
  tipo: SequenzaTipo;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  esecuzioneStato: SequenzaEsecuzioneStato;
  passi: SequenzaPasso[];
  createdAt: string;
};

export const sequenzaTestataSchema = z.object({
  id: z.string().uuid().optional(),
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(2000).optional().default(""),
  tipo: z.enum(SEQUENZA_TIPI),
});

export const sequenzaPassoInputSchema = z.object({
  sequenzaId: z.string().uuid(),
  componenteId: z.string().uuid(),
  comando: z.enum(SEQUENZA_COMANDI),
  valore: z.number().nullable().optional(),
  durataComandoSec: z.number().int().min(1).max(86400).nullable().optional(),
  stalloDopoSec: z.number().int().min(1).max(86400).nullable().optional(),
  precondizione: z.enum(IOT_PRECONDIZIONI).optional().default("nessuna"),
});

export const sequenzaPassoUpdateSchema = sequenzaPassoInputSchema.extend({
  id: z.string().uuid(),
});

export function minutiDaSecondi(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

export function formatStalloMinuti(sec: number | null | undefined): string {
  if (sec == null || sec < 1) return "—";
  const m = minutiDaSecondi(sec);
  return m === 1 ? "1 min" : `${m} min`;
}

export function formatSecondi(sec: number | null | undefined): string {
  if (sec == null || sec < 1) return "—";
  if (sec % 3600 === 0) {
    const h = sec / 3600;
    return h === 1 ? "1 ora" : `${h} ore`;
  }
  if (sec % 60 === 0) {
    const m = sec / 60;
    return m === 1 ? "1 minuto" : `${m} min`;
  }
  return sec === 1 ? "1 secondo" : `${sec} s`;
}

export function labelComandoPasso(p: Pick<SequenzaPasso, "comando" | "valore">): string {
  if (p.comando === "on") return "On";
  if (p.comando === "off") return "Off";
  if (p.valore != null) return `Set ${p.valore}`;
  return "Setpoint";
}

export function mexFrameDaPasso(input: {
  essiccatoreId: string;
  mexCmd: number | null;
  comando: SequenzaComando;
  valore: number | null;
}): MexFrame | null {
  if (input.mexCmd == null || input.mexCmd < 0 || input.mexCmd > 255) {
    return null;
  }
  const isRegola = input.comando === "setpoint";
  const d0 =
    input.comando === "on"
      ? 1
      : input.comando === "off"
        ? 0
        : Math.max(0, Math.min(255, Math.round(input.valore ?? 0)));
  return encodeMex({
    cls: "I",
    dir: "O",
    tipo: "A",
    cmd: input.mexCmd,
    d0,
    d1: isRegola ? input.mexCmd : 0,
    uid: uidPerEssiccatore(input.essiccatoreId),
  });
}

export type TestoMexPasso = {
  out: { titolo: string; codice: string; hex: string; corpo: string };
  ack: { titolo: string; codice: string; hex: string; corpo: string };
};

export function testoMexPasso(input: {
  essiccatoreId: string;
  mexCmd: number | null;
  comando: SequenzaComando;
  valore: number | null;
  tipoAttuatore?: string | null;
}): TestoMexPasso | null {
  const frame = mexFrameDaPasso(input);
  if (!frame) return null;
  const ack = encodeAckAtteso(frame);
  const lettere = coppiaLettereDaPasso({
    mexCmd: input.mexCmd,
    comando: input.comando,
    valore: input.valore,
    tipoAttuatore: input.tipoAttuatore,
  });
  return {
    out: {
      titolo: lettere?.titoloOut ?? titoloOperatoreMex(frame),
      codice: frame.codice,
      hex: frame.hexSpaced,
      corpo: lettere?.out ?? frame.codice,
    },
    ack: {
      titolo: lettere?.titoloAck ?? titoloOperatoreMex(ack),
      codice: ack.codice,
      hex: ack.hexSpaced,
      corpo: lettere?.ack ?? ack.codice,
    },
  };
}

export { DOCUMENTO_STATI_CATALOGO };
