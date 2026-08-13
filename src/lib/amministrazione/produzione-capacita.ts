import { z } from "zod";

/** Linea produttiva: secco (ODR/NDR) vs gel (OGL/NGL). */
export type LineaProduzioneCodice = "secco" | "gel";
export type StagioneProduzione = "inverno" | "estate";

export type ResaBaseline = {
  lineaCodice: LineaProduzioneCodice;
  stagione: StagioneProduzione;
  resaPercentualeMin: number;
  resaPercentualeMax: number;
  resaPercentualeMedia: number;
};

export type EssiccatoreCapacita = {
  id: string;
  codice: string;
  nome: string;
  capacitaIngressoKg: number;
  attivo: boolean;
};

export type LineaProduzione = {
  codice: LineaProduzioneCodice;
  nome: string;
  prefissiProdotto: string[];
  usaEssiccatori: boolean;
  capacitaIngressoGiornalieraKg: number | null;
};

export type CapacitaCalcoloInput = {
  prodottoCodice: string;
  quantitaKg: number;
  dataPartenza: string; // YYYY-MM-DD
  consegnaTipo: "asap" | "data";
  dataRichiesta: string | null; // se consegnaTipo === 'data'
  urgente: boolean;
  usaMagazzino: boolean;
  usaSabato: boolean;
  giacenzaKg: number;
  linee: LineaProduzione[];
  essiccatori: EssiccatoreCapacita[];
  reseBaseline: ResaBaseline[];
  /** Medie ML opzionali: chiave `${linea}|${stagione}` → % */
  reseMedieOsservate?: Record<string, number>;
  /** Giorni max di ricerca ASAP (default 365) */
  maxGiorniRicerca?: number;
};

export type CapacitaCalcoloResult = {
  lineaCodice: LineaProduzioneCodice | null;
  stagione: StagioneProduzione;
  resaPercentualeUsata: number;
  resaFonte: "baseline" | "media_osservata";
  essiccatoriAttivi: number;
  capacitaIngressoGiornalieraKg: number;
  capacitaUscitaGiornalieraKg: number;
  giacenzaDisponibileKg: number;
  kgDaProdurre: number;
  giorniLavorativiNecessari: number;
  dataConsegnaStimata: string | null;
  fattibileAllaData: boolean | null;
  chiedereSabato: boolean;
  avvisi: string[];
  snapshot: Record<string, unknown>;
};

export const calcoloConsegnaInputSchema = z.object({
  prodottoId: z.string().uuid(),
  prodottoCodice: z.string().trim().min(1),
  quantitaKg: z.number().positive("Quantità deve essere > 0"),
  consegnaTipo: z.enum(["asap", "data"]),
  dataRichiesta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  urgente: z.boolean(),
  usaMagazzino: z.boolean(),
  usaSabato: z.boolean(),
});

export type CalcoloConsegnaInput = z.infer<typeof calcoloConsegnaInputSchema>;

export const ordineWizardInputSchema = z
  .object({
    clienteId: z.string().uuid("Cliente non valido"),
    cliente: z.string().trim().min(1),
    codiceTargaCliente: z
      .string()
      .regex(/^C[0-9A-F]{3}$/, "Targa cliente non valida"),
    dataOrdine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    prodottoId: z.string().uuid(),
    prodottoCodice: z.string().trim().min(1),
    prodottoNome: z.string().trim().min(1),
    quantita: z.number().positive(),
    prezzoUnitario: z.number().min(0),
    ivaPercentuale: z.number().min(0).default(22),
    consegnaTipo: z.enum(["asap", "data"]),
    dataRichiesta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    urgente: z.boolean().default(false),
    usaMagazzino: z.boolean().default(false),
    usaSabato: z.boolean().default(false),
    note: z.string().optional(),
    tipoPagamento: z
      .enum(["anticipato", "alla_consegna", "posticipato", "dilazionato"])
      .default("alla_consegna"),
  })
  .superRefine((val, ctx) => {
    if (val.consegnaTipo === "data" && !val.dataRichiesta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica la data di consegna desiderata.",
        path: ["dataRichiesta"],
      });
    }
  });

export type OrdineWizardInput = z.infer<typeof ordineWizardInputSchema>;

export function stagioneFromDate(isoDate: string): StagioneProduzione {
  const m = Number(isoDate.slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return "estate";
  // Estate aprile–ottobre; inverno novembre–marzo
  return m >= 4 && m <= 10 ? "estate" : "inverno";
}

export function resolveLineaFromProdottoCodice(
  codice: string,
  linee: LineaProduzione[]
): LineaProduzione | null {
  const upper = codice.trim().toUpperCase();
  for (const linea of linee) {
    for (const pref of linea.prefissiProdotto) {
      if (upper.startsWith(pref.toUpperCase())) return linea;
    }
  }
  // Fallback prefissi noti se linee non ancora seedate
  if (/^(ODR|NDR)/.test(upper)) {
    return {
      codice: "secco",
      nome: "Secco",
      prefissiProdotto: ["ODR", "NDR"],
      usaEssiccatori: true,
      capacitaIngressoGiornalieraKg: null,
    };
  }
  if (/^(OGL|NGL)/.test(upper)) {
    return {
      codice: "gel",
      nome: "Gel",
      prefissiProdotto: ["OGL", "NGL"],
      usaEssiccatori: false,
      capacitaIngressoGiornalieraKg: 4400,
    };
  }
  return null;
}

export function resolveResaPercentuale(input: {
  lineaCodice: LineaProduzioneCodice;
  stagione: StagioneProduzione;
  reseBaseline: ResaBaseline[];
  reseMedieOsservate?: Record<string, number>;
}): { pct: number; fonte: "baseline" | "media_osservata" } {
  const key = `${input.lineaCodice}|${input.stagione}`;
  const observed = input.reseMedieOsservate?.[key];
  if (typeof observed === "number" && observed > 0) {
    return { pct: observed, fonte: "media_osservata" };
  }
  const base = input.reseBaseline.find(
    (r) => r.lineaCodice === input.lineaCodice && r.stagione === input.stagione
  );
  if (base) return { pct: base.resaPercentualeMedia, fonte: "baseline" };
  // Fallback hard-coded se DB non ancora migrato
  if (input.lineaCodice === "secco") {
    return {
      pct: input.stagione === "inverno" ? 7.75 : 10.5,
      fonte: "baseline",
    };
  }
  return {
    pct: input.stagione === "inverno" ? 10.5 : 7.75,
    fonte: "baseline",
  };
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isGiornoLavorativo(
  d: Date,
  usaSabato: boolean
): boolean {
  const day = d.getDay(); // 0=dom, 6=sab
  if (day === 0) return false;
  if (day === 6) return usaSabato;
  return true;
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function nextWorkingDay(iso: string, usaSabato: boolean): string {
  let cur = iso;
  for (let i = 0; i < 14; i += 1) {
    const d = parseIsoDate(cur);
    if (isGiornoLavorativo(d, usaSabato)) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}

export function countWorkingDaysInclusive(
  fromIso: string,
  toIso: string,
  usaSabato: boolean
): number {
  if (toIso < fromIso) return 0;
  let count = 0;
  let cur = fromIso;
  for (let i = 0; i < 800; i += 1) {
    if (isGiornoLavorativo(parseIsoDate(cur), usaSabato)) count += 1;
    if (cur === toIso) break;
    cur = addDays(cur, 1);
  }
  return count;
}

export function capacitaIngressoGiornalieraKg(
  linea: LineaProduzione,
  essiccatori: EssiccatoreCapacita[]
): { ingressoKg: number; essiccatoriAttivi: number } {
  if (linea.usaEssiccatori) {
    const attivi = essiccatori.filter((e) => e.attivo);
    const ingresso = attivi.reduce(
      (sum, e) => sum + Number(e.capacitaIngressoKg || 0),
      0
    );
    return { ingressoKg: ingresso, essiccatoriAttivi: attivi.length };
  }
  return {
    ingressoKg: Number(linea.capacitaIngressoGiornalieraKg ?? 0),
    essiccatoriAttivi: 0,
  };
}

/**
 * Calcolo consegna da capacità giornaliera + magazzino.
 * Giorni lavorativi lun–ven (+ sab se usaSabato).
 */
export function calcolaConsegnaCapacita(
  input: CapacitaCalcoloInput
): CapacitaCalcoloResult {
  const avvisi: string[] = [];
  const linea = resolveLineaFromProdottoCodice(
    input.prodottoCodice,
    input.linee
  );
  const stagione = stagioneFromDate(input.dataPartenza);

  if (!linea) {
    return {
      lineaCodice: null,
      stagione,
      resaPercentualeUsata: 0,
      resaFonte: "baseline",
      essiccatoriAttivi: 0,
      capacitaIngressoGiornalieraKg: 0,
      capacitaUscitaGiornalieraKg: 0,
      giacenzaDisponibileKg: input.giacenzaKg,
      kgDaProdurre: input.quantitaKg,
      giorniLavorativiNecessari: 0,
      dataConsegnaStimata: null,
      fattibileAllaData: false,
      chiedereSabato: false,
      avvisi: [
        "Codice prodotto non associato a linea secco (ODR/NDR) o gel (OGL/NGL).",
      ],
      snapshot: { errore: "linea_sconosciuta", prodottoCodice: input.prodottoCodice },
    };
  }

  const { pct, fonte } = resolveResaPercentuale({
    lineaCodice: linea.codice,
    stagione,
    reseBaseline: input.reseBaseline,
    reseMedieOsservate: input.reseMedieOsservate,
  });

  const { ingressoKg, essiccatoriAttivi } = capacitaIngressoGiornalieraKg(
    linea,
    input.essiccatori
  );
  const uscitaKgGiorno = (ingressoKg * pct) / 100;

  if (ingressoKg <= 0 || uscitaKgGiorno <= 0) {
    avvisi.push("Capacità giornaliera non configurata o resa zero.");
  }

  const giacenza = Math.max(0, input.usaMagazzino ? input.giacenzaKg : 0);
  const kgDaProdurre = Math.max(0, input.quantitaKg - giacenza);

  if (input.usaMagazzino && input.giacenzaKg > 0) {
    avvisi.push(
      `Magazzino: ${input.giacenzaKg.toLocaleString("it-IT")} kg disponibili` +
        (kgDaProdurre > 0
          ? `; da produrre ${kgDaProdurre.toLocaleString("it-IT")} kg (rimpiazzo fresco previsto).`
          : "; ordine coperto interamente da giacenza.")
    );
  }

  let usaSabato = input.usaSabato;
  let chiedereSabato = false;

  if (
    input.urgente &&
    !usaSabato &&
    kgDaProdurre > 0 &&
    uscitaKgGiorno > 0
  ) {
    // Se urgente e senza magazzino sufficiente, suggerisci sabato
    const giorniVen = Math.ceil(kgDaProdurre / uscitaKgGiorno);
    if (giorniVen >= 1) {
      chiedereSabato = true;
      avvisi.push(
        "Ordine urgente con produzione necessaria: valutare lavoro al sabato per accelerare la consegna."
      );
    }
  }

  const start = nextWorkingDay(input.dataPartenza, usaSabato);
  let giorniNecessari = 0;
  if (kgDaProdurre <= 0) {
    giorniNecessari = 0;
  } else if (uscitaKgGiorno <= 0) {
    giorniNecessari = 9999;
  } else {
    giorniNecessari = Math.ceil(kgDaProdurre / uscitaKgGiorno);
  }

  function dataDopoNGiorniLavorativi(
    from: string,
    n: number,
    sabato: boolean
  ): string {
    if (n <= 0) return from;
    let left = n;
    let cur = from;
    for (let i = 0; i < 900; i += 1) {
      if (isGiornoLavorativo(parseIsoDate(cur), sabato)) {
        left -= 1;
        if (left <= 0) return cur;
      }
      cur = addDays(cur, 1);
    }
    return cur;
  }

  let dataStimata: string | null = null;
  let fattibile: boolean | null = null;

  if (input.consegnaTipo === "asap") {
    dataStimata = dataDopoNGiorniLavorativi(
      start,
      Math.max(1, giorniNecessari || 1),
      usaSabato
    );
    // Se zero produzione, consegna al primo giorno lavorativo
    if (kgDaProdurre <= 0) dataStimata = start;
    fattibile = true;
  } else {
    const richiesta = input.dataRichiesta;
    if (!richiesta) {
      avvisi.push("Data consegna richiesta mancante.");
      fattibile = false;
    } else {
      const wd = countWorkingDaysInclusive(start, richiesta, usaSabato);
      const producibile = wd * uscitaKgGiorno + giacenza;
      fattibile = producibile + 1e-9 >= input.quantitaKg;
      dataStimata = richiesta;
      if (!fattibile) {
        const asap = dataDopoNGiorniLavorativi(
          start,
          Math.max(1, giorniNecessari || 1),
          usaSabato
        );
        avvisi.push(
          `Alla data ${richiesta} la capacità stimata non copre l’ordine. Prima data fattibile: ${asap}.`
        );
        dataStimata = asap;
      }
    }
  }

  const snapshot = {
    linea: linea.codice,
    stagione,
    resa_percentuale: pct,
    resa_fonte: fonte,
    essiccatori_attivi: essiccatoriAttivi,
    capacita_ingresso_kg_giorno: ingressoKg,
    capacita_uscita_kg_giorno: uscitaKgGiorno,
    giacenza_usata_kg: giacenza,
    kg_da_produrre: kgDaProdurre,
    quantita_ordine_kg: input.quantitaKg,
    giorni_lavorativi: giorniNecessari,
    usa_sabato: usaSabato,
    urgente: input.urgente,
    consegna_tipo: input.consegnaTipo,
    data_consegna_stimata: dataStimata,
    fattibile_alla_data: fattibile,
  };

  return {
    lineaCodice: linea.codice,
    stagione,
    resaPercentualeUsata: pct,
    resaFonte: fonte,
    essiccatoriAttivi,
    capacitaIngressoGiornalieraKg: ingressoKg,
    capacitaUscitaGiornalieraKg: Math.round(uscitaKgGiorno * 1000) / 1000,
    giacenzaDisponibileKg: input.giacenzaKg,
    kgDaProdurre,
    giorniLavorativiNecessari: giorniNecessari,
    dataConsegnaStimata: dataStimata,
    fattibileAllaData: fattibile,
    chiedereSabato,
    avvisi,
    snapshot,
  };
}
