import {
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

/** Io + superiori + subordinati in organigramma (linee commerciali). */
export async function loadCommercialLineageUserIds(
  userId: string
): Promise<string[]> {
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

  const ancestors = new Set<string>();
  const walkUp = (id: string, guard = 0) => {
    if (guard > 80 || ancestors.has(id)) return;
    ancestors.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const pid of parentIdsOf(node)) walkUp(pid, guard + 1);
  };
  walkUp(me.id);

  const children = new Map<string, string[]>();
  for (const r of rows) {
    for (const pid of parentIdsOf(r)) {
      const list = children.get(pid) ?? [];
      list.push(r.id);
      children.set(pid, list);
    }
  }

  const descendants = new Set<string>();
  const walkDown = (id: string, guard = 0) => {
    if (guard > 200 || descendants.has(id)) return;
    descendants.add(id);
    for (const cid of children.get(id) ?? []) walkDown(cid, guard + 1);
  };
  walkDown(me.id);

  const userIds = new Set<string>([mine]);
  for (const id of [...ancestors, ...descendants]) {
    const uid = byId.get(id)?.user_id;
    if (uid) userIds.add(uid);
  }
  return [...userIds];
}

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

