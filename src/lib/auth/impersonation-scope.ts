import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canHaveSubordinates,
  isSubordinateGerarchia,
  parseProfileGerarchia,
  parseProfilePotere,
  type ProfileGerarchia,
} from "@/lib/auth/gerarchia";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import type { Profile } from "@/types/database";

export function actorCanSwitchProfiles(actor: Profile): boolean {
  if (isSuperadminProfile(actor) || parseProfilePotere(actor.potere) === "superadmin") {
    return true;
  }
  return canHaveSubordinates(parseProfileGerarchia(actor.gerarchia));
}

function roleCodeOf(row: {
  app_roles?: { code?: string } | { code?: string }[] | null;
}): string {
  const role = row.app_roles;
  const obj = Array.isArray(role) ? role[0] : role;
  return String(obj?.code ?? "");
}

export function isProtectedSuperadminTarget(row: {
  potere?: string | null;
  stato_operativo?: string | null;
  app_roles?: { code?: string } | { code?: string }[] | null;
}): boolean {
  const isSa =
    parseProfilePotere(row.potere) === "superadmin" ||
    roleCodeOf(row) === "superadmin";
  if (!isSa) return false;
  return parseProfileStatoOperativo(row.stato_operativo) !== "test";
}

type PersonaLink = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  co_parent_ids?: string[] | null;
};

export function descendantPersonaIds(
  actorPersonaId: string,
  persone: PersonaLink[]
): Set<string> {
  const children = new Map<string, string[]>();
  for (const p of persone) {
    const parents = [p.parent_id, ...(p.co_parent_ids ?? [])].filter(
      (id): id is string => Boolean(id)
    );
    for (const parent of parents) {
      const list = children.get(parent) ?? [];
      list.push(p.id);
      children.set(parent, list);
    }
  }
  const out = new Set<string>();
  const stack = [...(children.get(actorPersonaId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return out;
}

export async function listAllowedImpersonationIds(
  service: SupabaseClient,
  actor: Profile
): Promise<"all" | Set<string>> {
  if (
    isSuperadminProfile(actor) ||
    parseProfilePotere(actor.potere) === "superadmin"
  ) {
    return "all";
  }

  const actorGerarchia = parseProfileGerarchia(actor.gerarchia);
  if (!canHaveSubordinates(actorGerarchia)) {
    return new Set();
  }

  const { data: persone } = await service
    .from("organigramma_persone")
    .select("id, user_id, parent_id, co_parent_ids")
    .is("deleted_at", null);
  const rows = (persone ?? []) as PersonaLink[];
  const actorPersona = rows.find((p) => p.user_id === actor.id);
  if (!actorPersona) return new Set();

  const desc = descendantPersonaIds(actorPersona.id, rows);
  const userIds = rows
    .filter((p) => desc.has(p.id) && p.user_id)
    .map((p) => String(p.user_id));
  if (userIds.length === 0) return new Set();

  const { data: profiles } = await service
    .from("profiles")
    .select("id, gerarchia, potere, stato_operativo, app_roles(code)")
    .in("id", userIds)
    .eq("is_active", true);

  const allowed = new Set<string>();
  for (const row of profiles ?? []) {
    if (isProtectedSuperadminTarget(row)) continue;
    const targetG = parseProfileGerarchia(
      (row as { gerarchia?: string }).gerarchia
    );
    if (isSubordinateGerarchia(actorGerarchia, targetG)) {
      allowed.add(String(row.id));
    }
  }
  return allowed;
}

export function actorGerarchia(actor: Profile): ProfileGerarchia {
  return parseProfileGerarchia(actor.gerarchia);
}
