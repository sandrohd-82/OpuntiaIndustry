"use server";

import { createClient } from "@/lib/supabase/server";
import { calcolaConsegnaOrdineAction } from "@/app/actions/produzione-capacita";
import {
  buildNumeroInternoOrdine,
  emptyTrasporto,
  formatOperatoreShort,
  fraseConfermaEliminazione,
  isOrdineDaProcessare,
  isCampionaturaGratuita,
  labelAuditAction,
  mapOrdineRow,
  normalizzaUnitaRigaOrdine,
  ordineInputSchema,
  ORDINI_ALLEGATI_BUCKET,
  quantitaInUnitaBase,
  totaleOrdine,
  type Ordine,
  type OrdineAuditEntry,
  type OrdineInput,
} from "@/lib/amministrazione/ordini";
import {
  normalizeConfezionamentoDraft,
  totaleKgConfezionati,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  ordineProcessaScalettaSchema,
  ordineWizardInputSchema,
} from "@/lib/amministrazione/produzione-capacita";
import { queryListinoVoceVigente } from "@/lib/ecosystem/listino-vigente-query";
import {
  LISTINO_CONTRATTO_MSG,
  valutaListinoPerContratto,
} from "@/lib/ecosystem/listino-vigente";
import { resolveClientePerOrdineFromRawAction } from "@/app/actions/clienti";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  requireOrdineCreateAccess,
  requireOrdineProcessAccess,
  requireOrdineReadAccess,
} from "@/lib/auth/ordini-access";
import { resolveScopeMode } from "@/lib/auth/data-scope-enforce";
import type {
  AuditLogInsert,
  AuditLogRow,
  OrdineConfezionamentoNodoInsert,
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

async function resolveOperatorLabels(
  userIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, first_name, last_name")
    .in("id", ids);

  for (const p of data ?? []) {
    const row = p as {
      id: string;
      email?: string | null;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    };
    const label = formatOperatoreShort(
      row.first_name,
      row.last_name,
      String(row.full_name ?? "").trim() || String(row.email ?? "").trim()
    );
    if (label) map.set(String(row.id), label);
  }
  return map;
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

  const typed = row as OrdineRow;
  const labels = await resolveOperatorLabels([
    typed.created_by,
    typed.updated_by,
    typed.processed_by,
  ]);
  return mapOrdineRow(typed, (righe ?? []) as OrdineRigaRow[], labels);
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
  kind: "offerta" | "ordine-cliente" | "ricevuta-pagamento",
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
    unita_misura: r.unitaMisura ?? "kg",
    lotto_codice: r.lottoCodice?.trim() ?? "",
    prezzo_unitario: r.prezzoUnitario,
    iva_percentuale: r.ivaPercentuale,
    sort_order: i,
  }));

  const { error: insErr } = await supabase.from("ordini_righe").insert(inserts);
  return insErr?.message ?? null;
}

export async function listOrdiniAction(
  stato: OrdineStato | OrdineStato[]
): Promise<{ success: true; ordini: Ordine[] } | { success: false; error: string }> {
  await requireOrdineReadAccess();
  const supabase = await createClient();
  const stati = Array.isArray(stato) ? stato : [stato];
  const scope = await resolveScopeMode("ordini");

  let q = supabase
    .from("ordini")
    .select("*")
    .is("deleted_at", null);
  if (scope && !scope.skip && scope.mode === "proprie") {
    q = q.eq("created_by", scope.userId);
  }
  q = stati.length === 1 ? q.eq("stato", stati[0]) : q.in("stato", stati);
  const { data, error } = await q.order(
    stati.includes("storico") ? "data_consegna" : "data_ordine",
    { ascending: false }
  );

  if (error) return { success: false, error: error.message };

  const ids = (data ?? []).map((r) => r.id);
  const righeByOrdine = new Map<string, OrdineRigaRow[]>();
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

  const rows = (data ?? []) as OrdineRow[];
  const labels = await resolveOperatorLabels(
    rows.flatMap((r) => [r.created_by, r.updated_by, r.processed_by])
  );

  return {
    success: true,
    ordini: rows.map((row) =>
      mapOrdineRow(row, righeByOrdine.get(row.id) ?? [], labels)
    ),
  };
}

export async function getOrdineAction(
  id: string
): Promise<OrdiniActionResult> {
  await requireOrdineReadAccess();
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
  await requireOrdineCreateAccess();
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

  const resolved = await resolveClientePerOrdineFromRawAction(payload);
  if (!resolved.success) return resolved;
  const parsed = ordineInputSchema.safeParse({
    ...(payload && typeof payload === "object" ? payload : {}),
    clienteId: resolved.cliente.id,
    cliente: resolved.cliente.ragioneSociale,
    codiceTargaCliente: resolved.cliente.codiceTarga,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const input = parsed.data;

  if (input.stato !== "storico") {
    for (const r of input.righe) {
      const voceRes = await queryListinoVoceVigente(r.prodottoId);
      if (voceRes.error) return { success: false, error: voceRes.error };
      const regola = valutaListinoPerContratto(voceRes.voce);
      if (regola.esito === "fuori_produzione") {
        return {
          success: false,
          error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.fuori_produzione}`,
        };
      }
      if (regola.esito === "senza_prezzo") {
        return {
          success: false,
          error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.senza_prezzo}`,
        };
      }
    }
  }

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
      unitaMisura: r.unitaMisura ?? "kg",
      lottoCodice: r.lottoCodice ?? "",
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
      tipo_pagamento: input.tipoPagamento,
      pagato: input.pagato,
      data_pagamento: input.pagato
        ? (input.dataPagamento ?? null)
        : (input.dataPagamento ?? null),
      note_rateizzazione: input.noteRateizzazione?.trim() ?? "",
      documento_stato: "registrato",
      versione: 1,
      tipo: "vendita",
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

    const righeErr = await replaceRighe(
      row.id,
      input.righe.map((r) => ({
        ...r,
        unitaMisura: normalizzaUnitaRigaOrdine({
          tipo: "vendita",
          unitaMisura: r.unitaMisura,
          prodottoCodice: r.prodottoCodice,
        }),
      }))
    );
    if (righeErr) {
      return { success: false, error: righeErr };
    }

    const offertaFile = formData.get("offertaFile");
    const ordineClienteFile = formData.get("ordineClienteFile");
    const ricevutaFile = formData.get("ricevutaPagamentoFile");
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
    if (ricevutaFile instanceof File && ricevutaFile.size > 0) {
      const up = await uploadAllegato(
        row.id,
        "ricevuta-pagamento",
        ricevutaFile
      );
      if ("error" in up) return { success: false, error: up.error };
      patch.ricevuta_pagamento_storage_path = up.path;
      patch.ricevuta_pagamento_file_name = up.name;
    }
    if (Object.keys(patch).length > 0) {
      await supabase
        .from("ordini")
        .update({ ...patch, updated_by: auth.userId })
        .eq("id", row.id);
    }

    await writeAudit({
      entity_type: "ordini",
      entity_id: row.id,
      action: "create",
      actor_id: auth.userId,
      summary: `Creato ordine ${numeroInterno} (${input.stato})`,
      payload: {
        stato: input.stato,
        numero_interno: numeroInterno,
        tipo_pagamento: input.tipoPagamento,
        pagato: input.pagato,
      },
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

  const campionaturaGratis = isCampionaturaGratuita(existing.tipo);
  const righeCalc = input.righe.map((r, i) => ({
    id: r.id ?? `tmp-${i}`,
    prodottoId: r.prodottoId,
    prodottoCodice: r.prodottoCodice,
    prodottoNome: r.prodottoNome,
    quantita: r.quantita,
    unitaMisura: normalizzaUnitaRigaOrdine({
      tipo: existing.tipo,
      unitaMisura: r.unitaMisura,
      prodottoCodice: r.prodottoCodice,
    }),
    lottoCodice: r.lottoCodice ?? "",
    prezzoUnitario: campionaturaGratis ? 0 : r.prezzoUnitario,
    ivaPercentuale: campionaturaGratis ? 0 : r.ivaPercentuale,
  }));
  const importo = campionaturaGratis
    ? 0
    : totaleOrdine(righeCalc, input.trasporto);
  const removeOfferta = formData.get("removeOfferta") === "1";
  const removeOrdineCliente = formData.get("removeOrdineCliente") === "1";
  const removeRicevuta = formData.get("removeRicevutaPagamento") === "1";

  let offertaPath = existing.offerta?.storagePath ?? "";
  let offertaName = existing.offerta?.fileName ?? "";
  let ordineClientePath = existing.ordineClienteDoc?.storagePath ?? "";
  let ordineClienteName = existing.ordineClienteDoc?.fileName ?? "";
  let ricevutaPath = existing.ricevutaPagamento?.storagePath ?? "";
  let ricevutaName = existing.ricevutaPagamento?.fileName ?? "";

  if (removeOfferta) {
    offertaPath = "";
    offertaName = "";
  }
  if (removeOrdineCliente) {
    ordineClientePath = "";
    ordineClienteName = "";
  }
  if (removeRicevuta) {
    ricevutaPath = "";
    ricevutaName = "";
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
  const ricevutaFile = formData.get("ricevutaPagamentoFile");
  if (ricevutaFile instanceof File && ricevutaFile.size > 0) {
    const up = await uploadAllegato(id, "ricevuta-pagamento", ricevutaFile);
    if ("error" in up) return { success: false, error: up.error };
    ricevutaPath = up.path;
    ricevutaName = up.name;
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
      trasporto_azienda: campionaturaGratis
        ? ""
        : input.trasporto.azienda.trim(),
      trasporto_imponibile: campionaturaGratis ? 0 : input.trasporto.imponibile,
      trasporto_iva_percentuale: campionaturaGratis
        ? 0
        : input.trasporto.ivaPercentuale,
      importo_euro: importo,
      note: input.note?.trim() ?? "",
      tipo_pagamento: input.tipoPagamento,
      pagato: campionaturaGratis ? false : input.pagato,
      data_pagamento: input.dataPagamento ?? null,
      note_rateizzazione: input.noteRateizzazione?.trim() ?? "",
      ricevuta_pagamento_storage_path: ricevutaPath,
      ricevuta_pagamento_file_name: ricevutaName,
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

  const righeErr = await replaceRighe(
    id,
    campionaturaGratis
      ? input.righe.map((r, i) => ({
          ...r,
          unitaMisura: righeCalc[i]?.unitaMisura ?? r.unitaMisura,
          prezzoUnitario: 0,
          ivaPercentuale: 0,
        }))
      : input.righe.map((r, i) => ({
          ...r,
          unitaMisura: righeCalc[i]?.unitaMisura ?? r.unitaMisura,
        }))
  );
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
      tipo_pagamento: input.tipoPagamento,
      pagato: input.pagato,
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
  await requireOrdineReadAccess();
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

export async function listOrdineAuditLogAction(
  ordineId: string
): Promise<
  | { success: true; entries: OrdineAuditEntry[] }
  | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", "ordini")
    .eq("entity_id", ordineId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as AuditLogRow[];
  const labels = await resolveOperatorLabels(rows.map((r) => r.actor_id));

  let entries: OrdineAuditEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: labelAuditAction(r.action),
    summary: r.summary,
    actorLabel: r.actor_id
      ? (labels.get(r.actor_id) ?? "Operatore non registrato")
      : "Operatore non registrato",
    createdAt: r.created_at,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));

  // Fallback ISO: se audit_log vuoto, espone almeno create/update dalla scheda
  if (entries.length === 0) {
    const ordine = await loadOrdineWithRighe(ordineId);
    if (!ordine) return { success: false, error: "Ordine non trovato." };
    entries = [
      {
        id: `fallback-update-${ordine.id}`,
        action: "update",
        actionLabel: labelAuditAction("update"),
        summary: `Ultima modifica ordine ${ordine.numeroInterno} (v${ordine.versione})`,
        actorLabel: ordine.updatedByLabel ?? "Operatore non registrato",
        createdAt: ordine.updatedAt,
        payload: { versione: ordine.versione, fonte: "scheda" },
      },
      {
        id: `fallback-create-${ordine.id}`,
        action: "create",
        actionLabel: labelAuditAction("create"),
        summary: `Creazione ordine ${ordine.numeroInterno}`,
        actorLabel: ordine.createdByLabel ?? "Operatore non registrato",
        createdAt: ordine.createdAt,
        payload: { fonte: "scheda" },
      },
    ];
  }

  return { success: true, entries };
}

/**
 * Wizard: crea ordine vendita/campionatura in attesa di processazione.
 * Non inserisce giorni in scaletta. Marca is_test=true (purge).
 */
export async function createOrdineWizardAction(
  raw: unknown
): Promise<OrdiniActionResult> {
  const { auth } = await requireOrdineCreateAccess();
  const resolved = await resolveClientePerOrdineFromRawAction(raw);
  if (!resolved.success) return resolved;
  const parsed = ordineWizardInputSchema.safeParse({
    ...(raw && typeof raw === "object" ? raw : {}),
    clienteId: resolved.cliente.id,
    cliente: resolved.cliente.ragioneSociale,
    codiceTargaCliente: resolved.cliente.codiceTarga,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const input = parsed.data;

  const voceRes = await queryListinoVoceVigente(input.prodottoId);
  if (voceRes.error) return { success: false, error: voceRes.error };
  const regola = valutaListinoPerContratto(voceRes.voce);
  const campionaturaGratis = isCampionaturaGratuita(input.tipo);
  if (regola.esito === "fuori_produzione") {
    return { success: false, error: LISTINO_CONTRATTO_MSG.fuori_produzione };
  }
  if (regola.esito === "senza_prezzo" && !campionaturaGratis) {
    return { success: false, error: LISTINO_CONTRATTO_MSG.senza_prezzo };
  }
  const ordineSospeso = regola.esito === "sospeso";
  if (ordineSospeso && !input.dataDisponibilitaPresunta) {
    return {
      success: false,
      error:
        "Prodotto al momento non disponibile: indica la data presunta di disponibilità.",
    };
  }

  const dataConsegna = ordineSospeso
    ? (input.dataDisponibilitaPresunta ?? input.dataRichiesta ?? null)
    : input.consegnaTipo === "data"
      ? (input.dataRichiesta ?? null)
      : null;

  const trasporto = emptyTrasporto();
  const prezzoUnitario = campionaturaGratis ? 0 : input.prezzoUnitario;
  const ivaPercentuale = campionaturaGratis ? 0 : input.ivaPercentuale;
  const unitaMisura = normalizzaUnitaRigaOrdine({
    tipo: input.tipo,
    unitaMisura: input.unitaMisura,
    listinoUm: voceRes.voce?.unitaMisura,
    prodottoCodice: input.prodottoCodice,
  });
  const quantitaBase = quantitaInUnitaBase(input.quantita, unitaMisura);
  const righeCalc = [
    {
      id: "wizard-1",
      prodottoId: input.prodottoId,
      prodottoCodice: input.prodottoCodice,
      prodottoNome: input.prodottoNome,
      quantita: input.quantita,
      unitaMisura,
      lottoCodice: input.lottoCodice ?? "",
      prezzoUnitario,
      ivaPercentuale,
    },
  ];
  const importo = campionaturaGratis ? 0 : totaleOrdine(righeCalc, trasporto);

  try {
    const supabase = await createClient();
    if (input.preventivoId && !campionaturaGratis) {
      const { data: pv, error: pvErr } = await supabase
        .from("preventivi")
        .select("id, stato, cliente_id, deleted_at")
        .eq("id", input.preventivoId)
        .maybeSingle();
      if (pvErr || !pv || pv.deleted_at) {
        return {
          success: false,
          error: pvErr?.message ?? "Preventivo non trovato.",
        };
      }
      if (pv.stato !== "accettato") {
        return {
          success: false,
          error: "Puoi collegare solo un preventivo accettato.",
        };
      }
      if (pv.cliente_id && pv.cliente_id !== input.clienteId) {
        return {
          success: false,
          error: "Il preventivo appartiene a un altro cliente.",
        };
      }
    }
    const seq = await nextSeqForCliente(
      input.clienteId,
      input.codiceTargaCliente
    );
    const numeroInterno = buildNumeroInternoOrdine({
      dataOrdine: input.dataOrdine,
      codiceTargaCliente: input.codiceTargaCliente,
      seq,
    });

    const insert: OrdineInsert = {
      numero_interno: numeroInterno,
      numero_cliente: "",
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente.trim(),
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_ordine: input.dataOrdine,
      data_consegna: dataConsegna,
      stato: ordineSospeso ? "sospeso" : "in_attesa",
      tipo: input.tipo ?? "vendita",
      data_disponibilita_presunta: ordineSospeso
        ? (input.dataDisponibilitaPresunta ?? null)
        : null,
      origine_storico: null,
      trasporto_azienda: "",
      trasporto_imponibile: 0,
      trasporto_iva_percentuale: 22,
      importo_euro: importo,
      note: input.note?.trim() ?? "",
      tipo_pagamento: input.tipoPagamento,
      pagato: false,
      data_pagamento: null,
      note_rateizzazione: "",
      documento_stato: "registrato",
      versione: 1,
      consegna_tipo: input.consegnaTipo,
      urgente: input.urgente,
      usa_magazzino: input.usaMagazzino,
      usa_sabato: input.usaSabato,
      data_consegna_stimata: dataConsegna,
      capacita_snapshot: ordineSospeso
        ? {
            sospeso: true,
            motivo: "non_disponibile",
            data_disponibilita_presunta: input.dataDisponibilitaPresunta,
          }
        : {
            in_attesa: true,
            consegna_tipo: input.consegnaTipo,
            data_consegna_richiesta: dataConsegna,
          },
      giorni_produzione: [],
      is_test: true,
      spedizione_mezzo: "corriere",
      corriere_id: input.corriereDaCompilare
        ? null
        : (input.corriereId ?? null),
      corriere_da_compilare: Boolean(input.corriereDaCompilare),
      spedizione_a_carico: input.spedizioneACarico,
      spedizione_pct_agrinsicilia:
        input.spedizioneACarico === "diviso"
          ? (input.spedizionePctAgrinsicilia ?? null)
          : null,
      preventivo_id: campionaturaGratis ? null : (input.preventivoId ?? null),
      webmail_accettazione_id: campionaturaGratis
        ? null
        : (input.webmailAccettazioneId ?? null),
      referente_accettazione_id: campionaturaGratis
        ? null
        : (input.referenteAccettazioneId ?? null),
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

    const righeErr = await replaceRighe(row.id, [
      {
        prodottoId: input.prodottoId,
        prodottoCodice: input.prodottoCodice,
        prodottoNome: input.prodottoNome,
        quantita: input.quantita,
        unitaMisura,
        lottoCodice: input.lottoCodice ?? "",
        prezzoUnitario,
        ivaPercentuale,
      },
    ]);
    if (righeErr) return { success: false, error: righeErr };

    if (input.confezionamento) {
      const conf = normalizeConfezionamentoDraft(input.confezionamento);
      const kgConf = totaleKgConfezionati(conf.nodi);
      const kgDelta = Math.round((quantitaBase - kgConf) * 1000) / 1000;
      const { data: confRow, error: confErr } = await supabase
        .from("ordini_confezionamento")
        .insert({
          ordine_id: row.id,
          movimentazione_modo: conf.movimentazioneModo,
          pallet_catalogo_id: conf.palletCatalogoId,
          pallet_misure_custom: conf.palletMisureCustom.trim(),
          kg_ordine: quantitaBase,
          kg_confezionati: kgConf,
          kg_delta: kgDelta,
          coerenza_ignorata: conf.coerenzaIgnorata,
          note: conf.note.trim(),
          versione: 1,
          documento_stato: "bozza",
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id")
        .single();
      if (confErr || !confRow) {
        return {
          success: false,
          error: confErr?.message ?? "Salvataggio confezionamento fallito.",
        };
      }
      const confId = (confRow as { id: string }).id;

      async function insertNodi(
        nodes: typeof conf.nodi,
        parentId: string | null,
        sortBase: number
      ): Promise<string | null> {
        let sort = sortBase;
        for (const n of nodes) {
          const insertNodo: OrdineConfezionamentoNodoInsert = {
            confezionamento_id: confId,
            parent_id: parentId,
            stadio: n.stadio,
            catalogo_id: n.catalogoId,
            nome_snapshot: n.nome,
            codice_snapshot: n.codice,
            quantita: n.quantita,
            kg_prodotto: n.stadio === "prodotto_kg" ? n.kgProdotto : null,
            sort_order: sort,
            created_by: auth.userId,
            updated_by: auth.userId,
          };
          const { data: nodoRow, error: nodoErr } = await supabase
            .from("ordini_confezionamento_nodi")
            .insert(insertNodo)
            .select("id")
            .single();
          if (nodoErr || !nodoRow) {
            return nodoErr?.message ?? "Nodo confezionamento non salvato.";
          }
          const nodeId = (nodoRow as { id: string }).id;
          sort += 1;
          if (n.children.length) {
            const childErr = await insertNodi(n.children, nodeId, 0);
            if (childErr) return childErr;
          }
        }
        return null;
      }

      const nodiErr = await insertNodi(conf.nodi, null, 0);
      if (nodiErr) return { success: false, error: nodiErr };
    }

    await writeAudit({
      entity_type: "ordini",
      entity_id: row.id,
      action: "create",
      actor_id: auth.userId,
      summary: input.preventivoId
        ? `Creato ordine ${input.tipo ?? "vendita"} ${numeroInterno} da preventivo (in attesa)`
        : `Creato ordine ${input.tipo ?? "vendita"} ${numeroInterno} in attesa di processazione`,
      payload: {
        wizard: true,
        is_test: true,
        tipo: input.tipo ?? "vendita",
        stato: ordineSospeso ? "sospeso" : "in_attesa",
        consegna_tipo: input.consegnaTipo,
        spedizione_a_carico: input.spedizioneACarico,
        preventivo_id: input.preventivoId ?? null,
      },
    });

    const ordine = await loadOrdineWithRighe(row.id);
    if (!ordine) {
      return { success: false, error: "Ordine creato ma non leggibile." };
    }
    return { success: true, ordine };
  } catch (e) {
    console.error("[createOrdineWizardAction]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore creazione ordine.",
    };
  }
}

async function writeImpegniScaletta(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  ordineId: string;
  numeroInterno: string;
  prodottoCodice: string;
  linea: string | null;
  giorniProduzione: string[];
  giorniAttivita: string[];
  attivitaSnapshot: Array<{ codice: string; dates: string[] }>;
}): Promise<string | null> {
  const giorniCalendario = [
    ...input.giorniProduzione,
    ...input.giorniAttivita,
  ];
  if (giorniCalendario.length === 0) return null;

  const nowIso = new Date().toISOString();
  await input.supabase
    .from("produzione_calendario_impegni")
    .update({
      deleted_at: nowIso,
      deleted_by: input.userId,
      updated_by: input.userId,
    })
    .in("data_giorno", giorniCalendario)
    .is("deleted_at", null);

  const dateToAttLabel = new Map<string, string>();
  for (const seg of input.attivitaSnapshot) {
    for (const d of seg.dates) {
      dateToAttLabel.set(d, `${input.numeroInterno} · ${seg.codice}`);
    }
  }

  const etichettaProd = `${input.numeroInterno} · ${input.prodottoCodice}`;
  const rowsImpegno = [
    ...input.giorniProduzione.map((d) => ({
      data_giorno: d,
      ordine_id: input.ordineId,
      linea_codice: input.linea,
      etichetta: etichettaProd,
      note: "lavorazione",
      created_by: input.userId,
      updated_by: input.userId,
    })),
    ...input.giorniAttivita.map((d) => ({
      data_giorno: d,
      ordine_id: input.ordineId,
      linea_codice: input.linea,
      etichetta: dateToAttLabel.get(d) ?? `${input.numeroInterno} · Attività`,
      note: "attivita",
      created_by: input.userId,
      updated_by: input.userId,
    })),
  ];

  const { error: impErr } = await input.supabase
    .from("produzione_calendario_impegni")
    .insert(rowsImpegno);
  return impErr?.message ?? null;
}

/**
 * Processa un ordine in attesa e lo inserisce in scaletta produzione.
 */
export async function processOrdineInScalettaAction(
  raw: unknown
): Promise<OrdiniActionResult> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = ordineProcessaScalettaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati processazione non validi.",
    };
  }
  const input = parsed.data;

  const existing = await loadOrdineWithRighe(input.ordineId);
  if (!existing || existing.deletedAt) {
    return { success: false, error: "Ordine non trovato." };
  }
  if (existing.stato === "sospeso") {
    return {
      success: false,
      error:
        "Ordine sospeso: il prodotto non è disponibile. Non si può inserire in scaletta.",
    };
  }
  if (!isOrdineDaProcessare(existing.stato)) {
    return {
      success: false,
      error: "Questo ordine è già stato processato o non è in coda.",
    };
  }

  const riga = existing.righe[0];
  if (!riga?.prodottoId) {
    return { success: false, error: "Ordine senza riga prodotto." };
  }

  const giorniProduzione = input.giorniProduzione ?? [];
  const giorniAttivita = input.giorniAttivita ?? [];
  const attivitaSnapshot = input.attivitaSnapshot ?? [];

  const calcRes = await calcolaConsegnaOrdineAction({
    prodottoId: riga.prodottoId,
    prodottoCodice: riga.prodottoCodice,
    quantitaKg: quantitaInUnitaBase(riga.quantita, riga.unitaMisura),
    consegnaTipo: existing.consegnaTipo === "data" ? "data" : "asap",
    dataRichiesta:
      existing.consegnaTipo === "data" ? existing.dataConsegna : null,
    urgente: input.urgente ?? existing.urgente,
    usaMagazzino: input.usaMagazzino ?? existing.usaMagazzino,
    usaSabato: input.usaSabato ?? existing.usaSabato,
    resaPercentualeOverride: input.resaPercentualeOverride ?? null,
    capacitaIngressoKgPerEssiccatoreOverride:
      input.capacitaIngressoKgPerEssiccatoreOverride ?? null,
  });
  if (!calcRes.success) {
    return { success: false, error: calcRes.error };
  }
  if (
    calcRes.calcolo.giorniLavorativiNecessari > 0 &&
    giorniProduzione.length === 0
  ) {
    return {
      success: false,
      error: "Seleziona i giorni di lavorazione sul calendario.",
    };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const linea =
    typeof calcRes.calcolo.snapshot.linea === "string"
      ? calcRes.calcolo.snapshot.linea
      : null;

  const { error } = await supabase
    .from("ordini")
    .update({
      stato: "in_scaletta",
      documento_stato: "approvato",
      processed_at: nowIso,
      processed_by: auth.userId,
      data_consegna: input.dataConsegnaCalendario,
      data_consegna_stimata: input.dataConsegnaCalendario,
      urgente: input.urgente ?? existing.urgente,
      usa_magazzino: input.usaMagazzino ?? existing.usaMagazzino,
      usa_sabato: input.usaSabato ?? existing.usaSabato,
      giorni_produzione: giorniProduzione,
      capacita_snapshot: {
        ...calcRes.calcolo.snapshot,
        giorni_produzione: giorniProduzione,
        giorni_attivita: giorniAttivita,
        attivita: attivitaSnapshot,
        data_consegna_calendario: input.dataConsegnaCalendario,
      },
      versione: existing.versione + 1,
      updated_by: auth.userId,
    })
    .eq("id", existing.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  const lottoCodice = (input.lottoCodice ?? "").trim();
  if (
    existing.tipo === "campionatura" &&
    riga.id &&
    !riga.id.startsWith("riga-") &&
    !riga.id.startsWith("tmp-")
  ) {
    const { error: lottoErr } = await supabase
      .from("ordini_righe")
      .update({
        lotto_codice: lottoCodice,
        updated_at: nowIso,
      })
      .eq("id", riga.id)
      .eq("ordine_id", existing.id);
    if (lottoErr) {
      return { success: false, error: lottoErr.message };
    }
  }

  const impErr = await writeImpegniScaletta({
    supabase,
    userId: auth.userId,
    ordineId: existing.id,
    numeroInterno: existing.numeroInterno,
    prodottoCodice: riga.prodottoCodice,
    linea,
    giorniProduzione,
    giorniAttivita,
    attivitaSnapshot,
  });
  if (impErr) {
    return { success: false, error: `Processato ma calendario: ${impErr}` };
  }

  await writeAudit({
    entity_type: "ordini",
    entity_id: existing.id,
    action: "ordine_processa",
    actor_id: auth.userId,
    summary: `Processato ordine ${existing.numeroInterno} — inserito in scaletta`,
    payload: {
      stato_da: existing.stato,
      stato_a: "in_scaletta",
      giorni_produzione: giorniProduzione,
      data_consegna: input.dataConsegnaCalendario,
      lotto_codice: lottoCodice || null,
    },
  });
  await writeAudit({
    entity_type: "ordini",
    entity_id: existing.id,
    action: "ordine_inserisci_scaletta",
    actor_id: auth.userId,
    summary: `Scaletta produzione per ${existing.numeroInterno}`,
    payload: {
      giorni_produzione: giorniProduzione,
      giorni_attivita: giorniAttivita,
      linea,
    },
  });

  const ordine = await loadOrdineWithRighe(existing.id);
  if (!ordine) {
    return { success: false, error: "Ordine processato ma non leggibile." };
  }
  return { success: true, ordine };
}

/**
 * Soft-delete di tutti i dati test dell’area ordini/produzione collegata.
 * Non tocca configurazione (linee, essiccatori, baseline rese).
 */
export async function purgeOrdiniTestAction(): Promise<
  | { success: true; purged: { ordini: number; movimenti: number; osservazioni: number; giacenze: number } }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const now = new Date().toISOString();

  async function softPurge(
    table: string
  ): Promise<{ count: number; error: string | null }> {
    const { data, error } = await supabase
      .from(table)
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("is_test", true)
      .is("deleted_at", null)
      .select("id");
    if (error) return { count: 0, error: error.message };
    return { count: (data ?? []).length, error: null };
  }

  const ordini = await softPurge("ordini");
  if (ordini.error) return { success: false, error: ordini.error };
  const movimenti = await softPurge("magazzino_movimenti");
  if (movimenti.error) return { success: false, error: movimenti.error };
  const osservazioni = await softPurge("produzione_resa_osservazioni");
  if (osservazioni.error) return { success: false, error: osservazioni.error };

  // Giacenze test: azzera quantità e soft-delete
  const { data: giacenzeData, error: giacenzeErr } = await supabase
    .from("magazzino_giacenze")
    .update({
      quantita_kg: 0,
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("is_test", true)
    .is("deleted_at", null)
    .select("id");
  if (giacenzeErr) return { success: false, error: giacenzeErr.message };

  await writeAudit({
    entity_type: "ordini",
    entity_id: "00000000-0000-0000-0000-000000000000",
    action: "purge_test_ordini",
    actor_id: auth.userId,
    summary: "Pulizia dati test area ordini / magazzino / osservazioni resa",
    payload: {
      ordini: ordini.count,
      movimenti: movimenti.count,
      osservazioni: osservazioni.count,
      giacenze: (giacenzeData ?? []).length,
    },
  });

  return {
    success: true,
    purged: {
      ordini: ordini.count,
      movimenti: movimenti.count,
      osservazioni: osservazioni.count,
      giacenze: (giacenzeData ?? []).length,
    },
  };
}
