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
  return ensureRateCount(piano, piano.rate.length, totale);
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
