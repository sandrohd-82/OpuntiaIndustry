"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildNumeroInternoOrdine,
  fraseConfermaEliminazione,
  mapOrdineRow,
  ordineInputSchema,
  ORDINI_ALLEGATI_BUCKET,
  totaleOrdine,
  type Ordine,
  type OrdineInput,
} from "@/lib/amministrazione/ordini";
import { requireAreaAccess } from "@/lib/areas/guard";
import type {
  AuditLogInsert,
  OrdineInsert,
  OrdineRigaInsert,
  OrdineRigaRow,
  OrdineRow,
  OrdineStato,
} from "@/types/database";

export type OrdiniActionResult =
  | { success: true; ordine: Ordine }
  | { success: false; error: string };

async function writeAudit(input: AuditLogInsert) {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_log").insert(input);
  if (error) {
    console.error("[audit_log]", error.message, input);
  }
}

async function loadOrdineWithRighe(id: string): Promise<Ordine | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("ordini")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return null;

  const { data: righe } = await supabase
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", id)
    .order("sort_order", { ascending: true });

  return mapOrdineRow(row as OrdineRow, (righe ?? []) as OrdineRigaRow[]);
}

async function nextSeqForCliente(
  clienteId: string,
  codiceTarga: string
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select("numero_interno, cliente_id")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^Or-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of data ?? []) {
    if (row.cliente_id === clienteId) countById += 1;
    const m = String(row.numero_interno).match(re);
    if (m) maxParsed = Math.max(maxParsed, Number(m[1]));
  }
  return Math.max(countById, maxParsed) + 1;
}

async function uploadAllegato(
  ordineId: string,
  kind: "offerta" | "ordine-cliente",
  file: File
): Promise<{ path: string; name: string } | { error: string }> {
  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${ordineId}/${kind}-${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(ORDINI_ALLEGATI_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (error) return { error: error.message };
  return { path, name: file.name };
}

async function replaceRighe(
  ordineId: string,
  righe: OrdineInput["righe"]
): Promise<string | null> {
  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from("ordini_righe")
    .delete()
    .eq("ordine_id", ordineId);
  if (delErr) return delErr.message;

  const inserts: OrdineRigaInsert[] = righe.map((r, i) => ({
    ordine_id: ordineId,
    prodotto_id: r.prodottoId || null,
    prodotto_codice: r.prodottoCodice,
    prodotto_nome: r.prodottoNome,
    quantita: r.quantita,
    prezzo_unitario: r.prezzoUnitario,
    iva_percentuale: r.ivaPercentuale,
    sort_order: i,
  }));

  const { error: insErr } = await supabase.from("ordini_righe").insert(inserts);
  return insErr?.message ?? null;
}

export async function listOrdiniAction(
  stato: OrdineStato
): Promise<{ success: true; ordini: Ordine[] } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ordini")
    .select("*")
    .eq("stato", stato)
    .is("deleted_at", null)
    .order(
      stato === "storico" ? "data_consegna" : "data_ordine",
      { ascending: false }
    );

  if (error) return { success: false, error: error.message };

  const ids = (data ?? []).map((r) => r.id);
  let righeByOrdine = new Map<string, OrdineRigaRow[]>();
  if (ids.length > 0) {
    const { data: righe } = await supabase
      .from("ordini_righe")
      .select("*")
      .in("ordine_id", ids);
    for (const r of (righe ?? []) as OrdineRigaRow[]) {
      const list = righeByOrdine.get(r.ordine_id) ?? [];
      list.push(r);
      righeByOrdine.set(r.ordine_id, list);
    }
  }

  return {
    success: true,
    ordini: ((data ?? []) as OrdineRow[]).map((row) =>
      mapOrdineRow(row, righeByOrdine.get(row.id) ?? [])
    ),
  };
}

export async function getOrdineAction(
  id: string
): Promise<OrdiniActionResult> {
  await requireAreaAccess("amministrazione");
  const ordine = await loadOrdineWithRighe(id);
  if (!ordine || ordine.deletedAt) {
    return { success: false, error: "Ordine non trovato." };
  }
  return { success: true, ordine };
}

export async function previewNumeroInternoOrdineAction(input: {
  clienteId: string;
  codiceTargaCliente: string;
  dataOrdine: string;
}): Promise<
  { success: true; numeroInterno: string } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const seq = await nextSeqForCliente(
      input.clienteId,
      input.codiceTargaCliente
    );
    return {
      success: true,
      numeroInterno: buildNumeroInternoOrdine({
        dataOrdine: input.dataOrdine,
        codiceTargaCliente: input.codiceTargaCliente,
        seq,
      }),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima numero non disponibile.",
    };
  }
}

export async function createOrdineAction(
  formData: FormData
): Promise<OrdiniActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Dati ordine non validi." };
  }

  const parsed = ordineInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const input = parsed.data;

  if (input.stato === "storico" && !input.dataConsegna) {
    return { success: false, error: "Data consegna obbligatoria nello storico." };
  }
  if (
    input.dataConsegna &&
    input.dataConsegna < input.dataOrdine
  ) {
    return {
      success: false,
      error: "La data di consegna non può precedere la data ordine.",
    };
  }

  try {
    const seq = await nextSeqForCliente(
      input.clienteId,
      input.codiceTargaCliente
    );
    const numeroInterno =
      input.numeroInterno?.trim() ||
      buildNumeroInternoOrdine({
        dataOrdine: input.dataOrdine,
        codiceTargaCliente: input.codiceTargaCliente,
        seq,
      });

    const righeCalc = input.righe.map((r, i) => ({
      id: r.id ?? `tmp-${i}`,
      prodottoId: r.prodottoId,
      prodottoCodice: r.prodottoCodice,
      prodottoNome: r.prodottoNome,
      quantita: r.quantita,
      prezzoUnitario: r.prezzoUnitario,
      ivaPercentuale: r.ivaPercentuale,
    }));
    const importo = totaleOrdine(righeCalc, input.trasporto);
    const insert: OrdineInsert = {
      numero_interno: numeroInterno,
      numero_cliente: input.numeroCliente?.trim() ?? "",
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente.trim(),
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_ordine: input.dataOrdine,
      data_consegna: input.dataConsegna ?? null,
      stato: input.stato,
      origine_storico:
        input.stato === "storico"
          ? (input.origineStorico ?? "manuale")
          : null,
      trasporto_azienda: input.trasporto.azienda.trim(),
      trasporto_imponibile: input.trasporto.imponibile,
      trasporto_iva_percentuale: input.trasporto.ivaPercentuale,
      importo_euro: importo,
      note: input.note?.trim() ?? "",
      documento_stato: "registrato",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    };

    const { data: row, error } = await supabase
      .from("ordini")
      .insert(insert)
      .select("*")
      .single();
    if (error || !row) {
      return { success: false, error: error?.message ?? "Creazione fallita." };
    }

    const righeErr = await replaceRighe(row.id, input.righe);
    if (righeErr) {
      return { success: false, error: righeErr };
    }

    const offertaFile = formData.get("offertaFile");
    const ordineClienteFile = formData.get("ordineClienteFile");
    const patch: Record<string, string> = {};

    if (offertaFile instanceof File && offertaFile.size > 0) {
      const up = await uploadAllegato(row.id, "offerta", offertaFile);
      if ("error" in up) return { success: false, error: up.error };
      patch.offerta_storage_path = up.path;
      patch.offerta_file_name = up.name;
    }
    if (ordineClienteFile instanceof File && ordineClienteFile.size > 0) {
      const up = await uploadAllegato(row.id, "ordine-cliente", ordineClienteFile);
      if ("error" in up) return { success: false, error: up.error };
      patch.ordine_cliente_storage_path = up.path;
      patch.ordine_cliente_file_name = up.name;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("ordini").update(patch).eq("id", row.id);
    }

    await writeAudit({
      entity_type: "ordini",
      entity_id: row.id,
      action: "create",
      actor_id: auth.userId,
      summary: `Creato ordine ${numeroInterno} (${input.stato})`,
      payload: { stato: input.stato, numero_interno: numeroInterno },
    });

    const ordine = await loadOrdineWithRighe(row.id);
    if (!ordine) return { success: false, error: "Ordine creato ma non leggibile." };
    return { success: true, ordine };
  } catch (e) {
    console.error("[createOrdineAction]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore creazione ordine.",
    };
  }
}

export async function updateOrdineAction(
  id: string,
  formData: FormData
): Promise<OrdiniActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const existing = await loadOrdineWithRighe(id);
  if (!existing || existing.deletedAt) {
    return { success: false, error: "Ordine non trovato." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Dati ordine non validi." };
  }

  const parsed = ordineInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const input = parsed.data;

  if (input.stato === "storico" && !input.dataConsegna) {
    return { success: false, error: "Data consegna obbligatoria nello storico." };
  }

  const righeCalc = input.righe.map((r, i) => ({
    id: r.id ?? `tmp-${i}`,
    prodottoId: r.prodottoId,
    prodottoCodice: r.prodottoCodice,
    prodottoNome: r.prodottoNome,
    quantita: r.quantita,
    prezzoUnitario: r.prezzoUnitario,
    ivaPercentuale: r.ivaPercentuale,
  }));
  const importo = totaleOrdine(righeCalc, input.trasporto);
  const removeOfferta = formData.get("removeOfferta") === "1";
  const removeOrdineCliente = formData.get("removeOrdineCliente") === "1";

  let offertaPath = existing.offerta?.storagePath ?? "";
  let offertaName = existing.offerta?.fileName ?? "";
  let ordineClientePath = existing.ordineClienteDoc?.storagePath ?? "";
  let ordineClienteName = existing.ordineClienteDoc?.fileName ?? "";

  if (removeOfferta) {
    offertaPath = "";
    offertaName = "";
  }
  if (removeOrdineCliente) {
    ordineClientePath = "";
    ordineClienteName = "";
  }

  const offertaFile = formData.get("offertaFile");
  if (offertaFile instanceof File && offertaFile.size > 0) {
    const up = await uploadAllegato(id, "offerta", offertaFile);
    if ("error" in up) return { success: false, error: up.error };
    offertaPath = up.path;
    offertaName = up.name;
  }
  const ordineClienteFile = formData.get("ordineClienteFile");
  if (ordineClienteFile instanceof File && ordineClienteFile.size > 0) {
    const up = await uploadAllegato(id, "ordine-cliente", ordineClienteFile);
    if ("error" in up) return { success: false, error: up.error };
    ordineClientePath = up.path;
    ordineClienteName = up.name;
  }

  const { error } = await supabase
    .from("ordini")
    .update({
      numero_cliente: input.numeroCliente?.trim() ?? "",
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente.trim(),
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_ordine: input.dataOrdine,
      data_consegna: input.dataConsegna ?? null,
      stato: input.stato,
      origine_storico:
        input.stato === "storico"
          ? (input.origineStorico ?? existing.origineStorico ?? "manuale")
          : null,
      trasporto_azienda: input.trasporto.azienda.trim(),
      trasporto_imponibile: input.trasporto.imponibile,
      trasporto_iva_percentuale: input.trasporto.ivaPercentuale,
      importo_euro: importo,
      note: input.note?.trim() ?? "",
      offerta_storage_path: offertaPath,
      offerta_file_name: offertaName,
      ordine_cliente_storage_path: ordineClientePath,
      ordine_cliente_file_name: ordineClienteName,
      versione: existing.versione + 1,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  const righeErr = await replaceRighe(id, input.righe);
  if (righeErr) return { success: false, error: righeErr };

  await writeAudit({
    entity_type: "ordini",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato ordine ${existing.numeroInterno} (v${existing.versione + 1})`,
    payload: {
      versione: existing.versione + 1,
      numero_interno: existing.numeroInterno,
    },
  });

  const ordine = await loadOrdineWithRighe(id);
  if (!ordine) return { success: false, error: "Aggiornamento non leggibile." };
  return { success: true, ordine };
}

export async function softDeleteOrdineAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const existing = await loadOrdineWithRighe(input.id);
  if (!existing || existing.deletedAt) {
    return { success: false, error: "Ordine non trovato." };
  }

  const expected = fraseConfermaEliminazione(existing.numeroInterno);
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const { error } = await supabase
    .from("ordini")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  await writeAudit({
    entity_type: "ordini",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Soft delete ordine ${existing.numeroInterno}`,
    payload: {
      numero_interno: existing.numeroInterno,
      conferma: expected,
    },
  });

  return { success: true };
}

export async function getOrdineAllegatoSignedUrlAction(
  storagePath: string
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!storagePath.trim()) {
    return { success: false, error: "Allegato assente." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(ORDINI_ALLEGATI_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? "URL non disponibile." };
  }
  return { success: true, url: data.signedUrl };
}
