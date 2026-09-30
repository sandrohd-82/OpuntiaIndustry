type Row = {
  id?: unknown;
  created_by?: unknown;
  origine_id?: unknown;
  attivita_id?: unknown;
};

type Query = PromiseLike<{ data: Row[] | null }> & {
  eq: (column: string, value: string) => Query;
  in: (column: string, values: readonly string[]) => Query;
  is: (column: string, value: null) => Query;
};

type Db = {
  from: (table: string) => {
    select: (columns: string) => Query;
  };
};

export type PnOrigineTipo = "nota" | "attivita" | "promemoria";

const TABLE: Record<PnOrigineTipo, string> = {
  nota: "pn_note",
  attivita: "pn_attivita",
  promemoria: "pn_promemoria",
};

/** Id che l'utente può leggere: è l'autore oppure è taggato. */
export async function idsPnVisibiliAlUtente(
  supabase: unknown,
  userId: string,
  tipo: PnOrigineTipo,
  ids: string[]
): Promise<Set<string>> {
  const db = supabase as Db;
  const uniq = [...new Set(ids.filter(Boolean))];
  const visible = new Set<string>();
  if (!uniq.length || !userId) return visible;

  const { data: rows } = await db
    .from(TABLE[tipo])
    .select("id, created_by")
    .in("id", uniq);
  for (const row of rows ?? []) {
    if (String(row.created_by ?? "") === userId) visible.add(String(row.id));
  }

  const { data: coinvolti } = await db
    .from("pn_coinvolti")
    .select("origine_id")
    .eq("origine_tipo", tipo)
    .eq("user_id", userId)
    .in("origine_id", uniq)
    .is("deleted_at", null);
  for (const row of coinvolti ?? []) {
    visible.add(String(row.origine_id));
  }

  if (tipo !== "attivita") return visible;

  const { data: mentions } = await db
    .from("pn_attivita_mentions")
    .select("attivita_id")
    .eq("user_id", userId)
    .in("attivita_id", uniq)
    .is("deleted_at", null);
  for (const row of mentions ?? []) {
    visible.add(String(row.attivita_id));
  }

  const { data: collegamenti } = await db
    .from("pn_attivita_collegamenti")
    .select("attivita_id")
    .eq("kind", "operatore")
    .eq("entity_id", userId)
    .in("attivita_id", uniq)
    .is("deleted_at", null);
  for (const row of collegamenti ?? []) {
    visible.add(String(row.attivita_id));
  }

  return visible;
}
