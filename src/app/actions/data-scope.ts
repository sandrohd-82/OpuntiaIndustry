"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ALL_SCOPE_KEY_SET,
  AREA_FISCALE_PATH,
  COMMERCIALISTA_EXCLUDED_PATHS,
  FISCALE_VIEW_SCOPES,
  RICERCA_SVILUPPO_PATH,
  allowedModesForScope,
  commercialeFiscaleGrantPaths,
  type DataScopeMode,
} from "@/lib/auth/data-scope";
import { loadProfileAuthBundle } from "@/lib/auth/data-scope-enforce";
import { upsertProfilePageKey } from "@/app/actions/page-access";

async function requireRealSuperadmin() {
  const user = await getAuthUser();
  if (!user) {
    return { ok: false as const, error: "Non autenticato." };
  }
  const actor = await getProfile(user.id);
  if (!actor || !isSuperadminProfile(actor)) {
    return {
      ok: false as const,
      error: "Solo il Super Admin può impostare le autorizzazioni.",
    };
  }
  return { ok: true as const, actorUserId: user.id };
}

async function activeTargetId(actorUserId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("impersonation_sessions")
    .select("target_user_id")
    .eq("actor_user_id", actorUserId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.target_user_id ? String(data.target_user_id) : null;
}

async function upsertAuthSettings(
  service: ReturnType<typeof createServiceClient>,
  profileId: string,
  actorUserId: string,
  patch: {
    is_commercialista?: boolean;
    fiscale_unlocked_at?: string | null;
    fiscale_unlocked_by?: string | null;
    rs_unlocked_at?: string | null;
    rs_unlocked_by?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await service
    .from("profile_auth_settings")
    .select("profile_id")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.profile_id) {
    const { error } = await service
      .from("profile_auth_settings")
      .update({
        ...patch,
        updated_by: actorUserId,
      })
      .eq("profile_id", profileId)
      .is("deleted_at", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.from("profile_auth_settings").insert({
    profile_id: profileId,
    is_commercialista: patch.is_commercialista ?? false,
    fiscale_unlocked_at: patch.fiscale_unlocked_at ?? null,
    fiscale_unlocked_by: patch.fiscale_unlocked_by ?? null,
    rs_unlocked_at: patch.rs_unlocked_at ?? null,
    rs_unlocked_by: patch.rs_unlocked_by ?? null,
    created_by: actorUserId,
    updated_by: actorUserId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function writeAudit(
  service: ReturnType<typeof createServiceClient>,
  targetId: string,
  actorUserId: string,
  action: string,
  summary: string,
  payload: Record<string, unknown>
) {
  await service.from("audit_log").insert({
    entity_type: "profile_auth_settings",
    entity_id: targetId,
    action,
    actor_id: actorUserId,
    summary,
    payload: { ...payload, target_user_id: targetId },
  });
}

export async function setDataScopeAction(
  scopeKeyRaw: string,
  modeRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per impostare gli ambiti.",
    };
  }

  const scopeKey = String(scopeKeyRaw ?? "").trim();
  const mode = String(modeRaw ?? "").trim() as DataScopeMode;
  if (!ALL_SCOPE_KEY_SET.has(scopeKey)) {
    return { success: false, error: "Ambito non valido." };
  }
  const allowed = allowedModesForScope(scopeKey);
  if (!allowed.includes(mode)) {
    return { success: false, error: "Scelta non valida per questo ambito." };
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("profile_data_scopes")
    .select("id")
    .eq("profile_id", targetId)
    .eq("scope_key", scopeKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await service
      .from("profile_data_scopes")
      .update({
        mode,
        updated_by: gate.actorUserId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await service.from("profile_data_scopes").insert({
      profile_id: targetId,
      scope_key: scopeKey,
      mode,
      created_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    });
    if (error) return { success: false, error: error.message };
  }

  if (scopeKey.startsWith("fiscale.")) {
    const view = FISCALE_VIEW_SCOPES.find((row) => row.key === scopeKey);
    if (view) {
      const pageRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey: view.path,
        visibile: true,
      });
      if (!pageRes.ok) return { success: false, error: pageRes.error };
    }
  }

  await writeAudit(
    service,
    targetId,
    gate.actorUserId,
    "data_scope_set",
    `Ambito ${scopeKey}: ${mode}`,
    { scope_key: scopeKey, mode }
  );

  revalidatePath("/", "layout");
  return { success: true };
}

async function clearFiscalePageKeys(
  service: ReturnType<typeof createServiceClient>,
  profileId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: rows, error } = await service
    .from("profile_page_access")
    .select("id, page_key")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  const ids = (rows ?? [])
    .filter((row) => {
      const key = String(row.page_key ?? "");
      return key === AREA_FISCALE_PATH || key.startsWith(`${AREA_FISCALE_PATH}/`);
    })
    .map((row) => row.id);
  if (ids.length === 0) return { ok: true };
  const { error: delErr } = await service
    .from("profile_page_access")
    .update({
      deleted_at: now,
      deleted_by: actorUserId,
      updated_by: actorUserId,
    })
    .in("id", ids);
  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true };
}

const unlockSchema = z.object({
  area: z.enum(["fiscale", "rs"]),
  confirm1: z.literal(true),
  confirm2: z.literal(true),
  isCommercialista: z.boolean().optional(),
});

export async function unlockLockedAreaAction(input: {
  area: "fiscale" | "rs";
  confirm1: boolean;
  confirm2: boolean;
  isCommercialista?: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = unlockSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Serve la doppia conferma per sbloccare l’area.",
    };
  }

  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per sbloccare l’area.",
    };
  }

  if (parsed.data.area === "fiscale" && parsed.data.isCommercialista == null) {
    return {
      success: false,
      error: "Indica se il profilo è un commercialista.",
    };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  if (parsed.data.area === "rs") {
    const setRes = await upsertAuthSettings(service, targetId, gate.actorUserId, {
      rs_unlocked_at: now,
      rs_unlocked_by: gate.actorUserId,
    });
    if (!setRes.ok) return { success: false, error: setRes.error };

    const pageRes = await upsertProfilePageKey(service, {
      profileId: targetId,
      actorUserId: gate.actorUserId,
      pageKey: RICERCA_SVILUPPO_PATH,
      visibile: true,
    });
    if (!pageRes.ok) return { success: false, error: pageRes.error };

    await writeAudit(
      service,
      targetId,
      gate.actorUserId,
      "rs_unlock",
      "Ricerca e sviluppo sbloccata (doppia conferma)",
      { area: "rs" }
    );
    revalidatePath("/", "layout");
    return { success: true };
  }

  const isCommercialista = Boolean(parsed.data.isCommercialista);
  const setRes = await upsertAuthSettings(service, targetId, gate.actorUserId, {
    is_commercialista: isCommercialista,
    fiscale_unlocked_at: now,
    fiscale_unlocked_by: gate.actorUserId,
  });
  if (!setRes.ok) return { success: false, error: setRes.error };

  if (isCommercialista) {
    const { grantOn, grantOff } = commercialeFiscaleGrantPaths();
    for (const pageKey of grantOn) {
      const pageRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: true,
      });
      if (!pageRes.ok) return { success: false, error: pageRes.error };
    }
    for (const pageKey of grantOff) {
      const pageRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: false,
      });
      if (!pageRes.ok) return { success: false, error: pageRes.error };
    }
    for (const view of FISCALE_VIEW_SCOPES) {
      const existing = await service
        .from("profile_data_scopes")
        .select("id")
        .eq("profile_id", targetId)
        .eq("scope_key", view.key)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing.data?.id) {
        await service
          .from("profile_data_scopes")
          .update({ mode: "tutte", updated_by: gate.actorUserId })
          .eq("id", existing.data.id);
      } else {
        await service.from("profile_data_scopes").insert({
          profile_id: targetId,
          scope_key: view.key,
          mode: "tutte",
          created_by: gate.actorUserId,
          updated_by: gate.actorUserId,
        });
      }
    }
  } else {
    const cleared = await clearFiscalePageKeys(
      service,
      targetId,
      gate.actorUserId
    );
    if (!cleared.ok) return { success: false, error: cleared.error };
    for (const pageKey of COMMERCIALISTA_EXCLUDED_PATHS) {
      const offRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: false,
      });
      if (!offRes.ok) return { success: false, error: offRes.error };
    }
  }

  await writeAudit(
    service,
    targetId,
    gate.actorUserId,
    "fiscale_unlock",
    isCommercialista
      ? "Area fiscale sbloccata per commercialista (senza bonifico e pagamenti dipendenti)"
      : "Area fiscale sbloccata: gestire le autorizzazioni di visualizzazione",
    { area: "fiscale", is_commercialista: isCommercialista }
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function lockLockedAreaAction(area: "fiscale" | "rs"): Promise<
  { success: true } | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return { success: false, error: "Entra nel profilo con lo switch." };
  }

  const service = createServiceClient();
  if (area === "rs") {
    const setRes = await upsertAuthSettings(service, targetId, gate.actorUserId, {
      rs_unlocked_at: null,
      rs_unlocked_by: null,
    });
    if (!setRes.ok) return { success: false, error: setRes.error };
    const pageRes = await upsertProfilePageKey(service, {
      profileId: targetId,
      actorUserId: gate.actorUserId,
      pageKey: RICERCA_SVILUPPO_PATH,
      visibile: false,
    });
    if (!pageRes.ok) return { success: false, error: pageRes.error };
    await writeAudit(
      service,
      targetId,
      gate.actorUserId,
      "rs_lock",
      "Ricerca e sviluppo nuovamente blindata",
      { area: "rs" }
    );
  } else {
    const setRes = await upsertAuthSettings(service, targetId, gate.actorUserId, {
      fiscale_unlocked_at: null,
      fiscale_unlocked_by: null,
      is_commercialista: false,
    });
    if (!setRes.ok) return { success: false, error: setRes.error };
    const pageRes = await upsertProfilePageKey(service, {
      profileId: targetId,
      actorUserId: gate.actorUserId,
      pageKey: AREA_FISCALE_PATH,
      visibile: false,
    });
    if (!pageRes.ok) return { success: false, error: pageRes.error };
    await writeAudit(
      service,
      targetId,
      gate.actorUserId,
      "fiscale_lock",
      "Area fiscale nuovamente blindata",
      { area: "fiscale" }
    );
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setCommercialistaAction(
  isCommercialista: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return { success: false, error: "Entra nel profilo con lo switch." };
  }

  const bundle = await loadProfileAuthBundle(targetId);
  if (!bundle.settings.fiscaleUnlocked) {
    return { success: false, error: "Sblocca prima l’Area fiscale." };
  }

  const service = createServiceClient();
  const setRes = await upsertAuthSettings(service, targetId, gate.actorUserId, {
    is_commercialista: isCommercialista,
  });
  if (!setRes.ok) return { success: false, error: setRes.error };

  if (isCommercialista) {
    const { grantOn, grantOff } = commercialeFiscaleGrantPaths();
    for (const pageKey of grantOn) {
      const pageRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: true,
      });
      if (!pageRes.ok) return { success: false, error: pageRes.error };
    }
    for (const pageKey of grantOff) {
      const pageRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: false,
      });
      if (!pageRes.ok) return { success: false, error: pageRes.error };
    }
  } else {
    const cleared = await clearFiscalePageKeys(
      service,
      targetId,
      gate.actorUserId
    );
    if (!cleared.ok) return { success: false, error: cleared.error };
    for (const pageKey of COMMERCIALISTA_EXCLUDED_PATHS) {
      const offRes = await upsertProfilePageKey(service, {
        profileId: targetId,
        actorUserId: gate.actorUserId,
        pageKey,
        visibile: false,
      });
      if (!offRes.ok) return { success: false, error: offRes.error };
    }
  }

  await writeAudit(
    service,
    targetId,
    gate.actorUserId,
    "commercialista_set",
    isCommercialista
      ? "Profilo impostato come commercialista"
      : "Profilo non commercialista: gestisci autorizzazioni fiscali",
    { is_commercialista: isCommercialista }
  );

  revalidatePath("/", "layout");
  return { success: true };
}
