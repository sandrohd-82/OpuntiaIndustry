/**
 * Client Fluida HR (Zucchetti) — https://developer.fluida.io/
 * Auth: header x-fluida-app-uuid = API key.
 * Company ID da Azienda → Impostazioni → Generali → API.
 */

function cleanEnvValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function readServerEnv(name: string): string {
  const direct = process.env[name];
  if (typeof direct === "string" && cleanEnvValue(direct)) {
    return cleanEnvValue(direct);
  }
  const all = process.env;
  const match = Object.keys(all).find(
    (k) => k.trim().toUpperCase() === name.toUpperCase()
  );
  if (match) {
    const v = all[match];
    if (typeof v === "string" && cleanEnvValue(v)) return cleanEnvValue(v);
  }
  return "";
}

function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return "(vuoto)";
  if (v.length <= 8) return `${v.length} caratteri`;
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

const DEFAULT_API_BASE = "https://api.fluida.io";

export function peekFluidaEnv(): {
  hasKey: boolean;
  hasCompanyId: boolean;
  keyLength: number;
  keyPreview: string;
  companyIdPreview: string;
  apiBase: string;
} {
  const key = readServerEnv("FLUIDA_API_KEY");
  const company = readServerEnv("FLUIDA_COMPANY_ID");
  const apiBase = readServerEnv("FLUIDA_API_BASE") || DEFAULT_API_BASE;
  return {
    hasKey: key.length > 0,
    hasCompanyId: company.length > 0,
    keyLength: key.length,
    keyPreview: maskSecret(key),
    companyIdPreview: maskSecret(company),
    apiBase,
  };
}

export function getFluidaConfig(): {
  apiKey: string;
  companyId: string;
  apiBase: string;
} {
  const apiKey = readServerEnv("FLUIDA_API_KEY");
  const companyId = readServerEnv("FLUIDA_COMPANY_ID");
  const apiBase = readServerEnv("FLUIDA_API_BASE") || DEFAULT_API_BASE;
  if (!apiKey) {
    throw new Error(
      "Manca FLUIDA_API_KEY. Incollala in .env.local e su Vercel (Production), poi Redeploy."
    );
  }
  if (!companyId) {
    throw new Error(
      "Manca FLUIDA_COMPANY_ID. Incollalo in .env.local e su Vercel (Production), poi Redeploy."
    );
  }
  return { apiKey, companyId, apiBase: apiBase.replace(/\/$/, "") };
}

export type FluidaContract = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fiscalCode: string;
  email: string;
  badgeId: string;
  registerId: string;
  refCode: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export type FluidaClockPunch = {
  contractId: string;
  userId: string;
  badgeId: string;
  day: string;
  direction: "IN" | "OUT" | "OTHER";
  clockAt: string | null;
  durationMinutes: number | null;
  raw: Record<string, unknown>;
};

export type FluidaAttendance = {
  contractId: string;
  userId: string;
  badgeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fiscalCode: string;
  email: string;
  clockIn: string | null;
  clockOut: string | null;
  minutes: number | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function asBool(row: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return false;
}

function pickList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => Boolean(r));
  }
  const root = asRecord(payload);
  if (!root) return [];
  const data = root.data;
  if (Array.isArray(data)) {
    return data
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => Boolean(r));
  }
  const nested = asRecord(data);
  for (const c of [nested?.data, nested?.items, root.items, root.results]) {
    if (Array.isArray(c)) {
      return c
        .map(asRecord)
        .filter((r): r is Record<string, unknown> => Boolean(r));
    }
  }
  return [];
}

function fromRomeLocal(local: string): Date | null {
  const withSec = local.length === 16 ? `${local}:00` : local;
  const expected = withSec.replace("T", " ");
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  for (const offset of ["+01:00", "+02:00"] as const) {
    const dt = new Date(`${withSec}${offset}`);
    if (Number.isNaN(dt.getTime())) continue;
    if (fmt.format(dt).replace("T", " ") === expected) return dt;
  }
  const fallback = new Date(`${withSec}+01:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Fluida manda "2021-12-29 15:47:10" in Europe/Rome oppure ISO con Z. */
export function parseFluidaDateTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw) &&
    !/[zZ]$/.test(raw) &&
    !/[+\-]\d{2}:?\d{2}$/.test(raw)
  ) {
    const rome = fromRomeLocal(raw.replace(" ", "T"));
    return rome ? rome.toISOString() : null;
  }
  const d = new Date(raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapContract(row: Record<string, unknown>): FluidaContract {
  const firstName = asText(row, ["firstname", "first_name", "firstName"]);
  const lastName = asText(row, ["lastname", "last_name", "lastName"]);
  return {
    id: asText(row, ["id", "contract_id"]),
    userId: asText(row, ["user_id", "userId"]),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    fiscalCode: asText(row, ["fiscal_code", "fiscalCode"])
      .toUpperCase()
      .replace(/\s+/g, ""),
    email: asText(row, ["user_email", "email", "company_email"]).toLowerCase(),
    badgeId: asText(row, ["badge_id", "badgeId"]),
    registerId: asText(row, ["register_id", "registerId"]),
    refCode: asText(row, ["ref_code", "refCode"]),
    active: row.active === undefined ? true : asBool(row, ["active"]),
    raw: row,
  };
}

async function fluidaRequest(
  method: "GET" | "PUT" | "POST",
  path: string,
  query?: Record<string, string>,
  body?: unknown
): Promise<{ ok: true; json: unknown; status: number } | { ok: false; status: number; path: string; text: string }> {
  const { apiKey, apiBase } = getFluidaConfig();
  const url = new URL(path.startsWith("http") ? path : `${apiBase}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-fluida-app-uuid": apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, path: url.pathname, text: text.slice(0, 400) };
  }
  if (!text.trim()) return { ok: true, json: null, status: res.status };
  try {
    return { ok: true, json: JSON.parse(text) as unknown, status: res.status };
  } catch {
    return { ok: true, json: text, status: res.status };
  }
}

function authError(status: number, detail: string): never {
  const env = peekFluidaEnv();
  const used = `Chiave usata dal server: API Key ${env.keyPreview}, Company ID ${env.companyIdPreview}.`;
  const low = detail.toLowerCase();
  if (low.includes("app not found")) {
    throw new Error(
      `Fluida non riconosce la API Key (app not found). ${used} Apri la chiave in Fluida (Azienda → Impostazioni → Generali → API → clic sul nome) e ricopia il campo API Key.`
    );
  }
  if (low.includes("unauthorized")) {
    throw new Error(
      `Fluida ha riconosciuto la API Key ma ha risposto Unauthorized. ${used} Non è lo scambio delle chiavi. Nella stessa schermata della chiave: 1) ricopia il Company ID (deve coincidere con ${env.companyIdPreview}); 2) sui permessi Custom accendi anche Company = Read o Write (oltre a Contract = Write e Stamping = Read). In test va bene Permessi Completi. Salva, poi riavvia il server o fai Redeploy su Vercel.`
    );
  }
  throw new Error(
    `Fluida ha rifiutato la chiave API (${status}). ${used} Controlla che la chiave sia Abilitata e che Company, Contract e Stamping non siano Disabled.`
  );
}

export async function fetchFluidaContracts(): Promise<FluidaContract[]> {
  const { companyId } = getFluidaConfig();
  const res = await fluidaRequest(
    "GET",
    `/api/v1/contracts/company/${companyId}`,
    { active: "true" }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) authError(res.status, res.text);
    throw new Error(`Fluida contratti: HTTP ${res.status}. ${res.text}`);
  }
  return pickList(res.json)
    .map(mapContract)
    .filter((c) => c.id);
}

export async function fetchFluidaContract(contractId: string): Promise<FluidaContract | null> {
  const res = await fluidaRequest("GET", `/api/v1/contracts/${contractId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) authError(res.status, res.text);
    throw new Error(`Fluida contratto ${contractId}: HTTP ${res.status}.`);
  }
  const root = asRecord(res.json);
  const row = asRecord(root?.data) ?? root;
  return row ? mapContract(row) : null;
}

export async function pushFluidaMatricola(
  contractId: string,
  matricola: string
): Promise<void> {
  const badgeRes = await fluidaRequest(
    "PUT",
    `/api/v1/contracts/${contractId}/badge`,
    undefined,
    { contract: { badge_id: matricola } }
  );
  if (!badgeRes.ok && badgeRes.status !== 202) {
    if (badgeRes.status === 401 || badgeRes.status === 403) {
      authError(badgeRes.status, badgeRes.text);
    }
    throw new Error(
      `Fluida badge ${contractId}: HTTP ${badgeRes.status}. ${badgeRes.text}`
    );
  }

  const current = await fetchFluidaContract(contractId);
  if (!current) return;
  if (
    current.registerId === matricola &&
    current.refCode === matricola &&
    current.badgeId === matricola
  ) {
    return;
  }
  const merged: Record<string, unknown> = {
    ...current.raw,
    register_id: matricola,
    ref_code: matricola,
    badge_id: matricola,
  };
  for (const key of [
    "company_info",
    "features",
    "firstname",
    "lastname",
    "user_email",
    "user_id",
    "id",
    "company_id",
  ]) {
    delete merged[key];
  }
  const put = await fluidaRequest(
    "PUT",
    `/api/v1/contracts/${contractId}`,
    undefined,
    { contract: merged }
  );
  if (!put.ok && put.status !== 202) {
    console.error("[fluida] update register_id", put.status, put.text);
  }
}

function flattenClockRecords(payload: unknown): FluidaClockPunch[] {
  const out: FluidaClockPunch[] = [];
  const groups = pickList(payload);
  for (const group of groups) {
    const contractId = asText(group, ["contract_id", "contractId"]);
    const userId = asText(group, ["user_id", "userId"]);
    const days = Array.isArray(group.days) ? group.days : [];
    for (const dayRaw of days) {
      const dayObj = asRecord(dayRaw);
      if (!dayObj) continue;
      const day = asText(dayObj, ["day"]).slice(0, 10);
      const duration =
        typeof dayObj.duration === "number" && Number.isFinite(dayObj.duration)
          ? Math.round(dayObj.duration)
          : null;
      const punches = Array.isArray(dayObj.clock_records)
        ? dayObj.clock_records
        : [];
      for (const punchRaw of punches) {
        const punch = asRecord(punchRaw);
        if (!punch) continue;
        const dirRaw = asText(punch, ["direction"]).toUpperCase();
        const direction: FluidaClockPunch["direction"] =
          dirRaw === "IN" || dirRaw === "OUT" ? dirRaw : "OTHER";
        out.push({
          contractId: asText(punch, ["contract_id"]) || contractId,
          userId: asText(punch, ["user_id"]) || userId,
          badgeId: asText(punch, ["badge_id", "badgeId"]),
          day: asText(punch, ["day"]).slice(0, 10) || day,
          direction,
          clockAt:
            parseFluidaDateTime(punch.clock_at) ||
            parseFluidaDateTime(punch.server_clock_at),
          durationMinutes: duration,
          raw: punch,
        });
      }
    }
  }
  return out;
}

export async function fetchFluidaDailyClockRecords(
  giorno: string
): Promise<FluidaClockPunch[]> {
  const { companyId } = getFluidaConfig();
  const res = await fluidaRequest(
    "GET",
    `/api/v1/stampings/${companyId}/daily_clock_records`,
    { start_date: giorno, end_date: giorno }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) authError(res.status, res.text);
    throw new Error(
      `Fluida timbrature: HTTP ${res.status}. ${res.text || "Controlla il permesso read:stamping."}`
    );
  }
  return flattenClockRecords(res.json).filter((p) => !p.day || p.day === giorno);
}

export function buildFluidaAttendances(
  punches: FluidaClockPunch[],
  contracts: FluidaContract[]
): FluidaAttendance[] {
  const byContract = new Map(contracts.map((c) => [c.id, c]));
  const grouped = new Map<string, FluidaClockPunch[]>();
  for (const punch of punches) {
    const key = punch.contractId || punch.userId || punch.badgeId;
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(punch);
    grouped.set(key, list);
  }

  const rows: FluidaAttendance[] = [];
  for (const [key, list] of grouped) {
    const first = list[0]!;
    const contract = byContract.get(first.contractId);
    const ins = list
      .filter((p) => p.direction === "IN" && p.clockAt)
      .map((p) => p.clockAt!)
      .sort();
    const outs = list
      .filter((p) => p.direction === "OUT" && p.clockAt)
      .map((p) => p.clockAt!)
      .sort();
    const duration = list.find((p) => p.durationMinutes != null)?.durationMinutes ?? null;
    rows.push({
      contractId: first.contractId || key,
      userId: first.userId || contract?.userId || "",
      badgeId: first.badgeId || contract?.badgeId || "",
      firstName: contract?.firstName ?? "",
      lastName: contract?.lastName ?? "",
      fullName: contract?.fullName || `${contract?.firstName ?? ""} ${contract?.lastName ?? ""}`.trim(),
      fiscalCode: contract?.fiscalCode ?? "",
      email: contract?.email ?? "",
      clockIn: ins[0] ?? null,
      clockOut: outs[outs.length - 1] ?? null,
      minutes: duration,
      raw: { punches: list.map((p) => p.raw), contract: contract?.raw ?? null },
    });
  }
  return rows;
}

export async function fetchFluidaAttendances(giorno: string): Promise<{
  attendances: FluidaAttendance[];
  contracts: FluidaContract[];
}> {
  let contracts: FluidaContract[] = [];
  try {
    contracts = await fetchFluidaContracts();
  } catch (err) {
    console.error("[fluida] contratti", err);
  }
  const punches = await fetchFluidaDailyClockRecords(giorno);
  const fromPunches = buildFluidaAttendances(punches, contracts);
  const seen = new Set(fromPunches.map((r) => r.contractId || r.userId));
  const extras: FluidaAttendance[] = [];
  for (const c of contracts) {
    if (!c.active) continue;
    if (seen.has(c.id) || (c.userId && seen.has(c.userId))) continue;
    extras.push({
      contractId: c.id,
      userId: c.userId,
      badgeId: c.badgeId || c.registerId || c.refCode,
      firstName: c.firstName,
      lastName: c.lastName,
      fullName: c.fullName,
      fiscalCode: c.fiscalCode,
      email: c.email,
      clockIn: null,
      clockOut: null,
      minutes: null,
      raw: c.raw,
    });
  }
  return { attendances: [...fromPunches, ...extras], contracts };
}
