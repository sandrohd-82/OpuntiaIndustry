"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile, getUserAreas } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { firstAreaPath } from "@/lib/areas/config";
import {
  parseCommercialeGrado,
  parseProvvigionePctInput,
} from "@/lib/auth/commerciale";
import { isProtectedSuperadminTarget } from "@/lib/auth/impersonation-scope";
import {
  PROFILE_GERARCHIA_LABELS,
  PROFILE_GERARCHIE,
  PROFILE_POTERI,
  PROFILE_REPARTI_OPERATIVI,
  parseProfileGerarchia,
  parseProfileReparto,
  roleCodeFromPotereGerarchia,
  type ProfileGerarchia,
  type ProfilePotere,
} from "@/lib/auth/gerarchia";
import {
  PROFILE_STATO_LABELS,
  parseProfileStatoOperativo,
} from "@/lib/auth/stato-operativo";
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
    return {
      ok: false as const,
      error: "Solo il Super Admin può collegare o creare profili gestionali.",
    };
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
    .select(
      "id, nome, cognome, user_id, commerciale_grado, commerciale_provvigione_pct, deleted_at"
    )
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
  const pctForm = parseProvvigionePctInput(
    formData.get("commercialeProvvigionePct")
  );
  const pctPersona = parseProvvigionePctInput(
    (persona as { commerciale_provvigione_pct?: number | null })
      .commerciale_provvigione_pct
  );
  const pct =
    pctForm.ok && pctForm.value != null
      ? pctForm.value
      : pctPersona.ok
        ? pctPersona.value
        : null;
  if (grado || pct != null) {
    await service
      .from("profiles")
      .update({
        commerciale_grado: grado,
        commerciale_provvigione_pct: pct,
      })
      .eq("id", result.userId);
    await service
      .from("organigramma_persone")
      .update({
        commerciale_grado: grado,
        commerciale_provvigione_pct: pct,
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
      commerciale_provvigione_pct: pct,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/app/amministrazione/organigramma/elenco-e-mansioni");
  return { success: true, userId: result.userId };
}

export type GestionaleProfileOption = {
  id: string;
  label: string;
  email: string;
  gerarchiaLabel: string;
  statoLabel: string;
};

export async function listUnlinkedGestionaleProfilesAction(): Promise<
  | { success: true; profiles: GestionaleProfileOption[] }
  | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const service = createServiceClient();
  const { data: linked } = await service
    .from("organigramma_persone")
    .select("user_id")
    .is("deleted_at", null)
    .not("user_id", "is", null);
  const taken = new Set(
    ((linked ?? []) as Array<{ user_id: string }>).map((r) => String(r.user_id))
  );

  const { data, error } = await service
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, gerarchia, stato_operativo, potere, is_active, app_roles(code)"
    )
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return { success: false, error: error.message };

  const profiles: GestionaleProfileOption[] = [];
  for (const row of data ?? []) {
    const id = String((row as { id: string }).id);
    if (taken.has(id)) continue;
    if (isProtectedSuperadminTarget(row)) continue;
    const email = String((row as { email?: string | null }).email ?? "");
    const full = String((row as { full_name?: string | null }).full_name ?? "").trim();
    const composed = `${(row as { first_name?: string | null }).first_name ?? ""} ${
      (row as { last_name?: string | null }).last_name ?? ""
    }`.trim();
    const gerarchia = parseProfileGerarchia(
      (row as { gerarchia?: string | null }).gerarchia
    );
    const stato = parseProfileStatoOperativo(
      (row as { stato_operativo?: string | null }).stato_operativo
    );
    profiles.push({
      id,
      label: full || composed || email || "Profilo",
      email,
      gerarchiaLabel: PROFILE_GERARCHIA_LABELS[gerarchia],
      statoLabel: PROFILE_STATO_LABELS[stato],
    });
  }
  profiles.sort((a, b) => a.label.localeCompare(b.label, "it"));
  return { success: true, profiles };
}

export async function linkOrganigrammaProfileAction(input: {
  personaId: string;
  profileId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const personaId = z.string().uuid().safeParse(input.personaId);
  const profileId = z.string().uuid().safeParse(input.profileId);
  if (!personaId.success || !profileId.success) {
    return { success: false, error: "Dati collegamento non validi." };
  }

  const service = createServiceClient();
  const { data: persona, error: pErr } = await service
    .from("organigramma_persone")
    .select("id, nome, cognome, user_id, commerciale_grado, commerciale_provvigione_pct")
    .eq("id", personaId.data)
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

  const { data: profile, error: prErr } = await service
    .from("profiles")
    .select("id, email, full_name, is_active, potere, stato_operativo, app_roles(code)")
    .eq("id", profileId.data)
    .maybeSingle();
  if (prErr || !profile || !profile.is_active) {
    return { success: false, error: "Profilo gestionale non trovato o non attivo." };
  }
  if (isProtectedSuperadminTarget(profile)) {
    return { success: false, error: "Non puoi collegare il Super Admin operativo." };
  }

  const { data: other } = await service
    .from("organigramma_persone")
    .select("id, nome, cognome")
    .eq("user_id", profileId.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (other) {
    return {
      success: false,
      error: `Il profilo è già collegato a ${other.cognome} ${other.nome}.`,
    };
  }

  const { error: linkErr } = await service
    .from("organigramma_persone")
    .update({
      user_id: profileId.data,
      updated_by: gate.actorUserId,
    })
    .eq("id", personaId.data)
    .is("deleted_at", null);
  if (linkErr) return { success: false, error: linkErr.message };

  const gradoLink = parseCommercialeGrado(
    (persona as { commerciale_grado?: string | null }).commerciale_grado
  );
  const pctLink = parseProvvigionePctInput(
    (persona as { commerciale_provvigione_pct?: number | null })
      .commerciale_provvigione_pct
  );
  await service
    .from("profiles")
    .update({
      commerciale_grado: gradoLink,
      commerciale_provvigione_pct: pctLink.ok ? pctLink.value : null,
    })
    .eq("id", profileId.data);

  await service.from("audit_log").insert({
    entity_type: "organigramma_persone",
    entity_id: personaId.data,
    action: "update",
    actor_id: gate.actorUserId,
    summary: `Collegato operatore ${persona.cognome} ${persona.nome} al profilo ${profile.full_name ?? profile.email}`,
    payload: {
      persona_id: personaId.data,
      profile_id: profileId.data,
      email: profile.email,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/app/amministrazione/organigramma/elenco-e-mansioni");
  revalidatePath(
    `/app/amministrazione/organigramma/elenco-e-mansioni/${personaId.data}`
  );
  return { success: true };
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
