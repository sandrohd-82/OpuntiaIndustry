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
