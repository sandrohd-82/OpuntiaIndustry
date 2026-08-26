import { createClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/amministrazione/fatture";
import type { ProdottoCondizioneStorico } from "@/lib/amministrazione/fatture-storico";
import { toCondizioneStorico } from "@/lib/amministrazione/fatture-storico";

export type CatalogoPrezzoKind = "servizio" | "prodotto";

function tableForKind(kind: CatalogoPrezzoKind): string {
  return kind === "servizio"
    ? "catalogo_servizi"
    : "catalogo_prodotti_fornitore";
}

function kindFromCodice(codice: string): CatalogoPrezzoKind | null {
  const c = codice.trim().toLowerCase();
  if (c.startsWith("sz")) return "servizio";
  if (c.startsWith("pr")) return "prodotto";
  return null;
}

/**
 * Ricalcola e aggiorna prezzo_unitario_medio su Pr/Sz per i codici indicati
 * (fonte: fatture_ricevute non soft-deleted).
 */
export async function recalcCatalogoPrezzoMedioForCodici(
  codici: string[],
  actorId?: string | null
): Promise<void> {
  const unique = [
    ...new Set(
      codici
        .map((c) => c.trim())
        .filter((c) => c && c !== "—" && kindFromCodice(c))
    ),
  ];
  if (unique.length === 0) return;

  const supabase = await createClient();

  for (const codice of unique) {
    const kind = kindFromCodice(codice);
    if (!kind) continue;

    const { data: righe, error: rErr } = await supabase
      .from("fatture_ricevute_righe")
      .select("prezzo_unitario, fatture_ricevute!inner(deleted_at)")
      .ilike("codice", codice)
      .is("fatture_ricevute.deleted_at", null)
      .gt("prezzo_unitario", 0)
      .limit(5000);

    if (rErr) {
      console.error("[prezzo-medio] righe", codice, rErr.message);
      continue;
    }

    const prezzi = (righe ?? [])
      .map((r) => Number(r.prezzo_unitario))
      .filter((p) => Number.isFinite(p) && p > 0);

    const count = prezzi.length;
    const medio =
      count > 0
        ? roundMoney(prezzi.reduce((a, b) => a + b, 0) / count)
        : null;

    const { error: upErr } = await supabase
      .from(tableForKind(kind))
      .update({
        prezzo_unitario_medio: medio,
        prezzo_medio_count: count,
        prezzo_medio_updated_at: new Date().toISOString(),
        updated_by: actorId ?? null,
      })
      .ilike("codice", codice)
      .is("deleted_at", null);

    if (upErr) {
      console.error("[prezzo-medio] update", codice, upErr.message);
    }
  }
}

/** Storico prezzi unitari per un codice (tutte le ricevute). */
export async function loadCatalogoPrezzoStorico(
  codice: string
): Promise<ProdottoCondizioneStorico[]> {
  const code = codice.trim();
  if (!code || code === "—") return [];

  const supabase = await createClient();
  const { data: righe, error } = await supabase
    .from("fatture_ricevute_righe")
    .select(
      "quantita, prezzo_unitario, sconto_percentuale, fattura_id, fatture_ricevute!inner(id, numero_interno, data_emissione, deleted_at)"
    )
    .ilike("codice", code)
    .is("fatture_ricevute.deleted_at", null)
    .gt("prezzo_unitario", 0)
    .order("fattura_id")
    .limit(300);

  if (error || !righe?.length) {
    if (error) console.error("[prezzo-storico]", error.message);
    return [];
  }

  const out: ProdottoCondizioneStorico[] = [];
  for (const raw of righe) {
    const r = raw as {
      quantita: number;
      prezzo_unitario: number;
      sconto_percentuale: number;
      fatture_ricevute:
        | {
            id: string;
            numero_interno: string;
            data_emissione: string;
          }
        | {
            id: string;
            numero_interno: string;
            data_emissione: string;
          }[];
    };
    const h = Array.isArray(r.fatture_ricevute)
      ? r.fatture_ricevute[0]
      : r.fatture_ricevute;
    if (!h) continue;
    const p = Number(r.prezzo_unitario);
    if (!Number.isFinite(p) || p <= 0) continue;
    out.push(
      toCondizioneStorico({
        fatturaId: h.id,
        numeroInterno: h.numero_interno,
        dataEmissione: h.data_emissione,
        prezzoUnitario: p,
        scontoPercentuale: Number(r.sconto_percentuale) || 0,
        quantita: Number(r.quantita) || 0,
      })
    );
  }

  return out.sort((a, b) => b.dataEmissione.localeCompare(a.dataEmissione));
}
