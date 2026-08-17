import {
  extractIvaPercentFromFicRaw,
  extractRigheFromFicRaw,
} from "@/lib/amministrazione/fatture-sync";
import {
  formatDateIt,
  formatEuro,
  importoRiga,
  prezzoScontatoUnitario,
  roundMoney,
  type Fattura,
} from "@/lib/amministrazione/fatture";

export type PaperParty = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo: string;
  citta: string;
  cap: string;
  provincia: string;
  pec: string;
  email: string;
  telefono: string;
};

export type PaperInvoiceLine = {
  descrizione: string;
  quantita: number;
  unitaMisura: string;
  prezzo: number;
  scontoPercentuale: number;
  ivaPercentuale: number;
  importo: number;
};

export type PaperIvaCastelletto = {
  aliquota: number;
  imponibile: number;
  imposta: number;
  natura: string;
  esigibilita: string;
};

export type PaperInvoiceModel = {
  numero: string;
  data: string | null;
  dataScadenza: string | null;
  mittente: PaperParty;
  destinatario: PaperParty;
  righe: PaperInvoiceLine[];
  castelletto: PaperIvaCastelletto[];
  imponibile: number;
  iva: number;
  totale: number;
  iban: string;
  notePagamento: string;
  fonte: "fic" | "opuntia";
  scissionePagamenti: boolean;
};

export type PaperInvoiceRawSource = {
  json: Record<string, unknown> | null;
  xml: string | null;
};

const DESTINATARIO_DEFAULT: PaperParty = {
  ragioneSociale: "Cooperativa Agricola e Sociale A.R.L.",
  partitaIva: "",
  codiceFiscale: "",
  indirizzo: "",
  citta: "",
  cap: "",
  provincia: "",
  pec: "",
  email: "",
  telefono: "",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value != null && typeof value !== "object"
      ? String(value).trim()
      : "";
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: unknown): string | null {
  const t = asText(value);
  if (!t) return null;
  const d = t.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function formatIndirizzo(p: {
  street?: string;
  cap?: string;
  city?: string;
  province?: string;
}): string {
  const line1 = p.street?.trim() || "";
  const line2 = [p.cap, p.city, p.province ? `(${p.province})` : ""]
    .filter(Boolean)
    .join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

function emptyParty(): PaperParty {
  return {
    ragioneSociale: "",
    partitaIva: "",
    codiceFiscale: "",
    indirizzo: "",
    citta: "",
    cap: "",
    provincia: "",
    pec: "",
    email: "",
    telefono: "",
  };
}

function partyFromEntity(entity: Record<string, unknown>): PaperParty {
  const street = asText(
    entity.address_street ?? entity.address ?? entity.street
  );
  const cap = asText(
    entity.address_postal_code ?? entity.postal_code ?? entity.cap
  );
  const citta = asText(entity.address_city ?? entity.city);
  const provincia = asText(entity.address_province ?? entity.province);
  return {
    ragioneSociale: asText(entity.name ?? entity.ragione_sociale),
    partitaIva: asText(entity.vat_number ?? entity.vat ?? entity.partita_iva),
    codiceFiscale: asText(entity.tax_code ?? entity.codice_fiscale),
    indirizzo: formatIndirizzo({ street, cap, city: citta, province: provincia }),
    citta,
    cap,
    provincia,
    pec: asText(entity.certified_email ?? entity.pec),
    email: asText(entity.email),
    telefono: asText(entity.phone ?? entity.telefono),
  };
}

function extractIban(raw: Record<string, unknown>): string {
  const direct = asText(
    raw.iban ?? raw.bank_iban ?? asRecord(raw.bank).iban
  );
  if (direct) return direct.toUpperCase().replace(/\s+/g, "");

  const payments = Array.isArray(raw.payments_list)
    ? raw.payments_list
    : Array.isArray(raw.payments)
      ? raw.payments
      : [];
  for (const p of payments) {
    const r = asRecord(p);
    const iban = asText(
      r.iban ?? r.bank_iban ?? asRecord(r.payment_account).iban
    );
    if (iban) return iban.toUpperCase().replace(/\s+/g, "");
  }
  return "";
}

function extractDueDate(raw: Record<string, unknown>): string | null {
  const top = asDate(raw.next_due_date ?? raw.due_date);
  if (top) return top;
  const payments = Array.isArray(raw.payments_list)
    ? raw.payments_list
    : Array.isArray(raw.payments)
      ? raw.payments
      : [];
  for (const p of payments) {
    const d = asDate(asRecord(p).due_date ?? asRecord(p).date);
    if (d) return d;
  }
  return null;
}

function extractXmlFromRaw(raw: Record<string, unknown>): string | null {
  const candidates = [
    raw.ei_raw,
    raw.e_invoice_xml,
    raw.xml,
    raw.xml_content,
    asRecord(raw.ei_data).xml,
    asRecord(raw.e_invoice).xml,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function extractXmlFromRawSafe(
  raw: Record<string, unknown> | null | undefined
): string | null {
  if (!raw) return null;
  const xml = extractXmlFromRaw(raw);
  if (!xml) return null;
  const t = xml.trim();
  if (!(t.startsWith("<?xml") || t.startsWith("<"))) return null;
  return t;
}

function lineVatPercent(
  item: Record<string, unknown>,
  fallback: number
): number {
  const vat = asRecord(item.vat);
  const rate = asNumber(vat.value ?? vat.rate ?? item.vat_rate ?? item.iva);
  return rate > 0 ? rate : fallback;
}

function buildCastellettoFromLines(
  righe: PaperInvoiceLine[]
): PaperIvaCastelletto[] {
  const map = new Map<number, PaperIvaCastelletto>();
  for (const r of righe) {
    const aliquota = r.ivaPercentuale;
    const cur = map.get(aliquota) ?? {
      aliquota,
      imponibile: 0,
      imposta: 0,
      natura: aliquota === 0 ? "Esente / non imponibile" : "",
      esigibilita: "I",
    };
    cur.imponibile = roundMoney(cur.imponibile + r.importo);
    cur.imposta = roundMoney((cur.imponibile * aliquota) / 100);
    map.set(aliquota, cur);
  }
  return [...map.values()].sort((a, b) => a.aliquota - b.aliquota);
}

function buildCastellettoFromFic(
  raw: Record<string, unknown>,
  righe: PaperInvoiceLine[]
): PaperIvaCastelletto[] {
  const list = Array.isArray(raw.vat_list)
    ? raw.vat_list
    : Array.isArray(raw.vats)
      ? raw.vats
      : [];
  if (list.length > 0) {
    return list
      .map((v) => {
        const r = asRecord(v);
        const aliquota = asNumber(r.vat_rate ?? r.value ?? r.rate ?? r.aliquota);
        const imponibile = asNumber(
          r.taxable_amount ?? r.amount_net ?? r.imponibile
        );
        const imposta = asNumber(r.amount ?? r.amount_vat ?? r.imposta);
        return {
          aliquota,
          imponibile: roundMoney(imponibile),
          imposta: roundMoney(imposta),
          natura: asText(r.nature ?? r.natura),
          esigibilita: asText(r.ei_type ?? r.esigibilita) || "I",
        } satisfies PaperIvaCastelletto;
      })
      .filter((c) => c.imponibile !== 0 || c.imposta !== 0 || c.aliquota > 0)
      .sort((a, b) => a.aliquota - b.aliquota);
  }
  return buildCastellettoFromLines(righe);
}

function detectScissione(raw: Record<string, unknown>): boolean {
  const ei = asText(raw.ei_type ?? raw.esigibilita_iva ?? raw.vat_kind);
  if (/split|scissione|S/i.test(ei)) return true;
  const payments = Array.isArray(raw.payments_list) ? raw.payments_list : [];
  for (const p of payments) {
    if (/split|scissione/i.test(asText(asRecord(p).payment_method))) return true;
  }
  return false;
}

export function mapFicRawToPaperInvoice(
  raw: Record<string, unknown>,
  destinatario: PaperParty = DESTINATARIO_DEFAULT
): PaperInvoiceModel {
  const entity = asRecord(raw.entity);
  const fallbackIva = extractIvaPercentFromFicRaw(raw);
  const items = Array.isArray(raw.items_list)
    ? raw.items_list
    : Array.isArray(raw.items)
      ? raw.items
      : [];

  const righe: PaperInvoiceLine[] =
    items.length > 0
      ? items.map((item) => {
          const r = asRecord(item);
          const quantita = asNumber(r.qty ?? r.quantity ?? r.amount) || 1;
          const prezzo = asNumber(
            r.net_price ?? r.price ?? r.gross_price ?? r.unit_price
          );
          const sconto = Math.min(
            100,
            Math.max(0, asNumber(r.discount ?? r.discount_percent ?? r.sconto))
          );
          const ivaPercentuale = lineVatPercent(r, fallbackIva);
          const importo = importoRiga(quantita, prezzo, sconto);
          return {
            descrizione:
              asText(r.name ?? r.description ?? r.product_description) ||
              "Voce",
            quantita,
            unitaMisura: asText(r.measure ?? r.unit ?? r.um) || "nr",
            prezzo,
            scontoPercentuale: sconto,
            ivaPercentuale,
            importo,
          };
        })
      : extractRigheFromFicRaw(raw).map((r) => ({
          descrizione: r.descrizione,
          quantita: r.quantita,
          unitaMisura: "nr",
          prezzo: r.prezzoUnitario,
          scontoPercentuale: r.scontoPercentuale,
          ivaPercentuale: fallbackIva,
          importo: r.importo,
        }));

  const castelletto = buildCastellettoFromFic(raw, righe);
  const imponibile =
    asNumber(raw.amount_net) ||
    roundMoney(castelletto.reduce((s, c) => s + c.imponibile, 0));
  const iva =
    asNumber(raw.amount_vat) ||
    roundMoney(castelletto.reduce((s, c) => s + c.imposta, 0));
  const totale =
    asNumber(raw.amount_gross) || roundMoney(imponibile + iva);

  const numero =
    asText(raw.invoice_number ?? raw.number) ||
    [asText(raw.number), asText(raw.numeration)].filter(Boolean).join(" ");

  return {
    numero: numero || "—",
    data: asDate(raw.date),
    dataScadenza: extractDueDate(raw),
    mittente: partyFromEntity(entity),
    destinatario,
    righe,
    castelletto,
    imponibile: roundMoney(imponibile),
    iva: roundMoney(iva),
    totale: roundMoney(totale),
    iban: extractIban(raw),
    notePagamento: asText(raw.notes ?? raw.payment_notes ?? raw.subject),
    fonte: "fic",
    scissionePagamenti: detectScissione(raw),
  };
}

export function mapOpuntiaFatturaToPaperInvoice(
  fattura: Fattura,
  destinatario: PaperParty = DESTINATARIO_DEFAULT
): PaperInvoiceModel {
  const ivaPct = fattura.ivaPercentuale || 22;
  const righe: PaperInvoiceLine[] = fattura.righe.map((r) => ({
    descrizione: [r.codice, r.descrizione].filter(Boolean).join(" — ") || "Voce",
    quantita: r.quantita,
    unitaMisura: "nr",
    prezzo: r.prezzoUnitario,
    scontoPercentuale: r.scontoPercentuale,
    ivaPercentuale: ivaPct,
    importo: r.importo,
  }));
  if (fattura.spedizione > 0) {
    righe.push({
      descrizione: "Spedizione / trasporto",
      quantita: 1,
      unitaMisura: "nr",
      prezzo: fattura.spedizione,
      scontoPercentuale: 0,
      ivaPercentuale: fattura.spedizioneIvaApplicata ? ivaPct : 0,
      importo: fattura.spedizione,
    });
  }
  const castelletto = buildCastellettoFromLines(righe);
  const scadenza =
    fattura.dilazioni
      .map((d) => d.dataScadenza)
      .filter(Boolean)
      .sort()[0] ?? null;

  return {
    numero:
      fattura.numeroDocumentoEsterno || fattura.numeroInterno || "—",
    data: fattura.dataEmissione || null,
    dataScadenza: scadenza,
    mittente: {
      ...emptyParty(),
      ragioneSociale: fattura.anagraficaRagioneSociale,
      partitaIva: "",
    },
    destinatario,
    righe,
    castelletto,
    imponibile: roundMoney(fattura.imponibile),
    iva: roundMoney(fattura.imposta),
    totale: roundMoney(fattura.totale),
    iban: "",
    notePagamento: fattura.note ?? "",
    fonte: "opuntia",
    scissionePagamenti: false,
  };
}

export function extractRawSources(
  raw: Record<string, unknown> | null
): PaperInvoiceRawSource {
  if (!raw) return { json: null, xml: null };
  return {
    json: raw,
    xml: extractXmlFromRaw(raw),
  };
}

export function defaultDestinatarioCooperativa(): PaperParty {
  return { ...DESTINATARIO_DEFAULT };
}

export function formatPaperDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return formatDateIt(isoDate);
}

export { formatDateIt, formatEuro, prezzoScontatoUnitario };
