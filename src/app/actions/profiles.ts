"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile, getUserAreas } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { firstAreaPath } from "@/lib/areas/config";
import {
  CREATABLE_ROLE_CODES,
  provisionTestProfile,
  resetProfileToTestState,
} from "@/lib/auth/provision-test-profile";

async function requireRealSuperadmin() {
  const user = await getAuthUser();
  if (!user) {
    return { ok: false as const, error: "Non autenticato." };
  }
  const actor = await getProfile(user.id);
  if (!actor || !isSuperadminProfile(actor)) {
    return { ok: false as const, error: "Solo il Super Admin può creare profili." };
  }
  return { ok: true as const, actorUserId: user.id, actor };
}

const createSchema = z.object({
  email: z.string().email("Email non valida"),
  fullName: z.string().trim().min(2, "Nome obbligatorio"),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  roleCode: z.enum(CREATABLE_ROLE_CODES),
});

export async function createTestProfileAction(
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = createSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim() || undefined,
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    roleCode: String(formData.get("roleCode") ?? "manager"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }

  const service = createServiceClient();
  const result = await provisionTestProfile(service, {
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    roleCode: parsed.data.roleCode,
    actorId: gate.actorUserId,
    resetExisting: false,
  });
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: result.userId,
    action: "profile_create_test",
    actor_id: gate.actorUserId,
    summary: `Profilo ${parsed.data.fullName} (${parsed.data.email}) creato in fase Test`,
    payload: {
      email: parsed.data.email,
      role: parsed.data.roleCode,
      created: result.created,
    },
  });

  const now = new Date().toISOString();
  await service
    .from("impersonation_sessions")
    .update({
      ended_at: now,
      ended_by: gate.actorUserId,
      updated_by: gate.actorUserId,
    })
    .eq("actor_user_id", gate.actorUserId)
    .is("ended_at", null)
    .is("deleted_at", null);

  const { error: impErr } = await service.from("impersonation_sessions").insert({
    actor_user_id: gate.actorUserId,
    target_user_id: result.userId,
    created_by: gate.actorUserId,
    updated_by: gate.actorUserId,
  });
  if (impErr) return { success: false, error: impErr.message };

  revalidatePath("/", "layout");
  const areas = await getUserAreas(gate.actorUserId);
  redirect(firstAreaPath(areas) ?? "/app/dashboard");
}

export async function resetImpersonatedProfileToTestAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const service = createServiceClient();
  const { data: session } = await service
    .from("impersonation_sessions")
    .select("target_user_id")
    .eq("actor_user_id", gate.actorUserId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const targetId = session?.target_user_id
    ? String(session.target_user_id)
    : "";
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per reimpostarlo.",
    };
  }

  const { data: target } = await service
    .from("profiles")
    .select("id, email, full_name, app_roles(code)")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return { success: false, error: "Profilo non trovato." };
  const role = target.app_roles as { code?: string } | { code?: string }[] | null;
  const roleCode = Array.isArray(role) ? role[0]?.code : role?.code;
  if (roleCode === "superadmin") {
    return { success: false, error: "Non puoi reimpostare un Super Admin." };
  }

  const reset = await resetProfileToTestState(service, targetId, gate.actorUserId);
  if (reset.error) return { success: false, error: reset.error };

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: targetId,
    action: "profile_reset_test",
    actor_id: gate.actorUserId,
    summary: `Profilo ${target.full_name ?? target.email} reimpostato in fase Test`,
    payload: { target_user_id: targetId },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
