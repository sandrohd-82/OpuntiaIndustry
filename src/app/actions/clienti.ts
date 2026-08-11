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
import { markAnagraficaArchivioRipescatoAction } from "@/app/actions/anagrafiche-archivio";
import { writeAuditLog } from "@/lib/audit";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { ClienteInsert, ClienteRow } from "@/types/database";

export type ClientiActionResult =
  | { success: true; cliente: Cliente }
  | { success: false; error: string };

/** Targhe che bloccano la sequenza: attive + soft-delete con ordini collegati. */
async function loadUsedCodiciTarga(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti")
    .select("id, codice_targa, deleted_at");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    codice_targa: string;
    deleted_at: string | null;
  }>;
  const active = rows
    .filter((r) => !r.deleted_at)
    .map((r) => String(r.codice_targa).toUpperCase());
  const softIds = rows.filter((r) => r.deleted_at).map((r) => r.id);
  if (softIds.length === 0) return active;

  const { data: ordini, error: ordError } = await supabase
    .from("ordini")
    .select("cliente_id")
    .in("cliente_id", softIds)
    .is("deleted_at", null);
  if (ordError) throw new Error(ordError.message);

  const busy = new Set(
    (ordini ?? [])
      .map((o) => String(o.cliente_id))
      .filter(Boolean)
  );
  const softBusy = rows
    .filter((r) => r.deleted_at && busy.has(r.id))
    .map((r) => String(r.codice_targa).toUpperCase());

  return [...new Set([...active, ...softBusy])];
}

async function assertPartitaIvaUnica(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partitaIva: string,
  excludeId?: string
): Promise<string | null> {
  const vat = normalizeVatKey(partitaIva);
  if (!vat) return "La partita IVA è obbligatoria.";
  const { data, error } = await supabase
    .from("clienti")
    .select("id, partita_iva, codice_targa, ragione_sociale")
    .is("deleted_at", null);
  if (error) return error.message;
  const dup = (
    (data ?? []) as Array<{
      id: string;
      partita_iva: string;
      codice_targa: string;
      ragione_sociale: string;
    }>
  ).find(
    (row) =>
      normalizeVatKey(row.partita_iva) === vat &&
      (!excludeId || row.id !== excludeId)
  );
  if (dup) {
    return `P. IVA già presente su ${dup.codice_targa} — ${dup.ragione_sociale}.`;
  }
  return null;
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
      error: "Ragione sociale e P. IVA sono obbligatorie. Salvataggio vuoto non consentito.",
    };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva
  );
  if (vatError) return { success: false, error: vatError };

  let codiceTarga = normalized.codiceTarga?.toUpperCase();
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

  if (input.archivioId) {
    await markAnagraficaArchivioRipescatoAction({
      kind: "cliente",
      archivioId: input.archivioId,
    });
  }

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
      error: "Ragione sociale e P. IVA sono obbligatorie. Salvataggio vuoto non consentito.",
    };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva,
    id
  );
  if (vatError) return { success: false, error: vatError };

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
}): Promise<
  | { success: true; mode: "archived" | "soft_deleted" }
  | { success: false; error: string }
> {
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

  const { count, error: actError } = await supabase
    .from("ordini")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", input.id)
    .is("deleted_at", null);
  if (actError) return { success: false, error: actError.message };

  if ((count ?? 0) === 0) {
    const { data: archived, error: rpcError } = await supabase.rpc(
      "archive_unused_cliente",
      {
        p_id: input.id,
        p_motivo: "eliminata",
        p_note: "Eliminazione scheda senza attività",
        p_actor: auth.userId,
      }
    );
    if (rpcError) {
      if (rpcError.message.includes("HAS_ACTIVITY")) {
        // fall through to soft delete
      } else {
        return { success: false, error: rpcError.message };
      }
    } else {
      const payload = (archived ?? {}) as {
        archivio_id?: string;
        former_codice_targa?: string;
      };
      await writeAuditLog({
        entity_type: "clienti_archivio",
        entity_id: payload.archivio_id ?? input.id,
        action: "soft_delete",
        actor_id: auth.userId,
        summary: `Cliente ${codice} archiviato (targa liberata)`,
        payload: {
          former_codice_targa: codice,
          ragione_sociale: existing.ragione_sociale,
          conferma: expected,
        },
      });
      return { success: true, mode: "archived" };
    }
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
    summary: `Soft delete cliente ${codice} (con attività — targa bloccata)`,
    payload: {
      codice_targa: codice,
      ragione_sociale: existing.ragione_sociale,
      conferma: expected,
    },
  });

  return { success: true, mode: "soft_deleted" };
}
