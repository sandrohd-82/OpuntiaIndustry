"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import type { CampionaturaOrdineVoce } from "@/lib/amministrazione/ordine-campionatura";
import { createClient } from "@/lib/supabase/server";

function firma(righe: CampionaturaOrdineVoce[]): string {
  return righe
    .map(
      (riga) =>
        `${riga.prodottoId}|${riga.prodottoCodice}|${riga.prodottoNome}|${riga.numeroConfezioni}`
    )
    .join(";");
}

export async function leggiCampionatureOrdineAction(
  ordineId: string
): Promise<
  | { success: true; righe: CampionaturaOrdineVoce[] }
  | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini_campionature")
    .select("prodotto_id, prodotto_codice, prodotto_nome, numero_confezioni, sort_order")
    .eq("ordine_id", ordineId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const righe: CampionaturaOrdineVoce[] = (data ?? []).map((row) => ({
    prodottoId: String(row.prodotto_id ?? ""),
    prodottoCodice: String(row.prodotto_codice ?? ""),
    prodottoNome: String(row.prodotto_nome ?? ""),
    numeroConfezioni: Number(row.numero_confezioni ?? 0),
  }));
  return { success: true, righe: righe.filter((riga) => riga.numeroConfezioni >= 1) };
}

export async function salvaCampionatureOrdine(input: {
  ordineId: string;
  userId: string;
  righe: CampionaturaOrdineVoce[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: esistenti, error: readErr } = await supabase
    .from("ordini_campionature")
    .select("id, prodotto_id, prodotto_codice, prodotto_nome, numero_confezioni, sort_order")
    .eq("ordine_id", input.ordineId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (readErr) return { success: false, error: readErr.message };

  const gia: CampionaturaOrdineVoce[] = (esistenti ?? []).map((row) => ({
    prodottoId: String(row.prodotto_id ?? ""),
    prodottoCodice: String(row.prodotto_codice ?? ""),
    prodottoNome: String(row.prodotto_nome ?? ""),
    numeroConfezioni: Number(row.numero_confezioni ?? 0),
  }));
  if (firma(gia) === firma(input.righe)) return { success: true };

  const { data: ordine, error: ordineErr } = await supabase
    .from("ordini")
    .select("versione, documento_stato")
    .eq("id", input.ordineId)
    .maybeSingle();
  if (ordineErr) return { success: false, error: ordineErr.message };
  const versione = Math.max(1, Number(ordine?.versione ?? 1));
  const statoOrdine = String(ordine?.documento_stato ?? "approvato");
  const documentoStato: "bozza" | "approvato" | "chiuso" =
    statoOrdine === "bozza" || statoOrdine === "chiuso" ? statoOrdine : "approvato";

  if ((esistenti ?? []).length > 0) {
    const { error } = await supabase
      .from("ordini_campionature")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
        updated_by: input.userId,
        updated_at: now,
      })
      .eq("ordine_id", input.ordineId)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
  }

  if (input.righe.length > 0) {
    const { error } = await supabase.from("ordini_campionature").insert(
      input.righe.map((riga, index) => ({
        ordine_id: input.ordineId,
        prodotto_id: riga.prodottoId || null,
        prodotto_codice: riga.prodottoCodice,
        prodotto_nome: riga.prodottoNome,
        numero_confezioni: riga.numeroConfezioni,
        sort_order: index,
        versione,
        documento_stato: documentoStato,
        created_by: input.userId,
        updated_by: input.userId,
      }))
    );
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "ordini",
    entity_id: input.ordineId,
    action: "update",
    actor_id: input.userId,
    summary:
      "Campionature dell'ordine aggiornate. Non compaiono in fattura e vanno nel collo.",
    payload: { voci: input.righe.length },
  });
  return { success: true };
}
