"use server";

import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { writeAuditLog } from "@/lib/audit";
import {
  labelSede,
  type ImpostazioniSede,
} from "@/lib/impostazioni/sedi";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const COLS =
  "id, codice, nome, indirizzo, cap, citta, provincia, nazione, attiva";

function mapSede(r: Record<string, unknown>): ImpostazioniSede {
  return {
    id: String(r.id),
    codice: String(r.codice ?? ""),
    nome: String(r.nome ?? ""),
    indirizzo: String(r.indirizzo ?? ""),
    cap: String(r.cap ?? ""),
    citta: String(r.citta ?? ""),
    provincia: String(r.provincia ?? ""),
    nazione: String(r.nazione ?? ""),
    attiva: r.attiva !== false,
  };
}

export async function listSediAttiveAction(): Promise<
  | { success: true; sedi: ImpostazioniSede[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "impostazioni",
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impostazioni_sedi")
    .select(COLS)
    .is("deleted_at", null)
    .eq("attiva", true)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    sedi: (data ?? []).map((r) => mapSede(r as Record<string, unknown>)),
  };
}

const sedePartenzaSchema = z.object({
  entityType: z.enum(["campionatura", "ordine"]),
  entityId: z.string().uuid(),
  sedeId: z.string().uuid().nullable(),
});

export async function updateSedePartenzaAction(
  raw: unknown
): Promise<
  | { success: true; sedeLabel: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
  const parsed = sedePartenzaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Sede di partenza non valida." };
  }
  const d = parsed.data;
  const supabase = await createClient();
  let sedeLabel = "";
  if (d.sedeId) {
    const { data: sede, error } = await supabase
      .from("impostazioni_sedi")
      .select(COLS)
      .eq("id", d.sedeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !sede) {
      return { success: false, error: "Sede non trovata nel catalogo." };
    }
    sedeLabel = labelSede(mapSede(sede as Record<string, unknown>));
  }
  const table = d.entityType === "ordine" ? "ordini" : "campionature";
  const { error: updErr } = await supabase
    .from(table)
    .update({
      sede_partenza_id: d.sedeId,
      updated_by: auth.userId,
    })
    .eq("id", d.entityId)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: table,
    entity_id: d.entityId,
    action: "sede_partenza",
    actor_id: auth.userId,
    summary: d.sedeId
      ? `Sede di partenza: ${sedeLabel}`
      : "Sede di partenza rimossa",
    payload: { sede_partenza_id: d.sedeId },
  });
  return { success: true, sedeLabel };
}
