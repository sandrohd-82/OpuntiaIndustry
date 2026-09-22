/**
 * Protocollo Mex v1 (grafica ora, IoT dopo).
 * Frame fisso 9 byte, checksum stile XBee: CHK = 0xFF − (somma payload & 0xFF).
 *
 * 7E | LEN | DIR | TIPO | CMD | D0 | D1 | D2 | CHK
 * LEN = 6 (byte da DIR a D2, esclusi start/len/chk)
 */

export const MEX_VERSIONE = 1;
export const MEX_START = 0x7e;
export const MEX_PAYLOAD_LEN = 6;

export const MEX_TIPI = {
  A: { lettera: "A", nome: "Action", spiegazione: "Comando di settaggio dal master al device." },
  R: { lettera: "R", nome: "Request", spiegazione: "Richiesta lettura (es. un sensore)." },
  K: { lettera: "K", nome: "acK", spiegazione: "Conferma: ricevuto sì/no + stato attuale." },
  S: { lettera: "S", nome: "Sensor", spiegazione: "Dato di sensoristica in ingresso." },
} as const;

export type MexTipoLettera = keyof typeof MEX_TIPI;
export type MexDir = "O" | "I";

export const MEX_CMD = {
  BURNER_CONSENT: 0x01,
  BURNER_TEMP: 0x02,
  FAN_CONSENT: 0x03,
  FAN_POWER: 0x04,
  SENSOR: 0x10,
} as const;

export type MexCmd = (typeof MEX_CMD)[keyof typeof MEX_CMD];

export type MexFrame = {
  bytes: number[];
  hex: string;
  hexSpaced: string;
  dir: MexDir;
  tipo: MexTipoLettera;
  cmd: number;
  codice: string;
  d0: number;
  d1: number;
  d2: number;
  len: number;
  chk: number;
  valido: boolean;
};

export type MexLogRiga = {
  id: string;
  verso: "out" | "in";
  stato: "inviato" | "in_attesa" | "ricevuto";
  titolo: string;
  dettaglio: string;
  frame: MexFrame;
};

function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

export function mexChecksum(payload: number[]): number {
  const sum = payload.reduce((acc, b) => acc + (b & 0xff), 0);
  return (0xff - (sum & 0xff)) & 0xff;
}

export function mexVerifica(payload: number[], chk: number): boolean {
  return ((payload.reduce((acc, b) => acc + (b & 0xff), 0) + (chk & 0xff)) &
    0xff) === 0xff;
}

export function mexCodice(tipo: MexTipoLettera, cmd: number): string {
  return `${tipo}${hex2(cmd)}`;
}

export function encodeMex(input: {
  dir: MexDir;
  tipo: MexTipoLettera;
  cmd: number;
  d0?: number;
  d1?: number;
  d2?: number;
}): MexFrame {
  const d0 = input.d0 ?? 0;
  const d1 = input.d1 ?? 0;
  const d2 = input.d2 ?? 0;
  const payload = [
    input.dir.charCodeAt(0),
    input.tipo.charCodeAt(0),
    input.cmd & 0xff,
    d0 & 0xff,
    d1 & 0xff,
    d2 & 0xff,
  ];
  const chk = mexChecksum(payload);
  const bytes = [MEX_START, MEX_PAYLOAD_LEN, ...payload, chk];
  const hex = bytes.map(hex2).join("");
  return {
    bytes,
    hex,
    hexSpaced: bytes.map(hex2).join(" "),
    dir: input.dir,
    tipo: input.tipo,
    cmd: input.cmd & 0xff,
    codice: mexCodice(input.tipo, input.cmd),
    d0: d0 & 0xff,
    d1: d1 & 0xff,
    d2: d2 & 0xff,
    len: MEX_PAYLOAD_LEN,
    chk,
    valido: true,
  };
}

export function decodeMexHex(hexRaw: string): MexFrame | null {
  const hex = hexRaw.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 18) return null;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  if (bytes[0] !== MEX_START || bytes[1] !== MEX_PAYLOAD_LEN) return null;
  const payload = bytes.slice(2, 8);
  const chk = bytes[8] ?? 0;
  const dirChar = String.fromCharCode(payload[0] ?? 0);
  const tipoChar = String.fromCharCode(payload[1] ?? 0);
  if (dirChar !== "O" && dirChar !== "I") return null;
  if (tipoChar !== "A" && tipoChar !== "R" && tipoChar !== "K" && tipoChar !== "S") {
    return null;
  }
  const cmd = payload[2] ?? 0;
  return {
    bytes,
    hex: hex.toUpperCase(),
    hexSpaced: bytes.map(hex2).join(" "),
    dir: dirChar,
    tipo: tipoChar,
    cmd,
    codice: mexCodice(tipoChar, cmd),
    d0: payload[3] ?? 0,
    d1: payload[4] ?? 0,
    d2: payload[5] ?? 0,
    len: MEX_PAYLOAD_LEN,
    chk,
    valido: mexVerifica(payload, chk),
  };
}

function onByte(on: boolean): number {
  return on ? 0x01 : 0x00;
}

export function encodeAvvioOut(input: {
  consensoBruciatore: boolean;
  tempBruciatoreC: number;
  consensoVentola: boolean;
  percVentilazione: number;
}): MexFrame[] {
  return [
    encodeMex({
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.BURNER_CONSENT,
      d0: onByte(input.consensoBruciatore),
    }),
    encodeMex({
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.BURNER_TEMP,
      d0: input.tempBruciatoreC,
    }),
    encodeMex({
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.FAN_CONSENT,
      d0: onByte(input.consensoVentola),
    }),
    encodeMex({
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.FAN_POWER,
      d0: input.percVentilazione,
    }),
  ];
}

export function encodeAckAtteso(out: MexFrame): MexFrame {
  return encodeMex({
    dir: "I",
    tipo: "K",
    cmd: out.cmd,
    d0: 0x01,
    d1: out.d0,
    d2: 0x00,
  });
}

export function titoloMex(frame: MexFrame): string {
  const voce = MEX_LEGGENDA.find(
    (r) => r.tipo === frame.tipo && r.cmd === frame.cmd && r.dir === frame.dir
  );
  return voce?.titolo ?? `${frame.codice}`;
}

export function dettaglioValore(frame: MexFrame): string {
  if (frame.cmd === MEX_CMD.BURNER_CONSENT || frame.cmd === MEX_CMD.FAN_CONSENT) {
    if (frame.tipo === "K") {
      return `Ricezione ${frame.d0 ? "true" : "false"} · Stato ${frame.d1 ? "On" : "Off"}`;
    }
    return frame.d0 ? "On" : "Off";
  }
  if (frame.cmd === MEX_CMD.BURNER_TEMP) {
    if (frame.tipo === "K") {
      return `Ricezione ${frame.d0 ? "true" : "false"} · ${frame.d1}°C`;
    }
    return `${frame.d0}°C`;
  }
  if (frame.cmd === MEX_CMD.FAN_POWER) {
    if (frame.tipo === "K") {
      return `Ricezione ${frame.d0 ? "true" : "false"} · ${frame.d1}%`;
    }
    return `${frame.d0}%`;
  }
  if (frame.cmd === MEX_CMD.SENSOR) {
    return `Id ${hex2(frame.d0)} · dato ${frame.d1 * 256 + frame.d2}`;
  }
  return `${hex2(frame.d0)} ${hex2(frame.d1)} ${hex2(frame.d2)}`;
}

export function buildMexLogAvvio(azione: {
  id: string;
  consensoBruciatore: boolean;
  tempBruciatoreC: number;
  consensoVentola: boolean;
  percVentilazione: number;
  messaggi: Array<{ payload: Record<string, unknown> }>;
}): MexLogRiga[] {
  const stored = azione.messaggi
    .map((m) => {
      const hex =
        typeof m.payload.mex === "string" ? m.payload.mex : null;
      return hex ? decodeMexHex(hex) : null;
    })
    .filter((f): f is MexFrame => Boolean(f));

  const outs =
    stored.length === 4
      ? stored
      : encodeAvvioOut({
          consensoBruciatore: azione.consensoBruciatore,
          tempBruciatoreC: azione.tempBruciatoreC,
          consensoVentola: azione.consensoVentola,
          percVentilazione: azione.percVentilazione,
        });

  const rows: MexLogRiga[] = [];
  outs.forEach((out, i) => {
    const ack = encodeAckAtteso(out);
    rows.push({
      id: `out-${azione.id}-${i}`,
      verso: "out",
      stato: "inviato",
      titolo: titoloMex(out),
      dettaglio: dettaglioValore(out),
      frame: out,
    });
    rows.push({
      id: `in-${azione.id}-${i}`,
      verso: "in",
      stato: "in_attesa",
      titolo: titoloMex(ack),
      dettaglio: `Atteso: ${dettaglioValore(ack)}`,
      frame: ack,
    });
  });
  return rows;
}

export type MexLeggendaVoce = {
  dir: MexDir;
  versoLabel: "Out" | "In";
  tipo: MexTipoLettera;
  cmd: number;
  codice: string;
  titolo: string;
  significato: string;
  spiegazione: string;
  esempio: MexFrame;
};

function voce(
  dir: MexDir,
  tipo: MexTipoLettera,
  cmd: number,
  titolo: string,
  significato: string,
  spiegazione: string,
  d0: number,
  d1 = 0,
  d2 = 0
): MexLeggendaVoce {
  const esempio = encodeMex({ dir, tipo, cmd, d0, d1, d2 });
  return {
    dir,
    versoLabel: dir === "O" ? "Out" : "In",
    tipo,
    cmd,
    codice: esempio.codice,
    titolo,
    significato,
    spiegazione,
    esempio,
  };
}

export const MEX_LEGGENDA: MexLeggendaVoce[] = [
  voce(
    "O",
    "A",
    MEX_CMD.BURNER_CONSENT,
    "Consenso bruciatore",
    "On/Off consenso al bruciatore",
    "Il master autorizza o toglie il consenso. D0=01 On, D0=00 Off. Senza consenso il bruciatore non accende.",
    0x01
  ),
  voce(
    "O",
    "A",
    MEX_CMD.BURNER_TEMP,
    "Temperatura bruciatore",
    "Valore temperatura da mantenere (°C)",
    "Setpoint 35–70. D0 è il valore in °C (es. 32 hex = 50 °C). Il device regola la % bruciatore dalla sonda TEMP-BRUC.",
    50
  ),
  voce(
    "O",
    "A",
    MEX_CMD.FAN_CONSENT,
    "Consenso ventilazione",
    "On/Off consenso alla ventola",
    "Il master autorizza o toglie il consenso ventola. D0=01 On, D0=00 Off.",
    0x01
  ),
  voce(
    "O",
    "A",
    MEX_CMD.FAN_POWER,
    "Potenza ventilazione",
    "Valore potenza 00–64 hex (% ventilazione)",
    "D0 è la percentuale 0–100. Esempio 28 hex = 40%.",
    40
  ),
  voce(
    "O",
    "R",
    MEX_CMD.SENSOR,
    "Richiesta sensore",
    "Richiesta generica valore sensore",
    "D0 = id sensore in hex (es. A1). D1–D2 = 0000 in richiesta (il dato arriva nella risposta S).",
    0xa1,
    0x00,
    0x00
  ),
  voce(
    "I",
    "K",
    MEX_CMD.BURNER_CONSENT,
    "Risposta consenso bruciatore",
    "true/false ricezione + On/Off stato bruciatore",
    "D0=01 ricevuto ok (00 no). D1= stato bruciatore 01 On / 00 Off.",
    0x01,
    0x01
  ),
  voce(
    "I",
    "K",
    MEX_CMD.BURNER_TEMP,
    "Risposta temperatura bruciatore",
    "true/false ricezione + valore impostato",
    "D0=01 ricevuto ok. D1 = setpoint °C confermato dal device.",
    0x01,
    50
  ),
  voce(
    "I",
    "K",
    MEX_CMD.FAN_CONSENT,
    "Risposta consenso ventola",
    "true/false ricezione + On/Off stato ventola",
    "D0=01 ricevuto ok. D1= stato ventola 01 On / 00 Off.",
    0x01,
    0x01
  ),
  voce(
    "I",
    "K",
    MEX_CMD.FAN_POWER,
    "Risposta % ventola",
    "true/false ricezione + valore impostato",
    "D0=01 ricevuto ok. D1 = percentuale confermata.",
    0x01,
    40
  ),
  voce(
    "I",
    "S",
    MEX_CMD.SENSOR,
    "Dati sensoristica",
    "Invio dato sensore (id hex + valore intero)",
    "D0 = id sensore (es. A1). D1–D2 = valore intero big-endian (0000 = 0). Usato come risposta a R10 o in telemetria.",
    0xa1,
    0x00,
    0x00
  ),
];
