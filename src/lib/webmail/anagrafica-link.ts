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
  return raw.trim().toLowerCase();
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

  const { data: cliente } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, email")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
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

  const { data: possibile } = await supabase
    .from("clienti_possibili")
    .select("id, ragione_sociale, email")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
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
