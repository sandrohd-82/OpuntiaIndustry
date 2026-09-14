/**
 * Client Dipendenti in Cloud (TeamSystem).
 * Auth: DIPENDENTI_IN_CLOUD_API_KEY (Bearer) + DIPENDENTI_IN_CLOUD_COMPANY_ID.
 * Base URL opzionale: DIPENDENTI_IN_CLOUD_API_BASE.
 */

function readServerEnv(name: string): string {
  const direct = process.env[name];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
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

const DEFAULT_API_BASE = "https://api.dipendentincloud.it";

export function peekDicEnv(): {
  hasKey: boolean;
  hasCompanyId: boolean;
  keyLength: number;
  companyIdPreview: string;
  apiBase: string;
} {
  const key = readServerEnv("DIPENDENTI_IN_CLOUD_API_KEY");
  const company = readServerEnv("DIPENDENTI_IN_CLOUD_COMPANY_ID");
  const apiBase =
    readServerEnv("DIPENDENTI_IN_CLOUD_API_BASE") || DEFAULT_API_BASE;
  return {
    hasKey: key.length > 0,
    hasCompanyId: company.length > 0,
    keyLength: key.length,
    companyIdPreview: company || "(vuoto)",
    apiBase,
  };
}

export function getDicConfig(): {
  apiKey: string;
  companyId: string;
  apiBase: string;
} {
  const apiKey = readServerEnv("DIPENDENTI_IN_CLOUD_API_KEY");
  const companyId = readServerEnv("DIPENDENTI_IN_CLOUD_COMPANY_ID");
  const apiBase =
    readServerEnv("DIPENDENTI_IN_CLOUD_API_BASE") || DEFAULT_API_BASE;
  if (!apiKey) {
    throw new Error(
      "Manca DIPENDENTI_IN_CLOUD_API_KEY. Incollala in .env.local e su Vercel (Production), poi Redeploy."
    );
  }
  if (!companyId) {
    throw new Error(
      "Manca DIPENDENTI_IN_CLOUD_COMPANY_ID. Incollalo in .env.local e su Vercel (Production), poi Redeploy."
    );
  }
  return { apiKey, companyId, apiBase: apiBase.replace(/\/$/, "") };
}

export type DicEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fiscalCode: string;
  raw: Record<string, unknown>;
};

export type DicAttendance = {
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fiscalCode: string;
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
  const nested = asRecord(row.employee) ?? asRecord(row.user) ?? asRecord(row.anagrafica);
  if (nested) {
    for (const key of keys) {
      const v = nested[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function asMinutes(row: Record<string, unknown>): number | null {
  for (const key of [
    "minuti_lavorati",
    "worked_minutes",
    "minutes",
    "total_minutes",
    "duration_minutes",
    "minuti",
  ]) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Math.max(0, Math.round(Number(v)));
    }
  }
  return null;
}

function asDateTime(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const parsed = parseFlexibleDateTime(row[key]);
    if (parsed) return parsed;
  }
  const nested =
    asRecord(row.clock) ??
    asRecord(row.timbratura) ??
    asRecord(row.timesheet);
  if (nested) {
    for (const key of keys) {
      const parsed = parseFlexibleDateTime(nested[key]);
      if (parsed) return parsed;
    }
  }
  return null;
}

export function parseFlexibleDateTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  const d = new Date(raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function combineDateAndTime(day: string, time: unknown): string | null {
  if (typeof time !== "string") return parseFlexibleDateTime(time);
  const t = time.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
    const [hh, mm, ss] = t.split(":");
    const iso = `${day}T${hh.padStart(2, "0")}:${mm}:${ss ?? "00"}`;
    return parseFlexibleDateTime(iso);
  }
  return parseFlexibleDateTime(t);
}

function pickList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((r): r is Record<string, unknown> => Boolean(r));
  }
  const root = asRecord(payload);
  if (!root) return [];
  const data = asRecord(root.data);
  const candidates = [
    root.data,
    root.items,
    root.results,
    root.attendances,
    root.timbrature,
    root.employees,
    root.dipendenti,
    root.value,
    data?.items,
    data?.data,
    data?.attendances,
    data?.employees,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map(asRecord).filter((r): r is Record<string, unknown> => Boolean(r));
    }
  }
  return [];
}

function mapEmployee(row: Record<string, unknown>): DicEmployee {
  const firstName = asText(row, ["first_name", "firstName", "nome", "name"]);
  const lastName = asText(row, ["last_name", "lastName", "cognome", "surname"]);
  const fullName =
    asText(row, ["full_name", "fullName", "nome_completo", "display_name"]) ||
    `${firstName} ${lastName}`.trim();
  return {
    id: asText(row, ["id", "employee_id", "employeeId", "uuid", "user_id"]),
    firstName,
    lastName,
    fullName,
    fiscalCode: asText(row, [
      "fiscal_code",
      "fiscalCode",
      "codice_fiscale",
      "codiceFiscale",
      "tax_code",
      "cf",
    ]).toUpperCase().replace(/\s+/g, ""),
    raw: row,
  };
}

function mapAttendance(
  row: Record<string, unknown>,
  day: string,
  employees: Map<string, DicEmployee>
): DicAttendance {
  const employeeId = asText(row, [
    "employee_id",
    "employeeId",
    "dipendente_id",
    "user_id",
    "id_dipendente",
  ]);
  const emp = employees.get(employeeId);
  const firstName =
    asText(row, ["first_name", "firstName", "nome"]) || emp?.firstName || "";
  const lastName =
    asText(row, ["last_name", "lastName", "cognome"]) || emp?.lastName || "";
  const fullName =
    asText(row, ["full_name", "fullName", "nome_completo", "employee_name"]) ||
    emp?.fullName ||
    `${firstName} ${lastName}`.trim();
  const fiscalCode = (
    asText(row, [
      "fiscal_code",
      "fiscalCode",
      "codice_fiscale",
      "codiceFiscale",
      "tax_code",
      "cf",
    ]) ||
    emp?.fiscalCode ||
    ""
  )
    .toUpperCase()
    .replace(/\s+/g, "");

  const clockIn =
    asDateTime(row, [
      "clock_in",
      "clockIn",
      "ingresso",
      "ingresso_at",
      "entry",
      "start",
      "start_at",
      "ora_ingresso",
      "check_in",
    ]) ||
    combineDateAndTime(
      day,
      row.ingresso_ora ?? row.entry_time ?? row.start_time ?? row.ora_ingresso
    );
  const clockOut =
    asDateTime(row, [
      "clock_out",
      "clockOut",
      "uscita",
      "uscita_at",
      "exit",
      "end",
      "end_at",
      "ora_uscita",
      "check_out",
    ]) ||
    combineDateAndTime(
      day,
      row.uscita_ora ?? row.exit_time ?? row.end_time ?? row.ora_uscita
    );

  return {
    employeeId: employeeId || emp?.id || fiscalCode,
    firstName,
    lastName,
    fullName,
    fiscalCode,
    clockIn,
    clockOut,
    minutes: asMinutes(row),
    raw: row,
  };
}

async function dicGet(
  path: string,
  query: Record<string, string>
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; path: string }> {
  const { apiKey, companyId, apiBase } = getDicConfig();
  const url = new URL(path.startsWith("http") ? path : `${apiBase}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Company-Id": companyId,
      "Company-Id": companyId,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, status: res.status, path: url.pathname };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: true, json };
}

const ATTENDANCE_PATHS = (companyId: string) => [
  `/v1/companies/${companyId}/attendances`,
  `/companies/${companyId}/attendances`,
  `/c/${companyId}/attendances`,
  `/v1/c/${companyId}/attendances`,
  `/api/v1/companies/${companyId}/attendances`,
  `/v1/attendances`,
  `/attendances`,
];

const EMPLOYEE_PATHS = (companyId: string) => [
  `/v1/companies/${companyId}/employees`,
  `/companies/${companyId}/employees`,
  `/c/${companyId}/employees`,
  `/v1/c/${companyId}/employees`,
  `/api/v1/companies/${companyId}/employees`,
  `/v1/employees`,
  `/employees`,
];

async function firstOk(
  paths: string[],
  query: Record<string, string>
): Promise<{ json: unknown; path: string }> {
  const errors: string[] = [];
  for (const path of paths) {
    const res = await dicGet(path, query);
    if (res.ok) return { json: res.json, path };
    errors.push(`${path} → HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Dipendenti in Cloud ha rifiutato la chiave API (${res.status}). Controlla DIPENDENTI_IN_CLOUD_API_KEY e i permessi dell’integrazione.`
      );
    }
  }
  throw new Error(
    `Nessun endpoint timbrature Dipendenti in Cloud ha risposto (200). Tentativi: ${errors.join("; ")}. Se TeamSystem ti ha dato un URL diverso, imposta DIPENDENTI_IN_CLOUD_API_BASE.`
  );
}

export async function fetchDicEmployees(): Promise<DicEmployee[]> {
  const { companyId } = getDicConfig();
  try {
    const { json } = await firstOk(EMPLOYEE_PATHS(companyId), {
      company_id: companyId,
    });
    return pickList(json).map(mapEmployee).filter((e) => e.id || e.fiscalCode);
  } catch {
    return [];
  }
}

export async function fetchDicAttendances(day: string): Promise<DicAttendance[]> {
  const { companyId } = getDicConfig();
  const employees = new Map<string, DicEmployee>();
  for (const emp of await fetchDicEmployees()) {
    if (emp.id) employees.set(emp.id, emp);
  }
  const { json } = await firstOk(ATTENDANCE_PATHS(companyId), {
    date: day,
    from: day,
    to: day,
    start_date: day,
    end_date: day,
    date_from: day,
    date_to: day,
    company_id: companyId,
  });
  return pickList(json).map((row) => mapAttendance(row, day, employees));
}
