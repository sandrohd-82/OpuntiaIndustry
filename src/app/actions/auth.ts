"use server";

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
import type {
  AuthSession2faInsert,
  UserSecondFactorInsert,
  UserSecondFactorUpdate,
} from "@/types/database";

export type AuthActionResult = {
  success: boolean;
  error?: string;
};

/** Riga OTP da user_second_factor (cast per tipi Supabase in build CI) */
type OtpFactorRow = {
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
};

export async function signInWithPassword(
  formData: FormData
): Promise<AuthActionResult> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return { success: false, error: "Email e password sono obbligatori." };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return {
        success: false,
        error: `Credenziali non valide. (${error.message})`,
      };
    }

    const otpResult = await sendEmailOtp();
    if (!otpResult.success) {
      return otpResult;
    }

    redirect("/verify-email");
  } catch (error) {
    console.error("signInWithPassword failed:", error);
    return {
      success: false,
      error:
        "Errore interno durante il login. Verifica le variabili Vercel (SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
}

export async function sendEmailOtp(): Promise<AuthActionResult> {
  try {
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
    const otpUpsert: UserSecondFactorInsert = {
      user_id: user.id,
      method: "email",
      otp_hash: otpHash,
      otp_expires_at: expiresAt.toISOString(),
      otp_attempts: 0,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await service
      .from("user_second_factor")
      .upsert(otpUpsert, { onConflict: "user_id" });

    if (upsertError) {
      return { success: false, error: "Impossibile generare il codice." };
    }

    // Invio email: integrare Resend / Supabase Edge Function in produzione
    if (process.env.NODE_ENV === "development") {
      console.info(`[DEV] OTP per ${user.email}: ${otp}`);
    }

    // TODO: invio email reale (Resend, SendGrid, Supabase Auth hooks)
    return { success: true };
  } catch (error) {
    console.error("sendEmailOtp failed:", error);
    return {
      success: false,
      error:
        "Errore OTP lato server. Controlla le env su Vercel (URL, ANON KEY, SERVICE ROLE KEY).",
    };
  }
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
  const { data: factorData, error: fetchError } = await service
    .from("user_second_factor")
    .select("otp_hash, otp_expires_at, otp_attempts")
    .eq("user_id", user.id)
    .single();

  const factor = factorData as OtpFactorRow | null;

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
    const attemptUpdate: UserSecondFactorUpdate = {
      otp_attempts: (factor.otp_attempts ?? 0) + 1,
    };
    await service
      .from("user_second_factor")
      .update(attemptUpdate)
      .eq("user_id", user.id);
    return { success: false, error: "Codice non corretto." };
  }

  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = twoFaSessionExpiresAt();

  const sessionInsert: AuthSession2faInsert = {
    user_id: user.id,
    session_token_hash: sessionTokenHash,
    expires_at: expiresAt.toISOString(),
  };
  await service.from("auth_sessions_2fa").insert(sessionInsert);

  const factorClear: UserSecondFactorUpdate = {
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    verified_at: new Date().toISOString(),
  };
  await service
    .from("user_second_factor")
    .update(factorClear)
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
