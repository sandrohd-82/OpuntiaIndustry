import { notFound, redirect } from "next/navigation";
import { AREA_ROUTES } from "@/lib/areas/config";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
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
