import { cache } from "react";
import { cookies } from "next/headers";
import { AREA_ROUTES } from "@/lib/areas/config";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { createClient } from "@/lib/supabase/server";
import type { AreaSlug, Profile, UserArea } from "@/types/database";

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
  /** Sempre false: il secondo fattore è solo OTP email, senza enrollment Authenticator. */
  mustEnrollTotp: boolean;
  /** Login reale: messaggio di benvenuto non ancora visto. */
  welcomePending: boolean;
}

export const getAuthUser = cache(async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

export const isSecondFactorVerified = cache(async function isSecondFactorVerified(
  userId?: string
): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWO_FA_SESSION_COOKIE)?.value;
  if (!token) return false;

  const uid = userId ?? (await getAuthUser())?.id;
  if (!uid) return false;

  const supabase = await createClient();
  const { hashSessionToken } = await import("@/lib/auth/two-factor");
  const tokenHash = hashSessionToken(token);

  const { data } = await supabase
    .from("auth_sessions_2fa")
    .select("id")
    .eq("session_token_hash", tokenHash)
    .eq("user_id", uid)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return Boolean(data);
});

export const getProfile = cache(async function getProfile(
  userId: string
): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, app_roles(id, code, name, description)")
    .eq("id", userId)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return data as Profile;
});

export const getUserAreas = cache(async function getUserAreas(
  userId: string
): Promise<UserArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_areas", {
    p_user_id: userId,
  });

  if (error || !data) return [];
  return data as UserArea[];
});

/** Tutte le aree attive: Super Admin le vede tutte, anche senza riga RBAC. */
export const getAllActiveAreas = cache(async function getAllActiveAreas(): Promise<UserArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("areas")
    .select("id, slug, name, description, icon, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (!error && data && data.length > 0) {
    return data.map((row) => ({
      area_id: String(row.id),
      slug: row.slug as AreaSlug,
      name: String(row.name ?? row.slug),
      description: row.description ? String(row.description) : null,
      icon: row.icon ? String(row.icon) : null,
      sort_order: Number(row.sort_order ?? 0),
    }));
  }
  return Object.entries(AREA_ROUTES).map(([slug, meta], i) => ({
    area_id: slug,
    slug: slug as AreaSlug,
    name: meta.label,
    description: meta.description,
    icon: null,
    sort_order: i,
  }));
});

const getActiveImpersonationTargetId = cache(async function getActiveImpersonationTargetId(
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
});

export const getAuthContext = cache(async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const [actorProfile, targetId, secondFactorOk] = await Promise.all([
    getProfile(user.id),
    getActiveImpersonationTargetId(user.id),
    isSecondFactorVerified(user.id),
  ]);
  if (!actorProfile) return null;

  const effectiveId = targetId || user.id;
  const profile =
    effectiveId === user.id ? actorProfile : await getProfile(effectiveId);
  if (!profile) return null;

  const impersonating = Boolean(targetId);
  const unrestricted = isUnrestrictedSuperadmin({
    profile,
    impersonating,
  });
  const areas = unrestricted
    ? await getAllActiveAreas()
    : await getUserAreas(effectiveId);

  const actorStato = parseProfileStatoOperativo(actorProfile.stato_operativo);
  const mustEnrollTotp = false;
  const welcomePending =
    !impersonating &&
    actorStato === "operativo" &&
    Boolean(actorProfile.password_impostata_at) &&
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
});

export function userCanAccessArea(
  areas: UserArea[],
  slug: string
): boolean {
  return areas.some((a) => a.slug === slug);
}
