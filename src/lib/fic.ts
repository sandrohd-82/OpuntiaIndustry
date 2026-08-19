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
    const lower = body.toLowerCase();
    if (
      res.status === 403 &&
      (lower.includes("no_permission") || lower.includes("no permission"))
    ) {
      if (path.includes("/cashbook") || path.includes("payment_accounts")) {
        throw new Error(
          "Fatture in Cloud: permesso mancante sulla Prima nota (cashbook). " +
            "Rigenera il token API con lo scope «cashbook:r» (e «settings:r» per i conti). " +
            "Pannello sviluppatori FiC → App → Scopes → cashbook:r → nuovo token → " +
            "incollalo in Vercel come FIC_API_TOKEN → Redeploy. " +
            "Se usi un utente secondario FiC, l’admin deve anche abilitare Prima nota in Utenti e permessi."
        );
      }
      throw new Error(
        "Fatture in Cloud: token senza permesso (403 NO_PERMISSION) sull’endpoint " +
          `${path}. Aggiungi gli scope mancanti e rigenera FIC_API_TOKEN.`
      );
    }
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
  const entityVat =
    pickItalianVat(
      entity.vat_number,
      entity.vat,
      entity.tax_code,
      extractSupplierVatFromReceivedRaw(doc)
    ) ||
    asText(entity.vat_number) ||
    asText(entity.tax_code) ||
    asText(entity.vat);
  return {
    ficId,
    type: "received",
    number: String(doc.invoice_number ?? doc.number ?? ""),
    entityName: String(entity.name ?? ""),
    entityVat,
    amountGross: asNumber(doc.amount_gross),
    date: asDateOnly(doc.date),
    dueDate: asDateOnly(doc.next_due_date),
    status: paymentStatusFromPayments(doc.payments_list),
    raw: doc,
  };
}

/** P.IVA cedente da campi FiC / XML SDI (ricevute spesso incomplete in entity). */
export function extractSupplierVatFromReceivedRaw(
  raw: Record<string, unknown>
): string {
  const entity = asRecord(raw.entity);
  const direct = pickItalianVat(
    entity.vat_number,
    entity.vat,
    entity.vatNumber,
    entity.partita_iva,
    entity.tax_code,
    entity.codice_fiscale,
    asRecord(raw.ei_data).vat_number,
    asRecord(raw.ei_data).tax_code,
    asRecord(raw.supplier).vat_number,
    asRecord(raw.supplier).tax_code
  );
  if (direct) return direct;

  const xml = findXmlBlobInReceivedRaw(raw);
  if (xml) {
    const fromXml = parseCedenteVatFromFatturaPaXml(xml);
    if (fromXml && looksLikeItalianVat(fromXml)) return fromXml;
  }

  return deepFindItalianVat(raw);
}

function findXmlBlobInReceivedRaw(raw: Record<string, unknown>): string | null {
  const candidates = [
    raw.ei_raw,
    raw.e_invoice_xml,
    raw.xml,
    raw.xml_content,
    asRecord(raw.ei_data).xml,
    asRecord(raw.e_invoice).xml,
    raw.attachment_xml,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const xml = extractXmlFromPossiblySigned(c);
    if (xml) return xml;
  }
  return null;
}

function xmlLocalText(xml: string, localName: string): string {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return "";
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function xmlLocalBlock(xml: string, localName: string): string {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[\\s\\S]*?</(?:[\\w.-]+:)?${localName}>`,
    "i"
  );
  return xml.match(re)?.[0] ?? "";
}

export function parseCedenteVatFromFatturaPaXml(xml: string): string {
  const cedente =
    xmlLocalBlock(xml, "CedentePrestatore") ||
    xmlLocalBlock(xml, "CedentePrestatoreDTE");
  const ivaBlock = xmlLocalBlock(cedente || xml, "IdFiscaleIVA");
  const idCodice = xmlLocalText(ivaBlock, "IdCodice");
  const cf = xmlLocalText(cedente || xml, "CodiceFiscale");
  return pickItalianVat(idCodice, cf) || idCodice || cf;
}

/** Dati anagrafici cedente da XML FatturaPA (per prefill scheda fornitore). */
export function parseCedenteAnagraficaFromFatturaPaXml(xml: string): {
  name: string;
  vat: string;
  taxCode: string;
  pec: string;
  sdi: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
} {
  const cedente =
    xmlLocalBlock(xml, "CedentePrestatore") ||
    xmlLocalBlock(xml, "CedentePrestatoreDTE");
  const anag = xmlLocalBlock(cedente, "Anagrafica");
  const sede = xmlLocalBlock(cedente, "Sede");
  const contatti = xmlLocalBlock(cedente, "Contatti");
  const ivaBlock = xmlLocalBlock(cedente, "IdFiscaleIVA");
  const vat = xmlLocalText(ivaBlock, "IdCodice");
  const taxCode = xmlLocalText(cedente, "CodiceFiscale") || vat;
  const name =
    xmlLocalText(anag, "Denominazione") ||
    [xmlLocalText(anag, "Nome"), xmlLocalText(anag, "Cognome")]
      .filter(Boolean)
      .join(" ");
  const street = [
    xmlLocalText(sede, "Indirizzo"),
    xmlLocalText(sede, "NumeroCivico"),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    name,
    vat,
    taxCode,
    pec: xmlLocalText(contatti, "Email") || "", // spesso PEC in Email
    sdi: xmlLocalText(xml, "CodiceDestinatario"),
    email: xmlLocalText(contatti, "Email"),
    phone: xmlLocalText(contatti, "Telefono"),
    street,
    postalCode: xmlLocalText(sede, "CAP"),
    city: xmlLocalText(sede, "Comune"),
    province: xmlLocalText(sede, "Provincia"),
    country: xmlLocalText(sede, "Nazione") || "IT",
  };
}

function mapCountryLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c || c === "IT" || c === "ITA") return "Italia";
  return code.trim() || "Italia";
}

function mergeCedenteIntoRaw(
  raw: Record<string, unknown>,
  ced: ReturnType<typeof parseCedenteAnagraficaFromFatturaPaXml>,
  entityName: string,
  entityVat: string
): Record<string, unknown> {
  const entity = asRecord(raw.entity);
  return {
    ...raw,
    entity: {
      ...entity,
      name: entityName || ced.name || asText(entity.name),
      vat_number: entityVat || ced.vat || asText(entity.vat_number),
      tax_code: ced.taxCode || asText(entity.tax_code),
      email: ced.email || asText(entity.email),
      certified_email: ced.pec || asText(entity.certified_email),
      phone: ced.phone || asText(entity.phone),
      ei_code: ced.sdi || asText(entity.ei_code),
      address_street: ced.street || asText(entity.address_street),
      address_postal_code:
        ced.postalCode || asText(entity.address_postal_code),
      address_city: ced.city || asText(entity.address_city),
      address_province: ced.province || asText(entity.address_province),
      country: mapCountryLabel(ced.country || asText(entity.country)),
    },
  };
}

/**
 * Arricchisce una ricevuta FiC: dettaglio + supplier + XML SDI.
 * La P.IVA cedente (11 cifre) è obbligatoria per il match anagrafica.
 */
export async function enrichReceivedDocument(
  doc: FicDocumentNormalized
): Promise<FicDocumentNormalized> {
  let raw = { ...doc.raw };
  let entityVat = pickItalianVat(doc.entityVat);
  let entityName = doc.entityName;

  const hasItems =
    (Array.isArray(raw.items_list) && raw.items_list.length > 0) ||
    (Array.isArray(raw.items) && raw.items.length > 0);
  const hasEntity = Object.keys(asRecord(raw.entity)).length > 0;

  // 1) Dettaglio documento — salta se la lista FiC ha già portato fieldset detailed
  if (!hasItems || !hasEntity) {
    try {
      const res = await ficGet<{ data?: unknown }>(
        `/received_documents/${doc.ficId}`,
        { fieldset: "detailed" }
      );
      const detail = asRecord(
        (res as { data?: unknown }).data ?? (res as unknown)
      );
      if (Object.keys(detail).length > 0 && asNumber(detail.id)) {
        raw = {
          ...raw,
          ...detail,
          entity: { ...asRecord(raw.entity), ...asRecord(detail.entity) },
        };
      }
    } catch (e) {
      console.error(
        "[fic] enrich detail failed",
        doc.ficId,
        e instanceof Error ? e.message : e
      );
    }
  }

  entityVat =
    pickItalianVat(
      asRecord(raw.entity).vat_number,
      asRecord(raw.entity).vat,
      asRecord(raw.entity).tax_code,
      extractSupplierVatFromReceivedRaw(raw),
      entityVat
    ) || entityVat;
  entityName = asText(asRecord(raw.entity).name) || entityName;

  // 2) Anagrafica supplier FiC per id
  const supplierId = asNumber(asRecord(raw.entity).id);
  if (supplierId > 0 && !looksLikeItalianVat(entityVat)) {
    try {
      const res = await ficGet<{ data?: unknown }>(
        `/entities/suppliers/${supplierId}`,
        { fieldset: "detailed" }
      );
      const supplier = asRecord(
        (res as { data?: unknown }).data ?? (res as unknown)
      );
      if (Object.keys(supplier).length > 0) {
        raw = {
          ...raw,
          entity: { ...asRecord(raw.entity), ...supplier },
        };
        entityVat =
          pickItalianVat(
            supplier.vat_number,
            supplier.tax_code,
            supplier.vat,
            entityVat
          ) || entityVat;
        entityName = asText(supplier.name) || entityName;
      }
    } catch (e) {
      console.error(
        "[fic] enrich supplier failed",
        supplierId,
        e instanceof Error ? e.message : e
      );
    }
  }

  // 3) XML SDI: solo se manca P.IVA italiana o non c'è già XML in raw
  let xml = findXmlBlobInReceivedRaw(raw);
  const needXml = !xml && (!looksLikeItalianVat(entityVat) || !hasItems);
  if (needXml) {
    try {
      const fetched = await fetchFicDocumentXml({
        kind: "received",
        ficId: doc.ficId,
      });
      xml = fetched.xml;
    } catch (e) {
      console.error(
        "[fic] enrich xml failed",
        doc.ficId,
        e instanceof Error ? e.message : e
      );
      xml = null;
    }
  }
  if (xml) {
    raw = { ...raw, ei_raw: xml };
    const ced = parseCedenteAnagraficaFromFatturaPaXml(xml);
    const cedVat = pickItalianVat(ced.vat, ced.taxCode);
    if (cedVat) entityVat = cedVat;
    if (ced.name) entityName = ced.name;
    raw = mergeCedenteIntoRaw(raw, ced, entityName, entityVat);
  }

  if (!looksLikeItalianVat(entityVat)) {
    entityVat =
      pickItalianVat(extractSupplierVatFromReceivedRaw(raw), deepFindItalianVat(raw)) ||
      entityVat;
  }

  return {
    ...doc,
    entityName: entityName || doc.entityName,
    entityVat: entityVat || doc.entityVat,
    raw,
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

function documentAttachmentCandidates(
  data: Record<string, unknown>
): string[] {
  const raw = [
    data.url,
    data.attachment_url,
    data.attachmentUrl,
    data.attachment_preview_url,
    data.attachmentPreviewUrl,
    data.ai_url,
    data.aiUrl,
  ];
  const out: string[] = [];
  for (const c of raw) {
    const url = asText(c);
    if (!url) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      out.push(url);
      continue;
    }
    if (url.startsWith("/")) {
      out.push(`https://api-v2.fattureincloud.it${url}`);
    }
  }
  return out;
}

function absoluteUrlLooksLikeXml(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return /\.(xml|p7m)(\.|$)/i.test(path) || /\.xml$/i.test(path);
}

/**
 * Scarica testo allegato. Gli URL S3 pre-firmati NON devono avere
 * Authorization Bearer (rompe la firma AWS).
 */
async function fetchRemoteAttachmentText(
  absoluteUrl: string
): Promise<{ ok: boolean; text: string }> {
  const isFicApi =
    absoluteUrl.includes("api-v2.fattureincloud.it") ||
    absoluteUrl.includes("api.fattureincloud.it");
  const headers: Record<string, string> = {
    Accept: "application/xml, text/xml, application/json, */*",
  };
  if (isFicApi) {
    const { token } = getFicConfig();
    headers.Authorization = `Bearer ${token}`;
  }
  const fileRes = await fetch(absoluteUrl, {
    headers,
    cache: "no-store",
  });
  const text = await fileRes.text().catch(() => "");
  return { ok: fileRes.ok, text };
}

/**
 * URL temporaneo file originale documento FiC (PDF, XML SDI, ecc.) da aprire in nuova scheda.
 * Emesse: campo `url`; ricevute: `attachment_url` / preview (spesso XML su S3).
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
  const candidates = documentAttachmentCandidates(asRecord(res.data));
  if (candidates[0]) return candidates[0];

  throw new Error(
    "Fatture in Cloud non ha restituito un link al file originale per questo documento (allegato assente o non disponibile)."
  );
}

/** Alias semantico: file originale FiC (XML/PDF/altro), non solo PDF. */
export async function fetchFicDocumentOriginalUrl(input: {
  kind: FicInvoiceKind;
  ficId: number;
}): Promise<string> {
  return fetchFicDocumentPdfUrl(input);
}

/**
 * True se FiC espone l’XML di trasmissione SDI (e-fattura) per un documento emesso.
 */
export async function hasFicIssuedEInvoiceXml(ficId: number): Promise<boolean> {
  const id = Number(ficId);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    const { text } = await ficGetText(
      `/issued_documents/${id}/e_invoice/xml`,
      { include_attachment: 0 }
    );
    return looksLikeXml(text);
  } catch {
    return false;
  }
}

function looksLikeXml(text: string): boolean {
  const t = text.trim().replace(/^\uFEFF/, "");
  return t.startsWith("<?xml") || t.startsWith("<");
}

/** Estrae XML SDI anche da allegati .p7m (PKCS#7 con XML embedded). */
export function extractXmlFromPossiblySigned(text: string): string | null {
  if (!text || !text.trim()) return null;
  if (looksLikeXml(text)) return text.trim();

  const markers = [
    "<?xml",
    "<FatturaElettronica",
    "<p:FatturaElettronica",
    "<ns1:FatturaElettronica",
    "<ns2:FatturaElettronica",
    "<ns3:FatturaElettronica",
  ];
  let idx = -1;
  const lower = text;
  for (const m of markers) {
    const i = lower.indexOf(m);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) {
    const re = /<\s*(?:[\w.-]+:)?FatturaElettronica\b/i;
    const m = re.exec(text);
    if (m?.index != null) idx = m.index;
  }
  if (idx < 0) return null;

  let slice = text.slice(idx);
  // Tag di chiusura tipico
  const closeRe =
    /<\/\s*(?:[\w.-]+:)?FatturaElettronica\s*>/i;
  const close = closeRe.exec(slice);
  if (close && close.index != null) {
    slice = slice.slice(0, close.index + close[0].length);
  }
  return slice.includes("FatturaElettronica") || looksLikeXml(slice)
    ? slice.trim()
    : null;
}

/** P.IVA italiana (11 cifre), ignora CF/codici non validi come P.IVA. */
export function looksLikeItalianVat(value: string): boolean {
  const key = value.replace(/[\s.\-\/]/g, "").toUpperCase().replace(/^IT/, "");
  return /^\d{11}$/.test(key);
}

function pickItalianVat(...candidates: unknown[]): string {
  for (const c of candidates) {
    const t = asText(c);
    if (t && looksLikeItalianVat(t)) return t;
  }
  return "";
}

/** Cerca P.IVA cedente in tutto il JSON FiC (chiavi note). */
function deepFindItalianVat(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") {
    return looksLikeItalianVat(value) ? value : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = deepFindItalianVat(item, depth + 1);
      if (hit) return hit;
    }
    return "";
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const preferKeys = [
      "vat_number",
      "vatNumber",
      "partita_iva",
      "partitaIva",
      "IdCodice",
      "id_codice",
    ];
    for (const k of preferKeys) {
      if (k in rec) {
        const hit = pickItalianVat(rec[k]);
        if (hit) return hit;
      }
    }
    for (const v of Object.values(rec)) {
      const hit = deepFindItalianVat(v, depth + 1);
      if (hit) return hit;
    }
  }
  return "";
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
    if (typeof c !== "string") continue;
    const xml = extractXmlFromPossiblySigned(c);
    if (xml) return xml;
  }
  return null;
}

/**
 * XML fattura elettronica da FiC.
 * - Emesse: GET …/issued_documents/{id}/e_invoice/xml
 * - Ricevute: campi XML nel documento / allegato (URL S3 firmato, senza Bearer)
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
    { fieldset: "detailed" }
  );
  const data = asRecord(
    (res as { data?: unknown }).data ?? (res as unknown)
  );
  const embedded = extractXmlCandidateFromRecord(data);
  if (embedded) {
    return { xml: embedded, filename: `fattura-ricevuta-${ficId}.xml` };
  }

  const candidates = documentAttachmentCandidates(data);
  // Prima URL che sembrano XML/p7m, poi gli altri (contenuto potrebbe essere XML)
  const ordered = [
    ...candidates.filter(absoluteUrlLooksLikeXml),
    ...candidates.filter((u) => !absoluteUrlLooksLikeXml(u)),
  ];

  for (const absolute of ordered) {
    const { ok, text } = await fetchRemoteAttachmentText(absolute);
    if (!ok || !text) continue;
    const xml = extractXmlFromPossiblySigned(text);
    if (xml) {
      const nameFromUrl =
        absolute.split("?")[0]?.split("/").pop() ||
        `fattura-ricevuta-${ficId}.xml`;
      return {
        xml,
        filename: nameFromUrl.includes(".")
          ? nameFromUrl
          : `fattura-ricevuta-${ficId}.xml`,
      };
    }
  }

  throw new Error(
    "File XML/SDI non disponibile per questa fattura ricevuta su Fatture in Cloud (né nel documento né come allegato scaricabile)."
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

export type FicPaymentAccount = {
  id: number;
  name: string;
  type: string;
  iban: string;
};

/** Conti di pagamento FiC (es. BCC Don Rizzo / TS Pay). */
export async function fetchFicPaymentAccounts(): Promise<FicPaymentAccount[]> {
  const res = await ficGet<{ data?: unknown[] }>("/info/payment_accounts", {});
  const out: FicPaymentAccount[] = [];
  for (const item of res.data ?? []) {
    const r = asRecord(item);
    const id = asNumber(r.id);
    if (!id) continue;
    out.push({
      id,
      name: asText(r.name) || `Conto ${id}`,
      type: asText(r.type),
      iban: asText(r.iban) || asText(r.bank_iban),
    });
  }
  return out;
}

export type FicCashbookEntry = {
  ficId: string;
  date: string | null;
  amount: number;
  description: string;
  entityName: string;
  kind: string;
  documentId: number | null;
  paymentAccountName: string;
  raw: Record<string, unknown>;
};

/**
 * Primanota / movimenti cassa-banca FiC (TS Pay → conto BCC).
 * date_from / date_to obbligatori (YYYY-MM-DD).
 */
export async function fetchFicCashbook(input: {
  dateFrom: string;
  dateTo: string;
  paymentAccountId?: number;
  type?: "all" | "in" | "out";
}): Promise<FicCashbookEntry[]> {
  const query: Record<string, string | number | undefined> = {
    date_from: input.dateFrom,
    date_to: input.dateTo,
    type: input.type ?? "all",
  };
  if (input.paymentAccountId) {
    query.payment_account_id = input.paymentAccountId;
  }
  const res = await ficGet<{ data?: unknown[] }>("/cashbook", query);
  const out: FicCashbookEntry[] = [];
  for (const item of res.data ?? []) {
    const r = asRecord(item);
    const amountIn = asNumber(r.amount_in);
    const amountOut = asNumber(r.amount_out);
    const amount =
      amountIn > 0 ? amountIn : amountOut > 0 ? -amountOut : asNumber(r.amount);
    const payIn = asRecord(r.payment_account_in);
    const payOut = asRecord(r.payment_account_out);
    const accountName =
      asText(payIn.name) ||
      asText(payOut.name) ||
      (amount >= 0 ? "Entrata" : "Uscita");
    const doc = asRecord(r.document);
    const ficId =
      asText(r.id) ||
      `${asDateOnly(r.date) ?? "x"}-${amount}-${asText(r.description).slice(0, 40)}`;
    out.push({
      ficId: String(ficId),
      date: asDateOnly(r.date),
      amount,
      description: asText(r.description),
      entityName: asText(r.entity_name),
      kind: asText(r.kind),
      documentId: asNumber(doc.id) || asNumber(r.document_id) || null,
      paymentAccountName: accountName,
      raw: r,
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
