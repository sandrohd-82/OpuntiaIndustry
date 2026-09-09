"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";
import {
  generateSessionToken,
  hashSessionToken,
  twoFaSessionExpiresAt,
} from "@/lib/auth/two-factor";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpUri,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AuthSession2faInsert, UserSecondFactorUpdate } from "@/types/database";

const passwordSchema = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri.");

export async function previewPrimoAccessoAction(token: string): Promise<
  | { success: true; email: string; name: string }
  | { success: false; error: string }
> {
  const hash = hashSessionToken(token.trim());
  if (!hash) return { success: false, error: "Link non valido o scaduto." };

  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("email, full_name, primo_accesso_expires_at, stato_operativo")
    .eq("primo_accesso_token_hash", hash)
    .maybeSingle();

  if (!data) {
    return { success: false, error: "Link non valido o scaduto." };
  }
  const stato = parseProfileStatoOperativo(data.stato_operativo);
  if (stato !== "operativo") {
    return { success: false, error: "Profilo non ancora operativo." };
  }
  const exp = data.primo_accesso_expires_at
    ? new Date(String(data.primo_accesso_expires_at))
    : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Contatta il Super Admin." };
  }

  return {
    success: true,
    email: String(data.email ?? ""),
    name: String(data.full_name ?? "").trim() || "Operatore",
  };
}

export async function setPrimoAccessoPasswordAction(
  formData: FormData
): Promise<
  { success: true; redirectTo: string } | { success: false; error: string }
> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { success: false, error: "Link non valido." };
  if (password !== confirm) {
    return { success: false, error: "Le password non coincidono." };
  }
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) {
    return { success: false, error: pw.error.issues[0]?.message ?? "Password non valida." };
  }

  const hash = hashSessionToken(token);
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, email, stato_operativo, primo_accesso_expires_at")
    .eq("primo_accesso_token_hash", hash)
    .maybeSingle();

  if (!profile?.id || !profile.email) {
    return { success: false, error: "Link non valido o scaduto." };
  }
  if (parseProfileStatoOperativo(profile.stato_operativo) !== "operativo") {
    return { success: false, error: "Profilo non operativo." };
  }
  const exp = profile.primo_accesso_expires_at
    ? new Date(String(profile.primo_accesso_expires_at))
    : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Contatta il Super Admin." };
  }

  const { error: updAuth } = await service.auth.admin.updateUserById(
    String(profile.id),
    { password: pw.data }
  );
  if (updAuth) return { success: false, error: updAuth.message };

  const now = new Date().toISOString();
  const { error: updProf } = await service
    .from("profiles")
    .update({
      password_impostata_at: now,
      primo_accesso_token_hash: null,
      primo_accesso_expires_at: null,
    })
    .eq("id", profile.id);
  if (updProf) return { success: false, error: updProf.message };

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: String(profile.id),
    action: "primo_accesso_password",
    actor_id: String(profile.id),
    summary: "Password impostata al primo accesso",
    payload: { email: profile.email },
  });

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: String(profile.email),
    password: pw.data,
  });
  if (signErr) {
    return {
      success: false,
      error:
        "Password salvata. Accedi dal login e configura Google Authenticator.",
    };
  }

  return { success: true, redirectTo: "/primo-accesso/2fa" };
}

async function requireFirstAccessTotpUser() {
  const user = await getAuthUser();
  if (!user?.email) {
    return { ok: false as const, error: "Sessione non valida. Accedi di nuovo." };
  }
  const profile = await getProfile(user.id);
  if (!profile) {
    return { ok: false as const, error: "Profilo non trovato." };
  }
  if (parseProfileStatoOperativo(profile.stato_operativo) !== "operativo") {
    return { ok: false as const, error: "Profilo non operativo." };
  }
  if (!profile.password_impostata_at) {
    return {
      ok: false as const,
      error: "Imposta prima la password dal link ricevuto via email.",
    };
  }
  return { ok: true as const, user, profile };
}

export async function startFirstAccessTotpAction(): Promise<
  | { success: true; secret: string; otpauthUrl: string }
  | { success: false; error: string }
> {
  const gate = await requireFirstAccessTotpUser();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const secret = generateTotpSecret();
    const service = createServiceClient();
    const { error } = await service.from("user_second_factor").upsert(
      {
        user_id: gate.user.id,
        method: "email",
        totp_secret_encrypted: encryptTotpSecret(secret),
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      secret,
      otpauthUrl: totpUri(secret, gate.user.email ?? gate.profile.email),
    };
  } catch (error) {
    console.error("startFirstAccessTotpAction", error);
    return { success: false, error: "Impossibile generare il secret Authenticator." };
  }
}

export async function confirmFirstAccessTotpAction(
  formData: FormData
): Promise<
  { success: true; redirectTo: string } | { success: false; error: string }
> {
  const gate = await requireFirstAccessTotpUser();
  if (!gate.ok) return { success: false, error: gate.error };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { success: false, error: "Inserisci il codice a 6 cifre dall'app." };
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("user_second_factor")
    .select("totp_secret_encrypted")
    .eq("user_id", gate.user.id)
    .maybeSingle();
  if (error || !data?.totp_secret_encrypted) {
    return {
      success: false,
      error: "Nessuna configurazione in corso. Genera di nuovo il secret.",
    };
  }

  try {
    const secret = decryptTotpSecret(data.totp_secret_encrypted);
    if (!verifyTotpCode(secret, code)) {
      return { success: false, error: "Codice non corretto. Riprova." };
    }
  } catch {
    return { success: false, error: "Secret non valido. Genera di nuovo." };
  }

  const update: UserSecondFactorUpdate = {
    method: "app",
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: updErr } = await service
    .from("user_second_factor")
    .update(update)
    .eq("user_id", gate.user.id);
  if (updErr) return { success: false, error: updErr.message };

  const sessionToken = generateSessionToken();
  const expiresAt = twoFaSessionExpiresAt();
  const sessionInsert: AuthSession2faInsert = {
    user_id: gate.user.id,
    session_token_hash: hashSessionToken(sessionToken),
    expires_at: expiresAt.toISOString(),
  };
  await service.from("auth_sessions_2fa").insert(sessionInsert);

  const cookieStore = await cookies();
  cookieStore.set(TWO_FA_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: gate.user.id,
    action: "primo_accesso_totp",
    actor_id: gate.user.id,
    summary: "Google Authenticator attivato al primo accesso",
  });

  return { success: true, redirectTo: "/app/dashboard" };
}

export async function markWelcomeSeenAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: "Non autenticato." };

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ welcome_visto_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("welcome_visto_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
