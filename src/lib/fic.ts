/**
 * Client minimo Fatture in Cloud API v2 (Manual Authentication).
 * Usa FIC_API_TOKEN (Bearer) e FIC_COMPANY_ID dal server.
 */

const FIC_API_BASE = "https://api-v2.fattureincloud.it";

export type FicInvoiceKind = "issued" | "received";
export type FicPaymentStatus = "paid" | "not_paid" | "partially_paid";

export type FicDocumentNormalized = {
  ficId: number;
  type: FicInvoiceKind;
  number: string;
  entityName: string;
  entityVat: string;
  amountGross: number;
  date: string | null;
  dueDate: string | null;
  status: FicPaymentStatus;
  raw: Record<string, unknown>;
};

/**
 * Lettura a runtime (notazione a parentesi) per evitare che Next.js
 * “congeli” il valore a build time quando la variabile non c’era ancora.
 */
function readServerEnv(name: string): string {
  const direct = process.env[name];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  // Alcuni setup Vercel espongono anche senza trim/spazi strani
  const all = process.env;
  const match = Object.keys(all).find(
    (k) => k.trim().toUpperCase() === name.toUpperCase()
  );
  if (match) {
    const v = all[match];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function peekFicEnv(): {
  hasToken: boolean;
  hasCompanyId: boolean;
  tokenLength: number;
  companyIdPreview: string;
} {
  const token = readServerEnv("FIC_API_TOKEN");
  const companyRaw = readServerEnv("FIC_COMPANY_ID");
  return {
    hasToken: token.length > 0,
    hasCompanyId: /^\d+$/.test(companyRaw),
    tokenLength: token.length,
    companyIdPreview: companyRaw || "(vuoto)",
  };
}

export function getFicConfig(): { token: string; companyId: number } {
  const token = readServerEnv("FIC_API_TOKEN");
  const companyRaw = readServerEnv("FIC_COMPANY_ID");
  if (!token) {
    throw new Error(
      "Manca FIC_API_TOKEN sul server Vercel. Controlla Settings → Environment Variables (nome esatto FIC_API_TOKEN, ambiente Production) e fai Redeploy senza cache."
    );
  }
  if (!companyRaw || !/^\d+$/.test(companyRaw)) {
    throw new Error(
      "Manca FIC_COMPANY_ID sul server Vercel (deve essere solo numeri, es. 941053). Poi Redeploy."
    );
  }
  return { token, companyId: Number(companyRaw) };
}

function formatFicDateTime(iso: Date): string {
  // FiC query usa spesso 'YYYY-MM-DD HH:mm:ss'
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${iso.getUTCFullYear()}-${pad(iso.getUTCMonth() + 1)}-${pad(iso.getUTCDate())} ${pad(iso.getUTCHours())}:${pad(iso.getUTCMinutes())}:${pad(iso.getUTCSeconds())}`;
}

export function buildUpdatedSinceQuery(since: Date | null): string | undefined {
  if (!since) return undefined;
  // Piccolo overlap per non perdere aggiornamenti al bordo
  const from = new Date(since.getTime() - 60_000);
  return `updated_at >= '${formatFicDateTime(from)}'`;
}

type FicListResponse = {
  data?: unknown[];
  current_page?: number;
  last_page?: number;
  total?: number;
};

async function ficRequest<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  options?: {
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const { token, companyId } = getFicConfig();
  const url = new URL(`${FIC_API_BASE}/c/${companyId}${path}`);
  for (const [k, v] of Object.entries(options?.query ?? {})) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options?.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Fatture in Cloud ha risposto con errore ${res.status}: ${body.slice(0, 600)}`
    );
  }

  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

/** GET che restituisce testo grezzo (es. XML e-fattura). */
async function ficGetText(
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<{ text: string; contentType: string }> {
  const { token, companyId } = getFicConfig();
  const url = new URL(`${FIC_API_BASE}/c/${companyId}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/xml, text/xml, application/json, */*",
    },
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `Fatture in Cloud ha risposto con errore ${res.status}: ${text.slice(0, 600)}`
    );
  }
  return { text, contentType };
}

async function ficGet<T>(
  path: string,
  query: Record<string, string | number | undefined>
): Promise<T> {
  return ficRequest<T>("GET", path, { query });
}

async function ficPost<T>(path: string, body: unknown): Promise<T> {
  return ficRequest<T>("POST", path, { body });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function paymentStatusFromPayments(payments: unknown): FicPaymentStatus {
  if (!Array.isArray(payments) || payments.length === 0) return "not_paid";
  let paid = 0;
  let unpaid = 0;
  for (const p of payments) {
    const status = String(asRecord(p).status ?? "").toLowerCase();
    if (status === "paid") paid += 1;
    else unpaid += 1;
  }
  if (paid > 0 && unpaid === 0) return "paid";
  if (paid > 0 && unpaid > 0) return "partially_paid";
  return "not_paid";
}

export function normalizeIssuedDocument(
  raw: unknown
): FicDocumentNormalized | null {
  const doc = asRecord(raw);
  const ficId = asNumber(doc.id);
  if (!ficId) return null;
  const entity = asRecord(doc.entity);
  const number = [doc.number, doc.numeration]
    .filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    .map(String)
    .join(" ");
  return {
    ficId,
    type: "issued",
    number: number || String(doc.number ?? ""),
    entityName: String(entity.name ?? ""),
    entityVat: String(entity.vat_number ?? entity.tax_code ?? ""),
    amountGross: asNumber(doc.amount_gross),
    date: asDateOnly(doc.date),
    dueDate: asDateOnly(doc.next_due_date),
    status: paymentStatusFromPayments(doc.payments_list),
    raw: doc,
  };
}

export function normalizeReceivedDocument(
  raw: unknown
): FicDocumentNormalized | null {
  const doc = asRecord(raw);
  const ficId = asNumber(doc.id);
  if (!ficId) return null;
  const entity = asRecord(doc.entity);
  return {
    ficId,
    type: "received",
    number: String(doc.invoice_number ?? doc.number ?? ""),
    entityName: String(entity.name ?? ""),
    entityVat: String(entity.vat_number ?? entity.tax_code ?? ""),
    amountGross: asNumber(doc.amount_gross),
    date: asDateOnly(doc.date),
    dueDate: asDateOnly(doc.next_due_date),
    status: paymentStatusFromPayments(doc.payments_list),
    raw: doc,
  };
}

async function listAllPages(
  path: string,
  baseQuery: Record<string, string | number | undefined>,
  normalize: (raw: unknown) => FicDocumentNormalized | null
): Promise<FicDocumentNormalized[]> {
  const out: FicDocumentNormalized[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const res = await ficGet<FicListResponse>(path, {
      ...baseQuery,
      page,
      per_page: 100,
    });
    lastPage = Number(res.last_page ?? 1) || 1;
    for (const item of res.data ?? []) {
      const n = normalize(item);
      if (n) out.push(n);
    }
    page += 1;
  } while (page <= lastPage && page <= 50); // safety cap

  return out;
}

/** Scarica fatture emesse (invoice) aggiornate da `since` (se presente). */
export async function fetchIssuedInvoices(
  since: Date | null
): Promise<FicDocumentNormalized[]> {
  const q = buildUpdatedSinceQuery(since);
  return listAllPages(
    "/issued_documents",
    {
      type: "invoice",
      fieldset: "detailed",
      sort: "-updated_at",
      q,
    },
    normalizeIssuedDocument
  );
}

/** Scarica note di credito emesse (credit_note). */
export async function fetchIssuedCreditNotes(
  since: Date | null
): Promise<FicDocumentNormalized[]> {
  const q = buildUpdatedSinceQuery(since);
  return listAllPages(
    "/issued_documents",
    {
      type: "credit_note",
      fieldset: "detailed",
      sort: "-updated_at",
      q,
    },
    normalizeIssuedDocument
  );
}

/** Scarica fatture ricevute (expense) aggiornate da `since` (se presente). */
export async function fetchReceivedInvoices(
  since: Date | null
): Promise<FicDocumentNormalized[]> {
  const q = buildUpdatedSinceQuery(since);
  return listAllPages(
    "/received_documents",
    {
      type: "expense",
      fieldset: "detailed",
      sort: "-updated_at",
      q,
    },
    normalizeReceivedDocument
  );
}

export type FicEntityKind = "supplier" | "client";

export type FicEntityNormalized = {
  ficId: number;
  kind: FicEntityKind;
  name: string;
  vat: string;
  /** Codice fiscale FiC (tax_code), distinto da vat_number. */
  taxCode: string;
  email: string;
  pec: string;
  phone: string;
  sdi: string;
  country: string;
  province: string;
  city: string;
  postalCode: string;
  street: string;
  shippingAddress: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value != null ? String(value).trim() : "";
}

export function normalizeFicEntity(
  raw: unknown,
  kind: FicEntityKind
): FicEntityNormalized | null {
  const doc = asRecord(raw);
  const ficId = asNumber(doc.id);
  if (!ficId) return null;
  const name = asText(doc.name);
  if (!name) return null;
  return {
    ficId,
    kind,
    name,
    vat: asText(doc.vat_number) || asText(doc.tax_code),
    taxCode: asText(doc.tax_code) || asText(doc.vat_number),
    email: asText(doc.email),
    pec: asText(doc.certified_email),
    phone: asText(doc.phone),
    sdi: asText(doc.ei_code),
    country: asText(doc.country) || "Italia",
    province: asText(doc.address_province),
    city: asText(doc.address_city),
    postalCode: asText(doc.address_postal_code),
    street: asText(doc.address_street),
    shippingAddress: asText(doc.shipping_address),
  };
}

/** Arricchisce da entity presente in documenti fattura (campi spesso parziali). */
export function enrichEntityFromInvoiceRaw(
  base: FicEntityNormalized,
  invoiceRaw: Record<string, unknown>
): FicEntityNormalized {
  const entity = asRecord(invoiceRaw.entity);
  const fill = (current: string, next: unknown) =>
    current.trim() ? current : asText(next);
  return {
    ...base,
    name: fill(base.name, entity.name),
    vat: fill(base.vat, entity.vat_number ?? entity.tax_code),
    taxCode: fill(base.taxCode, entity.tax_code ?? entity.vat_number),
    email: fill(base.email, entity.email),
    pec: fill(base.pec, entity.certified_email),
    phone: fill(base.phone, entity.phone),
    sdi: fill(base.sdi, entity.ei_code),
    country: fill(base.country, entity.country) || "Italia",
    province: fill(base.province, entity.address_province ?? entity.province),
    city: fill(base.city, entity.address_city ?? entity.city),
    postalCode: fill(
      base.postalCode,
      entity.address_postal_code ?? entity.postal_code
    ),
    street: fill(base.street, entity.address_street ?? entity.address),
    shippingAddress: fill(base.shippingAddress, entity.shipping_address),
  };
}

async function listAllEntities(
  path: string,
  kind: FicEntityKind
): Promise<FicEntityNormalized[]> {
  const out: FicEntityNormalized[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await ficGet<FicListResponse>(path, {
      fieldset: "detailed",
      sort: "name",
      page,
      per_page: 100,
    });
    lastPage = Number(res.last_page ?? 1) || 1;
    for (const item of res.data ?? []) {
      const n = normalizeFicEntity(item, kind);
      if (n) out.push(n);
    }
    page += 1;
  } while (page <= lastPage && page <= 50);
  return out;
}

export async function fetchFicSuppliers(): Promise<FicEntityNormalized[]> {
  return listAllEntities("/entities/suppliers", "supplier");
}

export async function fetchFicClients(): Promise<FicEntityNormalized[]> {
  return listAllEntities("/entities/clients", "client");
}

function escapeFicQueryValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Cerca un’entità FiC per P.IVA / codice fiscale (suppliers poi clients).
 * Usa filtro `q` API v2 — non scarica tutto il catalogo.
 */
export async function findFicEntityByVat(
  vatOrTax: string
): Promise<FicEntityNormalized | null> {
  const raw = vatOrTax.replace(/[\s.\-\/]/g, "").toUpperCase();
  if (!raw || raw.length < 5) return null;
  const key = raw.startsWith("IT") && raw.length > 2 ? raw.slice(2) : raw;
  const escaped = escapeFicQueryValue(key);
  const q = `(vat_number = '${escaped}' or tax_code = '${escaped}')`;

  for (const kind of ["supplier", "client"] as const) {
    const path =
      kind === "supplier" ? "/entities/suppliers" : "/entities/clients";
    try {
      const res = await ficGet<FicListResponse>(path, {
        fieldset: "detailed",
        q,
        page: 1,
        per_page: 10,
      });
      for (const item of res.data ?? []) {
        const n = normalizeFicEntity(item, kind);
        if (!n) continue;
        const nKey = (n.vat || "").replace(/[\s.\-\/]/g, "").toUpperCase();
        const nKey2 = nKey.startsWith("IT") ? nKey.slice(2) : nKey;
        if (nKey2 === key) return n;
      }
      // Se la query ha restituito qualcosa senza match esatto, prendi il primo
      if ((res.data ?? []).length > 0) {
        const first = normalizeFicEntity(res.data![0], kind);
        if (first) return first;
      }
    } catch {
      // Continua con l’altra kind / fallback fatture
    }
  }
  return null;
}

/**
 * Stub anagrafica da fatture ricevute FiC (entity su documento).
 */
export async function findFicEntityFromReceivedInvoices(
  vatOrTax: string
): Promise<FicEntityNormalized | null> {
  const raw = vatOrTax.replace(/[\s.\-\/]/g, "").toUpperCase();
  if (!raw || raw.length < 5) return null;
  const key = raw.startsWith("IT") && raw.length > 2 ? raw.slice(2) : raw;
  const escaped = escapeFicQueryValue(key);
  const q = `(entity.vat_number = '${escaped}' or entity.tax_code = '${escaped}')`;
  try {
    const res = await ficGet<FicListResponse>("/received_documents", {
      type: "expense",
      fieldset: "detailed",
      q,
      page: 1,
      per_page: 5,
      sort: "-updated_at",
    });
    for (const item of res.data ?? []) {
      const doc = asRecord(item);
      const stub: FicEntityNormalized = {
        ficId: asNumber(asRecord(doc.entity).id) || asNumber(doc.id),
        kind: "supplier",
        name: "",
        vat: "",
        taxCode: "",
        email: "",
        pec: "",
        phone: "",
        sdi: "",
        country: "Italia",
        province: "",
        city: "",
        postalCode: "",
        street: "",
        shippingAddress: "",
      };
      const enriched = enrichEntityFromInvoiceRaw(stub, doc);
      if (!enriched.name && !enriched.vat) continue;
      const nKey = (enriched.vat || "").replace(/[\s.\-\/]/g, "").toUpperCase();
      const nKey2 = nKey.startsWith("IT") ? nKey.slice(2) : nKey;
      if (!nKey2 || nKey2 === key) return enriched;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * URL temporaneo PDF/allegato documento FiC (da aprire in nuova scheda).
 * Emesse: campo `url`; ricevute: `attachment_url` / preview.
 */
export async function fetchFicDocumentPdfUrl(input: {
  kind: FicInvoiceKind;
  ficId: number;
}): Promise<string> {
  const ficId = Number(input.ficId);
  if (!Number.isFinite(ficId) || ficId <= 0) {
    throw new Error("ID documento Fatture in Cloud non valido.");
  }

  const path =
    input.kind === "issued"
      ? `/issued_documents/${ficId}`
      : `/received_documents/${ficId}`;

  const res = await ficGet<{ data?: unknown }>(path, {});
  const data = asRecord(res.data);
  const candidates = [
    data.url,
    data.attachment_url,
    data.attachmentUrl,
    data.attachment_preview_url,
    data.attachmentPreviewUrl,
    data.ai_url,
    data.aiUrl,
  ];

  for (const c of candidates) {
    const url = asText(c);
    if (!url) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    // Alcune risposte espongono path relativi
    if (url.startsWith("/")) return `https://api-v2.fattureincloud.it${url}`;
  }

  throw new Error(
    "Fatture in Cloud non ha restituito un link PDF per questo documento (allegato assente o non disponibile)."
  );
}

function looksLikeXml(text: string): boolean {
  const t = text.trim();
  return t.startsWith("<?xml") || t.startsWith("<");
}

function extractXmlCandidateFromRecord(
  raw: Record<string, unknown>
): string | null {
  const candidates = [
    raw.ei_raw,
    raw.e_invoice_xml,
    raw.xml,
    raw.xml_content,
    asRecord(raw.ei_data).xml,
    asRecord(raw.e_invoice).xml,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && looksLikeXml(c)) return c.trim();
  }
  return null;
}

/**
 * XML fattura elettronica da FiC.
 * - Emesse: GET …/issued_documents/{id}/e_invoice/xml
 * - Ricevute: campi XML nel documento / allegato .xml / cache locale (gestita dal caller)
 */
export async function fetchFicDocumentXml(input: {
  kind: FicInvoiceKind;
  ficId: number;
}): Promise<{ xml: string; filename: string }> {
  const ficId = Number(input.ficId);
  if (!Number.isFinite(ficId) || ficId <= 0) {
    throw new Error("ID documento Fatture in Cloud non valido.");
  }

  if (input.kind === "issued") {
    const { text } = await ficGetText(
      `/issued_documents/${ficId}/e_invoice/xml`,
      { include_attachment: 0 }
    );
    if (!looksLikeXml(text)) {
      throw new Error(
        "Fatture in Cloud non ha restituito un XML valido per questo documento emesso."
      );
    }
    return { xml: text.trim(), filename: `fattura-emessa-${ficId}.xml` };
  }

  const res = await ficGet<{ data?: unknown }>(
    `/received_documents/${ficId}`,
    {}
  );
  const data = asRecord(res.data);
  const embedded = extractXmlCandidateFromRecord(data);
  if (embedded) {
    return { xml: embedded, filename: `fattura-ricevuta-${ficId}.xml` };
  }

  const attachmentCandidates = [
    data.attachment_url,
    data.attachmentUrl,
    data.url,
    data.ai_url,
    data.aiUrl,
  ];
  for (const c of attachmentCandidates) {
    const url = asText(c);
    if (!url) continue;
    if (!/\.xml(\?|$)/i.test(url)) continue;
    const absolute =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : url.startsWith("/")
          ? `https://api-v2.fattureincloud.it${url}`
          : "";
    if (!absolute) continue;
    const { token } = getFicConfig();
    const fileRes = await fetch(absolute, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
      cache: "no-store",
    });
    const text = await fileRes.text().catch(() => "");
    if (fileRes.ok && looksLikeXml(text)) {
      return { xml: text.trim(), filename: `fattura-ricevuta-${ficId}.xml` };
    }
  }

  throw new Error(
    "XML non disponibile per questa fattura ricevuta su Fatture in Cloud (né nel documento né come allegato)."
  );
}

export type FicVatType = {
  id: number;
  value: number;
  description: string;
};

/** Elenco aliquote IVA configurate su FiC. */
export async function fetchFicVatTypes(): Promise<FicVatType[]> {
  const res = await ficGet<{ data?: unknown[] }>("/info/vat_types", {});
  const out: FicVatType[] = [];
  for (const item of res.data ?? []) {
    const r = asRecord(item);
    const id = asNumber(r.id);
    if (!id && id !== 0) continue;
    out.push({
      id,
      value: asNumber(r.value),
      description: asText(r.description),
    });
  }
  return out;
}

/** Trova vat.id FiC più vicino all’aliquota %. Preferisce match esatto. */
export function resolveFicVatId(
  vatTypes: FicVatType[],
  aliquotaPercent: number
): number {
  const target = Number(aliquotaPercent) || 0;
  const exact = vatTypes.find((v) => Math.abs(v.value - target) < 0.001);
  if (exact) return exact.id;
  if (target === 0) {
    const zero = vatTypes.find((v) => v.value === 0);
    if (zero) return zero.id;
  }
  // fallback comune FiC: id 0 = IVA default azienda
  return vatTypes[0]?.id ?? 0;
}

export type CreateIssuedDocumentResult = {
  ficId: number;
  number: string;
  eiStatus: string;
  pdfUrl: string;
  raw: Record<string, unknown>;
};

/** Crea fattura emessa su FiC (POST /issued_documents). */
export async function createIssuedDocument(
  data: Record<string, unknown>
): Promise<CreateIssuedDocumentResult> {
  const res = await ficPost<{ data?: unknown }>("/issued_documents", { data });
  const doc = asRecord(res.data);
  const ficId = asNumber(doc.id);
  if (!ficId) {
    throw new Error(
      "Fatture in Cloud non ha restituito l’ID del documento creato."
    );
  }
  const number = [doc.number, doc.numeration]
    .filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    .map(String)
    .join("");
  let pdfUrl = "";
  try {
    pdfUrl = await fetchFicDocumentPdfUrl({ kind: "issued", ficId });
  } catch {
    pdfUrl = asText(doc.url);
  }
  return {
    ficId,
    number: number || String(doc.number ?? ""),
    eiStatus: asText(doc.ei_status),
    pdfUrl,
    raw: doc,
  };
}

/** Invia e-fattura allo SDI. */
export async function sendIssuedDocumentToSdi(input: {
  ficId: number;
  dryRun?: boolean;
}): Promise<{ raw: Record<string, unknown> }> {
  const body = input.dryRun
    ? { data: { dry_run: true } }
    : { data: {} };
  const res = await ficPost<{ data?: unknown }>(
    `/issued_documents/${input.ficId}/e_invoice/send`,
    body
  );
  return { raw: asRecord(res.data ?? res) };
}

/** Invia mail di cortesia con link/PDF al cliente. */
export async function sendIssuedDocumentCourtesyEmail(input: {
  ficId: number;
  recipientEmail: string;
  subject: string;
  bodyHtml?: string;
}): Promise<void> {
  const email = input.recipientEmail.trim();
  if (!email) {
    throw new Error("Email destinatario mancante per la mail di cortesia.");
  }
  await ficPost(`/issued_documents/${input.ficId}/email`, {
    data: {
      recipient_email: email,
      subject: input.subject,
      body:
        input.bodyHtml ??
        `Gentile cliente,<br>in allegato / al link la fattura <b>${input.subject}</b>.<br><br>{{allegati}}<br><br>Cordiali saluti.`,
      include: {
        document: true,
        delivery_note: false,
        attachment: false,
        accompanying_invoice: false,
      },
      attach_pdf: true,
      send_copy: false,
    },
  });
}
