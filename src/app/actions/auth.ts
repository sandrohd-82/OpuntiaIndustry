"use server";
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  TWO_FA_SESSION_COOKIE,
} from "@/lib/auth/constants";
import {
  generateEmailOtp,
  generateSessionToken,
  hashOtp,
  hashSessionToken,
  otpExpiresAt,
  twoFaSessionExpiresAt,
} from "@/lib/auth/two-factor";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AuthActionResult = {
  success: boolean;
  error?: string;
};

export async function signInWithPassword(
  formData: FormData
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { success: false, error: "Email e password sono obbligatori." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { success: false, error: "Credenziali non valide." };
  }

  await sendEmailOtp();
  redirect("/verify-email");
}

export async function sendEmailOtp(): Promise<AuthActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { success: false, error: "Sessione non valida." };
  }

  const otp = generateEmailOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = otpExpiresAt();

  const service = createServiceClient();
  const { error: upsertError } = await service.from("user_second_factor").upsert(
    {
      user_id: user.id,
      method: "email",
      otp_hash: otpHash,
      otp_expires_at: expiresAt.toISOString(),
      otp_attempts: 0,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "user_id" }
  );

  if (upsertError) {
    return { success: false, error: "Impossibile generare il codice." };
  }

  // Invio email: integrare Resend / Supabase Edge Function in produzione
  if (process.env.NODE_ENV === "development") {
    console.info(`[DEV] OTP per ${user.email}: ${otp}`);
  }

  // TODO: invio email reale (Resend, SendGrid, Supabase Auth hooks)
  return { success: true };
}

export async function verifyEmailOtp(
  formData: FormData
): Promise<AuthActionResult> {
  const otp = String(formData.get("otp") ?? "").trim();

  if (!otp) {
    return { success: false, error: "Inserisci il codice ricevuto via email." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Sessione scaduta. Accedi di nuovo." };
  }

  const service = createServiceClient();
  const { data: factor, error: fetchError } = await service
    .from("user_second_factor")
    .select("otp_hash, otp_expires_at, otp_attempts")
    .eq("user_id", user.id)
    .single();

  // @ts-expect-error tipizzazione Supabase incompleta in build (factor inferito come never)
  if (fetchError || !factor?.otp_hash || !factor.otp_expires_at) {
    return { success: false, error: "Nessun codice attivo. Richiedine uno nuovo." };
  }

  if (factor.otp_attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Troppi tentativi. Richiedi un nuovo codice.",
    };
  }

  const expired = new Date(factor.otp_expires_at) < new Date();
  if (expired) {
    return { success: false, error: "Codice scaduto. Richiedine uno nuovo." };
  }

  const valid = hashOtp(otp) === factor.otp_hash;

  if (!valid) {
    await service
      .from("user_second_factor")
      .update({ otp_attempts: (factor.otp_attempts ?? 0) + 1 } as any)
      .eq("user_id", user.id);
    return { success: false, error: "Codice non corretto." };
  }

  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = twoFaSessionExpiresAt();

  await service.from("auth_sessions_2fa").insert({
    user_id: user.id,
    session_token_hash: sessionTokenHash,
    expires_at: expiresAt.toISOString(),
  } as any);

  await service
    .from("user_second_factor")
    .update({
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      verified_at: new Date().toISOString(),
    } as any)
    .eq("user_id", user.id);

  const cookieStore = await cookies();
  cookieStore.set(TWO_FA_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  const redirectTo = String(formData.get("redirect") ?? "/app/dashboard");
  redirect(redirectTo.startsWith("/app") ? redirectTo : "/app/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const token = cookieStore.get(TWO_FA_SESSION_COOKIE)?.value;
    if (token) {
      const service = createServiceClient();
      await service
        .from("auth_sessions_2fa")
        .delete()
        .eq("session_token_hash", hashSessionToken(token));
    }
  }

  cookieStore.delete(TWO_FA_SESSION_COOKIE);
  await supabase.auth.signOut();
  redirect("/login");
}
