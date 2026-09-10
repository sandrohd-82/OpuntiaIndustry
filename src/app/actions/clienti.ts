"use server";

import { createClient } from "@/lib/supabase/server";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import {
  consegneToDb,
  mapClienteRow,
  normalizeClienteInput,
  validateClienteFiscali,
  type Cliente,
  type ClienteInput,
} from "@/lib/amministrazione/clienti";
import { markAnagraficaArchivioRipescatoAction } from "@/app/actions/anagrafiche-archivio";
import { writeAuditLog } from "@/lib/audit";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { assertAnagraficaPrivilege } from "@/lib/auth/anagrafica-privileges-server";
import {
  parseAnagraficaOrdineFromRaw,
  type AnagraficaOrdineFonte,
} from "@/lib/amministrazione/ordine-anagrafica";
import {
  anagraficaLineageOrFilter,
  loadCommercialLineageUserIds,
  loadCommercialeLabels,
} from "@/lib/auth/commerciale-lineage";
import { resolveScopeMode } from "@/lib/auth/data-scope-enforce";
import { syncCommercialeOnSchedaUpdate } from "@/app/actions/commerciale-anagrafica";
import type { ClienteInsert, ClienteRow } from "@/types/database";
import { z } from "zod";

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
  if (!vat) return null;
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

async function assertCodiceFiscaleUnico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codiceFiscale: string,
  excludeId?: string
): Promise<string | null> {
  const cf = normalizeVatKey(codiceFiscale);
  if (!cf) return null;
  const { data, error } = await supabase
    .from("clienti")
    .select("id, codice_fiscale, codice_targa, ragione_sociale")
    .is("deleted_at", null);
  if (error) return error.message;
  const dup = (
    (data ?? []) as Array<{
      id: string;
      codice_fiscale: string;
      codice_targa: string;
      ragione_sociale: string;
    }>
  ).find(
    (row) =>
      normalizeVatKey(row.codice_fiscale) === cf &&
      (!excludeId || row.id !== excludeId)
  );
  if (dup) {
    return `Codice fiscale già presente su ${dup.codice_targa} — ${dup.ragione_sociale}.`;
  }
  return null;
}

export async function previewNextCodiceTargaClienteAction(): Promise<
  | { success: true; codiceTarga: string }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
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
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const supabase = await createClient();
  const scope = await resolveScopeMode("anagrafiche_clienti");

  let q = supabase
    .from("clienti")
    .select("*")
    .is("deleted_at", null);
  if (scope && !scope.skip && scope.mode === "proprie") {
    const lineage = await loadCommercialLineageUserIds(scope.userId);
    q = q.or(anagraficaLineageOrFilter(lineage));
  }
  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as ClienteRow[];
  const labels = await loadCommercialeLabels(
    rows.map((r) => r.commerciale_id ?? "").filter(Boolean)
  );
  return {
    success: true,
    clienti: rows.map((row) => {
      const label = row.commerciale_id
        ? labels.get(row.commerciale_id)
        : undefined;
      return mapClienteRow(row, label);
    }),
  };
}

export async function createClienteAction(
  input: ClienteInput
): Promise<ClientiActionResult> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "webmail",
    "commerciale",
  ]);
  const supabase = await createClient();

  const normalized = normalizeClienteInput(input);
  const fiscalErr = validateClienteFiscali(normalized);
  if (fiscalErr) {
    return { success: false, error: fiscalErr };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva
  );
  if (vatError) return { success: false, error: vatError };
  const cfError = await assertCodiceFiscaleUnico(
    supabase,
    normalized.codiceFiscale
  );
  if (cfError) return { success: false, error: cfError };

  let codiceTarga: string;
  try {
    // Create: ignora targa prenotata dalla coda — sempre la prima libera (C001…).
    const used = await loadUsedCodiciTarga();
    codiceTarga = nextSequentialCodiceTarga("C", used);
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
    codice_fiscale: normalized.codiceFiscale,
    is_privato: normalized.isPrivato,
    email: normalized.email ?? "",
    pec: normalized.pec ?? "",
    sdi_code: normalized.sdiCode ?? "",
    telefono: normalized.telefono ?? "",
    sito_web: normalized.sitoWeb ?? "",
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
    commerciale_id: normalized.commercialeId ?? null,
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
    cliente: mapClienteRow(row, { nome: "", grado: null }),
  };
}

export async function updateClienteAction(
  id: string,
  input: ClienteInput
): Promise<ClientiActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data: existingCliente } = await supabase
    .from("clienti")
    .select("created_by, commerciale_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const editGate = await assertAnagraficaPrivilege({
    kind: "cliente",
    op: "update",
    createdBy: existingCliente?.created_by
      ? String(existingCliente.created_by)
      : null,
    commercialeId: existingCliente?.commerciale_id
      ? String(existingCliente.commerciale_id)
      : null,
  });
  if (!editGate.ok) return { success: false, error: editGate.error };

  const normalized = normalizeClienteInput(input);
  const fiscalErr = validateClienteFiscali(normalized);
  if (fiscalErr) {
    return { success: false, error: fiscalErr };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva,
    id
  );
  if (vatError) return { success: false, error: vatError };
  const cfError = await assertCodiceFiscaleUnico(
    supabase,
    normalized.codiceFiscale,
    id
  );
  if (cfError) return { success: false, error: cfError };

  const { data, error } = await supabase
    .from("clienti")
    .update({
      ragione_sociale: normalized.ragioneSociale,
      partita_iva: normalized.partitaIva,
      codice_fiscale: normalized.codiceFiscale,
      is_privato: normalized.isPrivato,
      email: normalized.email ?? "",
      pec: normalized.pec ?? "",
      sdi_code: normalized.sdiCode ?? "",
      telefono: normalized.telefono ?? "",
      sito_web: normalized.sitoWeb ?? "",
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

  const sync = await syncCommercialeOnSchedaUpdate({
    aziendaTipo: "cliente",
    aziendaId: id,
    commercialeId: input.commercialeId,
    currentId: existingCliente?.commerciale_id
      ? String(existingCliente.commerciale_id)
      : null,
  });
  if (!sync.ok) return { success: false, error: sync.error };

  let row = data as ClienteRow;
  if (input.commercialeId !== undefined) {
    const { data: fresh } = await supabase
      .from("clienti")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fresh) row = fresh as ClienteRow;
  }

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

  const labels = row.commerciale_id
    ? await loadCommercialeLabels([String(row.commerciale_id)])
    : new Map();
  return {
    success: true,
    cliente: mapClienteRow(
      row,
      row.commerciale_id ? labels.get(String(row.commerciale_id)) : undefined
    ),
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
    .select("id, codice_targa, ragione_sociale, created_by, commerciale_id, deleted_at")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError) return { success: false, error: loadError.message };
  if (!existing || existing.deleted_at) {
    return { success: false, error: "Cliente non trovato." };
  }
  const delGate = await assertAnagraficaPrivilege({
    kind: "cliente",
    op: "delete",
    createdBy: existing.created_by ? String(existing.created_by) : null,
    commercialeId: existing.commerciale_id
      ? String(existing.commerciale_id)
      : null,
  });
  if (!delGate.ok) return { success: false, error: delGate.error };

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

async function mapClienteWithLabel(
  row: ClienteRow
): Promise<Cliente> {
  const labels = row.commerciale_id
    ? await loadCommercialeLabels([row.commerciale_id])
    : new Map();
  const label = row.commerciale_id
    ? labels.get(row.commerciale_id)
    : undefined;
  return mapClienteRow(row, label);
}

async function findClienteByFiscali(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partitaIva: string,
  codiceFiscale: string
): Promise<ClienteRow | null> {
  const vat = normalizeVatKey(partitaIva);
  const cf = normalizeVatKey(codiceFiscale);
  if (!vat && !cf) return null;
  const { data, error } = await supabase
    .from("clienti")
    .select("*")
    .is("deleted_at", null);
  if (error) return null;
  const rows = (data ?? []) as ClienteRow[];
  if (vat) {
    const hit = rows.find((r) => normalizeVatKey(r.partita_iva) === vat);
    if (hit) return hit;
  }
  if (cf) {
    const hit = rows.find((r) => normalizeVatKey(r.codice_fiscale) === cf);
    if (hit) return hit;
  }
  return null;
}

async function loadClienteById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<Cliente | null> {
  const { data } = await supabase
    .from("clienti")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return mapClienteWithLabel(data as ClienteRow);
}

async function markLeadConvertito(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  leadId: string;
  clienteId: string;
  ragioneSociale: string;
  actorId: string;
  linkedExisting: boolean;
}): Promise<void> {
  await opts.supabase
    .from("clienti_possibili")
    .update({
      stato: "convertito",
      cliente_id: opts.clienteId,
      updated_by: opts.actorId,
    })
    .eq("id", opts.leadId)
    .is("deleted_at", null);

  await writeAuditLog({
    entity_type: "clienti_possibili",
    entity_id: opts.leadId,
    action: "update",
    actor_id: opts.actorId,
    summary: opts.linkedExisting
      ? `Possibile cliente collegato a cliente esistente: ${opts.ragioneSociale}`
      : `Possibile cliente convertito in cliente: ${opts.ragioneSociale}`,
    payload: {
      cliente_id: opts.clienteId,
      linked_existing: opts.linkedExisting,
    },
  });
}

export async function convertClientePossibileAdClienteAction(
  possibileClienteId: string
): Promise<ClientiActionResult> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
  ]);
  if (!z.string().uuid().safeParse(possibileClienteId).success) {
    return { success: false, error: "Possibile cliente non valido." };
  }

  const supabase = await createClient();
  const { data: leadRow, error: leadErr } = await supabase
    .from("clienti_possibili")
    .select("*")
    .eq("id", possibileClienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadErr || !leadRow) {
    return {
      success: false,
      error: leadErr?.message ?? "Possibile cliente non trovato.",
    };
  }

  const gate = await assertAnagraficaPrivilege({
    kind: "cliente_possibile",
    op: "update",
    createdBy: leadRow.created_by ? String(leadRow.created_by) : null,
    commercialeId: leadRow.commerciale_id
      ? String(leadRow.commerciale_id)
      : null,
  });
  if (!gate.ok) return { success: false, error: gate.error };

  const stato = String(leadRow.stato ?? "");
  if (stato === "scartato") {
    return {
      success: false,
      error: "Il possibile cliente è scartato: non si può usare per un ordine.",
    };
  }

  const existingLinkedId = leadRow.cliente_id
    ? String(leadRow.cliente_id)
    : "";
  if (existingLinkedId) {
    const linked = await loadClienteById(supabase, existingLinkedId);
    if (linked) {
      if (stato !== "convertito") {
        await markLeadConvertito({
          supabase,
          leadId: String(leadRow.id),
          clienteId: linked.id,
          ragioneSociale: linked.ragioneSociale,
          actorId: auth.userId,
          linkedExisting: true,
        });
      }
      return { success: true, cliente: linked };
    }
  }

  const input: ClienteInput = {
    ragioneSociale: String(leadRow.ragione_sociale ?? ""),
    partitaIva: String(leadRow.partita_iva ?? ""),
    codiceFiscale: String(leadRow.codice_fiscale ?? ""),
    isPrivato: Boolean(leadRow.is_privato),
    email: String(leadRow.email ?? ""),
    pec: String(leadRow.pec ?? ""),
    sdiCode: String(leadRow.sdi_code ?? ""),
    telefono: String(leadRow.telefono ?? ""),
    sitoWeb: String(leadRow.sito_web ?? ""),
    sedeAmministrativa: {
      nazione: String(leadRow.sede_amm_nazione ?? ""),
      provincia: String(leadRow.sede_amm_provincia ?? ""),
      citta: String(leadRow.sede_amm_citta ?? ""),
      cap: String(leadRow.sede_amm_cap ?? ""),
      indirizzo: String(leadRow.sede_amm_indirizzo ?? ""),
    },
    sedeMagazzino: {
      nazione: String(leadRow.sede_mag_nazione ?? ""),
      provincia: String(leadRow.sede_mag_provincia ?? ""),
      citta: String(leadRow.sede_mag_citta ?? ""),
      cap: String(leadRow.sede_mag_cap ?? ""),
      indirizzo: String(leadRow.sede_mag_indirizzo ?? ""),
    },
    consegneAltraAzienda: Array.isArray(leadRow.consegne_altra_azienda)
      ? (leadRow.consegne_altra_azienda as ClienteRow["consegne_altra_azienda"]).map(
          (c) => ({
            ragioneSociale: String(c.ragione_sociale ?? ""),
            nazione: String(c.nazione ?? ""),
            provincia: String(c.provincia ?? ""),
            citta: String(c.citta ?? ""),
            cap: String(c.cap ?? ""),
            indirizzo: String(c.indirizzo ?? ""),
          })
        )
      : [],
    prodottiAcquistati: Array.isArray(leadRow.prodotti_interessati)
      ? (leadRow.prodotti_interessati as string[]).map(String).filter(Boolean)
      : [],
    commercialeId: leadRow.commerciale_id
      ? String(leadRow.commerciale_id)
      : null,
  };

  const fiscalErr = validateClienteFiscali(input);
  if (fiscalErr) {
    return {
      success: false,
      error: `${fiscalErr} Completa il possibile cliente prima di creare l’ordine.`,
    };
  }

  const existing = await findClienteByFiscali(
    supabase,
    input.partitaIva,
    input.codiceFiscale
  );
  if (existing) {
    const cliente = await mapClienteWithLabel(existing);
    await markLeadConvertito({
      supabase,
      leadId: String(leadRow.id),
      clienteId: cliente.id,
      ragioneSociale: cliente.ragioneSociale,
      actorId: auth.userId,
      linkedExisting: true,
    });
    return { success: true, cliente };
  }

  const created = await createClienteAction(input);
  if (!created.success) return created;

  await markLeadConvertito({
    supabase,
    leadId: String(leadRow.id),
    clienteId: created.cliente.id,
    ragioneSociale: created.cliente.ragioneSociale,
    actorId: auth.userId,
    linkedExisting: false,
  });
  return created;
}

export async function resolveClientePerOrdineAction(input: {
  fonte?: AnagraficaOrdineFonte | string | null;
  clienteId?: string | null;
  possibileClienteId?: string | null;
}): Promise<
  | {
      success: true;
      cliente: Cliente;
      possibileClienteId: string | null;
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
    "produzione",
  ]);
  const parsed = parseAnagraficaOrdineFromRaw({
    anagraficaFonte: input.fonte,
    clienteId: input.clienteId,
    possibileClienteId: input.possibileClienteId,
  });

  if (parsed.fonte === "possibile") {
    if (!parsed.possibileClienteId) {
      return { success: false, error: "Seleziona un possibile cliente." };
    }
    const converted = await convertClientePossibileAdClienteAction(
      parsed.possibileClienteId
    );
    if (!converted.success) return converted;
    return {
      success: true,
      cliente: converted.cliente,
      possibileClienteId: parsed.possibileClienteId,
    };
  }

  if (!parsed.clienteId) {
    return { success: false, error: "Seleziona un cliente dall’anagrafica." };
  }
  const supabase = await createClient();
  const cliente = await loadClienteById(supabase, parsed.clienteId);
  if (!cliente) {
    return { success: false, error: "Cliente non trovato." };
  }
  return {
    success: true,
    cliente,
    possibileClienteId: null,
  };
}

export async function resolveClientePerOrdineFromRawAction(
  raw: unknown
): Promise<
  | {
      success: true;
      cliente: Cliente;
      possibileClienteId: string | null;
    }
  | { success: false; error: string }
> {
  const parsed = parseAnagraficaOrdineFromRaw(raw);
  return resolveClientePerOrdineAction(parsed);
}
