"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { codiceProdottoArchiviato } from "@/lib/produzione/effetto-magazzino";
import { createClient } from "@/lib/supabase/server";

export type DisponibilitaRiga = {
  codice: string;
  codiceArchiviato: string | null;
  quantitaRichiesta: number;
  giacenza: number | null;
  lotto: string;
  coperta: boolean;
};

export async function disponibilitaPfOrdineAction(ordineId: string): Promise<
  | { success: true; righe: DisponibilitaRiga[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const id = ordineId.trim();
  if (!id) return { success: false, error: "Ordine non indicato." };
  const supabase = await createClient();
  const { data: righe, error } = await supabase
    .from("ordini_righe")
    .select("prodotto_codice, quantita, lotto_codice")
    .eq("ordine_id", id)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const esito: DisponibilitaRiga[] = [];
  for (const riga of righe ?? []) {
    const digitato = String(riga.prodotto_codice ?? "").trim();
    const quantita = Number(riga.quantita) || 0;
    const lotto = String(riga.lotto_codice ?? "").trim();
    const { data: candidati } = await supabase
      .from("prodotti_propri")
      .select("id, codice")
      .ilike("codice", digitato.replace(/[%_\\]/g, (ch) => `\\${ch}`));
    const identita = codiceProdottoArchiviato(
      digitato,
      ((candidati ?? []) as Array<{ codice: string }>).map((c) => c.codice)
    );
    if (!identita.ok) {
      esito.push({
        codice: digitato,
        codiceArchiviato: null,
        quantitaRichiesta: quantita,
        giacenza: null,
        lotto,
        coperta: false,
      });
      continue;
    }
    const prodotto = ((candidati ?? []) as Array<{ id: string; codice: string }>).find(
      (c) => c.codice === identita.codice
    );
    const { data: giacenza } = await supabase
      .from("magazzino_giacenze")
      .select("quantita_kg")
      .eq("catalog_kind", "prodotto_proprio")
      .eq("prodotto_id", prodotto?.id ?? "")
      .is("deleted_at", null)
      .maybeSingle();
    const saldo = giacenza ? Number(giacenza.quantita_kg) : 0;
    esito.push({
      codice: digitato,
      codiceArchiviato: identita.codice,
      quantitaRichiesta: quantita,
      giacenza: saldo,
      lotto,
      coperta: Boolean(lotto) && saldo >= quantita,
    });
  }
  return { success: true, righe: esito };
}

export async function preparaSpedizioneOrdineAction(ordineId: string): Promise<
  | {
      success: true;
      ddtId: string;
      numero: string;
      riusata: boolean;
      scarichi: number;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const id = ordineId.trim();
  if (!id) return { success: false, error: "Ordine non indicato." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "commerciale_prepara_spedizione_ordine",
    { p_ordine_id: id }
  );
  if (error) {
    const testo = (error.message ?? "").split("\n")[0] ?? "";
    return {
      success: false,
      error: testo.replace(/^ERROR:\s*/, "") || "Spedizione non preparata.",
    };
  }
  const row = (data ?? {}) as {
    ddt_id?: string;
    numero?: string;
    riusata?: boolean;
    scarichi?: number;
  };
  return {
    success: true,
    ddtId: String(row.ddt_id ?? ""),
    numero: String(row.numero ?? ""),
    riusata: Boolean(row.riusata),
    scarichi: Number(row.scarichi ?? 0),
  };
}
