import type { ActionEssiccatoreAzione } from "@/lib/action/azioni-immediate";
import {
  decodeMexHex,
  encodeAckAtteso,
  encodeAvvioOut,
  MEX_CMD,
  titoloOperatoreMex,
  type MexFrame,
} from "@/lib/action/iot-mex";

/** Tempi lenti di simulazione (ms). L’IoT reale sostituirà questi delay. */
export const MEX_COMMS_SIM = {
  attesaConfermaMs: 3200,
  mostraConfermaMs: 1500,
} as const;

export type MexCommsFase = "attesa" | "confermato" | "completato";

export type MexCommsPasso = {
  id: string;
  titolo: string;
  frame: MexFrame;
};

export type MexCommsSessione = {
  id: string;
  essiccatoreNome: string;
  azioneId: string;
  passi: MexCommsPasso[];
};

const ORDINE_AVVIO = [
  MEX_CMD.BURNER_TEMP,
  MEX_CMD.BURNER_CONSENT,
  MEX_CMD.FAN_POWER,
  MEX_CMD.FAN_CONSENT,
] as const;

function outsDaAzione(azione: ActionEssiccatoreAzione): MexFrame[] {
  const stored = azione.messaggi
    .map((m) => {
      const hex = typeof m.payload.mex === "string" ? m.payload.mex : null;
      return hex ? decodeMexHex(hex) : null;
    })
    .filter((f): f is MexFrame => Boolean(f));

  if (stored.length === 4) return stored;

  return encodeAvvioOut({
    essiccatoreId: azione.essiccatoreId,
    consensoBruciatore: azione.consensoBruciatore,
    tempBruciatoreC: azione.tempBruciatoreC,
    consensoVentola: azione.consensoVentola,
    percVentilazione: azione.percVentilazione,
  });
}

export function createSessioneAvvioComms(
  azione: ActionEssiccatoreAzione,
  essiccatoreNome: string
): MexCommsSessione {
  const byCmd = new Map(outsDaAzione(azione).map((f) => [f.cmd, f]));
  const passi: MexCommsPasso[] = [];

  ORDINE_AVVIO.forEach((cmd, i) => {
    const frame = byCmd.get(cmd);
    if (!frame) return;
    passi.push({
      id: `${azione.id}-out-${i}`,
      titolo: titoloOperatoreMex(frame),
      frame,
    });
  });

  return {
    id: azione.id,
    essiccatoreNome,
    azioneId: azione.id,
    passi,
  };
}

export function ackSimulato(out: MexFrame): MexCommsPasso {
  const ack = encodeAckAtteso(out);
  return {
    id: `ack-${out.codice}-${out.hex}`,
    titolo: titoloOperatoreMex(ack),
    frame: ack,
  };
}
