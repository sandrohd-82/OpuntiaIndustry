import { notFound, redirect } from "next/navigation";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { AREA_ROUTES } from "@/lib/areas/config";
import type { AreaSlug } from "@/types/database";

export async function requireAreaAccess(slug: AreaSlug) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");

  if (!userCanAccessArea(auth.areas, slug)) {
    notFound();
  }

  return { auth, meta: AREA_ROUTES[slug] };
}

/**
 * Accesso hub WebMail: area webmail, oppure commerciale/amministrazione (legacy).
 */
export async function requireWebmailAccess() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");

  const ok =
    isAdminLikeProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "webmail") ||
    userCanAccessArea(auth.areas, "commerciale") ||
    userCanAccessArea(auth.areas, "amministrazione");

  if (!ok) notFound();
  return { auth, meta: AREA_ROUTES.webmail };
}
