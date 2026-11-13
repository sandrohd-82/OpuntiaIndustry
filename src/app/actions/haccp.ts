"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  type HaccpCategoria,
  type HaccpStatoVoce,
  type HaccpVoce,
} from "@/lib/produzione/haccp";
import { createClient } from "@/lib/supabase/server";

const voceSchema = z.object({
  titolo: z.string().trim().min(2).max(120),
  categoriaId: z.string().uuid(),
  scadenzaAt: z.string().datetime({ offset: true }),
});

export async function listHaccpRoutineAction(): Promise<
  | { success: true; categorie: HaccpCategoria[]; voci: HaccpVoce[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const [categorieRes, vociRes] = await Promise.all([
    supabase
      .from("haccp_routine_categorie")
      .select("id, codice, nome, striscia, colore, colore_testo, ordine")
      .is("deleted_at", null)
      .order("ordine", { ascending: true }),
    supabase
      .from("haccp_routine_voci")
      .select("id, categoria_id, titolo, scadenza_at, ordine, stato")
      .is("deleted_at", null)
      .eq("stato", "attivo")
      .order("ordine", { ascending: true }),
  ]);
  if (categorieRes.error) return { success: false, error: categorieRes.error.message };
  if (vociRes.error) return { success: false, error: vociRes.error.message };
  return {
    success: true,
    categorie: (categorieRes.data ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      nome: String(row.nome),
      striscia: String(row.striscia),
      colore: String(row.colore),
      coloreTesto: String(row.colore_testo || "#ffffff"),
      ordine: Number(row.ordine) || 0,
    })),
    voci: (vociRes.data ?? []).map((row) => ({
      id: String(row.id),
      categoriaId: String(row.categoria_id),
      titolo: String(row.titolo),
      scadenzaAt: String(row.scadenza_at),
      ordine: Number(row.ordine) || 0,
      stato: String(row.stato) as HaccpStatoVoce,
    })),
  };
}

export async function salvaHaccpRoutineVoceAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = voceSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Voce non valida." };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: ordineRow } = await supabase
    .from("haccp_routine_voci")
    .select("ordine")
    .is("deleted_at", null)
    .order("ordine", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordine = Number(ordineRow?.ordine ?? 0) + 1;
  const { data, error } = await supabase
    .from("haccp_routine_voci")
    .insert({
      categoria_id: input.categoriaId,
      titolo: input.titolo,
      scadenza_at: input.scadenzaAt,
      ordine,
      versione: 1,
      stato: "attivo",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, error: error?.message ?? "Voce non salvata." };
  await writeAuditLog({
    entity_type: "haccp_routine_voci",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Routine HACCP «${input.titolo}» aggiunta.`,
    payload: { categoriaId: input.categoriaId, scadenzaAt: input.scadenzaAt },
  });
  return { success: true };
}
