import { z } from "zod";
import { roundMoney } from "@/lib/amministrazione/fatture";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";

export const PAGAMENTO_TIPI_SCADENZA = [
  { value: "anticipato", label: "Anticipato" },
  { value: "alla_consegna", label: "Alla consegna" },
  { value: "pronto_magazzino", label: "Pronto magazzino" },
  { value: "posticipato", label: "Posticipato" },
] as const;

export type PagamentoTipoScadenza =
  (typeof PAGAMENTO_TIPI_SCADENZA)[number]["value"];

export type PagamentoModalita = "unica" | "dilazione";

export const MESSAGGIO_DATA_PAGAMENTO_FESTIVA =
  "La data non può cadere di sabato o di domenica.";

/**
 * True se la data ISO (anno-mese-giorno) è sabato o domenica.
 * Gli anni sotto 1000 sono le cifre intermedie dell'input data
 * (0002, 0020, 0202 mentre si digita 2026) e non vanno bloccati.
 */
export function dataCadeNelFineSettimana(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const anno = Number(match[1]);
  if (anno < 1000) return false;
  const giorno = new Date(0);
  giorno.setFullYear(anno, Number(match[2]) - 1, Number(match[3]));
  return giorno.getDay() === 0 || giorno.getDay() === 6;
}

/** True se l'anno è ancora a metà digitazione, per esempio 0002 o 0202. */
export function annoDataPagamentoIncompleto(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  return Number(match[1]) < 1000;
}

export type OrdinePagamentoRata = {
  sortOrder: number;
  importo: number;
  tipoScadenza: PagamentoTipoScadenza | null;
  dataPagamento: string | null;
  note: string;
};

export type OrdinePagamentoPiano = {
  modalita: PagamentoModalita;
  tipoUnica: PagamentoTipoScadenza;
  rate: OrdinePagamentoRata[];
};

export function emptyPagamentoPiano(
  tipoUnica: PagamentoTipoScadenza = "alla_consegna"
): OrdinePagamentoPiano {
  return {
    modalita: "unica",
    tipoUnica,
    rate: [
      {
        sortOrder: 0,
        importo: 0,
        tipoScadenza: tipoUnica,
        dataPagamento: null,
        note: "",
      },
    ],
  };
}

export function labelTipoScadenza(tipo: PagamentoTipoScadenza): string {
  return (
    PAGAMENTO_TIPI_SCADENZA.find((t) => t.value === tipo)?.label ?? tipo
  );
}

export function labelModalitaPagamentoFattura(
  piano: OrdinePagamentoPiano
): string {
  if (piano.modalita === "unica") {
    return `Pagamento ${labelTipoScadenza(piano.tipoUnica).toLowerCase()}`;
  }
  const n = Math.max(2, piano.rate.length);
  const prima = piano.rate[0]?.tipoScadenza ?? "anticipato";
  return `Pagamento dilazionato in ${n} rate (1ª ${labelTipoScadenza(prima).toLowerCase()})`;
}

function ordinaleRomano(n: number): string {
  const valori: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = Math.max(1, Math.min(24, Math.floor(n)));
  let out = "";
  for (const [valore, segno] of valori) {
    while (rest >= valore) {
      out += segno;
      rest -= valore;
    }
  }
  return out;
}

function euroDocumento(n: number): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Percentuali intere che sommano 100. Il resto va alle quote con la parte decimale più alta. */
export function percentualiSuTotale(importi: number[], totale: number): number[] {
  const n = importi.length;
  if (n === 0) return [];
  const tot = roundMoney(Math.max(0, totale));
  if (tot <= 0) return importi.map(() => 0);
  const basi = importi.map((v) => Math.floor((Math.max(0, v) / tot) * 100));
  let resto = 100 - basi.reduce((s, v) => s + v, 0);
  const ordine = importi
    .map((v, i) => ({
      i,
      frac: (Math.max(0, v) / tot) * 100 - basi[i],
    }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...basi];
  for (const voce of ordine) {
    if (resto <= 0) break;
    out[voce.i] += 1;
    resto -= 1;
  }
  return out;
}

export type RigaTestoPagamento = {
  voce: string;
  causaleTitolo: string;
  causale: string;
};

/** Testo del riquadro pagamento. In dilazione ogni riga ha sotto la propria causale. */
export function righeTestoPagamento(input: {
  piano: OrdinePagamentoPiano;
  totale: number;
  numeroFattura: string;
  dataDocumento: string;
  dataRata?: (iso: string) => string;
}): { titolo: string | null; righe: RigaTestoPagamento[] } {
  const numero = input.numeroFattura.trim() || "—";
  const dataDoc = input.dataDocumento.trim() || "—";
  const dataRata = input.dataRata ?? ((iso: string) => iso);
  if (input.piano.modalita !== "dilazione") {
    const tipo = labelTipoScadenza(input.piano.tipoUnica);
    const importo = euroDocumento(roundMoney(input.totale));
    return {
      titolo: null,
      righe: [
        {
          voce: `${tipo} = € ${importo}`,
          causaleTitolo: "Causale:",
          causale: `Pagamento Fattura n. ${numero} del ${dataDoc}.`,
        },
      ],
    };
  }
  const rate = input.piano.rate;
  const quote = percentualiSuTotale(
    rate.map((r) => r.importo),
    input.totale
  );
  return {
    titolo: null,
    righe: rate.map((rata, i) => {
      const ultima = i >= rate.length - 1;
      const quando = rata.dataPagamento
        ? dataRata(rata.dataPagamento)
        : "data da definire";
      const quota = `${quote[i] ?? 0}%`;
      const cifra = `€ ${euroDocumento(rata.importo)}`;
      let voce = `${quota} ${ordinaleRomano(i + 1)} Rata (${quando}) = ${cifra}`;
      if (i === 0) {
        voce = `${quota} ${labelTipoScadenza(rata.tipoScadenza ?? input.piano.tipoUnica)} = ${cifra}`;
      } else if (ultima) {
        voce = `${quota} Saldo (${quando}) = ${cifra}`;
      }
      return {
        voce,
        causaleTitolo: `Causale ${i + 1}:`,
        causale: testoCausaleRataDilazione({
          indice: i,
          totaleRate: rate.length,
          numeroFattura: numero,
          dataDocumento: dataDoc,
        }),
      };
    }),
  };
}

/** Causale di una rata. L'ultima è il saldo, le precedenti la dilazione. */
export function testoCausaleRataDilazione(input: {
  indice: number;
  totaleRate: number;
  numeroFattura: string;
  dataDocumento: string;
}): string {
  const numero = input.numeroFattura.trim() || "—";
  const data = input.dataDocumento.trim() || "—";
  if (input.indice >= input.totaleRate - 1) {
    return `Saldo fattura n ${numero} del ${data}`;
  }
  return `Pagamento ${ordinaleRomano(input.indice + 1)}° Dilazione fattura n ${numero} del ${data}`;
}

export function tipoPagamentoFromPiano(
  piano: OrdinePagamentoPiano
): OrdineTipoPagamento {
  if (piano.modalita === "dilazione") return "dilazionato";
  return piano.tipoUnica;
}

export function splitImportiEqui(totale: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const tot = roundMoney(Math.max(0, totale));
  if (count === 1) return [tot];
  const base = roundMoney(tot / count);
  const parts = Array.from({ length: count }, () => base);
  const somma = roundMoney(parts.reduce((s, v) => s + v, 0));
  parts[count - 1] = roundMoney(parts[count - 1] + (tot - somma));
  return parts;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dataScadenzaDaTipo(input: {
  tipo: PagamentoTipoScadenza;
  oggi: string;
  dataConsegna: string | null;
}): string {
  if (input.tipo === "anticipato") return input.oggi;
  if (input.tipo === "alla_consegna" || input.tipo === "pronto_magazzino") {
    return input.dataConsegna || input.oggi;
  }
  return addDaysIso(input.dataConsegna || input.oggi, 30);
}

export function ensureRateCount(
  piano: OrdinePagamentoPiano,
  n: number,
  totale: number
): OrdinePagamentoPiano {
  const count = Math.max(2, Math.min(24, Math.floor(n)));
  const importi = splitImportiEqui(totale, count);
  const prev = piano.rate;
  const rate: OrdinePagamentoRata[] = importi.map((importo, i) => {
    const old = prev[i];
    if (i === 0) {
      return {
        sortOrder: 0,
        importo,
        tipoScadenza: old?.tipoScadenza ?? piano.tipoUnica,
        dataPagamento: old?.dataPagamento ?? null,
        note: old?.note ?? "",
      };
    }
    return {
      sortOrder: i,
      importo,
      tipoScadenza: null,
      dataPagamento: old?.dataPagamento ?? null,
      note: old?.note ?? "",
    };
  });
  return { ...piano, modalita: "dilazione", rate };
}

function conImporti(
  rate: OrdinePagamentoRata[],
  importi: number[]
): OrdinePagamentoRata[] {
  return rate.map((rata, i) => ({
    ...rata,
    sortOrder: i,
    importo: roundMoney(importi[i] ?? 0),
  }));
}

/** Le rate già impostate restano. L'ultima prende il resto, senza andare sotto zero. */
function importiConRestoSullUltima(importi: number[], totale: number): number[] {
  const n = importi.length;
  const tot = roundMoney(Math.max(0, totale));
  if (n <= 1) return [tot];
  const pref = importi
    .slice(0, n - 1)
    .map((v) => roundMoney(Math.max(0, v)));
  let extra = roundMoney(pref.reduce((s, v) => s + v, 0) - tot);
  for (let i = pref.length - 1; i >= 0 && extra > 0; i--) {
    const taglio = Math.min(pref[i], extra);
    pref[i] = roundMoney(pref[i] - taglio);
    extra = roundMoney(extra - taglio);
  }
  const somma = roundMoney(pref.reduce((s, v) => s + v, 0));
  return [...pref, roundMoney(tot - somma)];
}

/**
 * Imposta l'importo della rata indicata.
 * Le rate precedenti restano. Il resto si divide solo sulle successive.
 * L'ultima rata è sempre la differenza.
 */
export function applicaImportoRata(
  piano: OrdinePagamentoPiano,
  indice: number,
  nuovoImporto: number,
  totale: number
): OrdinePagamentoPiano {
  const tot = roundMoney(Math.max(0, totale));
  const rate = piano.rate;
  const n = rate.length;
  if (n < 2) return applyTotaleToPiano({ ...piano, modalita: "dilazione" }, tot);
  const i = Math.max(0, Math.min(n - 1, Math.floor(indice)));
  if (i >= n - 1) {
    return {
      ...piano,
      rate: conImporti(
        rate,
        importiConRestoSullUltima(
          rate.map((r) => r.importo),
          tot
        )
      ),
    };
  }
  const precedenti = roundMoney(
    rate.slice(0, i).reduce((s, r) => s + r.importo, 0)
  );
  const disponibile = roundMoney(Math.max(0, tot - precedenti));
  const valore = roundMoney(
    Math.min(disponibile, Math.max(0, nuovoImporto))
  );
  const parti = splitImportiEqui(roundMoney(disponibile - valore), n - i - 1);
  const importi = [
    ...rate.slice(0, i).map((r) => roundMoney(r.importo)),
    valore,
    ...parti,
  ];
  return { ...piano, rate: conImporti(rate, importi) };
}

export function applyTotaleToPiano(
  piano: OrdinePagamentoPiano,
  totale: number
): OrdinePagamentoPiano {
  if (piano.modalita === "unica") {
    return {
      ...piano,
      rate: [
        {
          sortOrder: 0,
          importo: roundMoney(totale),
          tipoScadenza: piano.tipoUnica,
          dataPagamento: null,
          note: piano.rate[0]?.note ?? "",
        },
      ],
    };
  }
  if (piano.rate.length < 2) return ensureRateCount(piano, 2, totale);
  return {
    ...piano,
    rate: conImporti(
      piano.rate,
      importiConRestoSullUltima(
        piano.rate.map((r) => r.importo),
        totale
      )
    ),
  };
}

export function noteRateizzazioneFromPiano(
  piano: OrdinePagamentoPiano
): string {
  if (piano.modalita === "unica") {
    return `Unica soluzione · ${labelTipoScadenza(piano.tipoUnica)}`;
  }
  return piano.rate
    .map((r, i) => {
      if (i === 0) {
        return `Rata 1: ${labelTipoScadenza(r.tipoScadenza ?? "anticipato")} € ${r.importo.toFixed(2)}`;
      }
      return `Rata ${i + 1}: ${r.dataPagamento ?? "data da definire"} € ${r.importo.toFixed(2)}`;
    })
    .join(" · ");
}

export function pianoToFicPayments(input: {
  piano: OrdinePagamentoPiano;
  oggi: string;
  dataConsegna: string | null;
}): Array<{ amount: number; due_date: string; status: "not_paid" }> {
  const { piano, oggi, dataConsegna } = input;
  if (piano.modalita === "unica") {
    return [
      {
        amount: piano.rate[0]?.importo ?? 0,
        due_date: dataScadenzaDaTipo({
          tipo: piano.tipoUnica,
          oggi,
          dataConsegna,
        }),
        status: "not_paid",
      },
    ];
  }
  return piano.rate.map((r, i) => ({
    amount: r.importo,
    due_date:
      i === 0
        ? dataScadenzaDaTipo({
            tipo: r.tipoScadenza ?? "anticipato",
            oggi,
            dataConsegna,
          })
        : (r.dataPagamento ?? oggi),
    status: "not_paid" as const,
  }));
}

const rataSchema = z.object({
  sortOrder: z.number().int().min(0),
  importo: z.number().min(0),
  tipoScadenza: z
    .enum(["anticipato", "alla_consegna", "pronto_magazzino", "posticipato"])
    .nullable(),
  dataPagamento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  note: z.string().optional().default(""),
});

export const ordinePagamentoPianoSchema = z
  .object({
    modalita: z.enum(["unica", "dilazione"]),
    tipoUnica: z.enum([
      "anticipato",
      "alla_consegna",
      "pronto_magazzino",
      "posticipato",
    ]),
    rate: z.array(rataSchema).min(1),
  })
  .superRefine((v, ctx) => {
    if (v.modalita === "unica") return;
    if (v.rate.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica almeno 2 dilazioni.",
        path: ["rate"],
      });
    }
    v.rate.forEach((r, i) => {
      if (i === 0 && !r.tipoScadenza) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Scegli la scadenza della prima rata.",
          path: ["rate", i, "tipoScadenza"],
        });
      }
      if (i > 0 && !r.dataPagamento) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Indica la data di pagamento della rata ${i + 1}.`,
          path: ["rate", i, "dataPagamento"],
        });
      }
      if (
        i > 0 &&
        r.dataPagamento &&
        annoDataPagamentoIncompleto(r.dataPagamento)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Completa l'anno della rata ${i + 1}.`,
          path: ["rate", i, "dataPagamento"],
        });
      }
      if (
        i > 0 &&
        r.dataPagamento &&
        dataCadeNelFineSettimana(r.dataPagamento)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La data della rata ${i + 1} non può cadere di sabato o di domenica.`,
          path: ["rate", i, "dataPagamento"],
        });
      }
    });
  });

export function validatePianoVsTotale(
  piano: OrdinePagamentoPiano,
  totale: number
): string | null {
  const somma = roundMoney(piano.rate.reduce((s, r) => s + r.importo, 0));
  const tot = roundMoney(totale);
  if (Math.abs(somma - tot) > 0.01) {
    return `La somma delle rate (€ ${somma.toFixed(2)}) deve coincidere con il totale (€ ${tot.toFixed(2)}).`;
  }
  return null;
}

export function emailsClienteUniche(input: {
  email?: string | null;
  pec?: string | null;
  emailGeneriche?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [
    input.email,
    input.pec,
    ...(input.emailGeneriche ?? []),
  ]) {
    const v = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!v || !v.includes("@") || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
