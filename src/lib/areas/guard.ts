import { notFound, redirect } from "next/navigation";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  isAdminLikeProfile,
  isSuperadminProfile,
} from "@/lib/auth/roles";
import { AREA_ROUTES } from "@/lib/areas/config";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import type { AreaSlug } from "@/types/database";

export function isTestImpersonation(auth: {
  impersonating: boolean;
  profile: { stato_operativo?: string | null };
}): boolean {
  return (
    auth.impersonating &&
    parseProfileStatoOperativo(auth.profile.stato_operativo) === "test"
  );
}

export async function requireAnyAreaAccess(slugs: AreaSlug[]) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.mustEnrollTotp) redirect("/primo-accesso/2fa");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  if (isTestImpersonation(auth)) return { auth };
  if (!slugs.some((s) => userCanAccessArea(auth.areas, s))) {
    notFound();
  }
  return { auth };
}

export async function requireAreaAccess(slug: AreaSlug) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.mustEnrollTotp) redirect("/primo-accesso/2fa");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");

  if (isTestImpersonation(auth)) {
    return { auth, meta: AREA_ROUTES[slug] };
  }

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
  if (auth.mustEnrollTotp) redirect("/primo-accesso/2fa");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  if (isTestImpersonation(auth)) {
    return { auth, meta: AREA_ROUTES.webmail };
  }

  const ok =
    isAdminLikeProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "webmail") ||
    userCanAccessArea(auth.areas, "commerciale") ||
    userCanAccessArea(auth.areas, "amministrazione");

  if (!ok) notFound();
  return { auth, meta: AREA_ROUTES.webmail };
}

/**
 * Pagina Archivio: serve l’area Archivio e l’area di origine della voce.
 */
export async function requireArchivioSource(
  source: AreaSlug | "webmail"
) {
  const { auth } = await requireAreaAccess("archivio");

  if (source === "webmail") {
    const ok =
      isAdminLikeProfile(auth.profile) ||
      userCanAccessArea(auth.areas, "webmail") ||
      userCanAccessArea(auth.areas, "commerciale") ||
      userCanAccessArea(auth.areas, "amministrazione");
    if (!ok) notFound();
    return { auth };
  }

  if (!userCanAccessArea(auth.areas, source)) {
    notFound();
  }
  return { auth };
}

/** Solo SuperAdmin (es. collegamento caselle ↔ profili). */
export async function requireSuperadmin() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.mustEnrollTotp) redirect("/primo-accesso/2fa");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  if (!isSuperadminProfile(auth.profile)) notFound();
  return { auth };
}
