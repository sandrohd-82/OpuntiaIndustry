/**
 * Protocollo Mex v2 — un frame per WiFi, XBee e LoRa.
 *
 * 7E | LEN | CLS | UID[8] | DIR | TIPO | CMD | D0 D1 D2 | CHK
 *
 * UID = 8 byte IEEE (XBee SH+SL / LoRa DevEUI / anagrafica WiFi).
 * CHK = 0xFF − (somma da CLS a D2 & 0xFF), come XBee.
 */

export const MEX_VERSIONE = 2;
export const MEX_START = 0x7e;
/** Byte da CLS a D2 (esclusi 7E, LEN, CHK). */
export const MEX_PAYLOAD_LEN = 15;

export const MEX_CLASSI = {
  C: {
    lettera: "C",
    nome: "Comunicazione",
    spiegazione: "Richieste, ack, telemetria ordinaria.",
  },
  I: {
    lettera: "I",
    nome: "Impostazione",
    spiegazione: "Comandi di settaggio (On/Off, temperatura, %).",
  },
  E: {
    lettera: "E",
    nome: "Errore",
    spiegazione: "Anomalia di parse, checksum o impianto.",
  },
  A: {
    lettera: "A",
    nome: "Allerta",
    spiegazione: "Allarme operativo (soglia, sicurezza).",
  },
} as const;

export type MexClasse = keyof typeof MEX_CLASSI;

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

/** Esempio documentato: XBee SH=0013A200 (OUI Digi) + SL=4162C81F. Stesso UID su WiFi/LoRa. */
export const MEX_UID_ESEMPIO = [
  0x00, 0x13, 0xa2, 0x00, 0x41, 0x62, 0xc8, 0x1f,
] as const;

export const MEX_UID_PER_ESSICCATORE: Record<string, number[]> = {
  "ess-a": [...MEX_UID_ESEMPIO],
  "ess-b": [0x00, 0x13, 0xa2, 0x00, 0x41, 0x62, 0xc8, 0x20],
  "ess-ultimo-stadio": [0x00, 0x13, 0xa2, 0x00, 0x41, 0x62, 0xc8, 0x21],
};

export type MexFrame = {
  bytes: number[];
  hex: string;
  hexSpaced: string;
  cls: MexClasse;
  uid: number[];
  uidHex: string;
  uidHigh: string;
  uidLow: string;
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

export function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

export function bytesToHex(bytes: readonly number[]): string {
  return bytes.map(hex2).join("");
}

export function bytesToHexSpaced(bytes: readonly number[]): string {
  return bytes.map(hex2).join(" ");
}

function parseHexBytes(hexRaw: string): number[] | null {
  const hex = hexRaw.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

export function mexChecksum(payload: number[]): number {
  const sum = payload.reduce((acc, b) => acc + (b & 0xff), 0);
  return (0xff - (sum & 0xff)) & 0xff;
}

export function mexVerifica(payload: number[], chk: number): boolean {
  return (
    ((payload.reduce((acc, b) => acc + (b & 0xff), 0) + (chk & 0xff)) & 0xff) ===
    0xff
  );
}

export function mexCodice(tipo: MexTipoLettera, cmd: number): string {
  return `${tipo}${hex2(cmd)}`;
}

export function uidPerEssiccatore(essiccatoreId: string): number[] {
  return [...(MEX_UID_PER_ESSICCATORE[essiccatoreId] ?? MEX_UID_ESEMPIO)];
}

export function formatUid(uid: readonly number[]): {
  uidHex: string;
  uidHigh: string;
  uidLow: string;
} {
  const bytes = [...uid].slice(0, 8);
  while (bytes.length < 8) bytes.push(0);
  return {
    uidHex: bytesToHex(bytes),
    uidHigh: bytesToHex(bytes.slice(0, 4)),
    uidLow: bytesToHex(bytes.slice(4, 8)),
  };
}

function defaultCls(tipo: MexTipoLettera): MexClasse {
  return tipo === "A" ? "I" : "C";
}

export function encodeMex(input: {
  dir: MexDir;
  tipo: MexTipoLettera;
  cmd: number;
  d0?: number;
  d1?: number;
  d2?: number;
  cls?: MexClasse;
  uid?: readonly number[];
}): MexFrame {
  const d0 = input.d0 ?? 0;
  const d1 = input.d1 ?? 0;
  const d2 = input.d2 ?? 0;
  const cls = input.cls ?? defaultCls(input.tipo);
  const uid = [...(input.uid ?? MEX_UID_ESEMPIO)].slice(0, 8);
  while (uid.length < 8) uid.push(0);
  const payload = [
    cls.charCodeAt(0),
    ...uid,
    input.dir.charCodeAt(0),
    input.tipo.charCodeAt(0),
    input.cmd & 0xff,
    d0 & 0xff,
    d1 & 0xff,
    d2 & 0xff,
  ];
  const chk = mexChecksum(payload);
  const bytes = [MEX_START, MEX_PAYLOAD_LEN, ...payload, chk];
  const names = formatUid(uid);
  return {
    bytes,
    hex: bytesToHex(bytes),
    hexSpaced: bytesToHexSpaced(bytes),
    cls,
    uid,
    uidHex: names.uidHex,
    uidHigh: names.uidHigh,
    uidLow: names.uidLow,
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
  const bytes = parseHexBytes(hexRaw);
  if (!bytes || bytes.length !== 18) return null;
  if (bytes[0] !== MEX_START || bytes[1] !== MEX_PAYLOAD_LEN) return null;
  const payload = bytes.slice(2, 17);
  const chk = bytes[17] ?? 0;
  const clsChar = String.fromCharCode(payload[0] ?? 0);
  if (clsChar !== "C" && clsChar !== "I" && clsChar !== "E" && clsChar !== "A") {
    return null;
  }
  const uid = payload.slice(1, 9);
  const dirChar = String.fromCharCode(payload[9] ?? 0);
  const tipoChar = String.fromCharCode(payload[10] ?? 0);
  if (dirChar !== "O" && dirChar !== "I") return null;
  if (tipoChar !== "A" && tipoChar !== "R" && tipoChar !== "K" && tipoChar !== "S") {
    return null;
  }
  const cmd = payload[11] ?? 0;
  const names = formatUid(uid);
  return {
    bytes,
    hex: bytesToHex(bytes),
    hexSpaced: bytesToHexSpaced(bytes),
    cls: clsChar,
    uid,
    uidHex: names.uidHex,
    uidHigh: names.uidHigh,
    uidLow: names.uidLow,
    dir: dirChar,
    tipo: tipoChar,
    cmd,
    codice: mexCodice(tipoChar, cmd),
    d0: payload[12] ?? 0,
    d1: payload[13] ?? 0,
    d2: payload[14] ?? 0,
    len: MEX_PAYLOAD_LEN,
    chk,
    valido: mexVerifica(payload, chk),
  };
}

function onByte(on: boolean): number {
  return on ? 0x01 : 0x00;
}

export function encodeAvvioOut(input: {
  essiccatoreId?: string;
  consensoBruciatore: boolean;
  tempBruciatoreC: number;
  consensoVentola: boolean;
  percVentilazione: number;
}): MexFrame[] {
  const uid = uidPerEssiccatore(input.essiccatoreId ?? "ess-a");
  const base = { cls: "I" as const, uid };
  /** Sicurezza: mai bruciatore prima della ventola confermata On. */
  return [
    encodeMex({
      ...base,
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.FAN_POWER,
      d0: input.percVentilazione,
    }),
    encodeMex({
      ...base,
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.FAN_CONSENT,
      d0: onByte(input.consensoVentola),
    }),
    encodeMex({
      ...base,
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.BURNER_TEMP,
      d0: input.tempBruciatoreC,
    }),
    encodeMex({
      ...base,
      dir: "O",
      tipo: "A",
      cmd: MEX_CMD.BURNER_CONSENT,
      d0: onByte(input.consensoBruciatore),
    }),
  ];
}

export function encodeAckAtteso(out: MexFrame): MexFrame {
  return encodeMex({
    cls: "C",
    uid: out.uid,
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

/** Titolo operatore nella modale di scambio (grafica, prima dell’IoT reale). */
export function titoloOperatoreMex(frame: MexFrame): string {
  if (frame.cmd === MEX_CMD.FAN_POWER) {
    return frame.dir === "O" ? "Imposta potenza ventola" : "Conferma potenza ventola";
  }
  if (frame.cmd === MEX_CMD.BURNER_TEMP) {
    return frame.dir === "O"
      ? "Imposta temperatura bruciatore"
      : "Conferma temperatura bruciatore";
  }
  if (frame.cmd === MEX_CMD.FAN_CONSENT) {
    return frame.d0 ? "On ventola" : "Off ventola";
  }
  if (frame.cmd === MEX_CMD.BURNER_CONSENT) {
    return frame.d0 ? "On bruciatore" : "Off bruciatore";
  }
  return titoloMex(frame);
}

export function dettaglioValore(frame: MexFrame): string {
  const uid = `SH ${frame.uidHigh} · SL ${frame.uidLow}`;
  if (frame.cmd === MEX_CMD.BURNER_CONSENT || frame.cmd === MEX_CMD.FAN_CONSENT) {
    if (frame.tipo === "K") {
      return `${uid} · Ricezione ${frame.d0 ? "true" : "false"} · Stato ${frame.d1 ? "On" : "Off"}`;
    }
    return `${uid} · ${frame.d0 ? "On" : "Off"}`;
  }
  if (frame.cmd === MEX_CMD.BURNER_TEMP) {
    if (frame.tipo === "K") {
      return `${uid} · Ricezione ${frame.d0 ? "true" : "false"} · ${frame.d1}°C`;
    }
    return `${uid} · ${frame.d0}°C`;
  }
  if (frame.cmd === MEX_CMD.FAN_POWER) {
    if (frame.tipo === "K") {
      return `${uid} · Ricezione ${frame.d0 ? "true" : "false"} · ${frame.d1}%`;
    }
    return `${uid} · ${frame.d0}%`;
  }
  if (frame.cmd === MEX_CMD.SENSOR) {
    return `${uid} · Id ${hex2(frame.d0)} · dato ${frame.d1 * 256 + frame.d2}`;
  }
  return uid;
}

export function buildMexLogAvvio(azione: {
  id: string;
  essiccatoreId?: string;
  consensoBruciatore: boolean;
  tempBruciatoreC: number;
  consensoVentola: boolean;
  percVentilazione: number;
  messaggi: Array<{ payload: Record<string, unknown> }>;
}): MexLogRiga[] {
  const stored = azione.messaggi
    .map((m) => {
      const hex = typeof m.payload.mex === "string" ? m.payload.mex : null;
      return hex ? decodeMexHex(hex) : null;
    })
    .filter((f): f is MexFrame => Boolean(f));

  const outs =
    stored.length === 4
      ? stored
      : encodeAvvioOut({
          essiccatoreId: azione.essiccatoreId,
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

/** Checksum XBee sul campo dati (dopo Length). */
export function xbeeChecksum(frameData: number[]): number {
  return mexChecksum(frameData);
}

const XBEE_ESCAPE = new Set([0x7e, 0x7d, 0x11, 0x13]);

/** API mode 2: escape su UART (7E, 7D, 11, 13). Il 7E di start non si escapa. */
export function xbeeEscapeUart(frame: number[]): number[] {
  const out = [MEX_START];
  for (const b of frame.slice(1)) {
    if (XBEE_ESCAPE.has(b)) {
      out.push(0x7d, b ^ 0x20);
    } else {
      out.push(b);
    }
  }
  return out;
}

/** XBee Transmit Request 0x10: stesso Mex come RF Data. */
export function wrapXbeeTx10(mex: MexFrame, frameId = 0x01): {
  logico: number[];
  uartAp2: number[];
  hexLogico: string;
  hexUartAp2: string;
} {
  const data = [
    0x10,
    frameId & 0xff,
    ...mex.uid,
    0xff,
    0xfe,
    0x00,
    0x00,
    ...mex.bytes,
  ];
  const len = data.length;
  const logico = [
    MEX_START,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
    xbeeChecksum(data),
  ];
  const uartAp2 = xbeeEscapeUart(logico);
  return {
    logico,
    uartAp2,
    hexLogico: bytesToHexSpaced(logico),
    hexUartAp2: bytesToHexSpaced(uartAp2),
  };
}

export type MexScenarioTrasporto = {
  mezzo: "wifi" | "xbee" | "lora";
  titolo: string;
  spiegazione: string;
  corpo: string;
};

export function scenariOnBruciatore(frame = encodeOnBruciatoreEsempio()): MexScenarioTrasporto[] {
  const xbee = wrapXbeeTx10(frame);
  const wifiJson = {
    device_uid: frame.uidHex,
    sh: frame.uidHigh,
    sl: frame.uidLow,
    mezzo: "wifi",
    mex: frame.hex,
  };
  return [
    {
      mezzo: "wifi",
      titolo: "1 · WiFi (Arduino IoT / HTTPS)",
      spiegazione:
        "Il Mex hex viaggia nel JSON. L’id è lo stesso UID a 8 byte. TLS copre il canale; CHK resta sul Mex.",
      corpo: JSON.stringify(wifiJson, null, 2),
    },
    {
      mezzo: "xbee",
      titolo: "2 · XBee API 0x10 (SH+SL = UID Mex)",
      spiegazione:
        "Stesso Mex come RF Data. Fuori: telaio XBee 7E + Length 16 bit + 0x10 + Frame ID + destinazione 64 bit (SH 4 + SL 4) + FFFE + opzioni + Mex + CHK XBee. In AP=2 il 7E interno del Mex si escapa in UART (7D 5E).",
      corpo: [
        `UID / dest 64 bit   SH ${frame.uidHigh}  SL ${frame.uidLow}`,
        `RF Data (Mex unico) ${frame.hexSpaced}`,
        `Frame API AP=1      ${xbee.hexLogico}`,
        `UART AP=2 (escaped) ${xbee.hexUartAp2}`,
      ].join("\n"),
    },
    {
      mezzo: "lora",
      titolo: "3 · LoRa / LoRaWAN",
      spiegazione:
        "Stesso Mex come FRMPayload. DevEUI = UID (8 byte, come SH+SL). FPort applicativo (es. 1). MHDR/MIC li mette lo stack LoRa; il gateway inoltra al gestionale solo il hex Mex.",
      corpo: [
        `DevEUI              ${frame.uidHex}`,
        `FPort               01`,
        `FRMPayload (Mex)    ${frame.hexSpaced}`,
        `Nota                downlink raro in LoRaWAN: stesso hex, pochi invii.`,
      ].join("\n"),
    },
  ];
}

export function encodeOnBruciatoreEsempio(): MexFrame {
  return encodeMex({
    cls: "I",
    uid: MEX_UID_ESEMPIO,
    dir: "O",
    tipo: "A",
    cmd: MEX_CMD.BURNER_CONSENT,
    d0: 0x01,
  });
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
  const esempio = encodeMex({ dir, tipo, cmd, d0, d1, d2, uid: MEX_UID_ESEMPIO });
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
    "Classe I (impostazione). D0=01 On, D0=00 Off. UID 8 byte = destinazione.",
    0x01
  ),
  voce(
    "O",
    "A",
    MEX_CMD.BURNER_TEMP,
    "Temperatura bruciatore",
    "Valore temperatura da mantenere (°C)",
    "Setpoint 35–70 in D0. Il device regola la % dalla sonda TEMP-BRUC.",
    50
  ),
  voce(
    "O",
    "A",
    MEX_CMD.FAN_CONSENT,
    "Consenso ventilazione",
    "On/Off consenso alla ventola",
    "Classe I. D0=01 On, D0=00 Off.",
    0x01
  ),
  voce(
    "O",
    "A",
    MEX_CMD.FAN_POWER,
    "Potenza ventilazione",
    "Valore potenza 00–64 hex (% ventilazione)",
    "D0 = percentuale 0–100. Esempio 28 hex = 40%.",
    40
  ),
  voce(
    "O",
    "R",
    MEX_CMD.SENSOR,
    "Richiesta sensore",
    "Richiesta generica valore sensore",
    "Classe C. D0 = id sensore (es. A1). D1–D2 = 0000 in richiesta.",
    0xa1
  ),
  voce(
    "I",
    "K",
    MEX_CMD.BURNER_CONSENT,
    "Risposta consenso bruciatore",
    "true/false ricezione + On/Off stato bruciatore",
    "Classe C. D0=01 ok. D1= stato 01 On / 00 Off.",
    0x01,
    0x01
  ),
  voce(
    "I",
    "K",
    MEX_CMD.BURNER_TEMP,
    "Risposta temperatura bruciatore",
    "true/false ricezione + valore impostato",
    "Classe C. D1 = setpoint °C confermato.",
    0x01,
    50
  ),
  voce(
    "I",
    "K",
    MEX_CMD.FAN_CONSENT,
    "Risposta consenso ventola",
    "true/false ricezione + On/Off stato ventola",
    "Classe C. D1= stato ventola.",
    0x01,
    0x01
  ),
  voce(
    "I",
    "K",
    MEX_CMD.FAN_POWER,
    "Risposta % ventola",
    "true/false ricezione + valore impostato",
    "Classe C. D1 = percentuale confermata.",
    0x01,
    40
  ),
  voce(
    "I",
    "S",
    MEX_CMD.SENSOR,
    "Dati sensoristica",
    "Invio dato sensore (id hex + valore intero)",
    "Classe C. D0 = id sonda. D1–D2 = valore big-endian.",
    0xa1
  ),
];
