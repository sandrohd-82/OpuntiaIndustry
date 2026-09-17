import { loadAccessMaps } from "@/app/actions/page-access";
import { canModificaFatturaAccess } from "@/lib/auth/action-access";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";

export type ModificaFatturaVia =
  | "superadmin"
  | "privilegio_doppia_conferma";

export async function assertModificaFatturaPrivilege(): Promise<
  | { ok: true; via: ModificaFatturaVia }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, error: "Non autenticato." };

  const isSuperadminSelf =
    isSuperadminProfile(auth.profile) && !auth.impersonating;
  if (isSuperadminSelf) {
    return { ok: true, via: "superadmin" };
  }

  const { actionAccess } = await loadAccessMaps(auth.userId);
  if (
    canModificaFatturaAccess({
      isSuperadminSelf: false,
      actionAccess,
    })
  ) {
    return { ok: true, via: "privilegio_doppia_conferma" };
  }

  return {
    ok: false,
    error:
      "La modifica di una fattura è consentita solo al Super Admin o a un operatore con il privilegio «Modifica fattura» (accensione con doppia conferma).",
  };
}

export async function canCurrentUserModificaFattura(): Promise<boolean> {
  const gate = await assertModificaFatturaPrivilege();
  return gate.ok;
}
