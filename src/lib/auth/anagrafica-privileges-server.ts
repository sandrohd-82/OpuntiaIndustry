import { loadAccessMaps } from "@/app/actions/page-access";
import type { AnagraficaPrivilegeKind } from "@/lib/auth/action-access";
import { evaluateAnagraficaPrivilege } from "@/lib/auth/anagrafica-privileges";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";

export async function assertAnagraficaPrivilege(opts: {
  kind: AnagraficaPrivilegeKind;
  op: "timeline" | "update" | "delete";
  createdBy?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, error: "Non autenticato." };
  const bypass = isSuperadminProfile(auth.profile) && !auth.impersonating;
  if (bypass) return { ok: true };

  const { actionAccess } = await loadAccessMaps(auth.userId);
  return evaluateAnagraficaPrivilege({
    actionAccess,
    userId: auth.userId,
    kind: opts.kind,
    op: opts.op,
    createdBy: opts.createdBy,
  });
}

export { kindFromAziendaTipo } from "@/lib/auth/anagrafica-privileges";
