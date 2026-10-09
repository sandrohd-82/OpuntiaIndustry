import { isRepartoCommerciale, parseCommercialeGrado } from "@/lib/auth/commerciale";
import { createServiceClient } from "@/lib/supabase/server";

export type PreventivoCommercialeRiferimento = {
  id: string;
  nome: string;
  telefono: string;
  email: string;
  /** Persona in organigramma senza accesso. Vale solo in fattura: non si scrive sulla FK utenti. */
  personaSenzaAccount?: boolean;
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

type CasellaAziendale = { email: string; label: string };

function soloLettere(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Casella aziendale del gestionale, dal nome e cognome in organigramma. */
function mailCasellaAziendale(
  nome: string,
  cognome: string,
  caselle: CasellaAziendale[]
): string {
  const n = soloLettere(nome);
  const c = soloLettere(cognome);
  if (!n || !c) return "";
  const iniziale = n.slice(0, 1);
  let scelta = "";
  let punteggio = 0;
  for (const casella of caselle) {
    const locale = soloLettere(casella.email.split("@")[0] ?? "");
    const etichetta = soloLettere(casella.label);
    const dominio = casella.email.split("@")[1]?.toLowerCase() ?? "";
    let punti = 0;
    if (locale === `${iniziale}${c}`) punti = 100;
    else if (locale === c) punti = 80;
    else if (locale === `${n}${c}` || locale === n) punti = 60;
    else if (etichetta.includes(`${iniziale}${c}`)) punti = 40;
    if (!punti) continue;
    if (dominio === "opuntiaitalia.com") punti += 5;
    if (punti > punteggio) {
      punteggio = punti;
      scelta = casella.email.trim();
    }
  }
  return scelta;
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

/** Commerciali (grado o reparto) e admin.
 *  Con `includiSenzaAccount` aggiunge anche chi è in organigramma senza accesso utente.
 *  Quella lista si usa solo in fattura: il preventivo continua a salvare un id utente.
 */
export async function loadPreventivoCommercialiRiferimento(opts?: {
  includiSenzaAccount?: boolean;
}): Promise<PreventivoCommercialeRiferimento[]> {
  const service = createServiceClient();
  const [
    { data: profiles },
    { data: fromReparti },
    { data: persone },
    { data: reparti },
    { data: caselleRaw },
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
      .select(
        "id, user_id, nome, cognome, cellulare, commerciale_grado, reparto_id, in_forza, cessato_at"
      )
      .is("deleted_at", null),
    service
      .from("organigramma_reparti")
      .select("id, codice, nome")
      .is("deleted_at", null),
    service
      .from("webmail_accounts")
      .select("label, email_address")
      .is("deleted_at", null),
  ]);
  const caselle: CasellaAziendale[] = (caselleRaw ?? [])
    .map((row) => ({
      label: String((row as { label?: string | null }).label ?? ""),
      email: String((row as { email_address?: string | null }).email_address ?? "").trim(),
    }))
    .filter((row) => row.email.includes("@"));

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
      cellulare: string;
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
      cellulare: String((p as { cellulare?: string | null }).cellulare ?? "").trim(),
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
    const nome = persona?.nome || String((row as { first_name?: string | null }).first_name ?? "");
    const cognome =
      persona?.cognome || String((row as { last_name?: string | null }).last_name ?? "");
    const emailProfilo = String((row as { email?: string | null }).email ?? "").trim();
    const email = emailProfilo || mailCasellaAziendale(nome, cognome, caselle);
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
      telefono: persona?.cellulare || phones.get(id) || "",
      email,
    });
  }
  if (opts?.includiSenzaAccount) {
    const giaInElenco = new Set(
      items.map((item) => item.nome.trim().toLowerCase())
    );
    for (const p of persone ?? []) {
      const row = p as {
        id?: string;
        user_id?: string | null;
        nome?: string | null;
        cognome?: string | null;
        cellulare?: string | null;
        commerciale_grado?: string | null;
        reparto_id?: string | null;
        in_forza?: boolean | null;
        cessato_at?: string | null;
      };
      if (row.user_id) continue;
      if (row.in_forza === false || row.cessato_at) continue;
      const commerciale = Boolean(
        parseCommercialeGrado(row.commerciale_grado) ||
          commercialeRepartoIds.has(String(row.reparto_id ?? ""))
      );
      if (!commerciale) continue;
      const id = String(row.id ?? "").trim();
      const nome = displayNome({
        personaNome: row.nome,
        personaCognome: row.cognome,
      });
      if (!id || giaInElenco.has(nome.toLowerCase())) continue;
      giaInElenco.add(nome.toLowerCase());
      const nomePersona = String(row.nome ?? "");
      const cognomePersona = String(row.cognome ?? "");
      items.push({
        id,
        nome,
        telefono: String(row.cellulare ?? "").trim(),
        email: mailCasellaAziendale(nomePersona, cognomePersona, caselle),
        personaSenzaAccount: true,
      });
    }
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
