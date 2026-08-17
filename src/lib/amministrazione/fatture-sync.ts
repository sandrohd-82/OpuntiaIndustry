import {
  draftFromFicEntity,
  normalizeCompanyNameKey,
  normalizeVatKey,
  type AnagraficaSyncDraft,
} from "@/lib/amministrazione/fic-anagrafiche";
import {
  calcolaTotaliFattura,
  importoRiga,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import {
  enrichEntityFromInvoiceRaw,
  parseCedenteAnagraficaFromFatturaPaXml,
  type FicDocumentNormalized,
  type FicEntityNormalized,
} from "@/lib/fic";
import type { FatturaStatoPagamento } from "@/types/database";

export type FatturaSyncLinkedHint = {
  fatturaId: string | null;
  numeroInterno: string;
  numeroEsterno: string;
  motivo: string;
};

export type FatturaSyncDuplicateCandidate = {
  strength: "weak";
  fatturaId: string;
  numeroInterno: string;
  numeroEsterno: string;
  dataEmissione: string;
  totale: number;
  motivo: string;
};

export type FatturaSyncQueueItem = {
  ficId: number;
  kind: FatturaKind;
  numeroEsterno: string;
  dataEmissione: string;
  entityName: string;
  entityVat: string;
  amountGross: number;
  statoPagamento: FatturaStatoPagamento;
  spedizione: number;
  /** Default false in sync: IVA non applicata al trasporto. */
  spedizioneIvaApplicata: boolean;
  ivaPercentuale: number;
  imponibile: number;
  imposta: number;
  totale: number;
  righe: FatturaRiga[];
  anagraficaMode: "create" | "existing";
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
  draft: AnagraficaSyncDraft;
  /** Fattura già in Opuntia collegata a questa NC (o hint testuale). */
  linkedFattura: FatturaSyncLinkedHint | null;
  riferimentoFatturaEsterno: string;
  /** Possibile duplicato di una fattura manuale (match debole). */
  duplicateCandidate: FatturaSyncDuplicateCandidate | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value != null
      ? String(value).trim()
      : "";
}

/** Estrae righe prodotto da payload FiC (fieldset detailed). */
export function extractRigheFromFicRaw(
  raw: Record<string, unknown>
): FatturaRiga[] {
  const items = Array.isArray(raw.items_list)
    ? raw.items_list
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.products)
        ? raw.products
        : [];
  const righe: FatturaRiga[] = [];
  for (const item of items) {
    const r = asRecord(item);
    const quantita = asNumber(r.qty ?? r.quantity ?? r.amount) || 1;
    const prezzoUnitario = asNumber(
      r.net_price ?? r.price ?? r.gross_price ?? r.unit_price
    );
    const descrizione =
      asText(r.name ?? r.description ?? r.product_description) || "Voce";
    const codice = asText(r.code ?? r.product_code ?? r.sku) || "—";
    if (!descrizione && !prezzoUnitario && !quantita) continue;
    const scontoPercentuale = Math.min(
      100,
      Math.max(0, asNumber(r.discount ?? r.discount_percent ?? r.sconto))
    );
    righe.push({
      prodottoId: null,
      codice,
      descrizione,
      quantita,
      prezzoUnitario,
      scontoPercentuale,
      importo: importoRiga(quantita, prezzoUnitario, scontoPercentuale),
    });
  }
  if (righe.length === 0) {
    const gross = asNumber(raw.amount_net ?? raw.amount_gross);
    if (gross > 0) {
      righe.push({
        prodottoId: null,
        codice: "—",
        descrizione: asText(raw.subject ?? raw.description) || "Documento FiC",
        quantita: 1,
        prezzoUnitario: gross,
        scontoPercentuale: 0,
        importo: gross,
      });
    }
  }
  return righe;
}

export function extractSpedizioneFromFicRaw(
  raw: Record<string, unknown>
): number {
  return Math.max(
    0,
    asNumber(
      raw.shipping_cost ??
        raw.carriage ??
        asRecord(raw.shipping).price ??
        asRecord(raw.shipping).cost
    )
  );
}

export function extractIvaPercentFromFicRaw(
  raw: Record<string, unknown>
): number {
  const items = Array.isArray(raw.items_list)
    ? raw.items_list
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  for (const item of items) {
    const vat = asRecord(asRecord(item).vat);
    const rate = asNumber(vat.value ?? vat.rate ?? asRecord(item).vat_rate);
    if (rate > 0) return rate;
  }
  const global = asNumber(raw.vat_rate ?? asRecord(raw.vat).value);
  return global > 0 ? global : 22;
}

export function statoPagamentoFromFic(
  status: FicDocumentNormalized["status"]
): FatturaStatoPagamento {
  return status === "paid" ? "pagato" : "da_pagare";
}

function entityStubFromDoc(doc: FicDocumentNormalized): FicEntityNormalized {
  const entity = asRecord(doc.raw.entity);
  const base: FicEntityNormalized = {
    ficId: asNumber(entity.id) || doc.ficId,
    kind: doc.type === "issued" ? "client" : "supplier",
    name: doc.entityName,
    vat: doc.entityVat,
    taxCode: asText(entity.tax_code) || doc.entityVat,
    email: asText(entity.email),
    pec: asText(entity.certified_email),
    phone: asText(entity.phone),
    sdi: asText(entity.ei_code),
    country: asText(entity.country) || "Italia",
    province: asText(entity.address_province ?? entity.province),
    city: asText(entity.address_city ?? entity.city),
    postalCode: asText(entity.address_postal_code ?? entity.postal_code),
    street: asText(entity.address_street ?? entity.address),
    shippingAddress: asText(entity.shipping_address),
  };
  let enriched = enrichEntityFromInvoiceRaw(base, doc.raw);
  if (doc.type === "received") {
    const xml =
      typeof doc.raw.ei_raw === "string" && doc.raw.ei_raw.includes("<")
        ? doc.raw.ei_raw
        : null;
    if (xml) {
      const ced = parseCedenteAnagraficaFromFatturaPaXml(xml);
      const fill = (cur: string, next: string) => (cur.trim() ? cur : next.trim());
      enriched = {
        ...enriched,
        name: fill(enriched.name, ced.name) || doc.entityName,
        vat: fill(enriched.vat, ced.vat) || doc.entityVat,
        taxCode: fill(enriched.taxCode, ced.taxCode) || enriched.vat,
        email: fill(enriched.email, ced.email),
        pec: fill(enriched.pec, ced.pec),
        phone: fill(enriched.phone, ced.phone),
        sdi: fill(enriched.sdi, ced.sdi),
        street: fill(enriched.street, ced.street),
        postalCode: fill(enriched.postalCode, ced.postalCode),
        city: fill(enriched.city, ced.city),
        province: fill(enriched.province, ced.province),
        country:
          fill(enriched.country, ced.country === "IT" ? "Italia" : ced.country) ||
          "Italia",
      };
    } else if (!enriched.vat.trim()) {
      enriched = { ...enriched, vat: doc.entityVat || enriched.vat };
    }
  }
  return enriched;
}

/** Riferimenti fattura citati in una nota di credito (es. 20/2025). */
export function extractFatturaRefsFromCreditNote(
  doc: FicDocumentNormalized
): string[] {
  const raw = doc.raw;
  const chunks = [
    doc.number,
    asText(raw.notes),
    asText(raw.subject),
    asText(raw.visible_subject),
    asText(raw.description),
    asText(asRecord(raw.ei_data).original_document_number),
    asText(asRecord(raw.ei_data).cig),
    JSON.stringify(raw.related ?? raw.original_document ?? ""),
  ];
  const text = chunks.join(" ");
  const refs = new Set<string>();
  for (const m of text.matchAll(
    /fattura\s*(?:n\.?|nr\.?|num\.?)?\s*([0-9]+\/[0-9]{2,4})/gi
  )) {
    refs.add(normalizeDocRef(m[1]));
  }
  for (const m of text.matchAll(/\b([0-9]{1,6}\/[0-9]{4})\b/g)) {
    refs.add(normalizeDocRef(m[1]));
  }
  return [...refs].filter(Boolean);
}

export function normalizeDocRef(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export type RegisteredFatturaHint = {
  id: string;
  numeroInterno: string;
  numeroEsterno: string;
  numeroFattura?: string;
  clienteId: string;
  entityVat: string;
  dataEmissione: string;
  totale: number;
  tipoDocumento?: "fattura" | "nota_credito";
  ficId?: number | null;
};

export function normalizeFatturaNumeroEsterno(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^N[\.\º°]?\s*/i, "");
}

export function fattureSyncTotaleTolleranza(): number {
  const n = Number(process.env.FATTURE_SYNC_TOTALE_TOLLERANZA ?? "0.02");
  return Number.isFinite(n) && n >= 0 ? n : 0.02;
}

export function fattureSyncDataTolleranzaGiorni(): number {
  const n = Number(process.env.FATTURE_SYNC_DATA_TOLLERANZA_GIORNI ?? "3");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

function yearFromIsoDate(iso: string): string {
  return (iso || "").slice(0, 4);
}

function daysBetweenIso(a: string, b: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return null;
  }
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function registeredDocNumeri(f: RegisteredFatturaHint): string[] {
  return [f.numeroEsterno, f.numeroFattura ?? ""]
    .map(normalizeFatturaNumeroEsterno)
    .filter(Boolean);
}

export type FicRegisteredMatch = {
  strength: "strong" | "weak";
  fattura: RegisteredFatturaHint;
  motivo: string;
};

/**
 * Riconosce fattura FiC già presente in Opuntia (anche se inserita a mano senza fic_id).
 * Forte: (numero+cliente/P.IVA+anno) oppure (numero+data+totale±tol).
 * Debole: stesso cliente + totale±tol + data ±N giorni (senza numero).
 */
export function matchFicDocToRegisteredFattura(
  doc: FicDocumentNormalized,
  kind: FatturaKind,
  fatture: RegisteredFatturaHint[]
): FicRegisteredMatch | null {
  const tipoWanted: "fattura" | "nota_credito" =
    kind === "nota_credito" ? "nota_credito" : "fattura";
  const pool = fatture.filter((f) => {
    if (f.ficId != null && Number(f.ficId) > 0) return false;
    const tipo = f.tipoDocumento ?? "fattura";
    return tipo === tipoWanted;
  });

  const docNum = normalizeFatturaNumeroEsterno(doc.number);
  const vat = normalizeVatKey(doc.entityVat);
  const date = doc.date || "";
  const year = yearFromIsoDate(date);
  const amount = Math.abs(doc.amountGross);
  const tol = fattureSyncTotaleTolleranza();
  const dayTol = fattureSyncDataTolleranzaGiorni();

  if (docNum) {
    for (const f of pool) {
      const nums = registeredDocNumeri(f);
      if (!nums.includes(docNum)) continue;
      const sameVat = Boolean(vat && normalizeVatKey(f.entityVat) === vat);
      const sameYear = Boolean(year && yearFromIsoDate(f.dataEmissione) === year);
      const sameDate = Boolean(date && f.dataEmissione === date);
      const totaleOk =
        amount > 0 && Math.abs(Math.abs(f.totale) - amount) <= tol;

      if (sameVat && sameYear) {
        return {
          strength: "strong",
          fattura: f,
          motivo: `Numero ${docNum} + P.IVA + anno ${year} → ${f.numeroInterno}`,
        };
      }
      if (sameDate && totaleOk) {
        return {
          strength: "strong",
          fattura: f,
          motivo: `Numero ${docNum} + data ${date} + totale (±${tol}€) → ${f.numeroInterno}`,
        };
      }
      if (sameVat && sameDate) {
        return {
          strength: "strong",
          fattura: f,
          motivo: `Numero ${docNum} + P.IVA + data → ${f.numeroInterno}`,
        };
      }
    }
  }

  // Debole: cliente + totale + data vicina
  let bestWeak: FicRegisteredMatch | null = null;
  for (const f of pool) {
    const sameVat = vat && normalizeVatKey(f.entityVat) === vat;
    if (!sameVat) continue;
    const totaleOk =
      amount > 0 && Math.abs(Math.abs(f.totale) - amount) <= tol;
    if (!totaleOk) continue;
    const days = daysBetweenIso(date, f.dataEmissione);
    if (days == null || days > dayTol) continue;
    const candidate: FicRegisteredMatch = {
      strength: "weak",
      fattura: f,
      motivo: `Stesso cliente + totale (±${tol}€) + data ±${dayTol}gg → ${f.numeroInterno} (conferma operatore)`,
    };
    if (!bestWeak) bestWeak = candidate;
  }
  return bestWeak;
}

/** Collega NC a fattura già registrata per riferimento / importo / periodo. */
export function matchCreditNoteToFattura(
  doc: FicDocumentNormalized,
  fatture: RegisteredFatturaHint[]
): FatturaSyncLinkedHint | null {
  const refs = extractFatturaRefsFromCreditNote(doc);
  const vat = normalizeVatKey(doc.entityVat);
  const amount = Math.abs(doc.amountGross);
  const date = doc.date || "";

  for (const ref of refs) {
    const hit = fatture.find((f) => {
      const ext = normalizeDocRef(f.numeroEsterno);
      return (
        ext === ref ||
        ext.endsWith(ref) ||
        ext.includes(ref) ||
        f.numeroInterno.includes(ref)
      );
    });
    if (hit) {
      return {
        fatturaId: hit.id,
        numeroInterno: hit.numeroInterno,
        numeroEsterno: hit.numeroEsterno || ref,
        motivo: `Riferimento documento «${ref}»`,
      };
    }
  }

  // Match debole: stessa P.IVA, importo ≈, data entro 120 giorni
  const candidates = fatture.filter((f) => {
    if (vat && normalizeVatKey(f.entityVat) !== vat) return false;
    const diff = Math.abs(Math.abs(f.totale) - amount);
    if (amount > 0 && diff > Math.max(0.5, amount * 0.02)) return false;
    if (date && f.dataEmissione) {
      const a = Date.parse(date);
      const b = Date.parse(f.dataEmissione);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const days = Math.abs(a - b) / (1000 * 60 * 60 * 24);
        if (days > 120) return false;
      }
    }
    return true;
  });
  if (candidates.length === 1) {
    const hit = candidates[0];
    return {
      fatturaId: hit.id,
      numeroInterno: hit.numeroInterno,
      numeroEsterno: hit.numeroEsterno,
      motivo: "Stesso cliente, importo e periodo compatibili",
    };
  }
  if (refs.length > 0) {
    return {
      fatturaId: null,
      numeroInterno: "",
      numeroEsterno: refs[0],
      motivo: `Riferimento «${refs[0]}» (fattura non ancora in Opuntia o non trovata)`,
    };
  }
  return null;
}

/** NC pendenti correlate a una fattura FiC in coda (stesso cliente / rif / importo). */
export function creditNotesRelatedToInvoice(
  invoice: FicDocumentNormalized,
  creditNotes: FicDocumentNormalized[]
): FicDocumentNormalized[] {
  const vat = normalizeVatKey(invoice.entityVat);
  const invNum = normalizeDocRef(invoice.number);
  const amount = Math.abs(invoice.amountGross);
  return creditNotes.filter((nc) => {
    const refs = extractFatturaRefsFromCreditNote(nc);
    if (invNum && refs.some((r) => invNum.includes(r) || r.includes(invNum))) {
      return true;
    }
    const sameVat = vat && normalizeVatKey(nc.entityVat) === vat;
    const amountClose =
      amount > 0 &&
      Math.abs(Math.abs(nc.amountGross) - amount) <=
        Math.max(0.5, amount * 0.02);
    if (sameVat && amountClose) return true;
    return false;
  });
}

export function buildFatturaSyncQueueItem(input: {
  doc: FicDocumentNormalized;
  kind: FatturaKind;
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
  linkedFattura?: FatturaSyncLinkedHint | null;
  duplicateCandidate?: FatturaSyncDuplicateCandidate | null;
}): FatturaSyncQueueItem {
  const righeRaw = extractRigheFromFicRaw(input.doc.raw);
  const isNc = input.kind === "nota_credito";
  const righe = isNc
    ? righeRaw.map((r) => ({
        ...r,
        quantita: r.quantita > 0 ? -r.quantita : r.quantita || -1,
        prezzoUnitario: Math.abs(r.prezzoUnitario),
        importo: importoRiga(
          r.quantita > 0 ? -r.quantita : r.quantita || -1,
          Math.abs(r.prezzoUnitario),
          r.scontoPercentuale ?? 0
        ),
      }))
    : righeRaw;
  const spedizione = extractSpedizioneFromFicRaw(input.doc.raw);
  const ivaPercentuale = extractIvaPercentFromFicRaw(input.doc.raw);
  const totals = calcolaTotaliFattura({
    righe,
    spedizione,
    spedizioneIvaApplicata: false,
    notaCredito: isNc,
    spedizioneSottraiIncassi: true,
    ivaPercentuale,
  });
  const entity = entityStubFromDoc(input.doc);
  const draft = draftFromFicEntity(entity);
  const linked = input.linkedFattura ?? null;
  const refs = extractFatturaRefsFromCreditNote(input.doc);

  return {
    ficId: input.doc.ficId,
    kind: input.kind,
    numeroEsterno: input.doc.number,
    dataEmissione:
      input.doc.date || new Date().toISOString().slice(0, 10),
    entityName: input.doc.entityName,
    entityVat: input.doc.entityVat,
    amountGross: input.doc.amountGross,
    statoPagamento: statoPagamentoFromFic(input.doc.status),
    spedizione,
    spedizioneIvaApplicata: false,
    ivaPercentuale,
    imponibile: totals.imponibile,
    imposta: totals.imposta,
    totale: totals.totale || Math.abs(input.doc.amountGross),
    righe,
    anagraficaMode: input.existingId ? "existing" : "create",
    existingId: input.existingId,
    existingLabel: input.existingLabel,
    proposedTarga: input.proposedTarga,
    draft,
    linkedFattura: linked,
    riferimentoFatturaEsterno:
      linked?.numeroEsterno || refs[0] || "",
    duplicateCandidate: input.duplicateCandidate ?? null,
  };
}

/** Priorità match importo NC ↔ fattura (±0,5€ o 2%). */
export function amountMatchScore(
  amountA: number,
  amountB: number
): { close: boolean; delta: number } {
  const a = Math.abs(amountA);
  const b = Math.abs(amountB);
  const delta = Math.abs(a - b);
  const close = a > 0 && b > 0 && delta <= Math.max(0.5, a * 0.02);
  return { close, delta };
}

export function sortPendingInvoicesByNcAmount<
  T extends {
    amountGross: number;
    dataEmissione?: string | null;
    date?: string | null;
  },
>(items: T[], importoNc: number): T[] {
  const target = Math.abs(importoNc);
  return [...items].sort((x, y) => {
    const sx = amountMatchScore(x.amountGross, target);
    const sy = amountMatchScore(y.amountGross, target);
    if (sx.close !== sy.close) return sx.close ? -1 : 1;
    if (sx.delta !== sy.delta) return sx.delta - sy.delta;
    const dx = x.dataEmissione || x.date || "";
    const dy = y.dataEmissione || y.date || "";
    return dy.localeCompare(dx);
  });
}

export { normalizeCompanyNameKey, normalizeVatKey };
