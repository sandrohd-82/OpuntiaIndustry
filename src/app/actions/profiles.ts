"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile, getUserAreas } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { firstAreaPath } from "@/lib/areas/config";
import { parseCommercialeGrado } from "@/lib/auth/commerciale";
import {
  PROFILE_GERARCHIE,
  PROFILE_POTERI,
  PROFILE_REPARTI_OPERATIVI,
  parseProfileReparto,
  roleCodeFromPotereGerarchia,
  type ProfileGerarchia,
  type ProfilePotere,
} from "@/lib/auth/gerarchia";
import {
  provisionTestProfile,
  replaceProfileReparti,
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
  gerarchia: z.enum(PROFILE_GERARCHIE),
  potere: z.enum(PROFILE_POTERI),
  reparti: z.array(z.enum(PROFILE_REPARTI_OPERATIVI)).min(1, "Seleziona almeno un reparto."),
  personaId: z.string().uuid().optional(),
});

function formReparti(formData: FormData): string[] {
  return formData
    .getAll("reparti")
    .map((v) => parseProfileReparto(String(v)))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
}

export async function createTestProfileAction(
  formData: FormData
): Promise<
  { success: true; redirectTo: string } | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = createSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim() || undefined,
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    gerarchia: String(formData.get("gerarchia") ?? "operatore"),
    potere: String(formData.get("potere") ?? "operatore"),
    reparti: formReparti(formData),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }

  const service = createServiceClient();
  const roleCode = roleCodeFromPotereGerarchia(
    parsed.data.potere,
    parsed.data.gerarchia
  );
  const result = await provisionTestProfile(service, {
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    jobTitle: parsed.data.gerarchia,
    roleCode,
    gerarchia: parsed.data.gerarchia,
    potere: parsed.data.potere,
    actorId: gate.actorUserId,
    resetExisting: false,
  });
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  const rep = await replaceProfileReparti(
    service,
    result.userId,
    parsed.data.reparti,
    gate.actorUserId
  );
  if (rep.error) return { success: false, error: rep.error };

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: result.userId,
    action: "profile_create_test",
    actor_id: gate.actorUserId,
    summary: `Profilo ${parsed.data.fullName} (${parsed.data.email}) creato in fase Test`,
    payload: {
      email: parsed.data.email,
      gerarchia: parsed.data.gerarchia,
      potere: parsed.data.potere,
      reparti: parsed.data.reparti,
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

  const areas = await getUserAreas(result.userId);
  return { success: true, redirectTo: firstAreaPath(areas) ?? "/app/dashboard" };
}

export async function createOrganigrammaProfileAction(
  formData: FormData
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = createSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim() || undefined,
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    gerarchia: String(formData.get("gerarchia") ?? "operatore") as ProfileGerarchia,
    potere: String(formData.get("potere") ?? "operatore") as ProfilePotere,
    reparti: formReparti(formData),
    personaId: String(formData.get("personaId") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  if (!parsed.data.personaId) {
    return { success: false, error: "Persona organigramma mancante." };
  }

  const service = createServiceClient();
  const { data: persona, error: pErr } = await service
    .from("organigramma_persone")
    .select("id, nome, cognome, user_id, commerciale_grado, deleted_at")
    .eq("id", parsed.data.personaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !persona) {
    return { success: false, error: pErr?.message ?? "Operatore non trovato." };
  }
  if (persona.user_id) {
    return {
      success: false,
      error: "Questa persona ha già un profilo gestionale.",
    };
  }

  const roleCode = roleCodeFromPotereGerarchia(
    parsed.data.potere,
    parsed.data.gerarchia
  );
  const result = await provisionTestProfile(service, {
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    firstName: parsed.data.firstName || String(persona.nome ?? ""),
    lastName: parsed.data.lastName || String(persona.cognome ?? ""),
    jobTitle: parsed.data.gerarchia,
    roleCode,
    gerarchia: parsed.data.gerarchia,
    potere: parsed.data.potere,
    actorId: gate.actorUserId,
    resetExisting: false,
  });
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  const { error: linkErr } = await service
    .from("organigramma_persone")
    .update({
      user_id: result.userId,
      updated_by: gate.actorUserId,
    })
    .eq("id", parsed.data.personaId)
    .is("deleted_at", null);
  if (linkErr) {
    return { success: false, error: linkErr.message };
  }

  const rep = await replaceProfileReparti(
    service,
    result.userId,
    parsed.data.reparti,
    gate.actorUserId
  );
  if (rep.error) return { success: false, error: rep.error };

  const grado =
    parseCommercialeGrado(formData.get("commercialeGrado")) ??
    parseCommercialeGrado(
      (persona as { commerciale_grado?: string | null }).commerciale_grado
    );
  if (grado) {
    await service
      .from("profiles")
      .update({ commerciale_grado: grado })
      .eq("id", result.userId);
    await service
      .from("organigramma_persone")
      .update({
        commerciale_grado: grado,
        updated_by: gate.actorUserId,
      })
      .eq("id", parsed.data.personaId);
  }

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: result.userId,
    action: "profile_create_test",
    actor_id: gate.actorUserId,
    summary: `Profilo ${parsed.data.fullName} (${parsed.data.email}) creato in Test da organigramma`,
    payload: {
      email: parsed.data.email,
      gerarchia: parsed.data.gerarchia,
      potere: parsed.data.potere,
      reparti: parsed.data.reparti,
      persona_id: parsed.data.personaId,
      commerciale_grado: grado,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/app/amministrazione/organigramma/elenco-e-mansioni");
  return { success: true, userId: result.userId };
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
