import type { ActionEssiccatoreAzione } from "@/lib/action/azioni-immediate";
import {
  decodeMexHex,
  encodeAckAtteso,
  encodeAvvioOut,
  MEX_CMD,
  titoloOperatoreMex,
  type MexFrame,
} from "@/lib/action/iot-mex";

/** Test grafica: il device finto risponde dopo 1 minuto. Poi IoT reale. */
export const MEX_COMMS_SIM = {
  attesaConfermaMs: 60_000,
  mostraConfermaMs: 5000,
} as const;

export type MexCommsFase =
  | "attesa"
  | "confermato"
  | "completato"
  | "blocco_sicurezza";

export type MexCommsEsitoLivello = "ok" | "attenzione" | "errore";

export type MexCommsEsitoAvviso = {
  livello: MexCommsEsitoLivello;
  titolo: string;
  testo: string;
  essiccatoreNome: string;
};

export function esitoDaFineSessione(
  fase: MexCommsFase,
  passi: MexCommsPasso[],
  essiccatoreNome: string
): MexCommsEsitoAvviso | null {
  if (fase === "blocco_sicurezza") {
    return {
      livello: "errore",
      titolo: "Avvio interrotto",
      testo: "Il processo si è fermato: il bruciatore non parte senza ventola On confermata.",
      essiccatoreNome,
    };
  }
  if (fase !== "completato") return null;
  if (passi.length < ORDINE_SICUREZZA_AVVIO.length) {
    return {
      livello: "attenzione",
      titolo: "Avvio incompleto",
      testo: "Lo scambio è finito, ma manca almeno un messaggio della cadenza di sicurezza.",
      essiccatoreNome,
    };
  }
  return {
    livello: "ok",
    titolo: "Avvio confermato",
    testo: "Tutti i messaggi sono stati confermati. La procedura è al 100%.",
    essiccatoreNome,
  };
}

export type MexCommsPasso = {
  id: string;
  titolo: string;
  frame: MexFrame;
  richiedeVentolaOn: boolean;
};

export type MexCommsSessione = {
  id: string;
  essiccatoreNome: string;
  azioneId: string;
  passi: MexCommsPasso[];
};

/** Cadenza di sicurezza: set ventola → On ventola → set temperatura → On bruciatore. */
export const ORDINE_SICUREZZA_AVVIO = [
  MEX_CMD.FAN_POWER,
  MEX_CMD.FAN_CONSENT,
  MEX_CMD.BURNER_TEMP,
  MEX_CMD.BURNER_POWER,
  MEX_CMD.BURNER_CONSENT,
] as const;

function outsDaAzione(azione: ActionEssiccatoreAzione): MexFrame[] {
  const stored = azione.messaggi
    .map((m) => {
      const hex = typeof m.payload.mex === "string" ? m.payload.mex : null;
      return hex ? decodeMexHex(hex) : null;
    })
    .filter((f): f is MexFrame => Boolean(f));

  if (stored.length >= 4) return stored;

  return encodeAvvioOut({
    essiccatoreId: azione.essiccatoreId,
    consensoBruciatore: azione.consensoBruciatore,
    tempBruciatoreC: azione.tempBruciatoreC,
    consensoVentola: azione.consensoVentola,
    percVentilazione: azione.percVentilazione,
    percBruciatore: azione.percBruciatorePrevista ?? 20,
  });
}

function richiedeVentolaOn(cmd: number): boolean {
  return (
    cmd === MEX_CMD.BURNER_TEMP ||
    cmd === MEX_CMD.BURNER_POWER ||
    cmd === MEX_CMD.BURNER_CONSENT
  );
}

export function createSessioneAvvioComms(
  azione: ActionEssiccatoreAzione,
  essiccatoreNome: string
): MexCommsSessione {
  const byCmd = new Map(outsDaAzione(azione).map((f) => [f.cmd, f]));
  const passi: MexCommsPasso[] = [];

  ORDINE_SICUREZZA_AVVIO.forEach((cmd, i) => {
    const frame = byCmd.get(cmd);
    if (!frame) return;
    passi.push({
      id: `${azione.id}-out-${i}`,
      titolo: titoloOperatoreMex(frame),
      frame,
      richiedeVentolaOn: richiedeVentolaOn(cmd),
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
    richiedeVentolaOn: false,
  };
}

/** Il bruciatore parte solo se la ventola è già confermata On. */
export function ventolaOnConfermata(passi: MexCommsPasso[], finoA: number): boolean {
  return passi.slice(0, finoA).some(
    (p) => p.frame.cmd === MEX_CMD.FAN_CONSENT && p.frame.d0 === 1
  );
}
