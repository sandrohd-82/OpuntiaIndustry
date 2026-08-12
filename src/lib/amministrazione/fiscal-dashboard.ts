import { roundMoney } from "@/lib/amministrazione/fatture";
import type { CompanyFiscalProfile } from "@/lib/amministrazione/fiscal-profile";
import type { DashboardFiscalePeriodoTipo } from "@/types/database";

export type FiscalPeriodo = {
  tipo: DashboardFiscalePeriodoTipo;
  label: string;
  dal: string;
  al: string;
};

export type FiscalIvaSummary = {
  ivaDebito: number;
  ivaCredito: number;
  ivaCreditoCompensazioneArt34: number;
  ivaSaldo: number;
  noteCalcolo: string[];
};

export type FiscalUtileStima = {
  imponibileEmesso: number;
  imponibileRicevuto: number;
  utileStimato: number;
  stimaIres: number;
  stimaIrap: number;
  stimaInpsPeriodo: number;
  stimaTasseTotale: number;
  noteCalcolo: string[];
};

export type ScadenzaUnificata = {
  id: string;
  data: string;
  tipo: "incasso" | "pagamento" | "adempimento";
  titolo: string;
  importo: number | null;
  stato: "pagato" | "da_pagare" | "previsto";
  riferimento: string;
  fatturaId?: string;
  fatturaKind?: "emessa" | "ricevuta";
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

export function resolveFiscalPeriodo(input: {
  tipo: "mese" | "trimestre";
  anno?: number;
  mese?: number;
  now?: Date;
}): FiscalPeriodo {
  const now = input.now ?? new Date();
  const anno = input.anno ?? now.getFullYear();
  if (input.tipo === "mese") {
    const mese = input.mese ?? now.getMonth() + 1;
    const last = new Date(anno, mese, 0).getDate();
    return {
      tipo: "mese",
      label: `${pad2(mese)}/${anno}`,
      dal: `${anno}-${pad2(mese)}-01`,
      al: `${anno}-${pad2(mese)}-${pad2(last)}`,
    };
  }
  const meseCorrente = input.mese ?? now.getMonth() + 1;
  const q = Math.ceil(meseCorrente / 3);
  const startM = (q - 1) * 3 + 1;
  const endM = startM + 2;
  const last = new Date(anno, endM, 0).getDate();
  return {
    tipo: "trimestre",
    label: `Q${q}/${anno}`,
    dal: `${anno}-${pad2(startM)}-01`,
    al: `${anno}-${pad2(endM)}-${pad2(last)}`,
  };
}

/** Media ponderata semplice delle % compensazione art. 34 dal profilo. */
export function mediaCompensazioneArt34(profile: CompanyFiscalProfile): number {
  const list = profile.tipiColture;
  if (list.length === 0) return 0;
  const sum = list.reduce((s, t) => s + (t.percentuale_compensazione || 0), 0);
  return sum / list.length;
}

export function calcolaIvaSummary(input: {
  profile: CompanyFiscalProfile;
  impostaEmesse: number;
  imponibileRicevute: number;
  impostaRicevute: number;
}): FiscalIvaSummary {
  const notes: string[] = [];
  const ivaDebito = roundMoney(input.impostaEmesse);
  let ivaCredito = roundMoney(input.impostaRicevute);
  let ivaCreditoCompensazioneArt34 = 0;

  if (input.profile.regimeIva === "speciale_agricolo_art34") {
    const pct = mediaCompensazioneArt34(input.profile);
    ivaCreditoCompensazioneArt34 = roundMoney(
      (input.imponibileRicevute * pct) / 100
    );
    // Regime speciale: credito da compensazione sulle acquisti agricoli (stima)
    ivaCredito = ivaCreditoCompensazioneArt34;
    notes.push(
      `Regime speciale agricolo art. 34: credito IVA stimato con media compensazione ${pct.toFixed(2)}% sulle fatture ricevute.`
    );
    notes.push(
      "La stima usa i coefficienti del profilo fiscale (override manuale / open data)."
    );
  } else {
    notes.push("Regime IVA ordinario: credito = IVA da fatture ricevute.");
  }

  return {
    ivaDebito,
    ivaCredito,
    ivaCreditoCompensazioneArt34,
    ivaSaldo: roundMoney(ivaDebito - ivaCredito),
    noteCalcolo: notes,
  };
}

export function calcolaUtileEStime(input: {
  profile: CompanyFiscalProfile;
  imponibileEmesso: number;
  imponibileRicevuto: number;
  mesiNelPeriodo: number;
}): FiscalUtileStima {
  const notes: string[] = [];
  const utile = roundMoney(input.imponibileEmesso - input.imponibileRicevuto);
  notes.push("Utile stimato = Imponibile emesso − Imponibile ricevuto (indicativo).");

  let iresPct = input.profile.aliquotaIresPct;
  if (input.profile.cooperativaSocialeL381) {
    notes.push(
      `Qualifica cooperativa sociale L. 381/91 attiva: aliquota IRES configurata ${iresPct}%.`
    );
  } else {
    iresPct = input.profile.aliquotaStimaGenericaPct;
    notes.push(
      `Senza L. 381/91: stima IRES con aliquota generica ${iresPct}%.`
    );
  }

  const baseTassabile = Math.max(0, utile);
  const stimaIres = roundMoney((baseTassabile * iresPct) / 100);
  const stimaIrap = roundMoney(
    (baseTassabile * input.profile.aliquotaIrapPct) / 100
  );

  const inps = input.profile.inpsParametri;
  let stimaInpsMensile = inps.stima_mensile_fissa_eur;
  if (stimaInpsMensile <= 0) {
    // Stima grezza da headcount × coefficienti override
    const baseOtd = input.profile.otdCount * inps.contribuzione_otd_pct;
    const baseOti = input.profile.otiCount * inps.contribuzione_oti_pct;
    stimaInpsMensile = roundMoney(baseOtd + baseOti);
  }
  if (input.profile.zonaSvantaggiata && inps.sgravio_zona_svantaggiata_pct > 0) {
    stimaInpsMensile = roundMoney(
      stimaInpsMensile *
        (1 - inps.sgravio_zona_svantaggiata_pct / 100)
    );
    notes.push(
      `Zona svantaggiata: sgravio INPS ${inps.sgravio_zona_svantaggiata_pct}% applicato.`
    );
  }
  const stimaInpsPeriodo = roundMoney(
    stimaInpsMensile * Math.max(1, input.mesiNelPeriodo)
  );
  notes.push(
    "Stime IRES/IRAP/INPS indicative — non sostituiscono la dichiarazione del commercialista."
  );

  return {
    imponibileEmesso: roundMoney(input.imponibileEmesso),
    imponibileRicevuto: roundMoney(input.imponibileRicevuto),
    utileStimato: utile,
    stimaIres,
    stimaIrap,
    stimaInpsPeriodo,
    stimaTasseTotale: roundMoney(stimaIres + stimaIrap + stimaInpsPeriodo),
    noteCalcolo: notes,
  };
}

export function mesiNelPeriodo(dal: string, al: string): number {
  const a = new Date(dal + "T00:00:00");
  const b = new Date(al + "T00:00:00");
  const months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(1, months);
}

export function formatEuro(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}
