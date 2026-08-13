"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { CalendarioImpegno } from "@/lib/amministrazione/calendario-produzione";
import type { ProduzioneCalendarioImpegnoRow } from "@/types/database";

export async function listCalendarioImpegniAction(input: {
  from: string;
  to: string;
}): Promise<
  | { success: true; impegni: CalendarioImpegno[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_calendario_impegni")
    .select("id, data_giorno, ordine_id, linea_codice, etichetta")
    .is("deleted_at", null)
    .gte("data_giorno", input.from)
    .lte("data_giorno", input.to)
    .order("data_giorno", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    impegni: ((data ?? []) as ProduzioneCalendarioImpegnoRow[]).map((r) => ({
      id: r.id,
      dataGiorno: r.data_giorno,
      ordineId: r.ordine_id,
      etichetta: r.etichetta ?? "",
      lineaCodice: r.linea_codice,
    })),
  };
}

/** Sposta un impegno esistente su un’altra data libera (o sostituisce). */
export async function spostaImpegnoCalendarioAction(input: {
  impegnoId: string;
  nuovaData: string;
  sostituisciSeOccupato?: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (input.sostituisciSeOccupato) {
    const { data: existing } = await supabase
      .from("produzione_calendario_impegni")
      .select("id")
      .eq("data_giorno", input.nuovaData)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("produzione_calendario_impegni")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", existing.id);
    }
  }

  const { error } = await supabase
    .from("produzione_calendario_impegni")
    .update({
      data_giorno: input.nuovaData,
      updated_by: auth.userId,
    })
    .eq("id", input.impegnoId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
