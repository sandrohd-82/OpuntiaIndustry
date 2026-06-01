import { cookies } from "next/headers";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserArea } from "@/types/database";

export interface AuthContext {
  userId: string;
  email: string;
  profile: Profile;
  areas: UserArea[];
  isSecondFactorVerified: boolean;
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

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const profile = await getProfile(user.id);
  if (!profile) return null;

  const [areas, secondFactorOk] = await Promise.all([
    getUserAreas(user.id),
    isSecondFactorVerified(),
  ]);

  return {
    userId: user.id,
    email: user.email,
    profile,
    areas,
    isSecondFactorVerified: secondFactorOk,
  };
}

export function userCanAccessArea(
  areas: UserArea[],
  slug: string
): boolean {
  return areas.some((a) => a.slug === slug);
}
