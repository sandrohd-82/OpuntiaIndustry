"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  bilancioDilazioni,
  buildNumeroInternoFattura,
  calcolaTotaliFattura,
  formatEuro,
  formatDateIt,
  mapFatturaEmessaRow,
  mapFatturaRicevutaRow,
  parseFatturaInput,
  type Fattura,
  type FatturaCollegabileOption,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";
import {
  hasCondizioniParticolari,
  toCondizioneStorico,
  type ProdottoPrezzoStoricoHint,
  type SpedizioneIvaStoricoHint,
} from "@/lib/amministrazione/fatture-storico";
import {
  planRinumeraFattureEmesse,
  tempNumeroInterno,
  type FatturaRinumeraRow,
} from "@/lib/amministrazione/fatture-rinumerazione";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  FatturaEmessaDilazioneInsert,
  FatturaEmessaDilazioneRow,
  FatturaEmessaInsert,
  FatturaEmessaRigaInsert,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaRicevutaDilazioneInsert,
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaInsert,
  FatturaRicevutaRigaInsert,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
} from "@/types/database";

const RICEVUTA_BUCKET = "fatture-ricevute-pagamenti";

export type FattureActionResult =
  | { success: true; fattura: Fattura }
  | { success: false; error: string };

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Rinumera Ft/Nc di un cliente in ordine di data emissione (targa gestionale).
 * Due fasi (TMP → definitivo) per rispettare l’unicità di numero_interno.
 */
export async function rinumeraFattureEmesseClienteInternal(
  supabase: SupabaseServer,
  actorId: string | null,
  clienteId: string
): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("fatture_emesse")
    .select(
      "id, cliente_id, cliente_codice_targa, data_emissione, numero_interno, tipo_documento, created_at"
    )
    .eq("cliente_id", clienteId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  const rows: FatturaRinumeraRow[] = (data ?? []).map((r) => ({
    id: String(r.id),
    clienteId: String(r.cliente_id),
    codiceTarga: String(r.cliente_codice_targa ?? ""),
    dataEmissione: String(r.data_emissione ?? ""),
    numeroInterno: String(r.numero_interno ?? ""),
    tipoDocumento:
      (r.tipo_documento as string) === "nota_credito"
        ? "nota_credito"
        : "fattura",
    createdAt: String(r.created_at ?? ""),
  }));

  const changes = planRinumeraFattureEmesse(rows);
  if (changes.length === 0) return { ok: true, changed: 0 };

  for (const ch of changes) {
    const { error: e1 } = await supabase
      .from("fatture_emesse")
      .update({
        numero_interno: tempNumeroInterno(ch.id),
        updated_by: actorId,
      })
      .eq("id", ch.id);
    if (e1) return { ok: false, error: e1.message };
  }

  for (const ch of changes) {
    const { error: e2 } = await supabase
      .from("fatture_emesse")
      .update({
        numero_interno: ch.a,
        updated_by: actorId,
      })
      .eq("id", ch.id);
    if (e2) return { ok: false, error: e2.message };

    // Aggiorna riferimenti testuali sulle NC collegate a questa fattura
    await supabase
      .from("fatture_emesse")
      .update({
        riferimento_fattura_esterno: ch.a,
        updated_by: actorId,
      })
      .eq("fattura_collegata_id", ch.id)
      .eq("tipo_documento", "nota_credito")
      .is("deleted_at", null);
  }

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: clienteId,
    action: "rinumera_per_data_emissione",
    actor_id: actorId,
    summary: `Rinumerate ${changes.length} documenti cliente per data emissione`,
    payload: {
      cliente_id: clienteId,
      changes: changes.map((c) => ({
        id: c.id,
        da: c.da,
        a: c.a,
        data_emissione: c.dataEmissione,
      })),
    },
  });

  return { ok: true, changed: changes.length };
}

/** Rinumerazione di tutti i clienti (sync / manutenzione). */
export async function rinumeraTutteFattureEmesseAction(): Promise<
  | { success: true; clienti: number; changed: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_emesse")
    .select("cliente_id")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const clienteIds = [
    ...new Set(
      (data ?? [])
        .map((r) => String(r.cliente_id ?? ""))
        .filter(Boolean)
    ),
  ];

  let changed = 0;
  for (const clienteId of clienteIds) {
    const res = await rinumeraFattureEmesseClienteInternal(
      supabase,
      auth.userId,
      clienteId
    );
    if (!res.ok) return { success: false, error: res.error };
    changed += res.changed;
  }

  return { success: true, clienti: clienteIds.length, changed };
}

export async function rinumeraFattureEmesseClienteAction(
  clienteId: string
): Promise<
  | { success: true; changed: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!clienteId) return { success: false, error: "Cliente non valido." };
  const supabase = await createClient();
  const res = await rinumeraFattureEmesseClienteInternal(
    supabase,
    auth.userId,
    clienteId
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, changed: res.changed };
}

async function nextSeqFattura(
  kind: FatturaKind,
  anagraficaId: string,
  codiceTarga: string
): Promise<number> {
  const supabase = await createClient();
  const table =
    kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const idCol = kind === "ricevuta" ? "fornitore_id" : "cliente_id";
  const prefix = kind === "nota_credito" ? "Nc" : "Ft";

  const { data, error } = await supabase
    .from(table)
    .select(`numero_interno, ${idCol}`)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^${prefix}-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of data ?? []) {
    const rec = row as Record<string, unknown>;
    if (rec[idCol] === anagraficaId) {
      const num = String(rec.numero_interno ?? "");
      if (kind === "nota_credito") {
        if (num.toUpperCase().startsWith("NC-")) countById += 1;
      } else if (kind === "emessa") {
        if (num.toUpperCase().startsWith("FT-")) countById += 1;
      } else {
        countById += 1;
      }
    }
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
        kind: input.kind,
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

/**
 * Aggiunge in scheda anagrafica i codici prodotto presenti sulla fattura
 * e mancanti in prodotti_acquistati (solo se esistono in prodotti_propri).
 */
async function syncProdottiAcquistatiFromFatturaRighe(input: {
  kind: FatturaKind;
  anagraficaId: string;
  righe: Array<{ prodottoId: string | null; codice: string }>;
  userId: string;
  fatturaId: string;
  numeroInterno: string;
}): Promise<string[]> {
  const supabase = await createClient();
  const rawCodes = [
    ...new Set(
      input.righe
        .map((r) => (r.codice ?? "").trim())
        .filter((c) => c.length > 0 && c !== "—")
    ),
  ];

  const ids = [
    ...new Set(
      input.righe
        .map((r) => r.prodottoId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const codes = new Set<string>(rawCodes);
  if (ids.length > 0) {
    const { data: byId } = await supabase
      .from("prodotti_propri")
      .select("id, codice")
      .in("id", ids)
      .is("deleted_at", null);
    for (const p of byId ?? []) {
      const code = String((p as { codice?: string }).codice ?? "").trim();
      if (code) codes.add(code);
    }
  }

  if (codes.size === 0) return [];

  const { data: valid } = await supabase
    .from("prodotti_propri")
    .select("codice")
    .in("codice", [...codes])
    .is("deleted_at", null);
  const validCodes = [
    ...new Set(
      (valid ?? [])
        .map((p) => String((p as { codice?: string }).codice ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (validCodes.length === 0) return [];

  const table =
    input.kind === "ricevuta" ? "fornitori" : "clienti";
  const { data: anagrafica, error } = await supabase
    .from(table)
    .select("id, prodotti_acquistati")
    .eq("id", input.anagraficaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !anagrafica) {
    console.error("[syncProdottiAcquistati]", error?.message);
    return [];
  }

  const existing = Array.isArray(
    (anagrafica as { prodotti_acquistati?: string[] }).prodotti_acquistati
  )
    ? (
        anagrafica as { prodotti_acquistati: string[] }
      ).prodotti_acquistati.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const missing = validCodes.filter((c) => !existing.includes(c));
  if (missing.length === 0) return [];

  const merged = [...new Set([...existing, ...missing])].sort((a, b) =>
    a.localeCompare(b, "it")
  );
  const { error: upErr } = await supabase
    .from(table)
    .update({
      prodotti_acquistati: merged,
      updated_by: input.userId,
    })
    .eq("id", input.anagraficaId)
    .is("deleted_at", null);
  if (upErr) {
    console.error("[syncProdottiAcquistati] update", upErr.message);
    return [];
  }

  await writeAuditLog({
    entity_type: table,
    entity_id: input.anagraficaId,
    action: "update",
    actor_id: input.userId,
    summary: `Aggiunti prodotti da fattura ${input.numeroInterno}: ${missing.join(", ")}`,
    payload: {
      fattura_id: input.fatturaId,
      added: missing,
      source: "fattura_registrazione",
    },
  });

  return missing;
}

export async function listFattureAction(
  kind: FatturaKind
): Promise<
  { success: true; fatture: Fattura[] } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  if (kind === "emessa" || kind === "nota_credito") {
    let q = supabase
      .from("fatture_emesse")
      .select("*")
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false });
    if (kind === "nota_credito") {
      q = q.eq("tipo_documento", "nota_credito");
    } else {
      q = q.or("tipo_documento.eq.fattura,tipo_documento.is.null");
    }
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as FatturaEmessaRow[];
    const ids = rows.map((r) => r.id);
    const righeBy = new Map<string, FatturaEmessaRigaRow[]>();
    const dilBy = new Map<string, FatturaEmessaDilazioneRow[]>();
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
      const { data: dilazioni } = await supabase
        .from("fatture_emesse_dilazioni")
        .select("*")
        .in("fattura_id", ids)
        .is("deleted_at", null);
      for (const d of (dilazioni ?? []) as FatturaEmessaDilazioneRow[]) {
        const list = dilBy.get(d.fattura_id) ?? [];
        list.push(d);
        dilBy.set(d.fattura_id, list);
      }
    }
    return {
      success: true,
      fatture: rows.map((row) =>
        mapFatturaEmessaRow(
          row,
          righeBy.get(row.id) ?? [],
          dilBy.get(row.id) ?? []
        )
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
  const dilBy = new Map<string, FatturaRicevutaDilazioneRow[]>();
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
    const { data: dilazioni } = await supabase
      .from("fatture_ricevute_dilazioni")
      .select("*")
      .in("fattura_id", ids)
      .is("deleted_at", null);
    for (const d of (dilazioni ?? []) as FatturaRicevutaDilazioneRow[]) {
      const list = dilBy.get(d.fattura_id) ?? [];
      list.push(d);
      dilBy.set(d.fattura_id, list);
    }
  }
  return {
    success: true,
    fatture: rows.map((row) =>
      mapFatturaRicevutaRow(
        row,
        righeBy.get(row.id) ?? [],
        dilBy.get(row.id) ?? []
      )
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

  const parsed = parseFatturaInput(kind, payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error,
    };
  }
  const input = parsed.data;
  const totals = calcolaTotaliFattura({
    righe: input.righe,
    spedizione: input.spedizione,
    spedizioneIvaApplicata: input.spedizioneIvaApplicata,
    spedizioneSottraiIncassi: input.spedizioneSottraiIncassi,
    notaCredito: kind === "nota_credito",
    ivaPercentuale: input.ivaPercentuale,
  });

  if (kind === "nota_credito" && !input.fatturaCollegataId) {
    return {
      success: false,
      error: "Seleziona la fattura collegata alla nota di credito.",
    };
  }

  if (input.dilazioni.length > 0) {
    const bil = bilancioDilazioni(
      totals.totale,
      input.dilazioni.map((d) => d.importo)
    );
    if (!bil.equilibrato) {
      if (bil.mancante > 0) {
        return {
          success: false,
          error: `Dilazioni incomplete: manca ${formatEuro(bil.mancante)} rispetto al totale ${formatEuro(bil.totaleFattura)}.`,
        };
      }
      return {
        success: false,
        error: `Dilazioni in esubero di ${formatEuro(bil.esubero)} rispetto al totale ${formatEuro(bil.totaleFattura)}.`,
      };
    }
  }

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
      kind,
    });

    if (kind === "emessa" || kind === "nota_credito") {
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
        spedizione_sottrai_incassi:
          kind === "nota_credito" ? input.spedizioneSottraiIncassi : true,
        imponibile: totals.imponibile,
        iva_percentuale: input.ivaPercentuale,
        imposta: totals.imposta,
        totale: totals.totale,
        stato_pagamento: input.statoPagamento,
        stato_incasso_nc:
          kind === "nota_credito" ? input.statoIncassoNc : null,
        rimborso_necessario:
          kind === "nota_credito" ? input.rimborsoNecessario : null,
        rimborso_mezzo: kind === "nota_credito" ? input.rimborsoMezzo : null,
        fattura_compensativa_id:
          kind === "nota_credito" ? input.fatturaCompensativaId : null,
        modalita_collegamento:
          kind === "nota_credito" ? input.modalitaCollegamento : null,
        fattura_sostitutiva_id:
          kind === "nota_credito" ? input.fatturaSostitutivaId : null,
        documento_stato: "registrata",
        note: input.note,
        tipo_documento: kind === "nota_credito" ? "nota_credito" : "fattura",
        fattura_collegata_id: input.fatturaCollegataId ?? null,
        riferimento_fattura_esterno: input.riferimentoFatturaEsterno ?? "",
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

      const prodottiAggiuntiScheda = await syncProdottiAcquistatiFromFatturaRighe(
        {
          kind: "emessa",
          anagraficaId: input.anagraficaId,
          righe: input.righe,
          userId: auth.userId,
          fatturaId: row.id,
          numeroInterno,
        }
      );

      let dilazioniData: FatturaEmessaDilazioneRow[] = [];
      if (input.dilazioni.length > 0) {
        const dilInsert: FatturaEmessaDilazioneInsert[] = input.dilazioni.map(
          (d, i) => ({
            fattura_id: row.id,
            data_scadenza: d.dataScadenza,
            importo: d.importo,
            stato_pagamento: d.statoPagamento,
            sort_order: i,
            note: d.note ?? "",
            created_by: auth.userId,
            updated_by: auth.userId,
          })
        );
        const { data: dilRows, error: dilErr } = await supabase
          .from("fatture_emesse_dilazioni")
          .insert(dilInsert)
          .select("*");
        if (dilErr) {
          return { success: false, error: dilErr.message };
        }
        dilazioniData = (dilRows ?? []) as FatturaEmessaDilazioneRow[];
      }

      if (
        kind === "nota_credito" &&
        input.modalitaCollegamento !== "sostituzione" &&
        input.fatturaCollegataId &&
        input.dilazioniAnnullateIds.length > 0
      ) {
        const nowIso = new Date().toISOString();
        const { error: annErr } = await supabase
          .from("fatture_emesse_dilazioni")
          .update({
            stato_pagamento: "annullata",
            annullata_at: nowIso,
            annullata_by: auth.userId,
            updated_by: auth.userId,
          })
          .eq("fattura_id", input.fatturaCollegataId)
          .in("id", input.dilazioniAnnullateIds)
          .is("deleted_at", null);
        if (annErr) {
          return {
            success: false,
            error: `Annullamento dilazioni: ${annErr.message}`,
          };
        }
        await writeAuditLog({
          entity_type: "fatture_emesse",
          entity_id: input.fatturaCollegataId,
          action: "annulla_dilazioni_da_nc",
          actor_id: auth.userId,
          summary: `Annullate ${input.dilazioniAnnullateIds.length} dilazioni da NC ${numeroInterno}`,
          payload: {
            nota_credito_id: row.id,
            dilazioni_ids: input.dilazioniAnnullateIds,
          },
        });
      }

      if (
        kind === "emessa" &&
        input.collegaComeCompensativaNcId
      ) {
        const { error: compErr } = await supabase
          .from("fatture_emesse")
          .update({
            fattura_compensativa_id: row.id,
            updated_by: auth.userId,
          })
          .eq("id", input.collegaComeCompensativaNcId)
          .eq("tipo_documento", "nota_credito")
          .is("deleted_at", null);
        if (compErr) {
          return {
            success: false,
            error: `Collegamento NC compensativa: ${compErr.message}`,
          };
        }
        await writeAuditLog({
          entity_type: "fatture_emesse",
          entity_id: input.collegaComeCompensativaNcId,
          action: "collega_fattura_compensativa",
          actor_id: auth.userId,
          summary: `Fattura ${numeroInterno} collegata come compensativa NC`,
          payload: {
            fattura_compensativa_id: row.id,
          },
        });
      }

      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: row.id,
        action: kind === "nota_credito" ? "create_nota_credito" : "create",
        actor_id: auth.userId,
        summary:
          kind === "nota_credito"
            ? `Registrata nota di credito ${numeroInterno}`
            : `Registrata fattura emessa ${numeroInterno}`,
        payload: {
          fic_id: input.ficId,
          cliente_id: input.anagraficaId,
          totale: totals.totale,
          dilazioni: input.dilazioni.length,
          stato_pagamento: input.statoPagamento,
          stato_incasso_nc: input.statoIncassoNc,
          rimborso_necessario: input.rimborsoNecessario,
          rimborso_mezzo: input.rimborsoMezzo,
          fattura_compensativa_id: input.fatturaCompensativaId,
          modalita_collegamento: input.modalitaCollegamento,
          fattura_sostitutiva_id: input.fatturaSostitutivaId,
          prodotti_aggiunti_scheda: prodottiAggiuntiScheda,
          tipo_documento: kind === "nota_credito" ? "nota_credito" : "fattura",
          fattura_collegata_id: input.fatturaCollegataId ?? null,
          riferimento_fattura_esterno: input.riferimentoFatturaEsterno ?? "",
          spedizione_sottrai_incassi: input.spedizioneSottraiIncassi,
          dilazioni_annullate: input.dilazioniAnnullateIds.length,
        },
      });

      // Sempre: progressivi allineati alla data (anche se arrivano documenti più vecchi)
      await rinumeraFattureEmesseClienteInternal(
        supabase,
        auth.userId,
        input.anagraficaId
      );

      const { data: refreshed } = await supabase
        .from("fatture_emesse")
        .select("*")
        .eq("id", row.id)
        .maybeSingle();
      const finalRow = (refreshed ?? row) as FatturaEmessaRow;

      return {
        success: true,
        fattura: mapFatturaEmessaRow(
          finalRow,
          (righeData ?? []) as FatturaEmessaRigaRow[],
          dilazioniData
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

    const prodottiAggiuntiScheda = await syncProdottiAcquistatiFromFatturaRighe(
      {
        kind: "ricevuta",
        anagraficaId: input.anagraficaId,
        righe: input.righe,
        userId: auth.userId,
        fatturaId: row.id,
        numeroInterno,
      }
    );

    let dilazioniData: FatturaRicevutaDilazioneRow[] = [];
    if (input.dilazioni.length > 0) {
      const dilInsert: FatturaRicevutaDilazioneInsert[] = input.dilazioni.map(
        (d, i) => ({
          fattura_id: row.id,
          data_scadenza: d.dataScadenza,
          importo: d.importo,
          stato_pagamento: d.statoPagamento,
          sort_order: i,
          note: d.note ?? "",
          created_by: auth.userId,
          updated_by: auth.userId,
        })
      );
      const { data: dilRows, error: dilErr } = await supabase
        .from("fatture_ricevute_dilazioni")
        .insert(dilInsert)
        .select("*");
      if (dilErr) {
        return { success: false, error: dilErr.message };
      }
      dilazioniData = (dilRows ?? []) as FatturaRicevutaDilazioneRow[];
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
        dilazioni: input.dilazioni.length,
        stato_pagamento: input.statoPagamento,
        prodotti_aggiunti_scheda: prodottiAggiuntiScheda,
      },
    });

    return {
      success: true,
      fattura: mapFatturaRicevutaRow(
        row,
        (righeData ?? []) as FatturaRicevutaRigaRow[],
        dilazioniData
      ),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore salvataggio fattura.",
    };
  }
}

export async function getFatturaByIdAction(
  kind: FatturaKind,
  id: string
): Promise<
  { success: true; fattura: Fattura } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  if (kind === "emessa" || kind === "nota_credito") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Documento non trovato." };
    const { data: righe } = await supabase
      .from("fatture_emesse_righe")
      .select("*")
      .eq("fattura_id", id)
      .order("sort_order", { ascending: true });
    const { data: dilazioni } = await supabase
      .from("fatture_emesse_dilazioni")
      .select("*")
      .eq("fattura_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const fattura = mapFatturaEmessaRow(
      data as FatturaEmessaRow,
      (righe ?? []) as FatturaEmessaRigaRow[],
      (dilazioni ?? []) as FatturaEmessaDilazioneRow[]
    );

    if (fattura.kind === "nota_credito") {
      const linkIds = [
        fattura.fatturaCollegataId,
        fattura.fatturaSostitutivaId,
      ].filter((x): x is string => Boolean(x));
      if (linkIds.length > 0) {
        const { data: linked } = await supabase
          .from("fatture_emesse")
          .select("id, numero_interno")
          .in("id", linkIds)
          .is("deleted_at", null);
        const byId = new Map(
          (linked ?? []).map((r) => [
            String(r.id),
            String(r.numero_interno ?? ""),
          ])
        );
        if (fattura.fatturaCollegataId) {
          fattura.fatturaCollegataNumeroInterno =
            byId.get(fattura.fatturaCollegataId) ||
            fattura.riferimentoFatturaEsterno ||
            null;
        }
        if (fattura.fatturaSostitutivaId) {
          fattura.fatturaSostitutivaNumeroInterno =
            byId.get(fattura.fatturaSostitutivaId) || null;
        }
      }
    }

    return {
      success: true,
      fattura,
    };
  }

  const { data, error } = await supabase
    .from("fatture_ricevute")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Fattura non trovata." };
  const { data: righe, error: righeErr } = await supabase
    .from("fatture_ricevute_righe")
    .select("*")
    .eq("fattura_id", id)
    .order("sort_order", { ascending: true });
  if (righeErr) return { success: false, error: righeErr.message };
  const { data: dilazioni } = await supabase
    .from("fatture_ricevute_dilazioni")
    .select("*")
    .eq("fattura_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return {
    success: true,
    fattura: mapFatturaRicevutaRow(
      data as FatturaRicevutaRow,
      (righe ?? []) as FatturaRicevutaRigaRow[],
      (dilazioni ?? []) as FatturaRicevutaDilazioneRow[]
    ),
  };
}

/** Avviso storico: IVA già applicata sulla spedizione per questa anagrafica. */
export async function getSpedizioneIvaStoricoHintAction(input: {
  kind: FatturaKind;
  anagraficaId: string;
}): Promise<
  | { success: true; hint: SpedizioneIvaStoricoHint }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const empty: SpedizioneIvaStoricoHint = {
    applicataInPassato: false,
    count: 0,
    ultima: null,
    fatture: [],
  };
  if (!input.anagraficaId) {
    return { success: true, hint: empty };
  }

  const supabase = await createClient();
  const table =
    input.kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const idCol =
    input.kind === "ricevuta" ? "fornitore_id" : "cliente_id";

  const { data, error } = await supabase
    .from(table)
    .select("id, numero_interno, data_emissione, spedizione_iva_applicata")
    .eq(idCol, input.anagraficaId)
    .eq("spedizione_iva_applicata", true)
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(10);

  if (error) return { success: false, error: error.message };

  const fatture = (data ?? []).map((row) => {
    const r = row as {
      id: string;
      numero_interno: string;
      data_emissione: string;
    };
    return {
      id: r.id,
      numeroInterno: r.numero_interno,
      dataEmissione: r.data_emissione,
    };
  });

  return {
    success: true,
    hint: {
      applicataInPassato: fatture.length > 0,
      count: fatture.length,
      ultima: fatture[0] ?? null,
      fatture,
    },
  };
}

/** Storico prezzi/sconti prodotto × anagrafica (per ⓘ in registrazione / futura creazione). */
export async function getProdottoPrezzoStoricoHintAction(input: {
  kind: FatturaKind;
  anagraficaId: string;
  prodottoId?: string | null;
  codice?: string | null;
}): Promise<
  | { success: true; hint: ProdottoPrezzoStoricoHint }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const empty: ProdottoPrezzoStoricoHint = {
    hasParticolari: false,
    condizioni: [],
  };
  if (!input.anagraficaId) return { success: true, hint: empty };

  const prodottoId = input.prodottoId?.trim() || null;
  const codice = (input.codice ?? "").trim();
  if (!prodottoId && !codice) return { success: true, hint: empty };

  const supabase = await createClient();
  const headerTable =
    input.kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const righeTable =
    input.kind === "ricevuta"
      ? "fatture_ricevute_righe"
      : "fatture_emesse_righe";
  const idCol =
    input.kind === "ricevuta" ? "fornitore_id" : "cliente_id";

  const { data: headers, error: hErr } = await supabase
    .from(headerTable)
    .select("id, numero_interno, data_emissione")
    .eq(idCol, input.anagraficaId)
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(80);

  if (hErr) return { success: false, error: hErr.message };
  const headerRows = (headers ?? []) as Array<{
    id: string;
    numero_interno: string;
    data_emissione: string;
  }>;
  if (headerRows.length === 0) return { success: true, hint: empty };

  const headerById = new Map(headerRows.map((h) => [h.id, h]));
  const fatturaIds = headerRows.map((h) => h.id);

  let q = supabase
    .from(righeTable)
    .select(
      "fattura_id, prodotto_id, codice, quantita, prezzo_unitario, sconto_percentuale"
    )
    .in("fattura_id", fatturaIds);

  if (prodottoId) {
    q = q.eq("prodotto_id", prodottoId);
  } else {
    q = q.ilike("codice", codice);
  }

  const { data: righe, error: rErr } = await q.limit(40);
  if (rErr) return { success: false, error: rErr.message };

  const condizioni = (righe ?? [])
    .map((raw) => {
      const r = raw as {
        fattura_id: string;
        quantita: number;
        prezzo_unitario: number;
        sconto_percentuale: number;
      };
      const h = headerById.get(r.fattura_id);
      if (!h) return null;
      return toCondizioneStorico({
        fatturaId: h.id,
        numeroInterno: h.numero_interno,
        dataEmissione: h.data_emissione,
        prezzoUnitario: Number(r.prezzo_unitario) || 0,
        scontoPercentuale: Number(r.sconto_percentuale) || 0,
        quantita: Number(r.quantita) || 0,
      });
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.dataEmissione.localeCompare(a.dataEmissione))
    .slice(0, 10);

  return {
    success: true,
    hint: {
      hasParticolari: hasCondizioniParticolari(condizioni),
      condizioni,
    },
  };
}

/** Fatture emesse della stessa azienda (per collegamento NC / compensativa). */
export async function listFattureEmesseClienteAction(input: {
  clienteId: string;
  excludeId?: string | null;
}): Promise<
  | { success: true; fatture: FatturaCollegabileOption[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!input.clienteId) {
    return { success: true, fatture: [] };
  }
  const supabase = await createClient();
  let q = supabase
    .from("fatture_emesse")
    .select("id, numero_interno, data_emissione, totale")
    .eq("cliente_id", input.clienteId)
    .or("tipo_documento.eq.fattura,tipo_documento.is.null")
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(200);
  if (input.excludeId) q = q.neq("id", input.excludeId);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const fatture: FatturaCollegabileOption[] = (data ?? []).map((r) => {
    const id = String(r.id);
    const numeroInterno = String(r.numero_interno ?? "");
    const dataEmissione = String(r.data_emissione ?? "");
    const totale = Number(r.totale) || 0;
    return {
      id,
      numeroInterno,
      dataEmissione,
      totale,
      label: `${numeroInterno} · ${formatEuro(totale)} · ${formatDateIt(dataEmissione)}`,
    };
  });
  return { success: true, fatture };
}

export type DilazioneFatturaOption = {
  id: string;
  dataScadenza: string;
  importo: number;
  statoPagamento: string;
  note: string;
};

/** Dilazioni attive di una fattura (per annullo da NC). */
export async function listDilazioniFatturaEmessaAction(
  fatturaId: string
): Promise<
  | { success: true; dilazioni: DilazioneFatturaOption[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!fatturaId) return { success: true, dilazioni: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_emesse_dilazioni")
    .select("id, data_scadenza, importo, stato_pagamento, note")
    .eq("fattura_id", fatturaId)
    .is("deleted_at", null)
    .neq("stato_pagamento", "annullata")
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    dilazioni: (data ?? []).map((d) => ({
      id: String(d.id),
      dataScadenza: String(d.data_scadenza),
      importo: Number(d.importo) || 0,
      statoPagamento: String(d.stato_pagamento),
      note: String(d.note ?? ""),
    })),
  };
}

export type NcCompensazioneCandidate = {
  id: string;
  numeroInterno: string;
  dataEmissione: string;
  totale: number;
  riferimentoFatturaEsterno: string;
  note: string;
  motivo: string;
};

/** NC in attesa di fattura compensativa, stesso cliente, importi affini. */
export async function findNcCompensazioneCandidatesAction(input: {
  clienteId: string;
  importoFattura: number;
  descrizioneHint?: string;
}): Promise<
  | { success: true; candidates: NcCompensazioneCandidate[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!input.clienteId) return { success: true, candidates: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_emesse")
    .select(
      "id, numero_interno, data_emissione, totale, riferimento_fattura_esterno, note"
    )
    .eq("cliente_id", input.clienteId)
    .eq("tipo_documento", "nota_credito")
    .eq("rimborso_mezzo", "nuova_fattura")
    .is("fattura_compensativa_id", null)
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(40);
  if (error) return { success: false, error: error.message };

  const amount = Math.abs(input.importoFattura);
  const hint = (input.descrizioneHint ?? "").trim().toLowerCase();
  const candidates: NcCompensazioneCandidate[] = [];
  for (const r of data ?? []) {
    const tot = Math.abs(Number(r.totale) || 0);
    const amountClose =
      amount > 0 &&
      Math.abs(tot - amount) <= Math.max(0.5, amount * 0.02);
    const note = String(r.note ?? "");
    const rif = String(r.riferimento_fattura_esterno ?? "");
    const descMatch =
      !hint ||
      note.toLowerCase().includes(hint) ||
      rif.toLowerCase().includes(hint);
    if (!amountClose && !descMatch) continue;
    const numeroInterno = String(r.numero_interno ?? "");
    candidates.push({
      id: String(r.id),
      numeroInterno,
      dataEmissione: String(r.data_emissione ?? ""),
      totale: Number(r.totale) || 0,
      riferimentoFatturaEsterno: rif,
      note,
      motivo: amountClose
        ? `Importo simile (${formatEuro(tot)} ≈ ${formatEuro(amount)})`
        : "Descrizione / riferimento affine",
    });
  }
  return { success: true, candidates };
}
