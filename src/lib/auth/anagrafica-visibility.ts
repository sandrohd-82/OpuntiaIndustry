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
 * Preventivi e ordini di un commerciale: aziende del sottoalbero
 * (un'azienda affiancata resta del sottoposto) e, in più, i documenti
 * di cui lui è l'autore o il commerciale di riferimento.
 * Gli ordini includono anche quelli creati dai sottoposti, anche se
 * l'azienda è affiancata o il documento non ha un cliente (invio a un commerciale).
 * `unrestricted` = Super Admin reale.
 */
export type PerimetroDocumenti =
  | { unrestricted: true }
  | {
      unrestricted: false;
      clienti: string[];
      possibili: string[];
      ownerIds: string[];
      selfId: string;
      /** Preventivi di cui l'operatore è autore o commerciale di riferimento. */
      preventiviPropri: string[];
    };

export const resolvePerimetroDocumenti = cache(
  async (): Promise<PerimetroDocumenti> => {
    const ownerIds = await resolveAnagraficaOwnerUserIds();
    if (ownerIds === null) return { unrestricted: true };
    const auth = await getAuthContext();
    if (!auth) {
      return {
        unrestricted: false,
        clienti: [],
        possibili: [],
        ownerIds: [],
        selfId: "",
        preventiviPropri: [],
      };
    }
    const supabase = await createClient();
    const [clienti, possibili, preventivi] = await Promise.all([
      loadOwnedAziendaIds(supabase, auth.userId, "clienti"),
      loadOwnedPossibileIds(supabase, auth.userId),
      supabase
        .from("preventivi")
        .select("id")
        .is("deleted_at", null)
        .or(
          `commerciale_riferimento_id.eq.${auth.userId},created_by.eq.${auth.userId}`
        )
        .limit(1000),
    ]);
    const preventiviPropri = (preventivi.data ?? [])
      .map((row) => String((row as { id?: string }).id ?? ""))
      .filter(Boolean);
    return {
      unrestricted: false,
      clienti,
      possibili,
      ownerIds,
      selfId: auth.userId,
      preventiviPropri,
    };
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
  if (p.selfId) {
    parts.push(`created_by.eq.${p.selfId}`);
    parts.push(`commerciale_riferimento_id.eq.${p.selfId}`);
  }
  return parts.length ? parts.join(",") : null;
}

/**
 * Filtro ordini e campionature.
 * Il commerciale vede i documenti delle sue aziende, quelli che ha creato lui
 * (anche collegati a un sottoposto o senza cliente) e tutti quelli creati
 * dal sottoalbero. Non vede i documenti dei superiori.
 */
export function perimetroOrdiniOr(p: PerimetroDocumenti): string | null {
  if (p.unrestricted) return null;
  const parts = partiAzienda(p);
  if (p.ownerIds.length) {
    parts.push(`created_by.in.(${p.ownerIds.join(",")})`);
  } else if (p.selfId) {
    parts.push(`created_by.eq.${p.selfId}`);
  }
  return parts.length ? parts.join(",") : null;
}

/** Ordini: aggiunge quelli nati da un preventivo di cui l'operatore è il commerciale. */
export function perimetroOrdiniConPreventivi(p: PerimetroDocumenti): string | null {
  const base = perimetroOrdiniOr(p);
  if (p.unrestricted) return null;
  const legati = inFilter("preventivo_id", p.preventiviPropri);
  if (!legati) return base;
  return base ? `${base},${legati}` : legati;
}

export function rigaNelPerimetro(
  row: {
    cliente_id?: string | null;
    cliente_possibile_id?: string | null;
    created_by?: string | null;
    commerciale_riferimento_id?: string | null;
    preventivo_id?: string | null;
  },
  p: PerimetroDocumenti,
  opts?: { riferimento?: boolean; autoriSottoalbero?: boolean }
): boolean {
  if (p.unrestricted) return true;
  const cliente = row.cliente_id ? String(row.cliente_id) : "";
  const possibile = row.cliente_possibile_id ? String(row.cliente_possibile_id) : "";
  if (cliente && p.clienti.includes(cliente)) return true;
  if (!cliente && possibile && p.possibili.includes(possibile)) return true;
  const by = row.created_by ? String(row.created_by) : "";
  if (
    by &&
    p.ownerIds.includes(by) &&
    ((!cliente && !possibile) || opts?.autoriSottoalbero)
  ) {
    return true;
  }
  if (!cliente && !possibile && opts?.riferimento) {
    const rif = row.commerciale_riferimento_id
      ? String(row.commerciale_riferimento_id)
      : "";
    if (rif && p.ownerIds.includes(rif)) return true;
  }
  if (p.selfId && by === p.selfId) return true;
  if (opts?.riferimento && p.selfId) {
    const rif = row.commerciale_riferimento_id
      ? String(row.commerciale_riferimento_id)
      : "";
    if (rif === p.selfId) return true;
  }
  const preventivoId = row.preventivo_id ? String(row.preventivo_id) : "";
  if (preventivoId && p.preventiviPropri.includes(preventivoId)) return true;
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
