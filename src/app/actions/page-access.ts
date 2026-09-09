"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { ACTION_ACCESS_KEY_SET } from "@/lib/auth/action-access";
import {
  isActionAccessKey,
  isChildPageKeyOfSubtree,
  resolvePageKey,
  type PageAccessMap,
} from "@/lib/auth/page-access";
import {
  AREA_FISCALE_PATH,
  RICERCA_SVILUPPO_PATH,
  isAreaUnlocked,
  isSensitiveLockedPath,
  lockedAreaKind,
} from "@/lib/auth/data-scope";
import { loadProfileAuthBundle } from "@/lib/auth/data-scope-enforce";
import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function upsertProfilePageKey(
  service: ServiceClient,
  params: {
    profileId: string;
    actorUserId: string;
    pageKey: string;
    visibile: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await service
    .from("profile_page_access")
    .select("id")
    .eq("profile_id", params.profileId)
    .eq("page_key", params.pageKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await service
      .from("profile_page_access")
      .update({
        visibile: params.visibile,
        updated_by: params.actorUserId,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.from("profile_page_access").insert({
    profile_id: params.profileId,
    page_key: params.pageKey,
    visibile: params.visibile,
    created_by: params.actorUserId,
    updated_by: params.actorUserId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function requireRealSuperadmin() {
  const user = await getAuthUser();
  if (!user) {
    return { ok: false as const, error: "Non autenticato." };
  }
  const actor = await getProfile(user.id);
  if (!actor || !isSuperadminProfile(actor)) {
    return { ok: false as const, error: "Solo il Super Admin può impostare le pagine." };
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

export async function loadAccessMaps(profileId: string): Promise<{
  pageAccess: PageAccessMap;
  actionAccess: PageAccessMap;
}> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profile_page_access")
    .select("page_key, visibile")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  const pageAccess: PageAccessMap = {};
  const actionAccess: PageAccessMap = {};
  if (error || !data) return { pageAccess, actionAccess };
  for (const row of data) {
    const key = String(row.page_key ?? "").trim();
    if (!key) continue;
    if (isActionAccessKey(key)) actionAccess[key] = Boolean(row.visibile);
    else pageAccess[key] = Boolean(row.visibile);
  }
  return { pageAccess, actionAccess };
}

export async function loadPageAccessMap(
  profileId: string
): Promise<PageAccessMap> {
  const { pageAccess } = await loadAccessMaps(profileId);
  return pageAccess;
}

export async function loadActionAccessMap(
  profileId: string
): Promise<PageAccessMap> {
  const { actionAccess } = await loadAccessMaps(profileId);
  return actionAccess;
}

export async function setPageAccessAction(
  pathname: string,
  visibile: boolean
): Promise<{ success: true; pageKey: string } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per impostare le pagine.",
    };
  }

  const pageKey = resolvePageKey(pathname);
  if (!pageKey.startsWith("/app")) {
    return { success: false, error: "Pagina non valida." };
  }

  if (visibile && isSensitiveLockedPath(pageKey)) {
    const bundle = await loadProfileAuthBundle(targetId);
    if (!isAreaUnlocked(pageKey, bundle.settings)) {
      return {
        success: false,
        error:
          "Area blindata: sbloccala da Imposta autorizzazioni (doppia conferma).",
      };
    }
  }

  const service = createServiceClient();
  const upserted = await upsertProfilePageKey(service, {
    profileId: targetId,
    actorUserId: gate.actorUserId,
    pageKey,
    visibile,
  });
  if (!upserted.ok) return { success: false, error: upserted.error };

  await service.from("audit_log").insert({
    entity_type: "profile_page_access",
    entity_id: targetId,
    action: visibile ? "page_on" : "page_off",
    actor_id: gate.actorUserId,
    summary: `Pagina ${pageKey} ${visibile ? "On" : "Off"}`,
    payload: { page_key: pageKey, visibile, target_user_id: targetId },
  });

  revalidatePath("/", "layout");
  return { success: true, pageKey };
}

export async function setAreaAccessAction(
  areaKeyRaw: string,
  visibile: boolean
): Promise<{ success: true; areaKey: string } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per impostare le aree.",
    };
  }

  const areaKey = resolvePageKey(String(areaKeyRaw ?? "").trim());
  if (!areaKey.startsWith("/app") || areaKey === "/app") {
    return { success: false, error: "Voce di menu non valida." };
  }

  if (visibile && isSensitiveLockedPath(areaKey)) {
    const bundle = await loadProfileAuthBundle(targetId);
    if (!isAreaUnlocked(areaKey, bundle.settings)) {
      return {
        success: false,
        error:
          "Area blindata: sbloccala da Imposta autorizzazioni (doppia conferma).",
      };
    }
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  if (
    !visibile &&
    (areaKey === AREA_FISCALE_PATH || areaKey === RICERCA_SVILUPPO_PATH)
  ) {
    const kind = lockedAreaKind(areaKey);
    const patch =
      kind === "fiscale"
        ? {
            fiscale_unlocked_at: null,
            fiscale_unlocked_by: null,
            is_commercialista: false,
            updated_by: gate.actorUserId,
          }
        : {
            rs_unlocked_at: null,
            rs_unlocked_by: null,
            updated_by: gate.actorUserId,
          };
    const { data: settingsRow } = await service
      .from("profile_auth_settings")
      .select("profile_id")
      .eq("profile_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (settingsRow?.profile_id) {
      await service
        .from("profile_auth_settings")
        .update(patch)
        .eq("profile_id", targetId)
        .is("deleted_at", null);
    }
  }

  const upserted = await upsertProfilePageKey(service, {
    profileId: targetId,
    actorUserId: gate.actorUserId,
    pageKey: areaKey,
    visibile,
  });
  if (!upserted.ok) return { success: false, error: upserted.error };

  const { data: siblings } = await service
    .from("profile_page_access")
    .select("id, page_key")
    .eq("profile_id", targetId)
    .is("deleted_at", null);

  const childIds = (siblings ?? [])
    .filter((row) => isChildPageKeyOfSubtree(String(row.page_key ?? ""), areaKey))
    .map((row) => row.id);

  if (childIds.length > 0) {
    const { error: clearErr } = await service
      .from("profile_page_access")
      .update({
        deleted_at: now,
        deleted_by: gate.actorUserId,
        updated_by: gate.actorUserId,
      })
      .in("id", childIds);
    if (clearErr) return { success: false, error: clearErr.message };
  }

  await service.from("audit_log").insert({
    entity_type: "profile_page_access",
    entity_id: targetId,
    action: visibile ? "area_on" : "area_off",
    actor_id: gate.actorUserId,
    summary: `Menu ${areaKey} ${visibile ? "On" : "Off"} (voce e sottocategorie)`,
    payload: {
      page_key: areaKey,
      visibile,
      target_user_id: targetId,
      cleared_child_keys: childIds.length,
    },
  });

  revalidatePath("/", "layout");
  return { success: true, areaKey };
}

export async function clearPageAccessKeyAction(
  pathname: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = z.string().min(1).safeParse(pathname);
  if (!parsed.success) return { success: false, error: "Pagina non valida." };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return { success: false, error: "Entra nel profilo con lo switch." };
  }

  const pageKey = resolvePageKey(parsed.data);
  const service = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service
    .from("profile_page_access")
    .update({
      deleted_at: now,
      deleted_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    })
    .eq("profile_id", targetId)
    .eq("page_key", pageKey)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setActionAccessAction(
  actionKeyRaw: string,
  visibile: boolean
): Promise<{ success: true; actionKey: string } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const targetId = await activeTargetId(gate.actorUserId);
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per impostare le autorizzazioni.",
    };
  }

  const actionKey = String(actionKeyRaw ?? "").trim();
  if (!ACTION_ACCESS_KEY_SET.has(actionKey)) {
    return { success: false, error: "Azione non valida." };
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("profile_page_access")
    .select("id")
    .eq("profile_id", targetId)
    .eq("page_key", actionKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await service
      .from("profile_page_access")
      .update({
        visibile,
        updated_by: gate.actorUserId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await service.from("profile_page_access").insert({
      profile_id: targetId,
      page_key: actionKey,
      visibile,
      created_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    });
    if (error) return { success: false, error: error.message };
  }

  await service.from("audit_log").insert({
    entity_type: "profile_page_access",
    entity_id: targetId,
    action: visibile ? "action_on" : "action_off",
    actor_id: gate.actorUserId,
    summary: `Azione ${actionKey} ${visibile ? "On" : "Off"}`,
    payload: { page_key: actionKey, visibile, target_user_id: targetId },
  });

  revalidatePath("/", "layout");
  return { success: true, actionKey };
}
