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

async function ficGet<T>(
  path: string,
  query: Record<string, string | number | undefined>
): Promise<T> {
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
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Fatture in Cloud ha risposto con errore ${res.status}: ${body.slice(0, 400)}`
    );
  }

  return (await res.json()) as T;
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
