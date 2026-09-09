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
import { createServiceClient } from "@/lib/supabase/server";

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

  const service = createServiceClient();
  const { data: existing } = await service
    .from("profile_page_access")
    .select("id")
    .eq("profile_id", targetId)
    .eq("page_key", pageKey)
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
      page_key: pageKey,
      visibile,
      created_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    });
    if (error) return { success: false, error: error.message };
  }

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

  const service = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await service
    .from("profile_page_access")
    .select("id")
    .eq("profile_id", targetId)
    .eq("page_key", areaKey)
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
      page_key: areaKey,
      visibile,
      created_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    });
    if (error) return { success: false, error: error.message };
  }

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
