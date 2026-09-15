import { isRepartoCommerciale, parseCommercialeGrado } from "@/lib/auth/commerciale";
import { createServiceClient } from "@/lib/supabase/server";

export type PreventivoCommercialeRiferimento = {
  id: string;
  nome: string;
  telefono: string;
  email: string;
};

function displayNome(opts: {
  personaNome?: string | null;
  personaCognome?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const organigramma = `${opts.personaNome ?? ""} ${opts.personaCognome ?? ""}`.trim();
  if (organigramma) return organigramma;
  const composed = `${opts.firstName ?? ""} ${opts.lastName ?? ""}`.trim();
  return opts.fullName?.trim() || composed || opts.email?.trim() || "Commerciale";
}

function roleCodeOf(row: {
  app_roles?: { code?: string } | { code?: string }[] | null;
}): string {
  const role = row.app_roles;
  const obj = Array.isArray(role) ? role[0] : role;
  return String(obj?.code ?? "");
}

function isAdminRiferimento(row: {
  gerarchia?: string | null;
  potere?: string | null;
  app_roles?: { code?: string } | { code?: string }[] | null;
}): boolean {
  const code = roleCodeOf(row);
  return (
    code === "admin" ||
    code === "superadmin" ||
    row.gerarchia === "amministratore" ||
    row.potere === "superadmin"
  );
}

async function loadAuthPhones(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error || !data?.users) return map;
    const wanted = new Set(ids);
    for (const user of data.users) {
      if (!wanted.has(user.id)) continue;
      const phone = String(user.phone ?? "").trim();
      if (phone) map.set(user.id, phone);
    }
  } catch {
    return map;
  }
  return map;
}

/** Solo commerciali (grado/reparto) e admin. Non tutti gli operatori. */
export async function loadPreventivoCommercialiRiferimento(): Promise<
  PreventivoCommercialeRiferimento[]
> {
  const service = createServiceClient();
  const [
    { data: profiles },
    { data: fromReparti },
    { data: persone },
    { data: reparti },
  ] = await Promise.all([
    service
      .from("profiles")
      .select(
        "id, email, full_name, first_name, last_name, gerarchia, potere, commerciale_grado, is_active, app_roles(code)"
      )
      .eq("is_active", true),
    service
      .from("profile_reparti")
      .select("profile_id")
      .eq("codice", "commerciale")
      .is("deleted_at", null),
    service
      .from("organigramma_persone")
      .select("user_id, nome, cognome, commerciale_grado, reparto_id")
      .is("deleted_at", null)
      .not("user_id", "is", null),
    service
      .from("organigramma_reparti")
      .select("id, codice, nome")
      .is("deleted_at", null),
  ]);

  const commercialeRepartoIds = new Set(
    (reparti ?? [])
      .filter((row) => isRepartoCommerciale(row))
      .map((row) => String((row as { id: string }).id))
  );
  const commercialeFromReparto = new Set(
    (fromReparti ?? []).map((r) => String((r as { profile_id: string }).profile_id))
  );
  const personaByUser = new Map<
    string,
    {
      nome: string;
      cognome: string;
      commerciale: boolean;
    }
  >();
  for (const p of persone ?? []) {
    const uid = String((p as { user_id?: string }).user_id ?? "");
    if (!uid) continue;
    const commerciale = Boolean(
      parseCommercialeGrado(
        (p as { commerciale_grado?: string | null }).commerciale_grado
      ) ||
        commercialeRepartoIds.has(
          String((p as { reparto_id?: string | null }).reparto_id ?? "")
        )
    );
    personaByUser.set(uid, {
      nome: String((p as { nome?: string }).nome ?? ""),
      cognome: String((p as { cognome?: string }).cognome ?? ""),
      commerciale,
    });
  }

  const eligible = new Set<string>();
  for (const row of profiles ?? []) {
    const id = String((row as { id: string }).id);
    const persona = personaByUser.get(id);
    const isCommerciale =
      Boolean(
        parseCommercialeGrado(
          (row as { commerciale_grado?: string | null }).commerciale_grado
        )
      ) ||
      commercialeFromReparto.has(id) ||
      Boolean(persona?.commerciale);
    if (isAdminRiferimento(row) || isCommerciale) {
      eligible.add(id);
    }
  }

  const phones = await loadAuthPhones([...eligible]);
  const items: PreventivoCommercialeRiferimento[] = [];
  for (const row of profiles ?? []) {
    const id = String((row as { id: string }).id);
    if (!eligible.has(id)) continue;
    const persona = personaByUser.get(id);
    const email = String((row as { email?: string | null }).email ?? "").trim();
    items.push({
      id,
      nome: displayNome({
        personaNome: persona?.nome,
        personaCognome: persona?.cognome,
        fullName: (row as { full_name?: string | null }).full_name,
        firstName: (row as { first_name?: string | null }).first_name,
        lastName: (row as { last_name?: string | null }).last_name,
        email,
      }),
      telefono: phones.get(id) ?? "",
      email,
    });
  }
  items.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return items;
}

export async function resolvePreventivoCommercialeRiferimento(
  id: string
): Promise<PreventivoCommercialeRiferimento | null> {
  const wanted = id.trim();
  if (!wanted) return null;
  const items = await loadPreventivoCommercialiRiferimento();
  return items.find((item) => item.id === wanted) ?? null;
}
