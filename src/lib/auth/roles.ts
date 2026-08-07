import type { AppRoleCode, Profile } from "@/types/database";

export function getProfileRoleCode(profile: Profile): AppRoleCode | null {
  return profile.app_roles?.code ?? null;
}

export function isSuperadminProfile(profile: Profile): boolean {
  return getProfileRoleCode(profile) === "superadmin";
}

/**
 * Admin e superadmin condividono le stesse azioni del gestionale.
 * Distinzioni fine-grained verranno definite a fine progetto.
 */
export function isAdminLikeProfile(profile: Profile): boolean {
  const code = getProfileRoleCode(profile);
  return code === "superadmin" || code === "admin";
}
