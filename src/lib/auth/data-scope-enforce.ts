import { cache } from "react";
import {
  anagraficaLineageOrFilter,
  loadCommercialLineageUserIds,
} from "@/lib/auth/commerciale-lineage";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  effectiveScopeMode,
  todayRomeDate,
  type DataScopeMap,
  type DataScopeMode,
  type ProfileAuthSettings,
  EMPTY_AUTH_SETTINGS,
} from "@/lib/auth/data-scope";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export type OperatorScopeContext = {
  userId: string;
  skip: boolean;
  settings: ProfileAuthSettings;
  scopes: DataScopeMap;
};

function mapSettingsRow(row: {
  is_commercialista?: boolean | null;
  fiscale_unlocked_at?: string | null;
  rs_unlocked_at?: string | null;
  deleted_at?: string | null;
} | null): ProfileAuthSettings {
  if (!row || row.deleted_at) return { ...EMPTY_AUTH_SETTINGS };
  return {
    isCommercialista: Boolean(row.is_commercialista),
    fiscaleUnlocked: Boolean(row.fiscale_unlocked_at),
    rsUnlocked: Boolean(row.rs_unlocked_at),
  };
}

export const loadProfileAuthBundle = cache(async (profileId: string) => {
  const service = createServiceClient();
  const [settingsRes, scopesRes] = await Promise.all([
    service
      .from("profile_auth_settings")
      .select(
        "is_commercialista, fiscale_unlocked_at, rs_unlocked_at, deleted_at"
      )
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .maybeSingle(),
    service
      .from("profile_data_scopes")
      .select("scope_key, mode")
      .eq("profile_id", profileId)
      .is("deleted_at", null),
  ]);

  const settings = mapSettingsRow(settingsRes.data);
  const scopes: DataScopeMap = {};
  for (const row of scopesRes.data ?? []) {
    const key = String(row.scope_key ?? "").trim();
    const mode = String(row.mode ?? "").trim() as DataScopeMode;
    if (key) scopes[key] = mode;
  }
  return { settings, scopes };
});

export const resolveOperatorScopeContext = cache(
  async (): Promise<OperatorScopeContext | null> => {
    const auth = await getAuthContext();
    if (!auth) return null;
    const skip =
      isSuperadminProfile(auth.profile) && !auth.impersonating;
    const bundle = await loadProfileAuthBundle(auth.userId);
    return {
      userId: auth.userId,
      skip,
      settings: bundle.settings,
      scopes: bundle.scopes,
    };
  }
);

export async function resolveScopeMode(
  scopeKey: string
): Promise<{ skip: boolean; mode: DataScopeMode; userId: string } | null> {
  const ctx = await resolveOperatorScopeContext();
  if (!ctx) return null;
  return {
    skip: ctx.skip,
    userId: ctx.userId,
    mode: effectiveScopeMode(scopeKey, ctx.scopes, ctx.settings),
  };
}

export async function resolveStatsDateFloor(): Promise<string | null> {
  const resolved = await resolveScopeMode("statistiche");
  if (!resolved || resolved.skip) return null;
  return resolved.mode === "da_oggi" ? todayRomeDate() : null;
}

/**
 * Filtro aziende per statistiche.
 * `ids === null` = nessuna restrizione extra (oltre a un eventuale cliente scelto in UI).
 */
export async function resolveStatsClienteIds(
  supabase: UserClient,
  requestedClienteId?: string | null
): Promise<{ empty: boolean; ids: string[] | null }> {
  const resolved = await resolveScopeMode("statistiche_aziende");
  const requested = requestedClienteId?.trim() || null;
  if (!resolved || resolved.skip || resolved.mode !== "aziende_proprie") {
    return { empty: false, ids: requested ? [requested] : null };
  }
  const owned = await loadOwnedAziendaIds(supabase, resolved.userId, "clienti");
  if (owned.length === 0) return { empty: true, ids: [] };
  if (requested) {
    return owned.includes(requested)
      ? { empty: false, ids: [requested] }
      : { empty: true, ids: [] };
  }
  return { empty: false, ids: owned };
}

export type FiscaleDocScope = {
  skip: boolean;
  dateFloor: string | null;
  ownedIds: Set<string> | null;
};

function fiscaleScopeUsesFornitori(scopeKey: string): boolean {
  return (
    scopeKey.includes("ricevut") ||
    scopeKey.endsWith("ddt_ricevuti") ||
    scopeKey.includes("fatture_ricevute")
  );
}

export async function resolveFiscaleDocScope(
  supabase: UserClient,
  scopeKey: string
): Promise<FiscaleDocScope> {
  const resolved = await resolveScopeMode(scopeKey);
  if (!resolved || resolved.skip) {
    return { skip: true, dateFloor: null, ownedIds: null };
  }
  const dateFloor = resolved.mode === "da_oggi" ? todayRomeDate() : null;
  if (resolved.mode !== "aziende_proprie") {
    return { skip: false, dateFloor, ownedIds: null };
  }
  const ids = await loadOwnedAziendaIds(
    supabase,
    resolved.userId,
    fiscaleScopeUsesFornitori(scopeKey) ? "fornitori" : "clienti"
  );
  return { skip: false, dateFloor, ownedIds: new Set(ids) };
}

export function isFiscaleDocAllowed(
  scope: FiscaleDocScope,
  opts: { aziendaId: string | null; date?: string | null }
): boolean {
  if (scope.skip) return true;
  const date = String(opts.date ?? "").slice(0, 10);
  if (scope.dateFloor) {
    if (!date || date < scope.dateFloor) return false;
  }
  if (scope.ownedIds) {
    if (!opts.aziendaId || !scope.ownedIds.has(opts.aziendaId)) return false;
  }
  return true;
}

export async function loadOwnedAziendaIds(
  supabase: UserClient,
  userId: string,
  kind: "clienti" | "fornitori" | "entrambi"
): Promise<string[]> {
  const tables: Array<"clienti" | "fornitori"> =
    kind === "entrambi" ? ["clienti", "fornitori"] : [kind];
  const ids: string[] = [];
  const lineage = await loadCommercialLineageUserIds(userId);
  for (const table of tables) {
    let q = supabase.from(table).select("id").is("deleted_at", null);
    if (table === "clienti") {
      q = q.or(anagraficaLineageOrFilter(lineage));
    } else {
      q = q.eq("created_by", userId);
    }
    const { data } = await q;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (id) ids.push(id);
    }
  }
  return ids;
}
