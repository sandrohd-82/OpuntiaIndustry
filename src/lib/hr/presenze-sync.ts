import { todayRomeDate } from "@/lib/auth/data-scope";
import {
  fetchDicAttendances,
  fetchDicEmployees,
  peekDicEnv,
} from "@/lib/hr/dipendenti-in-cloud";
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
  persona_id: string | null;
  ingresso_at: string | null;
  uscita_at: string | null;
  minuti_lavorati: number;
  stato: PresenzaGiorno["stato"];
  last_synced_at: string;
};

const SELECT_COLS =
  "id, giorno, match_key, dipendente_esterno_id, nome, cognome, nome_completo, codice_fiscale, persona_id, ingresso_at, uscita_at, minuti_lavorati, stato, last_synced_at";

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
    personaId: row.persona_id,
    ingressoAt: row.ingresso_at,
    uscitaAt: row.uscita_at,
    minutiLavorati: row.minuti_lavorati ?? 0,
    stato: row.stato,
    lastSyncedAt: row.last_synced_at,
  };
}

async function loadPersonaByCf(
  service: ReturnType<typeof createServiceClient>,
  fiscalCodes: string[]
): Promise<Map<string, string>> {
  const cfs = [...new Set(fiscalCodes.map((c) => c.toUpperCase()).filter(Boolean))];
  const map = new Map<string, string>();
  if (cfs.length === 0) return map;
  const { data } = await service
    .from("organigramma_persone")
    .select("id, codice_fiscale")
    .is("deleted_at", null)
    .in("codice_fiscale", cfs);
  for (const row of data ?? []) {
    const cf = String((row as { codice_fiscale?: string }).codice_fiscale ?? "")
      .toUpperCase()
      .replace(/\s+/g, "");
    const id = String((row as { id?: string }).id ?? "");
    if (cf && id) map.set(cf, id);
  }
  return map;
}

export async function syncPresenzeGiorno(opts: {
  giorno?: string;
  actorId?: string | null;
}): Promise<
  | { success: true; giorno: string; fetched: number; upserted: number }
  | { success: false; error: string }
> {
  const env = peekDicEnv();
  if (!env.hasKey || !env.hasCompanyId) {
    return {
      success: false,
      error:
        "Configura DIPENDENTI_IN_CLOUD_API_KEY e DIPENDENTI_IN_CLOUD_COMPANY_ID sul server.",
    };
  }
  const giorno = opts.giorno || todayRomeDate();
  let attendances;
  try {
    attendances = await fetchDicAttendances(giorno);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync Dipendenti in Cloud fallita.",
    };
  }

  const byKey = new Map<
    string,
    {
      dipendenteEsternoId: string;
      nome: string;
      cognome: string;
      nomeCompleto: string;
      codiceFiscale: string;
      ingressoAt: string | null;
      uscitaAt: string | null;
      minuti: number | null;
      raw: Record<string, unknown>;
    }
  >();

  for (const row of attendances) {
    const codiceFiscale = row.fiscalCode.toUpperCase().replace(/\s+/g, "");
    if (!codiceFiscale && !row.employeeId) continue;
    const key = presenzaMatchKey({
      codiceFiscale,
      dipendenteEsternoId: row.employeeId,
    });
    const prev = byKey.get(key);
    const ingressoAt =
      !prev?.ingressoAt ||
      (row.clockIn && row.clockIn < prev.ingressoAt)
        ? row.clockIn
        : prev.ingressoAt;
    const uscitaAt =
      !prev?.uscitaAt || (row.clockOut && row.clockOut > prev.uscitaAt)
        ? row.clockOut
        : prev.uscitaAt;
    byKey.set(key, {
      dipendenteEsternoId: row.employeeId || prev?.dipendenteEsternoId || "",
      nome: row.firstName || prev?.nome || "",
      cognome: row.lastName || prev?.cognome || "",
      nomeCompleto: row.fullName || prev?.nomeCompleto || "",
      codiceFiscale,
      ingressoAt,
      uscitaAt,
      minuti: row.minutes ?? prev?.minuti ?? null,
      raw: row.raw,
    });
  }

  try {
    const employees = await fetchDicEmployees();
    for (const emp of employees) {
      const codiceFiscale = emp.fiscalCode.toUpperCase().replace(/\s+/g, "");
      if (!codiceFiscale && !emp.id) continue;
      const key = presenzaMatchKey({
        codiceFiscale,
        dipendenteEsternoId: emp.id,
      });
      if (byKey.has(key)) continue;
      byKey.set(key, {
        dipendenteEsternoId: emp.id,
        nome: emp.firstName,
        cognome: emp.lastName,
        nomeCompleto: emp.fullName,
        codiceFiscale,
        ingressoAt: null,
        uscitaAt: null,
        minuti: null,
        raw: emp.raw,
      });
    }
  } catch {
    /* elenco dipendenti opzionale */
  }

  const service = createServiceClient();
  const personaByCf = await loadPersonaByCf(
    service,
    [...byKey.values()].map((r) => r.codiceFiscale)
  );

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
      persona_id: row.codiceFiscale
        ? personaByCf.get(row.codiceFiscale) ?? null
        : null,
      ingresso_at: row.ingressoAt,
      uscita_at: row.uscitaAt,
      minuti_lavorati: minuti,
      stato,
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
    summary: `Sync presenze ${giorno}: ${upserted} schede`,
    payload: { giorno, fetched: attendances.length, upserted },
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
