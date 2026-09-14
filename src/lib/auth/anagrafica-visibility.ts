import { cache } from "react";
import {
  anagraficaLineageOrAziendaFilter,
  anagraficaLineageOrFilter,
  loadCommercialeOperatorContext,
  loadCommercialeUserIds,
} from "@/lib/auth/commerciale-lineage";
import {
  loadOwnedAziendaIds,
  resolveScopeMode,
} from "@/lib/auth/data-scope-enforce";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type AnagraficaListVisibility = {
  /** `null` = nessuna restrizione (Super Admin reale / scope tutte). */
  ownerIds: string[] | null;
  /** Senior (o commerciale con subordinati): anche le schede «Azienda». */
  includeAzienda: boolean;
};

/**
 * Chi può comparire come titolare anagrafica (created_by / commerciale_id).
 * `null` = nessuna restrizione (Super Admin reale).
 * `[]` = autenticazione assente: zero aziende.
 *
 * Un commerciale vede sempre solo il proprio sottoalbero, in ogni area,
 * anche se lo scope è «tutte». Mai i superiori.
 * Senior / capo-team: in elenco può anche vedere le schede «Azienda»
 * (solo dati primari: timeline/fatture/modifica restano sui privilegi).
 */
export const resolveAnagraficaListVisibility = cache(
  async (): Promise<AnagraficaListVisibility> => {
    const auth = await getAuthContext();
    if (!auth) return { ownerIds: [], includeAzienda: false };
    const skip = isSuperadminProfile(auth.profile) && !auth.impersonating;
    if (skip) return { ownerIds: null, includeAzienda: true };
    const op = await loadCommercialeOperatorContext(auth.userId);
    const hasSubordinates = op.subtreeIds.some((id) => id !== auth.userId);
    const canSeeAziendaInElenco =
      op.grado === "senior" || hasSubordinates;
    if (op.isCommerciale) {
      return {
        ownerIds: op.subtreeIds,
        includeAzienda: canSeeAziendaInElenco,
      };
    }
    const scope = await resolveScopeMode("anagrafiche_clienti");
    if (scope && !scope.skip && scope.mode === "proprie") {
      return {
        ownerIds: op.subtreeIds.length > 0 ? op.subtreeIds : [auth.userId],
        includeAzienda: false,
      };
    }
    return { ownerIds: null, includeAzienda: true };
  }
);

export const resolveAnagraficaOwnerUserIds = cache(
  async (): Promise<string[] | null> => {
    return (await resolveAnagraficaListVisibility()).ownerIds;
  }
);

/**
 * Aziende visibili per conteggi/elenchi collegati (ordini, campionature).
 * `null` = nessuna restrizione. `[]` = zero aziende (elenco e pallini a 0).
 * Un commerciale vede solo le aziende del sottoalbero (collegate a lui).
 */
export const resolveVisibleClienteIds = cache(
  async (): Promise<string[] | null> => {
    const ownerUserIds = await resolveAnagraficaOwnerUserIds();
    if (ownerUserIds === null) return null;
    const auth = await getAuthContext();
    if (!auth) return [];
    const supabase = await createClient();
    return loadOwnedAziendaIds(supabase, auth.userId, "clienti");
  }
);

/** Clausola `.or()` per elenchi clienti / possibili. `null` = nessun filtro. */
export async function anagraficaListOrClause(): Promise<string | null> {
  const vis = await resolveAnagraficaListVisibility();
  if (!vis.ownerIds) return null;
  if (!vis.includeAzienda) return anagraficaLineageOrFilter(vis.ownerIds);
  const commercialIds = await loadCommercialeUserIds();
  return anagraficaLineageOrAziendaFilter(vis.ownerIds, commercialIds);
}
