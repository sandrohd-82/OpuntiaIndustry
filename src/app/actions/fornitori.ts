"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceTarga,
  nextSequentialCodiceTarga,
} from "@/lib/amministrazione/codice-targa";
import {
  mapFornitoreRow,
  normalizeFornitoreInput,
  type Fornitore,
  type FornitoreInput,
} from "@/lib/amministrazione/fornitori";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { FornitoreInsert, FornitoreRow } from "@/types/database";

export type FornitoriActionResult =
  | { success: true; fornitore: Fornitore }
  | { success: false; error: string };

async function loadUsedCodiciTarga(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fornitori").select("codice_targa");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.codice_targa));
}

export async function previewNextCodiceTargaAction(): Promise<
  | { success: true; codiceTarga: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const used = await loadUsedCodiciTarga();
    return {
      success: true,
      codiceTarga: nextSequentialCodiceTarga("F", used),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima codice non disponibile.",
    };
  }
}

export async function listFornitoriAction(): Promise<
  | { success: true; fornitori: Fornitore[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fornitori")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as FornitoreRow[];
  return {
    success: true,
    fornitori: rows.map(mapFornitoreRow),
  };
}

export async function createFornitoreAction(
  input: FornitoreInput
): Promise<FornitoriActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const normalized = normalizeFornitoreInput(input);
  if (!normalized.ragioneSociale || !normalized.partitaIva) {
    return {
      success: false,
      error: "Ragione sociale e P. IVA sono obbligatorie.",
    };
  }

  let codiceTarga = normalized.codiceTarga;
  try {
    const used = await loadUsedCodiciTarga();
    if (!codiceTarga || !isValidCodiceTarga(codiceTarga, "F") || used.includes(codiceTarga)) {
      codiceTarga = nextSequentialCodiceTarga("F", used);
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Generazione codice targa fallita.",
    };
  }

  const insert: FornitoreInsert = {
    codice_targa: codiceTarga,
    ragione_sociale: normalized.ragioneSociale,
    partita_iva: normalized.partitaIva,
    sede_amm_nazione: normalized.sedeAmministrativa.nazione,
    sede_amm_provincia: normalized.sedeAmministrativa.provincia,
    sede_amm_citta: normalized.sedeAmministrativa.citta,
    sede_amm_cap: normalized.sedeAmministrativa.cap,
    sede_amm_indirizzo: normalized.sedeAmministrativa.indirizzo,
    sede_mag_nazione: normalized.sedeMagazzino.nazione,
    sede_mag_provincia: normalized.sedeMagazzino.provincia,
    sede_mag_citta: normalized.sedeMagazzino.citta,
    sede_mag_cap: normalized.sedeMagazzino.cap,
    sede_mag_indirizzo: normalized.sedeMagazzino.indirizzo,
    prodotti_acquistati: normalized.prodottiAcquistati,
    created_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("fornitori")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    // Collisione concorrente: riprova con il prossimo codice libero
    if (error?.code === "23505") {
      try {
        const used = await loadUsedCodiciTarga();
        const retryInsert: FornitoreInsert = {
          ...insert,
          codice_targa: nextSequentialCodiceTarga("F", used),
        };
        const retry = await supabase
          .from("fornitori")
          .insert(retryInsert)
          .select("*")
          .single();
        if (!retry.error && retry.data) {
          return {
            success: true,
            fornitore: mapFornitoreRow(retry.data as FornitoreRow),
          };
        }
      } catch {
        // fall through
      }
    }

    return {
      success: false,
      error: error?.message ?? "Salvataggio fornitore non riuscito.",
    };
  }

  return {
    success: true,
    fornitore: mapFornitoreRow(data as FornitoreRow),
  };
}

export async function updateFornitoreAction(
  id: string,
  input: FornitoreInput
): Promise<FornitoriActionResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const normalized = normalizeFornitoreInput(input);
  if (!normalized.ragioneSociale || !normalized.partitaIva) {
    return {
      success: false,
      error: "Ragione sociale e P. IVA sono obbligatorie.",
    };
  }

  // La targa non è mai modificabile dopo l'assegnazione
  const { data, error } = await supabase
    .from("fornitori")
    .update({
      ragione_sociale: normalized.ragioneSociale,
      partita_iva: normalized.partitaIva,
      sede_amm_nazione: normalized.sedeAmministrativa.nazione,
      sede_amm_provincia: normalized.sedeAmministrativa.provincia,
      sede_amm_citta: normalized.sedeAmministrativa.citta,
      sede_amm_cap: normalized.sedeAmministrativa.cap,
      sede_amm_indirizzo: normalized.sedeAmministrativa.indirizzo,
      sede_mag_nazione: normalized.sedeMagazzino.nazione,
      sede_mag_provincia: normalized.sedeMagazzino.provincia,
      sede_mag_citta: normalized.sedeMagazzino.citta,
      sede_mag_cap: normalized.sedeMagazzino.cap,
      sede_mag_indirizzo: normalized.sedeMagazzino.indirizzo,
      prodotti_acquistati: normalized.prodottiAcquistati,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Aggiornamento scheda non riuscito.",
    };
  }

  return {
    success: true,
    fornitore: mapFornitoreRow(data as FornitoreRow),
  };
}
