"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  type HaccpCategoria,
  type HaccpLineaGuida,
  type HaccpStatoGuida,
  type HaccpStatoVoce,
  type HaccpVoce,
} from "@/lib/produzione/haccp";
import { createClient } from "@/lib/supabase/server";

const statoGuida = z.enum(["bozza", "approvato", "chiuso"]);

const guidaSchema = z.object({
  id: z.string().uuid().optional(),
  titolo: z.string().trim().min(2).max(160),
  corpo: z.string().trim().max(20000),
  stato: statoGuida,
});

const voceSchema = z.object({
  titolo: z.string().trim().min(2).max(120),
  categoriaId: z.string().uuid(),
  scadenzaAt: z.string().datetime({ offset: true }),
});

export async function listHaccpLineeGuidaAction(): Promise<
  { success: true; sezioni: HaccpLineaGuida[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("haccp_linee_guida")
    .select("id, slug, titolo, corpo, ordine, versione, stato, updated_at")
    .is("deleted_at", null)
    .order("ordine", { ascending: true });
  if (error) return { success: false, error: error.message };
  const sezioni = (data ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    titolo: String(row.titolo),
    corpo: String(row.corpo ?? ""),
    ordine: Number(row.ordine) || 0,
    versione: Number(row.versione) || 1,
    stato: String(row.stato) as HaccpStatoGuida,
    updatedAt: String(row.updated_at),
  }));
  return { success: true, sezioni };
}

export async function salvaHaccpLineaGuidaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = guidaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Testo non valido." };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (!input.id) {
    const slug = input.titolo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `sezione-${Date.now()}`;
    const { data: ordineRow } = await supabase
      .from("haccp_linee_guida")
      .select("ordine")
      .is("deleted_at", null)
      .order("ordine", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordine = Number(ordineRow?.ordine ?? 0) + 1;
    const { data, error } = await supabase
      .from("haccp_linee_guida")
      .insert({
        slug: `${slug}-${ordine}`,
        titolo: input.titolo,
        corpo: input.corpo,
        ordine,
        versione: 1,
        stato: input.stato,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { success: false, error: error?.message ?? "Sezione non salvata." };
    await writeAuditLog({
      entity_type: "haccp_linee_guida",
      entity_id: String(data.id),
      action: "create",
      actor_id: auth.userId,
      summary: `Linea guida HACCP «${input.titolo}» creata in ${input.stato}.`,
      payload: { versione: 1, stato: input.stato },
    });
    return { success: true };
  }

  const { data: attuale, error: readErr } = await supabase
    .from("haccp_linee_guida")
    .select("id, versione, titolo")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !attuale) {
    return { success: false, error: readErr?.message ?? "Sezione non trovata." };
  }
  const versione = Number(attuale.versione) + 1;
  const { error } = await supabase
    .from("haccp_linee_guida")
    .update({
      titolo: input.titolo,
      corpo: input.corpo,
      stato: input.stato,
      versione,
      updated_at: now,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "haccp_linee_guida",
    entity_id: input.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Linea guida HACCP «${input.titolo}» aggiornata alla versione ${versione}.`,
    payload: { versione, stato: input.stato },
  });
  return { success: true };
}

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
