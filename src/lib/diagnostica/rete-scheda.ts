export type IstanteRete = {
  start: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
};

export type ReteAzioneScheda = {
  affidabilita: "verificata" | "incerta";
  attesaHttpMs: number | null;
  httpMs: number | null;
  primoByteMs: number | null;
  dopoRispostaMs: number | null;
};

const FINESTRA_MS = 1500;
const TOLLERANZA_MS = 40;

const INCERTA: ReteAzioneScheda = {
  affidabilita: "incerta",
  attesaHttpMs: null,
  httpMs: null,
  primoByteMs: null,
  dopoRispostaMs: null,
};

export function associaReteAzione(input: {
  invocazione: number;
  completamento: number;
  risorse: IstanteRete[];
}): ReteAzioneScheda {
  const candidate = input.risorse.filter(
    (risorsa) =>
      risorsa.start >= input.invocazione - 1 &&
      risorsa.responseEnd <= input.completamento + TOLLERANZA_MS &&
      risorsa.responseEnd >= input.completamento - FINESTRA_MS &&
      risorsa.requestStart > 0 &&
      risorsa.responseStart >= risorsa.requestStart &&
      risorsa.responseEnd >= risorsa.responseStart
  );
  if (candidate.length !== 1) return INCERTA;
  const rete = candidate[0];
  return {
    affidabilita: "verificata",
    attesaHttpMs: Math.max(0, Math.round(rete.requestStart - input.invocazione)),
    httpMs: Math.max(0, Math.round(rete.responseEnd - rete.requestStart)),
    primoByteMs: Math.max(0, Math.round(rete.responseStart - rete.requestStart)),
    dopoRispostaMs: Math.max(0, Math.round(input.completamento - rete.responseEnd)),
  };
}

export function normalizzaReteAzione(valore: unknown): ReteAzioneScheda | null {
  if (!valore || typeof valore !== "object") return null;
  const record = valore as Record<string, unknown>;
  if (record.affidabilita === "incerta") return INCERTA;
  if (record.affidabilita !== "verificata") return null;
  const attesa = numero(record.attesaHttpMs);
  const http = numero(record.httpMs);
  const primo = numero(record.primoByteMs);
  const dopo = numero(record.dopoRispostaMs);
  if (attesa == null || http == null || primo == null || dopo == null) return INCERTA;
  return {
    affidabilita: "verificata",
    attesaHttpMs: Math.max(0, Math.round(attesa)),
    httpMs: Math.max(0, Math.round(http)),
    primoByteMs: Math.max(0, Math.round(primo)),
    dopoRispostaMs: Math.max(0, Math.round(dopo)),
  };
}

function numero(valore: unknown): number | null {
  return typeof valore === "number" && Number.isFinite(valore) ? valore : null;
}
