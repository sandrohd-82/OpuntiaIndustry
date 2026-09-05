import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttivitaAzione, AttivitaOrigine } from "@/lib/produzione/macchinari";
import { createClient } from "@/lib/supabase/server";

async function resolveOpenFoglioId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id")
    .eq("stato", "aperto")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveAreaId(
  supabase: SupabaseClient,
  macchinarioId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("produzione_macchinari")
    .select("area_id")
    .eq("id", macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { area_id: string } | null)?.area_id ?? null;
}

export async function recordMacchinarioAttivita(input: {
  supabase?: SupabaseClient;
  macchinarioId: string;
  areaId?: string | null;
  azione: AttivitaAzione;
  origine: AttivitaOrigine;
  eventoLineaId?: string | null;
  foglioId?: string | null;
  actorId: string | null;
  actorNome: string;
  note: string;
}): Promise<{ error: string | null }> {
  const supabase = input.supabase ?? (await createClient());
  const areaId =
    input.areaId ?? (await resolveAreaId(supabase, input.macchinarioId));
  if (!areaId) return { error: "Macchinario non trovato per lo storico." };
  const foglioId =
    input.foglioId === undefined
      ? await resolveOpenFoglioId(supabase)
      : input.foglioId;
  const { error } = await supabase.from("produzione_macchinario_attivita").insert({
    macchinario_id: input.macchinarioId,
    area_id: areaId,
    azione: input.azione,
    origine: input.origine,
    evento_linea_id: input.eventoLineaId ?? null,
    foglio_id: foglioId,
    actor_nome: input.actorNome,
    note: input.note,
    created_by: input.actorId,
  });
  if (error) {
    console.error("[attivita]", error.message);
    return { error: error.message };
  }
  return { error: null };
}
