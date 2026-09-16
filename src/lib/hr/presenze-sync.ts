import { todayRomeDate } from "@/lib/auth/data-scope";
import {
  fetchFluidaAttendances,
  fetchFluidaContracts,
  peekFluidaEnv,
  pushFluidaMatricola,
  type FluidaAttendance,
  type FluidaContract,
} from "@/lib/hr/fluida";
import { isValidMatricola, normalizeMatricola } from "@/lib/hr/matricola";
import {
  computeMinuti,
  computeStato,
  presenzaMatchKey,
  type PresenzaGiorno,
} from "@/lib/hr/presenze";
import { createServiceClient } from "@/lib/supabase/server";

type PresenzaRow = {
  id: string;
  giorno: string;
  match_key: string;
  dipendente_esterno_id: string | null;
  nome: string;
  cognome: string;
  nome_completo: string;
  codice_fiscale: string;
  matricola?: string | null;
  persona_id: string | null;
  ingresso_at: string | null;
  uscita_at: string | null;
  minuti_lavorati: number;
  stato: PresenzaGiorno["stato"];
  last_synced_at: string;
};

const SELECT_COLS =
  "id, giorno, match_key, dipendente_esterno_id, nome, cognome, nome_completo, codice_fiscale, matricola, persona_id, ingresso_at, uscita_at, minuti_lavorati, stato, last_synced_at";

type PersonaLink = {
  id: string;
  codice_fiscale: string;
  matricola: string;
  fluida_user_id: string | null;
  fluida_contract_id: string | null;
  user_id: string | null;
};

export function mapPresenzaRow(row: PresenzaRow): PresenzaGiorno {
  return {
    id: row.id,
    giorno: String(row.giorno).slice(0, 10),
    matchKey: row.match_key,
    dipendenteEsternoId: row.dipendente_esterno_id ?? "",
    nome: row.nome ?? "",
    cognome: row.cognome ?? "",
    nomeCompleto: row.nome_completo || `${row.nome} ${row.cognome}`.trim(),
    codiceFiscale: row.codice_fiscale ?? "",
    matricola: row.matricola ?? "",
    personaId: row.persona_id,
    ingressoAt: row.ingresso_at,
    uscitaAt: row.uscita_at,
    minutiLavorati: row.minuti_lavorati ?? 0,
    stato: row.stato,
    lastSyncedAt: row.last_synced_at,
  };
}

function normCf(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

async function loadPersone(
  service: ReturnType<typeof createServiceClient>
): Promise<PersonaLink[]> {
  const { data } = await service
    .from("organigramma_persone")
    .select("id, codice_fiscale, matricola, fluida_user_id, fluida_contract_id, user_id")
    .is("deleted_at", null);
  return ((data ?? []) as PersonaLink[]).map((p) => ({
    ...p,
    codice_fiscale: normCf(p.codice_fiscale ?? ""),
    matricola: normalizeMatricola(p.matricola),
    fluida_user_id: p.fluida_user_id || null,
    fluida_contract_id: p.fluida_contract_id || null,
    user_id: p.user_id || null,
  }));
}

async function loadEmailsByUserId(
  service: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await service.from("profiles").select("id, email").in("id", ids);
  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "");
    const email = String((row as { email?: string }).email ?? "")
      .trim()
      .toLowerCase();
    if (id && email) map.set(id, email);
  }
  return map;
}

function matchPersona(
  persone: PersonaLink[],
  emails: Map<string, string>,
  row: {
    contractId: string;
    userId: string;
    badgeId: string;
    fiscalCode: string;
    email: string;
    matricolaHint?: string;
  }
): PersonaLink | null {
  const cf = normCf(row.fiscalCode);
  const badge = normalizeMatricola(row.badgeId);
  const hint = normalizeMatricola(row.matricolaHint ?? "");
  const email = row.email.trim().toLowerCase();

  if (row.contractId) {
    const byContract = persone.find((p) => p.fluida_contract_id === row.contractId);
    if (byContract) return byContract;
  }
  if (row.userId) {
    const byUser = persone.find((p) => p.fluida_user_id === row.userId);
    if (byUser) return byUser;
  }
  for (const code of [hint, badge]) {
    if (isValidMatricola(code)) {
      const byMat = persone.find((p) => p.matricola === code);
      if (byMat) return byMat;
    }
  }
  if (cf) {
    const byCf = persone.find((p) => p.codice_fiscale === cf);
    if (byCf) return byCf;
  }
  if (email) {
    const byMail = persone.find((p) => p.user_id && emails.get(p.user_id) === email);
    if (byMail) return byMail;
  }
  return null;
}

export async function linkFluidaOperatori(opts: {
  actorId?: string | null;
  pushBadges?: boolean;
}): Promise<
  | { success: true; matched: number; pushed: number }
  | { success: false; error: string }
> {
  const env = peekFluidaEnv();
  if (!env.hasKey || !env.hasCompanyId) {
    return {
      success: false,
      error: "Configura FLUIDA_API_KEY e FLUIDA_COMPANY_ID sul server.",
    };
  }
  let contracts: FluidaContract[];
  try {
    contracts = await fetchFluidaContracts();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Collegamento Fluida fallito.",
    };
  }

  const service = createServiceClient();
  const persone = await loadPersone(service);
  const emails = await loadEmailsByUserId(
    service,
    persone.map((p) => p.user_id ?? "")
  );
  const now = new Date().toISOString();
  let matched = 0;
  let pushed = 0;

  for (const contract of contracts) {
    const persona = matchPersona(persone, emails, {
      contractId: contract.id,
      userId: contract.userId,
      badgeId: contract.badgeId || contract.registerId || contract.refCode,
      fiscalCode: contract.fiscalCode,
      email: contract.email,
      matricolaHint: contract.registerId || contract.refCode,
    });
    if (!persona) continue;
    matched += 1;
    const patch: Record<string, unknown> = {
      updated_by: opts.actorId ?? null,
      updated_at: now,
    };
    if (persona.fluida_contract_id !== contract.id) {
      patch.fluida_contract_id = contract.id;
    }
    if (contract.userId && persona.fluida_user_id !== contract.userId) {
      patch.fluida_user_id = contract.userId;
    }
    if (Object.keys(patch).length > 2) {
      const { error } = await service
        .from("organigramma_persone")
        .update(patch)
        .eq("id", persona.id)
        .is("deleted_at", null);
      if (error) return { success: false, error: error.message };
      persona.fluida_contract_id = contract.id;
      persona.fluida_user_id = contract.userId || persona.fluida_user_id;
    }
    if (opts.pushBadges && persona.matricola) {
      try {
        await pushFluidaMatricola(contract.id, persona.matricola);
        pushed += 1;
      } catch (err) {
        console.error("[fluida] push matricola", persona.matricola, err);
      }
    }
  }

  await service.from("audit_log").insert({
    entity_type: "organigramma_persone",
    entity_id: opts.actorId ?? persone[0]?.id ?? crypto.randomUUID(),
    action: "update",
    actor_id: opts.actorId ?? null,
    summary: `Collegamento Fluida: ${matched} operatori, ${pushed} matricole inviate`,
    payload: { matched, pushed, provider: "fluida" },
  });

  return { success: true, matched, pushed };
}

export async function syncPresenzeGiorno(opts: {
  giorno?: string;
  actorId?: string | null;
}): Promise<
  | { success: true; giorno: string; fetched: number; upserted: number }
  | { success: false; error: string }
> {
  const env = peekFluidaEnv();
  if (!env.hasKey || !env.hasCompanyId) {
    return {
      success: false,
      error: "Configura FLUIDA_API_KEY e FLUIDA_COMPANY_ID sul server.",
    };
  }
  const giorno = opts.giorno || todayRomeDate();
  let attendances: FluidaAttendance[];
  let contracts: FluidaContract[];
  try {
    const fetched = await fetchFluidaAttendances(giorno);
    attendances = fetched.attendances;
    contracts = fetched.contracts;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync Fluida fallita.",
    };
  }

  const service = createServiceClient();
  const persone = await loadPersone(service);
  const emails = await loadEmailsByUserId(
    service,
    persone.map((p) => p.user_id ?? "")
  );

  type PresenzaAccum = {
    dipendenteEsternoId: string;
    nome: string;
    cognome: string;
    nomeCompleto: string;
    codiceFiscale: string;
    matricola: string;
    personaId: string | null;
    ingressoAt: string | null;
    uscitaAt: string | null;
    minuti: number | null;
    raw: Record<string, unknown>;
  };
  const byKey = new Map<string, PresenzaAccum>();

  for (const row of attendances) {
    const persona = matchPersona(persone, emails, {
      contractId: row.contractId,
      userId: row.userId,
      badgeId: row.badgeId,
      fiscalCode: row.fiscalCode,
      email: row.email,
    });
    if (
      persona &&
      row.contractId &&
      (persona.fluida_contract_id !== row.contractId ||
        (row.userId && persona.fluida_user_id !== row.userId))
    ) {
      await service
        .from("organigramma_persone")
        .update({
          fluida_contract_id: row.contractId,
          fluida_user_id: row.userId || persona.fluida_user_id,
          updated_by: opts.actorId ?? null,
        })
        .eq("id", persona.id)
        .is("deleted_at", null);
      persona.fluida_contract_id = row.contractId;
      if (row.userId) persona.fluida_user_id = row.userId;
    }
    const codiceFiscale = normCf(row.fiscalCode || persona?.codice_fiscale || "");
    const matricola = persona?.matricola || normalizeMatricola(row.badgeId);
    if (!codiceFiscale && !row.contractId && !matricola) continue;
    const key = presenzaMatchKey({
      matricola,
      codiceFiscale,
      dipendenteEsternoId: row.contractId || row.userId,
    });
    const prev = byKey.get(key);
    const ingressoAt =
      !prev?.ingressoAt || (row.clockIn && row.clockIn < prev.ingressoAt)
        ? row.clockIn
        : prev.ingressoAt;
    const uscitaAt =
      !prev?.uscitaAt || (row.clockOut && row.clockOut > prev.uscitaAt)
        ? row.clockOut
        : prev.uscitaAt;
    byKey.set(key, {
      dipendenteEsternoId: row.contractId || prev?.dipendenteEsternoId || "",
      nome: row.firstName || prev?.nome || "",
      cognome: row.lastName || prev?.cognome || "",
      nomeCompleto:
        row.fullName ||
        prev?.nomeCompleto ||
        `${row.firstName} ${row.lastName}`.trim(),
      codiceFiscale,
      matricola,
      personaId: persona?.id ?? prev?.personaId ?? null,
      ingressoAt,
      uscitaAt,
      minuti: row.minutes ?? prev?.minuti ?? null,
      raw: row.raw,
    });
  }

  const { data: existing } = await service
    .from("dipendenti_presenze")
    .select("id, match_key")
    .eq("giorno", giorno)
    .is("deleted_at", null);
  const idByKey = new Map<string, string>();
  for (const row of existing ?? []) {
    idByKey.set(
      String((row as { match_key: string }).match_key),
      String((row as { id: string }).id)
    );
  }

  let upserted = 0;
  const now = new Date().toISOString();
  for (const [matchKey, row] of byKey) {
    const minuti = computeMinuti(row.ingressoAt, row.uscitaAt, row.minuti);
    const stato = computeStato({
      ingressoAt: row.ingressoAt,
      uscitaAt: row.uscitaAt,
    });
    const payload = {
      giorno,
      match_key: matchKey,
      dipendente_esterno_id: row.dipendenteEsternoId || null,
      nome: row.nome,
      cognome: row.cognome,
      nome_completo:
        row.nomeCompleto || `${row.nome} ${row.cognome}`.trim() || "Dipendente",
      codice_fiscale: row.codiceFiscale,
      matricola: row.matricola,
      persona_id: row.personaId,
      ingresso_at: row.ingressoAt,
      uscita_at: row.uscitaAt,
      minuti_lavorati: minuti,
      stato,
      fonte: "fluida",
      raw: row.raw,
      last_synced_at: now,
      updated_by: opts.actorId ?? null,
      deleted_at: null,
      deleted_by: null,
    };
    const existingId = idByKey.get(matchKey);
    if (existingId) {
      const { error } = await service
        .from("dipendenti_presenze")
        .update(payload)
        .eq("id", existingId);
      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await service.from("dipendenti_presenze").insert({
        ...payload,
        created_by: opts.actorId ?? null,
      });
      if (error) {
        return { success: false, error: error.message };
      }
    }
    upserted += 1;
  }

  await service.from("audit_log").insert({
    entity_type: "dipendenti_presenze",
    entity_id: giorno,
    action: "presenze_sync",
    actor_id: opts.actorId ?? null,
    summary: `Sync presenze Fluida ${giorno}: ${upserted} schede`,
    payload: {
      giorno,
      fetched: attendances.length,
      upserted,
      contracts: contracts.length,
      provider: "fluida",
    },
  });

  return {
    success: true,
    giorno,
    fetched: attendances.length,
    upserted,
  };
}

export async function listPresenzeGiorno(
  giorno: string
): Promise<
  { success: true; items: PresenzaGiorno[] } | { success: false; error: string }
> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("dipendenti_presenze")
    .select(SELECT_COLS)
    .eq("giorno", giorno)
    .is("deleted_at", null)
    .order("nome_completo", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as PresenzaRow[]).map(mapPresenzaRow),
  };
}
