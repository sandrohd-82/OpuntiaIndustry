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

function normalizeEmail(raw: string): string {
  const t = raw.trim().toLowerCase();
  const angled = t.match(/<([^>]+@[^>]+)>/);
  return (angled?.[1] ?? t).trim();
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

  return { ...empty, linkStato: "da_salvare" };
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
