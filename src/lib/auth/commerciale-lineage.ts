import { cache } from "react";
import {
  isRepartoCommerciale,
  parseCommercialeGrado,
  type CommercialeGrado,
} from "@/lib/auth/commerciale";
import { createServiceClient } from "@/lib/supabase/server";

type PersonaLink = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  co_parent_ids: string[] | null;
};

function parentIdsOf(p: PersonaLink): string[] {
  return [
    ...new Set(
      [p.parent_id, ...(p.co_parent_ids ?? [])].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
}

/**
 * Io + subordinati in organigramma. Mai i superiori:
 * un agente non vede le aziende del Senior, il Senior non vede un gradino sopra.
 */
export const loadCommercialLineageUserIds = cache(
  async (userId: string): Promise<string[]> => {
    const mine = String(userId ?? "").trim();
    if (!mine) return [];

    const service = createServiceClient();
    const { data } = await service
      .from("organigramma_persone")
      .select("id, user_id, parent_id, co_parent_ids")
      .is("deleted_at", null);

    const rows = (data ?? []) as PersonaLink[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const me = rows.find((r) => r.user_id === mine);
    if (!me) return [mine];

    const children = new Map<string, string[]>();
    for (const r of rows) {
      for (const pid of parentIdsOf(r)) {
        const list = children.get(pid) ?? [];
        list.push(r.id);
        children.set(pid, list);
      }
    }

    const subtree = new Set<string>();
    const walkDown = (id: string, guard = 0) => {
      if (guard > 200 || subtree.has(id)) return;
      subtree.add(id);
      for (const cid of children.get(id) ?? []) walkDown(cid, guard + 1);
    };
    walkDown(me.id);

    const userIds = new Set<string>([mine]);
    for (const id of subtree) {
      const uid = byId.get(id)?.user_id;
      if (uid) userIds.add(uid);
    }
    return [...userIds];
  }
);

export type CommercialeOperatorContext = {
  isCommerciale: boolean;
  grado: CommercialeGrado | null;
  subtreeIds: string[];
};

/** Profilo commerciale (grado o reparto), con il suo sottoalbero. */
export const loadCommercialeOperatorContext = cache(
  async (userId: string): Promise<CommercialeOperatorContext> => {
    const mine = String(userId ?? "").trim();
    const subtreeIds = mine ? await loadCommercialLineageUserIds(mine) : [];
    if (!mine) {
      return { isCommerciale: false, grado: null, subtreeIds: [] };
    }

    const service = createServiceClient();
    const [{ data: profile }, { data: persone }, { data: fromReparto }] =
      await Promise.all([
        service
          .from("profiles")
          .select("commerciale_grado")
          .eq("id", mine)
          .maybeSingle(),
        service
          .from("organigramma_persone")
          .select("commerciale_grado, reparto_id")
          .eq("user_id", mine)
          .is("deleted_at", null),
        service
          .from("profile_reparti")
          .select("id")
          .eq("profile_id", mine)
          .eq("codice", "commerciale")
          .is("deleted_at", null)
          .limit(1),
      ]);

    const personaRows = (persone ?? []) as Array<{
      commerciale_grado?: string | null;
      reparto_id?: string | null;
    }>;
    let grado = parseCommercialeGrado(
      (profile as { commerciale_grado?: string | null } | null)
        ?.commerciale_grado
    );
    for (const row of personaRows) {
      grado = parseCommercialeGrado(row.commerciale_grado) ?? grado;
    }

    let inReparto = (fromReparto ?? []).length > 0;
    const repartoIds = [
      ...new Set(
        personaRows
          .map((row) => String(row.reparto_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    if (!inReparto && repartoIds.length > 0) {
      const { data: reparti } = await service
        .from("organigramma_reparti")
        .select("codice, nome")
        .in("id", repartoIds)
        .is("deleted_at", null);
      inReparto = (reparti ?? []).some((row) => isRepartoCommerciale(row));
    }

    return {
      isCommerciale: Boolean(grado) || inReparto,
      grado,
      subtreeIds: subtreeIds.length > 0 ? subtreeIds : [mine],
    };
  }
);

/** Super Admin: non diventano «area commerciale» se creano un’anagrafica. */
export async function loadSuperadminUserIds(): Promise<Set<string>> {
  const service = createServiceClient();
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    service.from("app_roles").select("id, code").eq("code", "superadmin"),
    service.from("profiles").select("id, potere, role_id"),
  ]);
  const roleIds = new Set(
    (roles ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean)
  );
  const ids = new Set<string>();
  for (const p of profiles ?? []) {
    const row = p as {
      id?: string;
      potere?: string | null;
      role_id?: string | null;
    };
    const uid = String(row.id ?? "");
    if (!uid) continue;
    if (row.potere === "superadmin" || (row.role_id && roleIds.has(row.role_id))) {
      ids.add(uid);
    }
  }
  return ids;
}

/**
 * Stesso insieme del picker Super Admin: persone in organigramma con utente,
 * più reparto/grado commerciale. Esclude i Super Admin.
 */
export async function loadCommercialeUserIds(): Promise<Set<string>> {
  const service = createServiceClient();
  const [{ data: persone }, { data: fromReparti }, { data: graded }, supers] =
    await Promise.all([
      service
        .from("organigramma_persone")
        .select("user_id, commerciale_grado")
        .is("deleted_at", null)
        .not("user_id", "is", null),
      service
        .from("profile_reparti")
        .select("profile_id")
        .eq("codice", "commerciale")
        .is("deleted_at", null),
      service
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .not("commerciale_grado", "is", null),
      loadSuperadminUserIds(),
    ]);

  const ids = new Set<string>();
  for (const p of persone ?? []) {
    const uid = String((p as { user_id?: string }).user_id ?? "");
    if (uid) ids.add(uid);
  }
  for (const r of fromReparti ?? []) {
    const uid = String((r as { profile_id?: string }).profile_id ?? "");
    if (uid) ids.add(uid);
  }
  for (const p of graded ?? []) {
    const uid = String((p as { id?: string }).id ?? "");
    if (uid) ids.add(uid);
  }
  for (const id of supers) ids.delete(id);
  return ids;
}

export async function resolveDefaultCommercialeId(opts: {
  userId: string;
  isSuperadmin: boolean;
  explicitId?: string | null;
  /** Lead: chi lo inserisce (non Super Admin) ne è titolare. */
  anyNonSuperadmin?: boolean;
}): Promise<string | null> {
  const explicit = opts.explicitId?.trim() || null;
  if (explicit) return explicit;
  if (opts.isSuperadmin) return null;
  if (opts.anyNonSuperadmin) return opts.userId;
  const ids = await loadCommercialeUserIds();
  return ids.has(opts.userId) ? opts.userId : null;
}

export async function loadCommercialeLabels(
  userIds: string[]
): Promise<Map<string, { nome: string; grado: CommercialeGrado | null }>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, { nome: string; grado: CommercialeGrado | null }>();
  if (ids.length === 0) return map;
  const service = createServiceClient();
  const [{ data: profiles }, { data: persone }] = await Promise.all([
    service
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, commerciale_grado")
      .in("id", ids),
    service
      .from("organigramma_persone")
      .select("user_id, nome, cognome, commerciale_grado")
      .in("user_id", ids)
      .is("deleted_at", null),
  ]);
  const personaByUser = new Map(
    (persone ?? []).map((p) => [
      String((p as { user_id: string }).user_id),
      p as {
        nome: string;
        cognome: string;
        commerciale_grado: string | null;
      },
    ])
  );
  for (const p of profiles ?? []) {
    const row = p as {
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      commerciale_grado: string | null;
    };
    const persona = personaByUser.get(row.id);
    const nome =
      `${persona?.nome ?? ""} ${persona?.cognome ?? ""}`.trim() ||
      row.full_name?.trim() ||
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
      row.email ||
      "Operatore";
    map.set(row.id, {
      nome,
      grado:
        parseCommercialeGrado(persona?.commerciale_grado) ??
        parseCommercialeGrado(row.commerciale_grado),
    });
  }
  return map;
}

export function anagraficaLineageOrFilter(lineageIds: string[]): string {
  const ids = [...new Set(lineageIds.filter(Boolean))];
  if (ids.length === 0) return "id.eq.00000000-0000-0000-0000-000000000000";
  const inList = ids.join(",");
  return `created_by.in.(${inList}),commerciale_id.in.(${inList})`;
}

