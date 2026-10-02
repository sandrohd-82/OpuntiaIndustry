import { z } from "zod";
import { roundMoney } from "@/lib/amministrazione/fatture";

export const ddtEmissioneSchema = z.object({
  clienteId: z.string().uuid("Seleziona un cliente."),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida."),
  causale: z.string().trim().min(1, "Indica la causale del trasporto.").max(300),
  destinazione: z.string().trim().max(400).default(""),
  note: z.string().trim().max(2000).default(""),
  righe: z
    .array(
      z.object({
        codice: z.string().trim().max(40).default(""),
        descrizione: z.string().trim().min(1, "Ogni riga ha una descrizione.").max(500),
        quantita: z.number().positive("La quantità deve essere maggiore di zero."),
        prezzoUnitario: z.number().min(0, "Il prezzo non può essere negativo."),
        scontoPercentuale: z.number().min(0).max(100).default(0),
        ivaPercentuale: z.number().min(0).max(100),
      })
    )
    .min(1, "Aggiungi almeno una riga.")
    .max(40),
});

export type DdtEmissioneInput = z.infer<typeof ddtEmissioneSchema>;

export type DdtRigaView = {
  id: string;
  codice: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale: number;
  ivaPercentuale: number;
  importo: number;
};

export type DdtDocumentoView = {
  id: string;
  direzione: "emesso" | "ricevuto";
  ficId: number | null;
  numeroFic: string;
  numeroInterno: string;
  ragioneSociale: string;
  partitaIva: string;
  dataDocumento: string;
  causale: string;
  destinazione: string;
  imponibile: number;
  imposta: number;
  totale: number;
  stato: string;
  versione: number;
  note: string;
  pdfUrl: string;
  righe: DdtRigaView[];
};

export type DdtClienteOption = {
  id: string;
  ragioneSociale: string;
  codiceTarga: string;
  partitaIva: string;
  destinazione: string;
};

export function totaliDdt(
  righe: Array<{
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale: number;
    ivaPercentuale: number;
  }>
): { imponibile: number; imposta: number; totale: number } {
  let imponibile = 0;
  let imposta = 0;
  for (const r of righe) {
    const lordo = r.quantita * r.prezzoUnitario;
    const netto = lordo * (1 - (Number(r.scontoPercentuale) || 0) / 100);
    const base = roundMoney(netto);
    const iva = roundMoney(base * ((Number(r.ivaPercentuale) || 0) / 100));
    imponibile += base;
    imposta += iva;
  }
  return {
    imponibile: roundMoney(imponibile),
    imposta: roundMoney(imposta),
    totale: roundMoney(imponibile + imposta),
  };
}

export function targaDdt(raw: string): string {
  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return t || "GEN";
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type RigaImportata = {
  codice: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale: number;
  ivaPercentuale: number;
  importo: number;
};

/** Righe dal payload FiC (items_list). Se mancano, una riga di riepilogo. */
export function righeDaDocumentoFic(raw: Record<string, unknown>): RigaImportata[] {
  const items = Array.isArray(raw.items_list) ? raw.items_list : [];
  const out: RigaImportata[] = [];
  for (const item of items) {
    const row = record(item);
    const vat = record(row.vat);
    const qty = num(row.qty) || 1;
    const price = num(row.net_price);
    const sconto = num(row.discount);
    const iva = num(vat.value);
    const base = roundMoney(qty * price * (1 - sconto / 100));
    const descrizione = String(row.name ?? row.description ?? "").trim();
    if (!descrizione && base === 0) continue;
    out.push({
      codice: String(row.code ?? "").trim().slice(0, 40),
      descrizione: (descrizione || "Voce").slice(0, 500),
      quantita: qty,
      prezzoUnitario: price,
      scontoPercentuale: sconto,
      ivaPercentuale: iva,
      importo: base,
    });
  }
  if (out.length > 0) return out;
  const imponibile = num(raw.amount_net) || num(raw.amount_gross);
  return [
    {
      codice: "",
      descrizione: "Documento di trasporto",
      quantita: 1,
      prezzoUnitario: imponibile,
      scontoPercentuale: 0,
      ivaPercentuale: 0,
      importo: roundMoney(imponibile),
    },
  ];
}

export function importiDaDocumentoFic(
  raw: Record<string, unknown>,
  righe: RigaImportata[]
): { imponibile: number; imposta: number; totale: number } {
  const gross = num(raw.amount_gross);
  const net = num(raw.amount_net);
  const vat = num(raw.amount_vat);
  if (gross !== 0 || net !== 0) {
    const imponibile = net !== 0 ? roundMoney(net) : roundMoney(gross - vat);
    const imposta = vat !== 0 ? roundMoney(vat) : roundMoney(gross - imponibile);
    return {
      imponibile,
      imposta,
      totale: gross !== 0 ? roundMoney(gross) : roundMoney(imponibile + imposta),
    };
  }
  return totaliDdt(righe);
}

export function pdfDaDocumentoFic(raw: Record<string, unknown>): string {
  const url = raw.url ?? raw.pdf_url;
  return typeof url === "string" && url.startsWith("http") ? url : "";
}

export function testoIndirizzo(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 400);
}
