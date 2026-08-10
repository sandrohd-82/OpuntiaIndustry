"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceTarga,
  nextSequentialCodiceTarga,
} from "@/lib/amministrazione/codice-targa";
import {
  consegneToDb,
  mapClienteRow,
  normalizeClienteInput,
  type Cliente,
  type ClienteInput,
} from "@/lib/amministrazione/clienti";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
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
    .is("deleted_at", null)
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
    email: normalized.email ?? "",
    pec: normalized.pec ?? "",
    sdi_code: normalized.sdiCode ?? "",
    telefono: normalized.telefono ?? "",
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
    consegne_altra_azienda: consegneToDb(normalized.consegneAltraAzienda),
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("clienti")
    .insert(insert)
    .select("*")
    .single();

  let row = data as ClienteRow | null;
  if (error || !row) {
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
          row = retry.data as ClienteRow;
        }
      } catch {
        // fall through
      }
    }
    if (!row) {
      return {
        success: false,
        error: error?.message ?? "Salvataggio cliente non riuscito.",
      };
    }
  }

  await writeAuditLog({
    entity_type: "clienti",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata scheda cliente ${row.codice_targa}`,
    payload: {
      codice_targa: row.codice_targa,
      ragione_sociale: row.ragione_sociale,
    },
  });

  return {
    success: true,
    cliente: mapClienteRow(row),
  };
}

export async function updateClienteAction(
  id: string,
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

  const { data, error } = await supabase
    .from("clienti")
    .update({
      ragione_sociale: normalized.ragioneSociale,
      partita_iva: normalized.partitaIva,
      email: normalized.email ?? "",
      pec: normalized.pec ?? "",
      sdi_code: normalized.sdiCode ?? "",
      telefono: normalized.telefono ?? "",
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
      consegne_altra_azienda: consegneToDb(normalized.consegneAltraAzienda),
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Aggiornamento scheda non riuscito.",
    };
  }

  const row = data as ClienteRow;
  await writeAuditLog({
    entity_type: "clienti",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata scheda cliente ${row.codice_targa}`,
    payload: {
      codice_targa: row.codice_targa,
      ragione_sociale: row.ragione_sociale,
    },
  });

  return {
    success: true,
    cliente: mapClienteRow(row),
  };
}

export async function softDeleteClienteAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("clienti")
    .select("id, codice_targa, ragione_sociale, deleted_at")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError) return { success: false, error: loadError.message };
  if (!existing || existing.deleted_at) {
    return { success: false, error: "Cliente non trovato." };
  }

  const codice = String(existing.codice_targa);
  const expected = fraseConfermaSoftDelete(codice);
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const { error } = await supabase
    .from("clienti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "clienti",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Soft delete cliente ${codice}`,
    payload: {
      codice_targa: codice,
      ragione_sociale: existing.ragione_sociale,
      conferma: expected,
    },
  });

  return { success: true };
}
