"use server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type NazioneIndirizzo = { iso2: string; nome: string };

export async function listNazioniIndirizzoAction(): Promise<
  { success: true; nazioni: NazioneIndirizzo[] } | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.userId) return { success: false, error: "Accesso negato." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geo_nazioni")
    .select("iso2, nome")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const nazioni = (data ?? []).map((row) => ({
    iso2: String(row.iso2 ?? ""),
    nome: String(row.nome ?? ""),
  }));
  return { success: true, nazioni };
}
