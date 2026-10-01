import { cache } from "react";
import {
  anagraficaLineageOrAziendaFilter,
  anagraficaLineageOrFilter,
  loadCommercialLineagePersonaIds,
  loadCommercialSelfPersonaIds,
  loadCommercialeOperatorContext,
  loadCommercialeUserIds,
} from "@/lib/auth/commerciale-lineage";
import {
  loadOwnedAziendaIds,
  loadOwnedPossibileIds,
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

/**
 * Preventivi e ordini di un commerciale: solo aziende del sottoalbero
 * (un'azienda affiancata resta del sottoposto) oppure, se non c'è azienda,
 * i documenti scritti dal sottoalbero.
 * `unrestricted` = Super Admin reale.
 */
export type PerimetroDocumenti =
  | { unrestricted: true }
  | {
      unrestricted: false;
      clienti: string[];
      possibili: string[];
      ownerIds: string[];
    };

export const resolvePerimetroDocumenti = cache(
  async (): Promise<PerimetroDocumenti> => {
    const ownerIds = await resolveAnagraficaOwnerUserIds();
    if (ownerIds === null) return { unrestricted: true };
    const auth = await getAuthContext();
    if (!auth) {
      return { unrestricted: false, clienti: [], possibili: [], ownerIds: [] };
    }
    const supabase = await createClient();
    const [clienti, possibili] = await Promise.all([
      loadOwnedAziendaIds(supabase, auth.userId, "clienti"),
      loadOwnedPossibileIds(supabase, auth.userId),
    ]);
    return { unrestricted: false, clienti, possibili, ownerIds };
  }
);

function inFilter(column: string, ids: string[]): string | null {
  if (!ids.length) return null;
  return `${column}.in.(${ids.join(",")})`;
}

function partiAzienda(p: Exclude<PerimetroDocumenti, { unrestricted: true }>) {
  const parts: string[] = [];
  const clienti = inFilter("cliente_id", p.clienti);
  if (clienti) parts.push(clienti);
  const possibili = inFilter("cliente_possibile_id", p.possibili);
  if (possibili) {
    parts.push(`and(cliente_id.is.null,${possibili})`);
  }
  return parts;
}

/** Filtro preventivi. `null` = nessun filtro (super admin) oppure nessun documento. */
export function perimetroPreventiviOr(p: PerimetroDocumenti): string | null {
  if (p.unrestricted) return null;
  const parts = partiAzienda(p);
  if (p.ownerIds.length) {
    const ids = p.ownerIds.join(",");
    parts.push(
      `and(cliente_id.is.null,cliente_possibile_id.is.null,or(created_by.in.(${ids}),commerciale_riferimento_id.in.(${ids})))`
    );
  }
  return parts.length ? parts.join(",") : null;
}

/** Filtro ordini. Senza commerciale di riferimento in testata. */
export function perimetroOrdiniOr(p: PerimetroDocumenti): string | null {
  if (p.unrestricted) return null;
  const parts = partiAzienda(p);
  if (p.ownerIds.length) {
    const ids = p.ownerIds.join(",");
    parts.push(
      `and(cliente_id.is.null,cliente_possibile_id.is.null,created_by.in.(${ids}))`
    );
  }
  return parts.length ? parts.join(",") : null;
}

export function rigaNelPerimetro(
  row: {
    cliente_id?: string | null;
    cliente_possibile_id?: string | null;
    created_by?: string | null;
    commerciale_riferimento_id?: string | null;
  },
  p: PerimetroDocumenti,
  opts?: { riferimento?: boolean }
): boolean {
  if (p.unrestricted) return true;
  const cliente = row.cliente_id ? String(row.cliente_id) : "";
  const possibile = row.cliente_possibile_id ? String(row.cliente_possibile_id) : "";
  if (cliente) return p.clienti.includes(cliente);
  if (possibile) return p.possibili.includes(possibile);
  const by = row.created_by ? String(row.created_by) : "";
  if (by && p.ownerIds.includes(by)) return true;
  if (opts?.riferimento) {
    const rif = row.commerciale_riferimento_id
      ? String(row.commerciale_riferimento_id)
      : "";
    if (rif && p.ownerIds.includes(rif)) return true;
  }
  return false;
}

/** Clausola `.or()` per elenchi clienti / possibili. `null` = nessun filtro. */
export async function anagraficaListOrClause(): Promise<string | null> {
  const vis = await resolveAnagraficaListVisibility();
  if (!vis.ownerIds) return null;
  const auth = await getAuthContext();
  const [personaIds, selfPersonaIds] = auth
    ? await Promise.all([
        loadCommercialLineagePersonaIds(auth.userId),
        loadCommercialSelfPersonaIds(auth.userId),
      ])
    : [[], []];
  const self = auth
    ? {
        userId: auth.userId,
        personaIds: selfPersonaIds,
        includeSubtreeAffiancati: true,
      }
    : undefined;
  if (!vis.includeAzienda) {
    return anagraficaLineageOrFilter(vis.ownerIds, personaIds, self);
  }
  const commercialIds = await loadCommercialeUserIds();
  return anagraficaLineageOrAziendaFilter(
    vis.ownerIds,
    commercialIds,
    personaIds,
    self
  );
}
