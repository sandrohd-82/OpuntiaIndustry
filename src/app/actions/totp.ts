"use server";

import { EMAIL_OTP_MAX_ATTEMPTS } from "@/lib/auth/constants";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { getProfile } from "@/lib/auth/session";
import { hashOtp } from "@/lib/auth/two-factor";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { UserSecondFactorUpdate } from "@/types/database";

export type TotpActionResult = {
  success: boolean;
  error?: string;
  secret?: string;
  otpauthUrl?: string;
  enabled?: boolean;
};

const EMAIL_ONLY_MESSAGE =
  "Google Authenticator non è più utilizzato. Il secondo fattore è solo il codice OTP inviato via email.";

async function requireAdminLike() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Sessione non valida." as const, user: null, profile: null };
  }

  const profile = await getProfile(user.id);
  if (!profile || !isAdminLikeProfile(profile)) {
    return {
      error: "Solo admin e superadmin possono gestire le impostazioni di accesso." as const,
      user: null,
      profile: null,
    };
  }

  return { error: null, user, profile };
}

export async function getTotpStatus(): Promise<TotpActionResult> {
  const gate = await requireAdminLike();
  if (gate.error || !gate.user) {
    return { success: false, error: gate.error ?? "Accesso negato." };
  }
  return { success: true, enabled: false };
}

export async function startTotpEnrollment(): Promise<TotpActionResult> {
  return { success: false, error: EMAIL_ONLY_MESSAGE };
}

export async function confirmTotpEnrollment(): Promise<TotpActionResult> {
  return { success: false, error: EMAIL_ONLY_MESSAGE };
}

/** Forza method = email e cancella eventuali secret TOTP residui. */
export async function disableTotp(): Promise<TotpActionResult> {
  try {
    const gate = await requireAdminLike();
    if (gate.error || !gate.user) {
      return { success: false, error: gate.error ?? "Accesso negato." };
    }

    const service = createServiceClient();
    const update: UserSecondFactorUpdate = {
      method: "email",
      totp_secret_encrypted: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await service
      .from("user_second_factor")
      .update(update)
      .eq("user_id", gate.user.id);

    if (error) {
      return {
        success: false,
        error: `Aggiornamento fallito. (${error.message})`,
      };
    }

    return { success: true, enabled: false };
  } catch (error) {
    console.error("disableTotp failed:", error);
    return { success: false, error: "Errore durante l'allineamento OTP email." };
  }
}

/** Verifica l’OTP email dell’utente corrente (azioni critiche, es. listini). */
export async function verifyCurrentUserTotp(
  userId: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = String(code ?? "").trim();
  if (!/^\d{6}$/.test(token)) {
    return { ok: false, error: "Inserisci il codice OTP a 6 cifre ricevuto via email." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return { ok: false, error: "Sessione non valida." };
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("user_second_factor")
    .select("otp_hash, otp_expires_at, otp_attempts")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.otp_hash || !data.otp_expires_at) {
    return {
      ok: false,
      error: "Nessun codice attivo. Richiedi un nuovo OTP via email.",
    };
  }
  if ((data.otp_attempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Troppi tentativi. Richiedi un nuovo codice." };
  }
  if (new Date(String(data.otp_expires_at)) < new Date()) {
    return { ok: false, error: "Codice scaduto. Richiedine uno nuovo via email." };
  }
  if (hashOtp(token) !== data.otp_hash) {
    await service
      .from("user_second_factor")
      .update({
        otp_attempts: (data.otp_attempts ?? 0) + 1,
        method: "email",
        totp_secret_encrypted: null,
      } satisfies UserSecondFactorUpdate)
      .eq("user_id", userId);
    return { ok: false, error: "Codice OTP non corretto." };
  }

  await service
    .from("user_second_factor")
    .update({
      method: "email",
      totp_secret_encrypted: null,
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies UserSecondFactorUpdate)
    .eq("user_id", userId);

  return { ok: true };
}
