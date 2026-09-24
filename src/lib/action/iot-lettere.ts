type ComandoLettera = "on" | "off" | "setpoint";

/**
 * Corpo semantico IoT v1 (Archivio → IoT).
 * Non è il frame: il filo resta Mex v2
 * 7E | LEN | CLS | UID[8] | DIR | TIPO | CMD | D0 D1 D2 | CHK
 * (es. 7E 0F 49 00 13 A2 00 41 62 C8 1F 4F 41 …).
 * Minuscola = master (Gestionale) → slave (oggetto).
 * Maiuscola = stessa lettera, risposta oggetto → Gestionale.
 */
export const IOT_LETTERE_VERSIONE = 1;

export const IOT_LETTERE = ["h", "l", "r", "i", "s"] as const;
export type IotLettera = (typeof IOT_LETTERE)[number];

export const IOT_LETTERA_META: Record<
  IotLettera,
  { nome: string; uso: string; esempioOut: string; esempioAck: string; notaAck: string }
> = {
  h: {
    nome: "High",
    uso: "On nelle azioni On/Off",
    esempioOut: "h21",
    esempioAck: "H21",
    notaAck: "Conferma High sul componente 21",
  },
  l: {
    nome: "Low",
    uso: "Off nelle azioni On/Off",
    esempioOut: "l21",
    esempioAck: "L21",
    notaAck: "Conferma Low sul componente 21",
  },
  r: {
    nome: "Regola",
    uso: "Regola inverter o setpoint (valore % o °C)",
    esempioOut: "r65",
    esempioAck: "R65",
    notaAck: "Conferma regola al 65%",
  },
  i: {
    nome: "Input",
    uso: "Impulso sul componente",
    esempioOut: "i12",
    esempioAck: "I12",
    notaAck: "Conferma impulso sul componente 12",
  },
  s: {
    nome: "Sensor",
    uso: "Richiesta valore sensore",
    esempioOut: "s35",
    esempioAck: "S35-0256",
    notaAck: "0256 = 25,6 (quattro cifre in decimi)",
  },
};

export type IotLetteraVoce = {
  lettera: IotLettera;
  verso: "out" | "in";
  messaggio: string;
  titolo: string;
  significato: string;
};

/** Catalogo ufficiale da mostrare in Archivio IoT. */
export const IOT_LETTERE_LEGGENDA: IotLetteraVoce[] = [
  {
    lettera: "h",
    verso: "out",
    messaggio: "h21",
    titolo: "High componente 21",
    significato: "Gestionale → oggetto: On sul componente 21",
  },
  {
    lettera: "h",
    verso: "in",
    messaggio: "H21",
    titolo: "Risposta High 21",
    significato: "Oggetto → gestionale: On confermato sul 21",
  },
  {
    lettera: "l",
    verso: "out",
    messaggio: "l21",
    titolo: "Low componente 21",
    significato: "Gestionale → oggetto: Off sul componente 21",
  },
  {
    lettera: "l",
    verso: "in",
    messaggio: "L21",
    titolo: "Risposta Low 21",
    significato: "Oggetto → gestionale: Off confermato sul 21",
  },
  {
    lettera: "r",
    verso: "out",
    messaggio: "r65",
    titolo: "Regola 65%",
    significato: "Gestionale → oggetto: regola inverter / setpoint a 65",
  },
  {
    lettera: "r",
    verso: "in",
    messaggio: "R65",
    titolo: "Risposta Regola 65",
    significato: "Oggetto → gestionale: valore 65 confermato",
  },
  {
    lettera: "i",
    verso: "out",
    messaggio: "i12",
    titolo: "Input impulso 12",
    significato: "Gestionale → oggetto: impulso sul componente 12",
  },
  {
    lettera: "i",
    verso: "in",
    messaggio: "I12",
    titolo: "Risposta Input 12",
    significato: "Oggetto → gestionale: impulso 12 eseguito",
  },
  {
    lettera: "s",
    verso: "out",
    messaggio: "s35",
    titolo: "Richiesta sensore 35",
    significato: "Gestionale → oggetto: leggi il sensore 35",
  },
  {
    lettera: "s",
    verso: "in",
    messaggio: "S35-0256",
    titolo: "Risposta sensore 35 = 25,6",
    significato: "Oggetto → gestionale: S{id}-{4 cifre in decimi}. 0256 = 25,6",
  },
];

export function letteraDaPasso(input: {
  comando: ComandoLettera;
  tipoAttuatore?: string | null;
}): IotLettera {
  if (input.tipoAttuatore === "on_off_temporizzato" && input.comando === "on") {
    return "i";
  }
  if (input.comando === "off") return "l";
  if (input.comando === "setpoint") return "r";
  if (input.comando === "on") return "h";
  return "h";
}

export function encodeLetteraOut(input: {
  lettera: IotLettera;
  indirizzo: number;
  valore?: number | null;
}): string {
  const n = Math.round(input.indirizzo);
  if (input.lettera === "r") {
    const v = Math.max(0, Math.round(input.valore ?? 0));
    return `r${v}`;
  }
  return `${input.lettera}${n}`;
}

export function encodeLetteraAck(
  out: string,
  opts?: { sensoreValore?: number | null }
): string {
  if (out.startsWith("s")) {
    const id = out.slice(1);
    if (opts?.sensoreValore == null) return `S${id}-xxxx`;
    const decimi = String(Math.round(opts.sensoreValore * 10)).padStart(4, "0");
    return `S${id}-${decimi}`;
  }
  return out.toUpperCase();
}

export function titoloLetteraOut(lettera: IotLettera, messaggio: string): string {
  if (lettera === "h") return `High On · ${messaggio}`;
  if (lettera === "l") return `Low Off · ${messaggio}`;
  if (lettera === "r") return `Regola · ${messaggio}`;
  if (lettera === "i") return `Input impulso · ${messaggio}`;
  return `Richiesta sensore · ${messaggio}`;
}

export function titoloLetteraAck(lettera: IotLettera, messaggio: string): string {
  if (lettera === "h") return `Risposta High · ${messaggio}`;
  if (lettera === "l") return `Risposta Low · ${messaggio}`;
  if (lettera === "r") return `Risposta Regola · ${messaggio}`;
  if (lettera === "i") return `Risposta Input · ${messaggio}`;
  return `Risposta Sensor · ${messaggio}`;
}

export function coppiaLettereDaPasso(input: {
  mexCmd: number | null;
  comando: ComandoLettera;
  valore: number | null;
  tipoAttuatore?: string | null;
}): {
  lettera: IotLettera;
  out: string;
  ack: string;
  titoloOut: string;
  titoloAck: string;
} | null {
  if (input.mexCmd == null || input.mexCmd < 0 || input.mexCmd > 255) {
    return null;
  }
  const lettera = letteraDaPasso(input);
  const out = encodeLetteraOut({
    lettera,
    indirizzo: input.mexCmd,
    valore: input.valore,
  });
  const ack = encodeLetteraAck(out);
  return {
    lettera,
    out,
    ack,
    titoloOut: titoloLetteraOut(lettera, out),
    titoloAck: titoloLetteraAck(lettera, ack),
  };
}
