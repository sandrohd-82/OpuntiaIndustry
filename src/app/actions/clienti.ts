"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceTarga,
  nextSequentialCodiceTarga,
} from "@/lib/amministrazione/codice-targa";
import {
  mapClienteRow,
  normalizeClienteInput,
  type Cliente,
  type ClienteInput,
} from "@/lib/amministrazione/clienti";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { ClienteInsert, ClienteRow } from "@/types/database";

export type ClientiActionResult =
  | { success: true; cliente: Cliente }
  | { success: false; error: string };

async function loadUsedCodiciTarga(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clienti").select("codice_targa");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.codice_targa));
}

export async function previewNextCodiceTargaClienteAction(): Promise<
  | { success: true; codiceTarga: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const used = await loadUsedCodiciTarga();
    return {
      success: true,
      codiceTarga: nextSequentialCodiceTarga("C", used),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima codice non disponibile.",
    };
  }
}

export async function listClientiAction(): Promise<
  | { success: true; clienti: Cliente[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as ClienteRow[];
  return {
    success: true,
    clienti: rows.map(mapClienteRow),
  };
}

export async function createClienteAction(
  input: ClienteInput
): Promise<ClientiActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const normalized = normalizeClienteInput(input);
  if (!normalized.ragioneSociale || !normalized.partitaIva) {
    return {
      success: false,
      error: "Ragione sociale e P. IVA sono obbligatorie.",
    };
  }

  let codiceTarga = normalized.codiceTarga;
  try {
    const used = await loadUsedCodiciTarga();
    if (
      !codiceTarga ||
      !isValidCodiceTarga(codiceTarga, "C") ||
      used.includes(codiceTarga)
    ) {
      codiceTarga = nextSequentialCodiceTarga("C", used);
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Generazione codice targa fallita.",
    };
  }

  const insert: ClienteInsert = {
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
    .from("clienti")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      try {
        const used = await loadUsedCodiciTarga();
        const retryInsert: ClienteInsert = {
          ...insert,
          codice_targa: nextSequentialCodiceTarga("C", used),
        };
        const retry = await supabase
          .from("clienti")
          .insert(retryInsert)
          .select("*")
          .single();
        if (!retry.error && retry.data) {
          return {
            success: true,
            cliente: mapClienteRow(retry.data as ClienteRow),
          };
        }
      } catch {
        // fall through
      }
    }

    return {
      success: false,
      error: error?.message ?? "Salvataggio cliente non riuscito.",
    };
  }

  return {
    success: true,
    cliente: mapClienteRow(data as ClienteRow),
  };
}

export async function updateClienteAction(
  id: string,
  input: ClienteInput
): Promise<ClientiActionResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const normalized = normalizeClienteInput(input);
  if (!normalized.ragioneSociale || !normalized.partitaIva) {
    return {
      success: false,
      error: "Ragione sociale e P. IVA sono obbligatorie.",
    };
  }

  const { data, error } = await supabase
    .from("clienti")
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
    cliente: mapClienteRow(data as ClienteRow),
  };
}
