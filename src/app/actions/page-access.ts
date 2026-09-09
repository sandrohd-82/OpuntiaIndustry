"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { resolvePageKey, type PageAccessMap } from "@/lib/auth/page-access";
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

export async function loadPageAccessMap(
  profileId: string
): Promise<PageAccessMap> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profile_page_access")
    .select("page_key, visibile")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  if (error || !data) return {};
  const map: PageAccessMap = {};
  for (const row of data) {
    const key = String(row.page_key ?? "").trim();
    if (!key) continue;
    map[key] = Boolean(row.visibile);
  }
  return map;
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
