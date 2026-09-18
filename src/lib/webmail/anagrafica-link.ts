import type { SupabaseClient } from "@supabase/supabase-js";

export type WebmailAziendaTipo = "cliente" | "fornitore" | "cliente_possibile";
export type WebmailLinkStato = "bozza" | "collegata" | "da_salvare";

export type WebmailAnagraficaMatch = {
  aziendaTipo: WebmailAziendaTipo | null;
  aziendaId: string | null;
  aziendaLabel: string;
  contattoId: string | null;
  linkStato: WebmailLinkStato;
};

export function normalizeWebmailEmail(raw: string): string {
  const t = raw.trim().toLowerCase();
  const angled = t.match(/<([^>]+@[^>]+)>/);
  return (angled?.[1] ?? t).trim();
}

function normalizeEmail(raw: string): string {
  return normalizeWebmailEmail(raw);
}

/**
 * Risolve mittente email → referente rubrica e/o anagrafica azienda.
 */
export async function matchWebmailAnagrafica(
  supabase: SupabaseClient,
  fromAddress: string
): Promise<WebmailAnagraficaMatch> {
  const email = normalizeEmail(fromAddress);
  const empty: WebmailAnagraficaMatch = {
    aziendaTipo: null,
    aziendaId: null,
    aziendaLabel: "",
    contattoId: null,
    linkStato: "bozza",
  };
  if (!email || !email.includes("@")) return empty;

  const { data: auto, error: autoErr } = await supabase
    .from("webmail_email_anagrafica_auto_link")
    .select("azienda_tipo, azienda_id, azienda_label, contatto_id")
    .eq("email_normalized", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (!autoErr && auto?.azienda_id) {
    const tipo = String(auto.azienda_tipo ?? "");
    if (tipo === "cliente" || tipo === "cliente_possibile") {
      return {
        aziendaTipo: tipo,
        aziendaId: String(auto.azienda_id),
        aziendaLabel: String(auto.azienda_label ?? ""),
        contattoId: auto.contatto_id ? String(auto.contatto_id) : null,
        linkStato: "collegata",
      };
    }
  }

  const { data: contatto } = await supabase
    .from("rubrica_contatti")
    .select("id, azienda_tipo, azienda_id, azienda_label, email")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (contatto) {
    const tipo = String(contatto.azienda_tipo ?? "");
    const aziendaId = contatto.azienda_id
      ? String(contatto.azienda_id)
      : null;
    const aziendaTipo =
      tipo === "cliente" ||
      tipo === "fornitore" ||
      tipo === "cliente_possibile"
        ? (tipo as WebmailAziendaTipo)
        : null;
    return {
      aziendaTipo,
      aziendaId,
      aziendaLabel: String(contatto.azienda_label ?? ""),
      contattoId: String(contatto.id),
      linkStato: aziendaId ? "collegata" : "da_salvare",
    };
  }

  const { data: clienteEmail } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, email, pec")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const { data: clientePec } = clienteEmail
    ? { data: null }
    : await supabase
        .from("clienti")
        .select("id, ragione_sociale, email, pec")
        .ilike("pec", email)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
  const cliente = clienteEmail ?? clientePec;
  if (cliente) {
    return {
      aziendaTipo: "cliente",
      aziendaId: String(cliente.id),
      aziendaLabel: String(cliente.ragione_sociale ?? ""),
      contattoId: null,
      linkStato: "collegata",
    };
  }

  const { data: fornitore } = await supabase
    .from("fornitori")
    .select("id, ragione_sociale, email")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (fornitore) {
    return {
      aziendaTipo: "fornitore",
      aziendaId: String(fornitore.id),
      aziendaLabel: String(fornitore.ragione_sociale ?? ""),
      contattoId: null,
      linkStato: "collegata",
    };
  }

  const { data: possEmail } = await supabase
    .from("clienti_possibili")
    .select("id, ragione_sociale, email, pec")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const { data: possPec } = possEmail
    ? { data: null }
    : await supabase
        .from("clienti_possibili")
        .select("id, ragione_sociale, email, pec")
        .ilike("pec", email)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
  const possibile = possEmail ?? possPec;
  if (possibile) {
    return {
      aziendaTipo: "cliente_possibile",
      aziendaId: String(possibile.id),
      aziendaLabel: String(possibile.ragione_sociale ?? ""),
      contattoId: null,
      linkStato: "collegata",
    };
  }

  const extraLead = await matchByEmailGeneriche(
    supabase,
    "clienti_possibili",
    "cliente_possibile",
    email
  );
  if (extraLead) return extraLead;
  const extraCli = await matchByEmailGeneriche(
    supabase,
    "clienti",
    "cliente",
    email
  );
  if (extraCli) return extraCli;

  const { data: brand } = await supabase
    .from("anagrafica_brand")
    .select("owner_kind, owner_id, nome, email")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (
    brand &&
    (brand.owner_kind === "cliente" || brand.owner_kind === "cliente_possibile")
  ) {
    const labelTable =
      brand.owner_kind === "cliente" ? "clienti" : "clienti_possibili";
    const { data: owner } = await supabase
      .from(labelTable)
      .select("ragione_sociale")
      .eq("id", brand.owner_id)
      .is("deleted_at", null)
      .maybeSingle();
    return {
      aziendaTipo: brand.owner_kind,
      aziendaId: String(brand.owner_id),
      aziendaLabel: String(owner?.ragione_sociale ?? brand.nome ?? ""),
      contattoId: null,
      linkStato: "collegata",
    };
  }

  return { ...empty, linkStato: "da_salvare" };
}

async function matchByEmailGeneriche(
  supabase: SupabaseClient,
  table: "clienti" | "clienti_possibili",
  tipo: "cliente" | "cliente_possibile",
  email: string
): Promise<WebmailAnagraficaMatch | null> {
  const { data } = await supabase
    .from(table)
    .select("id, ragione_sociale, email_generiche")
    .contains("email_generiche", [email])
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    aziendaTipo: tipo,
    aziendaId: String(data.id),
    aziendaLabel: String(data.ragione_sociale ?? ""),
    contattoId: null,
    linkStato: "collegata",
  };
}

/**
 * Per mail in uscita: primo destinatario (To, poi Cc) che matcha anagrafica.
 */
export async function matchWebmailAnagraficaRecipients(
  supabase: SupabaseClient,
  addresses: string[],
  skipEmail?: string | null
): Promise<WebmailAnagraficaMatch> {
  const skip = skipEmail ? normalizeEmail(skipEmail) : "";
  const seen = new Set<string>();
  let fallback: WebmailAnagraficaMatch | null = null;
  for (const raw of addresses) {
    const email = normalizeEmail(raw);
    if (!email || !email.includes("@") || email === skip || seen.has(email)) {
      continue;
    }
    seen.add(email);
    const match = await matchWebmailAnagrafica(supabase, email);
    if (match.linkStato === "collegata" && match.aziendaId) {
      return match;
    }
    if (!fallback && (match.aziendaId || match.contattoId)) {
      fallback = match;
    }
  }
  return (
    fallback ?? {
      aziendaTipo: null,
      aziendaId: null,
      aziendaLabel: "",
      contattoId: null,
      linkStato: "da_salvare",
    }
  );
}

/** Mappa intent AI → codice categoria UI hub. */
export function intentToCategoriaCodice(intent: string): string {
  switch (intent) {
    case "preventivi":
    case "preventivo_listino":
      return "preventivi";
    case "ordini":
    case "ordine_lotto":
      return "ordini";
    case "info":
    case "scheda_tecnica":
    case "contatti":
      return "info";
    case "pubblicita":
    case "scartate":
      return "pubblicita";
    case "generico":
    case "da_revisionare":
      return "generico";
    default:
      return "generico";
  }
}
