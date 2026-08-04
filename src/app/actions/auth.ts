"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  TWO_FA_SESSION_COOKIE,
} from "@/lib/auth/constants";
import {
  decryptTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/totp";
import {
  generateEmailOtp,
  generateSessionToken,
  hashOtp,
  hashSessionToken,
  otpExpiresAt,
  twoFaSessionExpiresAt,
} from "@/lib/auth/two-factor";
import { sendOtpEmail } from "@/lib/email/smtp";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  AuthSession2faInsert,
  SecondFactorMethod,
  UserSecondFactorInsert,
  UserSecondFactorUpdate,
} from "@/types/database";

export type AuthActionResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
  /** Metodo 2FA attivo dopo login */
  secondFactorMethod?: SecondFactorMethod;
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Sessione non valida dopo il login." };
    }

    const service = createServiceClient();
    const { data: factor } = await service
      .from("user_second_factor")
      .select("method, totp_secret_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    const method: SecondFactorMethod =
      factor?.method === "app" && factor.totp_secret_encrypted
        ? "app"
        : "email";

    if (method === "app") {
      return {
        success: true,
        redirectTo: "/verify-email",
        secondFactorMethod: "app",
      };
    }

    const otpResult = await sendEmailOtp();
    if (!otpResult.success) {
      return otpResult;
    }

    return {
      success: true,
      redirectTo: "/verify-email",
      secondFactorMethod: "email",
    };
  } catch (error) {
    console.error("signInWithPassword failed:", error);
    return {
      success: false,
      error:
        "Errore interno durante il login. Verifica le variabili Vercel (SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
}

async function issueTwoFaSession(userId: string, redirectRaw: string) {
  const service = createServiceClient();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = twoFaSessionExpiresAt();

  const sessionInsert: AuthSession2faInsert = {
    user_id: userId,
    session_token_hash: sessionTokenHash,
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

  const redirectTo = redirectRaw.startsWith("/app")
    ? redirectRaw
    : "/app/dashboard";
  return { success: true as const, redirectTo };
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
    // Non toccare method/totp_secret: se Authenticator è attivo non si passa da qui
    const otpUpsert: UserSecondFactorInsert = {
      user_id: user.id,
      otp_hash: otpHash,
      otp_expires_at: expiresAt.toISOString(),
      otp_attempts: 0,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await service
      .from("user_second_factor")
      .upsert(otpUpsert, { onConflict: "user_id" });

    if (upsertError) {
      return {
        success: false,
        error: `Impossibile generare il codice. (${upsertError.message})`,
      };
    }

    try {
      await sendOtpEmail(user.email, otp);
    } catch (mailError) {
      console.error("sendOtpEmail failed:", mailError);
      return {
        success: false,
        error:
          "Impossibile inviare l'email con il codice. Verifica SMTP (Aruba) sulle variabili d'ambiente.",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("sendEmailOtp failed:", error);
    return {
      success: false,
      error:
        "Errore OTP lato server. Controlla Supabase e le variabili SMTP su Vercel.",
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

  const redirectTo = String(formData.get("redirect") ?? "/app/dashboard");
  return issueTwoFaSession(user.id, redirectTo);
}

export async function getSecondFactorMethod(): Promise<SecondFactorMethod> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "email";

  const service = createServiceClient();
  const { data } = await service
    .from("user_second_factor")
    .select("method, totp_secret_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data?.method === "app" && data.totp_secret_encrypted) {
    return "app";
  }
  return "email";
}

export async function verifyAppTotp(
  formData: FormData
): Promise<AuthActionResult> {
  const otp = String(formData.get("otp") ?? "").trim();

  if (!/^\d{6}$/.test(otp)) {
    return {
      success: false,
      error: "Inserisci il codice a 6 cifre di Google Authenticator.",
    };
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
    .select("method, totp_secret_encrypted, otp_attempts")
    .eq("user_id", user.id)
    .single();

  if (
    fetchError ||
    factor?.method !== "app" ||
    !factor.totp_secret_encrypted
  ) {
    return {
      success: false,
      error: "Google Authenticator non attivo per questo account.",
    };
  }

  if ((factor.otp_attempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Troppi tentativi. Riprova più tardi o contatta un amministratore.",
    };
  }

  try {
    const secret = decryptTotpSecret(factor.totp_secret_encrypted);
    const valid = verifyTotpCode(secret, otp);

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

    await service
      .from("user_second_factor")
      .update({
        otp_attempts: 0,
        verified_at: new Date().toISOString(),
      } satisfies UserSecondFactorUpdate)
      .eq("user_id", user.id);

    const redirectTo = String(formData.get("redirect") ?? "/app/dashboard");
    return issueTwoFaSession(user.id, redirectTo);
  } catch (error) {
    console.error("verifyAppTotp failed:", error);
    return {
      success: false,
      error: "Errore durante la verifica Authenticator.",
    };
  }
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
