import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

export type RagResult = {
  notes: string;
  allegati: Array<{
    fileName: string;
    storagePath: string;
    source: "scheda_tecnica" | "manuale" | "generato";
    prodottoId: string | null;
  }>;
};

/** Cerca prodotti/schede/listino per bozza AI. */
export async function buildRagForIntent(
  supabase: Service,
  intent: string,
  productQuery: string | null,
  bodyText: string
): Promise<RagResult> {
  const q = (productQuery || bodyText).trim();
  if (!q) {
    return { notes: "", allegati: [] };
  }

  const tokens = q
    .split(/[\s,.;:/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  let query = supabase
    .from("prodotti_propri")
    .select("id, codice, nome, note, prezzo_listino, scheda_tecnica_path")
    .is("deleted_at", null)
    .limit(8);

  if (tokens.length > 0) {
    const or = tokens
      .map((t) => {
        const safe = t.replace(/[%_,]/g, "");
        return `nome.ilike.%${safe}%,codice.ilike.%${safe}%`;
      })
      .join(",");
    query = query.or(or);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[webmail rag]", error.message);
    return { notes: "", allegati: [] };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    codice: string;
    nome: string;
    note: string;
    prezzo_listino: number | null;
    scheda_tecnica_path: string;
  }>;

  if (rows.length === 0) {
    return {
      notes:
        "Nessun prodotto corrispondente trovato in anagrafica. Non indicare prezzi inventati.",
      allegati: [],
    };
  }

  const lines: string[] = [];
  const allegati: RagResult["allegati"] = [];

  for (const p of rows) {
    if (intent === "preventivo_listino") {
      const prezzo =
        p.prezzo_listino != null
          ? `${Number(p.prezzo_listino).toFixed(2)} EUR (listino cooperativa, IVA esclusa se non diversamente indicato)`
          : "prezzo listino non ancora valorizzato in anagrafica";
      lines.push(`- ${p.codice} — ${p.nome}: ${prezzo}`);
    } else if (intent === "scheda_tecnica") {
      lines.push(`- ${p.codice} — ${p.nome}`);
      if (p.scheda_tecnica_path?.trim()) {
        allegati.push({
          fileName: `Scheda_${p.codice}.pdf`,
          storagePath: p.scheda_tecnica_path.trim(),
          source: "scheda_tecnica",
          prodottoId: p.id,
        });
        lines.push(`  Scheda tecnica allegabile: ${p.scheda_tecnica_path}`);
      } else {
        lines.push("  Scheda tecnica PDF non caricata in anagrafica.");
      }
    } else {
      lines.push(`- ${p.codice} — ${p.nome}`);
    }
  }

  return {
    notes: lines.join("\n"),
    allegati: intent === "scheda_tecnica" ? allegati : [],
  };
}
