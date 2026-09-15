import { parseProfilePotere } from "@/lib/auth/gerarchia";
import type { AppRoleCode, Profile } from "@/types/database";

export function getProfileRoleCode(profile: Profile): AppRoleCode | null {
  return profile.app_roles?.code ?? null;
}

export function isSuperadminProfile(profile: Profile): boolean {
  return (
    getProfileRoleCode(profile) === "superadmin" ||
    parseProfilePotere(profile.potere) === "superadmin"
  );
}

/** Super Admin sul proprio profilo: nessun filtro pagine, aree o lucchetti. */
export function isUnrestrictedSuperadmin(auth: {
  profile: Profile;
  impersonating: boolean;
}): boolean {
  return isSuperadminProfile(auth.profile) && !auth.impersonating;
}

/**
 * Admin e superadmin condividono le stesse azioni del gestionale.
 * Distinzioni fine-grained verranno definite a fine progetto.
 */
export function isAdminLikeProfile(profile: Profile): boolean {
  const code = getProfileRoleCode(profile);
  return (
    code === "superadmin" ||
    code === "admin" ||
    parseProfilePotere(profile.potere) === "superadmin"
  );
}

/**
 * Gestione listino (bozze, revisione, in uso): solo admin/superadmin
 * sul profilo con cui si sta operando. Un commerciale, anche in switch,
 * vede solo il listino in carica in sola lettura.
 */
export function canApprovareListino(auth: { profile: Profile }): boolean {
  return (
    isAdminLikeProfile(auth.profile) || isSuperadminProfile(auth.profile)
  );
}
