import { cache } from "react";
import { loadCommercialeOperatorContext } from "@/lib/auth/commerciale-lineage";
import { resolveScopeMode } from "@/lib/auth/data-scope-enforce";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";

/**
 * Chi può comparire come titolare anagrafica (created_by / commerciale_id).
 * `null` = nessuna restrizione (Super Admin reale).
 * `[]` = autenticazione assente: zero aziende.
 *
 * Un commerciale vede sempre solo il proprio sottoalbero, in ogni area,
 * anche se lo scope è «tutte». Mai i superiori.
 */
export const resolveAnagraficaOwnerUserIds = cache(
  async (): Promise<string[] | null> => {
    const auth = await getAuthContext();
    if (!auth) return [];
    const skip = isSuperadminProfile(auth.profile) && !auth.impersonating;
    if (skip) return null;
    const op = await loadCommercialeOperatorContext(auth.userId);
    if (op.isCommerciale) return op.subtreeIds;
    const scope = await resolveScopeMode("anagrafiche_clienti");
    if (scope && !scope.skip && scope.mode === "proprie") {
      return op.subtreeIds.length > 0 ? op.subtreeIds : [auth.userId];
    }
    return null;
  }
);
