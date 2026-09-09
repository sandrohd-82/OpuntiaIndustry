import { cookies } from "next/headers";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserArea } from "@/types/database";

export interface AuthContext {
  /** Identità con cui opera il gestionale (operatore se in switch). */
  userId: string;
  email: string;
  profile: Profile;
  areas: UserArea[];
  isSecondFactorVerified: boolean;
  /** Login reale (Super Admin anche durante lo switch). */
  actorUserId: string;
  actorProfile: Profile;
  impersonating: boolean;
  /** Login reale: deve ancora iscrivere Google Authenticator (primo accesso). */
  mustEnrollTotp: boolean;
  /** Login reale: messaggio di benvenuto non ancora visto. */
  welcomePending: boolean;
}

export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function isSecondFactorVerified(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWO_FA_SESSION_COOKIE)?.value;
  if (!token) return false;

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return false;

  const { hashSessionToken } = await import("@/lib/auth/two-factor");
  const tokenHash = hashSessionToken(token);

  const { data } = await supabase
    .from("auth_sessions_2fa")
    .select("id, expires_at")
    .eq("session_token_hash", tokenHash)
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return Boolean(data);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, app_roles(id, code, name, description)")
    .eq("id", userId)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function getUserAreas(userId: string): Promise<UserArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_areas", {
    p_user_id: userId,
  });

  if (error || !data) return [];
  return data as UserArea[];
}

async function getActiveImpersonationTargetId(
  actorUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
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

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const actorProfile = await getProfile(user.id);
  if (!actorProfile) return null;

  const targetId = await getActiveImpersonationTargetId(user.id);
  const effectiveId = targetId || user.id;
  const profile =
    effectiveId === user.id ? actorProfile : await getProfile(effectiveId);
  if (!profile) return null;

  const impersonating = Boolean(targetId);
  const [areas, secondFactorOk, factor] = await Promise.all([
    getUserAreas(effectiveId),
    isSecondFactorVerified(),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("user_second_factor")
        .select("method, totp_secret_encrypted")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    })(),
  ]);

  const totpReady =
    factor?.method === "app" && Boolean(factor.totp_secret_encrypted);
  const actorStato = parseProfileStatoOperativo(actorProfile.stato_operativo);
  const mustEnrollTotp =
    !impersonating &&
    actorStato === "operativo" &&
    Boolean(actorProfile.password_impostata_at) &&
    !totpReady;
  const welcomePending =
    !impersonating &&
    actorStato === "operativo" &&
    Boolean(actorProfile.password_impostata_at) &&
    totpReady &&
    !actorProfile.welcome_visto_at;

  return {
    userId: effectiveId,
    email: profile.email || user.email,
    profile,
    areas,
    isSecondFactorVerified: secondFactorOk,
    actorUserId: user.id,
    actorProfile,
    impersonating,
    mustEnrollTotp,
    welcomePending,
  };
}

export function userCanAccessArea(
  areas: UserArea[],
  slug: string
): boolean {
  return areas.some((a) => a.slug === slug);
}
