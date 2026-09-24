import type { ActionEssiccatoreAzione } from "@/lib/action/azioni-immediate";
import {
  decodeMexHex,
  encodeAckAtteso,
  encodeArrestoOut,
  encodeAvvioOut,
  MEX_CMD,
  titoloOperatoreMex,
  type MexFrame,
} from "@/lib/action/iot-mex";

/** Test grafica: il device finto risponde dopo 10 secondi. Poi IoT reale. */
export const MEX_COMMS_SIM = {
  attesaConfermaMs: 10_000,
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
  essiccatoreNome: string,
  kind: "avvio" | "arresto" = "avvio"
): MexCommsEsitoAvviso | null {
  const atteso =
    kind === "arresto"
      ? ORDINE_SICUREZZA_ARRESTO.length
      : ORDINE_SICUREZZA_AVVIO.length;
  if (fase === "blocco_sicurezza") {
    return {
      livello: "errore",
      titolo: kind === "arresto" ? "Arresto interrotto" : "Avvio interrotto",
      testo:
        kind === "arresto"
          ? "Lo spegnimento si è fermato prima del completamento."
          : "Il processo si è fermato: il bruciatore non parte senza ventola On confermata.",
      essiccatoreNome,
    };
  }
  if (fase !== "completato") return null;
  if (passi.length < atteso) {
    return {
      livello: "attenzione",
      titolo: kind === "arresto" ? "Arresto incompleto" : "Avvio incompleto",
      testo: "Lo scambio è finito, ma manca almeno un messaggio della cadenza di sicurezza.",
      essiccatoreNome,
    };
  }
  return {
    livello: "ok",
    titolo: kind === "arresto" ? "Arresto confermato" : "Avvio confermato",
    testo:
      kind === "arresto"
        ? "Bruciatore spento e ventola confermata. La procedura è al 100%."
        : "Tutti i messaggi sono stati confermati. La procedura è al 100%.",
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
  kind?: "avvio" | "arresto";
  onCompletata?: () => void;
};

/** Cadenza di sicurezza: set ventola → On ventola → set temperatura → On bruciatore. */
export const ORDINE_SICUREZZA_AVVIO = [
  MEX_CMD.FAN_POWER,
  MEX_CMD.FAN_CONSENT,
  MEX_CMD.BURNER_TEMP,
  MEX_CMD.BURNER_POWER,
  MEX_CMD.BURNER_CONSENT,
] as const;

/** Sicurezza arresto: bruciatore Off, poi ventola di raffreddamento. */
export const ORDINE_SICUREZZA_ARRESTO = [
  MEX_CMD.BURNER_CONSENT,
  MEX_CMD.BURNER_POWER,
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
    kind: "avvio",
    passi,
  };
}

function outsDaArresto(azione: ActionEssiccatoreAzione): MexFrame[] {
  const stored = azione.messaggi
    .map((m) => {
      const hex = typeof m.payload.mex === "string" ? m.payload.mex : null;
      return hex ? decodeMexHex(hex) : null;
    })
    .filter((f): f is MexFrame => Boolean(f));
  if (stored.length >= 3) return stored;
  return encodeArrestoOut({
    essiccatoreId: azione.essiccatoreId,
    percVentilazione: azione.percVentilazione,
    consensoVentola: true,
  });
}

export function createSessioneArrestoComms(
  azione: ActionEssiccatoreAzione,
  essiccatoreNome: string,
  onCompletata?: () => void
): MexCommsSessione {
  const byCmd = new Map(outsDaArresto(azione).map((f) => [f.cmd, f]));
  const passi: MexCommsPasso[] = [];
  ORDINE_SICUREZZA_ARRESTO.forEach((cmd, i) => {
    const frame = byCmd.get(cmd);
    if (!frame) return;
    passi.push({
      id: `${azione.id}-stop-${i}`,
      titolo: titoloOperatoreMex(frame),
      frame,
      richiedeVentolaOn: false,
    });
  });
  return {
    id: azione.id,
    essiccatoreNome,
    azioneId: azione.id,
    kind: "arresto",
    onCompletata,
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
