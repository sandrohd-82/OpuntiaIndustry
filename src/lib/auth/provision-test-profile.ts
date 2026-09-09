import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseProfileGerarchia,
  parseProfilePotere,
  type ProfileGerarchia,
  type ProfilePotere,
} from "@/lib/auth/gerarchia";

export const CREATABLE_ROLE_CODES = [
  "manager",
  "operator",
  "admin",
  "viewer",
] as const;

export type CreatableRoleCode = (typeof CREATABLE_ROLE_CODES)[number];

function randomUnusedPassword(): string {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

async function waitForProfile(
  service: SupabaseClient,
  userId: string
): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const { data } = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data?.id) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export async function resetProfileToTestState(
  service: SupabaseClient,
  profileId: string,
  actorId: string
): Promise<{ error?: string }> {
  const now = new Date().toISOString();

  const { error: accErr } = await service
    .from("profile_page_access")
    .update({
      deleted_at: now,
      deleted_by: actorId,
      updated_by: actorId,
    })
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  if (accErr) return { error: accErr.message };

  const { error: pErr } = await service
    .from("profiles")
    .update({
      stato_operativo: "test",
      stato_operativo_at: now,
      stato_operativo_by: actorId,
      primo_accesso_token_hash: null,
      primo_accesso_expires_at: null,
      password_impostata_at: null,
      welcome_visto_at: null,
      attivato_at: null,
      attivato_by: null,
    })
    .eq("id", profileId);
  if (pErr) return { error: pErr.message };

  const { error: pwErr } = await service.auth.admin.updateUserById(profileId, {
    password: randomUnusedPassword(),
  });
  if (pwErr) return { error: pwErr.message };

  const { error: fErr } = await service.from("user_second_factor").upsert(
    {
      user_id: profileId,
      method: "email",
      totp_secret_encrypted: null,
      verified_at: null,
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (fErr) return { error: fErr.message };

  return {};
}

export async function provisionTestProfile(
  service: SupabaseClient,
  input: {
    email: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    roleCode: CreatableRoleCode;
    gerarchia?: ProfileGerarchia;
    potere?: ProfilePotere;
    actorId: string;
    /** Se il profilo esiste: torna in fase test (niente mail, niente 2FA). */
    resetExisting?: boolean;
  }
): Promise<{ userId: string; created: boolean } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName) {
    return { error: "Email e nome sono obbligatori." };
  }
  if (!(CREATABLE_ROLE_CODES as readonly string[]).includes(input.roleCode)) {
    return { error: "Ruolo non consentito." };
  }

  const { data: role, error: roleErr } = await service
    .from("app_roles")
    .select("id, code")
    .eq("code", input.roleCode)
    .maybeSingle();
  if (roleErr || !role) {
    return { error: roleErr?.message ?? "Ruolo non trovato." };
  }

  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, email, app_roles(code)")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    const roleRel = existingProfile.app_roles as
      | { code?: string }
      | { code?: string }[]
      | null;
    const existingRole = Array.isArray(roleRel) ? roleRel[0]?.code : roleRel?.code;
    if (existingRole === "superadmin") {
      return { error: "Non puoi modificare un Super Admin." };
    }
    if (!input.resetExisting) {
      return {
        error: `Esiste già un profilo con ${email}. Usa «Reimposta in fase test» sul profilo, oppure scegli un'altra email.`,
      };
    }
    const now = new Date().toISOString();
    const { error: updErr } = await service
      .from("profiles")
      .update({
        email,
        full_name: fullName,
        first_name: input.firstName?.trim() || fullName,
        last_name: input.lastName?.trim() || "",
        job_title: input.jobTitle?.trim() || "",
        role_id: role.id,
        gerarchia: parseProfileGerarchia(input.gerarchia),
        potere: parseProfilePotere(input.potere),
        is_active: true,
        stato_operativo_at: now,
        stato_operativo_by: input.actorId,
      })
      .eq("id", existingProfile.id);
    if (updErr) return { error: updErr.message };

    const reset = await resetProfileToTestState(
      service,
      String(existingProfile.id),
      input.actorId
    );
    if (reset.error) return { error: reset.error };
    return { userId: String(existingProfile.id), created: false };
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password: randomUnusedPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    return { error: createErr?.message ?? "Impossibile creare l'utente Auth." };
  }

  const userId = created.user.id;
  const ready = await waitForProfile(service, userId);
  const now = new Date().toISOString();
  const row = {
    id: userId,
    email,
    full_name: fullName,
    first_name: input.firstName?.trim() || fullName,
    last_name: input.lastName?.trim() || "",
    job_title: input.jobTitle?.trim() || "",
    role_id: role.id,
    gerarchia: parseProfileGerarchia(input.gerarchia),
    potere: parseProfilePotere(input.potere),
    is_active: true,
    stato_operativo: "test",
    stato_operativo_at: now,
    stato_operativo_by: input.actorId,
    password_impostata_at: null,
    welcome_visto_at: null,
    primo_accesso_token_hash: null,
    primo_accesso_expires_at: null,
    attivato_at: null,
    attivato_by: null,
  };

  if (ready) {
    const { error } = await service.from("profiles").update(row).eq("id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await service.from("profiles").upsert(row, { onConflict: "id" });
    if (error) return { error: error.message };
  }

  await service.from("user_second_factor").upsert(
    {
      user_id: userId,
      method: "email",
      totp_secret_encrypted: null,
      verified_at: null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  return { userId, created: true };
}

export function isCreatableRole(value: string): value is CreatableRoleCode {
  return (CREATABLE_ROLE_CODES as readonly string[]).includes(value);
}

export async function replaceProfileReparti(
  service: SupabaseClient,
  profileId: string,
  codici: string[],
  actorId: string
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error: delErr } = await service
    .from("profile_reparti")
    .update({
      deleted_at: now,
      deleted_by: actorId,
      updated_by: actorId,
    })
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  if (delErr) return { error: delErr.message };

  const unique = [...new Set(codici.filter(Boolean))];
  if (unique.length === 0) return {};

  const { error: insErr } = await service.from("profile_reparti").insert(
    unique.map((codice) => ({
      profile_id: profileId,
      codice,
      created_by: actorId,
      updated_by: actorId,
    }))
  );
  if (insErr) return { error: insErr.message };
  return {};
}
