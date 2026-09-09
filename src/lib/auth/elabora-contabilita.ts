import { canElaboraContabilitaAccess } from "@/lib/auth/action-access";
import { loadAccessMaps } from "@/app/actions/page-access";
import { loadProfileAuthBundle } from "@/lib/auth/data-scope-enforce";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";

export async function assertElaboraContabilita(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) {
    return { ok: false, error: "Non autenticato." };
  }
  const [{ settings }, { actionAccess }] = await Promise.all([
    loadProfileAuthBundle(auth.userId),
    loadAccessMaps(auth.userId),
  ]);
  const allowed = canElaboraContabilitaAccess({
    isSuperadminSelf:
      isSuperadminProfile(auth.profile) && !auth.impersonating,
    isCommercialista: settings.isCommercialista,
    actionAccess,
  });
  if (!allowed) {
    return {
      ok: false,
      error:
        "Elabora contabilità è riservata al commercialista o al Super Admin.",
    };
  }
  return { ok: true };
}
