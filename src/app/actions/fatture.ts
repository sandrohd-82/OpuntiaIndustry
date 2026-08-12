"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  buildNumeroInternoFattura,
  calcolaTotaliFattura,
  fatturaInputSchema,
  mapFatturaEmessaRow,
  mapFatturaRicevutaRow,
  type Fattura,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  FatturaEmessaInsert,
  FatturaEmessaRigaInsert,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaRicevutaInsert,
  FatturaRicevutaRigaInsert,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
} from "@/types/database";

const RICEVUTA_BUCKET = "fatture-ricevute-pagamenti";

export type FattureActionResult =
  | { success: true; fattura: Fattura }
  | { success: false; error: string };

async function nextSeqFattura(
  kind: FatturaKind,
  anagraficaId: string,
  codiceTarga: string
): Promise<number> {
  const supabase = await createClient();
  const table = kind === "emessa" ? "fatture_emesse" : "fatture_ricevute";
  const idCol = kind === "emessa" ? "cliente_id" : "fornitore_id";

  const { data, error } = await supabase
    .from(table)
    .select(`numero_interno, ${idCol}`)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^Ft-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of data ?? []) {
    const rec = row as Record<string, unknown>;
    if (rec[idCol] === anagraficaId) countById += 1;
    const m = String(rec.numero_interno).match(re);
    if (m) maxParsed = Math.max(maxParsed, Number(m[1]));
  }
  return Math.max(countById, maxParsed) + 1;
}

export async function previewNumeroInternoFatturaAction(input: {
  kind: FatturaKind;
  anagraficaId: string;
  codiceTarga: string;
  dataEmissione: string;
}): Promise<
  { success: true; numeroInterno: string } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const seq = await nextSeqFattura(
      input.kind,
      input.anagraficaId,
      input.codiceTarga
    );
    return {
      success: true,
      numeroInterno: buildNumeroInternoFattura({
        dataEmissione: input.dataEmissione,
        codiceTarga: input.codiceTarga,
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

async function uploadRicevuta(
  fatturaId: string,
  file: File
): Promise<{ path: string; name: string } | { error: string }> {
  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${fatturaId}/ricevuta-${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(RICEVUTA_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (error) return { error: error.message };
  return { path, name: file.name };
}

export async function listFattureAction(
  kind: FatturaKind
): Promise<
  { success: true; fatture: Fattura[] } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  if (kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select("*")
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false });
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as FatturaEmessaRow[];
    const ids = rows.map((r) => r.id);
    const righeBy = new Map<string, FatturaEmessaRigaRow[]>();
    if (ids.length > 0) {
      const { data: righe } = await supabase
        .from("fatture_emesse_righe")
        .select("*")
        .in("fattura_id", ids);
      for (const r of (righe ?? []) as FatturaEmessaRigaRow[]) {
        const list = righeBy.get(r.fattura_id) ?? [];
        list.push(r);
        righeBy.set(r.fattura_id, list);
      }
    }
    return {
      success: true,
      fatture: rows.map((row) =>
        mapFatturaEmessaRow(row, righeBy.get(row.id) ?? [])
      ),
    };
  }

  const { data, error } = await supabase
    .from("fatture_ricevute")
    .select("*")
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as FatturaRicevutaRow[];
  const ids = rows.map((r) => r.id);
  const righeBy = new Map<string, FatturaRicevutaRigaRow[]>();
  if (ids.length > 0) {
    const { data: righe } = await supabase
      .from("fatture_ricevute_righe")
      .select("*")
      .in("fattura_id", ids);
    for (const r of (righe ?? []) as FatturaRicevutaRigaRow[]) {
      const list = righeBy.get(r.fattura_id) ?? [];
      list.push(r);
      righeBy.set(r.fattura_id, list);
    }
  }
  return {
    success: true,
    fatture: rows.map((row) =>
      mapFatturaRicevutaRow(row, righeBy.get(row.id) ?? [])
    ),
  };
}

export async function createFatturaAction(
  kind: FatturaKind,
  formData: FormData
): Promise<FattureActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Dati fattura non validi." };
  }

  const parsed = fatturaInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const input = parsed.data;
  const totals = calcolaTotaliFattura({
    righe: input.righe,
    spedizione: input.spedizione,
    spedizioneIvaApplicata: input.spedizioneIvaApplicata,
    ivaPercentuale: input.ivaPercentuale,
  });

  try {
    const seq = await nextSeqFattura(
      kind,
      input.anagraficaId,
      input.anagraficaCodiceTarga
    );
    const numeroInterno = buildNumeroInternoFattura({
      dataEmissione: input.dataEmissione,
      codiceTarga: input.anagraficaCodiceTarga,
      seq,
    });

    if (kind === "emessa") {
      const insert: FatturaEmessaInsert = {
        numero_interno: numeroInterno,
        cliente_id: input.anagraficaId,
        cliente_ragione_sociale: input.anagraficaRagioneSociale,
        cliente_codice_targa: input.anagraficaCodiceTarga,
        data_emissione: input.dataEmissione,
        numero_documento_esterno: input.numeroDocumentoEsterno,
        fic_id: input.ficId,
        spedizione: input.spedizione,
        spedizione_iva_applicata: input.spedizioneIvaApplicata,
        imponibile: totals.imponibile,
        iva_percentuale: input.ivaPercentuale,
        imposta: totals.imposta,
        totale: totals.totale,
        stato_pagamento: input.statoPagamento,
        documento_stato: "registrata",
        note: input.note,
        created_by: auth.userId,
        updated_by: auth.userId,
      };

      const { data, error } = await supabase
        .from("fatture_emesse")
        .insert(insert)
        .select("*")
        .single();
      if (error || !data) {
        return {
          success: false,
          error: error?.message ?? "Salvataggio fattura non riuscito.",
        };
      }
      const row = data as FatturaEmessaRow;

      const ricevutaFile = formData.get("ricevuta");
      if (ricevutaFile instanceof File && ricevutaFile.size > 0) {
        const up = await uploadRicevuta(row.id, ricevutaFile);
        if ("error" in up) {
          return { success: false, error: `Ricevuta: ${up.error}` };
        }
        await supabase
          .from("fatture_emesse")
          .update({
            ricevuta_storage_path: up.path,
            ricevuta_file_name: up.name,
            updated_by: auth.userId,
          })
          .eq("id", row.id);
        row.ricevuta_storage_path = up.path;
        row.ricevuta_file_name = up.name;
      }

      const righeInsert: FatturaEmessaRigaInsert[] = input.righe.map(
        (r, i) => ({
          fattura_id: row.id,
          prodotto_id: r.prodottoId,
          codice: r.codice,
          descrizione: r.descrizione,
          quantita: r.quantita,
          prezzo_unitario: r.prezzoUnitario,
          sconto_percentuale: r.scontoPercentuale,
          importo: r.importo,
          sort_order: i,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
      );
      const { data: righeData, error: righeErr } = await supabase
        .from("fatture_emesse_righe")
        .insert(righeInsert)
        .select("*");
      if (righeErr) {
        return { success: false, error: righeErr.message };
      }

      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: row.id,
        action: "create",
        actor_id: auth.userId,
        summary: `Registrata fattura emessa ${numeroInterno}`,
        payload: {
          fic_id: input.ficId,
          cliente_id: input.anagraficaId,
          totale: totals.totale,
        },
      });

      return {
        success: true,
        fattura: mapFatturaEmessaRow(
          row,
          (righeData ?? []) as FatturaEmessaRigaRow[]
        ),
      };
    }

    const insert: FatturaRicevutaInsert = {
      numero_interno: numeroInterno,
      fornitore_id: input.anagraficaId,
      fornitore_ragione_sociale: input.anagraficaRagioneSociale,
      fornitore_codice_targa: input.anagraficaCodiceTarga,
      data_emissione: input.dataEmissione,
      numero_documento_esterno: input.numeroDocumentoEsterno,
      fic_id: input.ficId,
      spedizione: input.spedizione,
      spedizione_iva_applicata: input.spedizioneIvaApplicata,
      imponibile: totals.imponibile,
      iva_percentuale: input.ivaPercentuale,
      imposta: totals.imposta,
      totale: totals.totale,
      stato_pagamento: input.statoPagamento,
      documento_stato: "registrata",
      note: input.note,
      created_by: auth.userId,
      updated_by: auth.userId,
    };

    const { data, error } = await supabase
      .from("fatture_ricevute")
      .insert(insert)
      .select("*")
      .single();
    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "Salvataggio fattura non riuscito.",
      };
    }
    const row = data as FatturaRicevutaRow;

    const ricevutaFile = formData.get("ricevuta");
    if (ricevutaFile instanceof File && ricevutaFile.size > 0) {
      const up = await uploadRicevuta(row.id, ricevutaFile);
      if ("error" in up) {
        return { success: false, error: `Ricevuta: ${up.error}` };
      }
      await supabase
        .from("fatture_ricevute")
        .update({
          ricevuta_storage_path: up.path,
          ricevuta_file_name: up.name,
          updated_by: auth.userId,
        })
        .eq("id", row.id);
      row.ricevuta_storage_path = up.path;
      row.ricevuta_file_name = up.name;
    }

    const righeInsert: FatturaRicevutaRigaInsert[] = input.righe.map(
      (r, i) => ({
        fattura_id: row.id,
        prodotto_id: r.prodottoId,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzo_unitario: r.prezzoUnitario,
        sconto_percentuale: r.scontoPercentuale,
        importo: r.importo,
        sort_order: i,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
    );
    const { data: righeData, error: righeErr } = await supabase
      .from("fatture_ricevute_righe")
      .insert(righeInsert)
      .select("*");
    if (righeErr) {
      return { success: false, error: righeErr.message };
    }

    await writeAuditLog({
      entity_type: "fatture_ricevute",
      entity_id: row.id,
      action: "create",
      actor_id: auth.userId,
      summary: `Registrata fattura ricevuta ${numeroInterno}`,
      payload: {
        fic_id: input.ficId,
        fornitore_id: input.anagraficaId,
        totale: totals.totale,
      },
    });

    return {
      success: true,
      fattura: mapFatturaRicevutaRow(
        row,
        (righeData ?? []) as FatturaRicevutaRigaRow[]
      ),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore salvataggio fattura.",
    };
  }
}
