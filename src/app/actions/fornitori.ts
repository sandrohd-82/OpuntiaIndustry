"use server";

import { createClient } from "@/lib/supabase/server";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import {
  FORNITORI_BIO_BUCKET,
  bioCertificatoStoragePath,
  mapFornitoreRow,
  normalizeFornitoreInput,
  validateFornitoreAnagrafica,
  type Fornitore,
  type FornitoreInput,
} from "@/lib/amministrazione/fornitori";
import { markAnagraficaArchivioRipescatoAction } from "@/app/actions/anagrafiche-archivio";
import { writeAuditLog } from "@/lib/audit";
import { normalizeCompanyNameKey, normalizeVatKey, companyNamesMatch } from "@/lib/amministrazione/fic-anagrafiche";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { FornitoreInsert, FornitoreRow } from "@/types/database";

export type FornitoriActionResult =
  | { success: true; fornitore: Fornitore }
  | { success: false; error: string };

const MAX_BIO_PDF_BYTES = 10 * 1024 * 1024;

function isMissingCodiceFiscaleColumn(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("codice_fiscale") &&
    (msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.includes("could not find"))
  );
}

/** Targhe che bloccano la sequenza: TUTTE le attive + soft-delete con materie bio. */
export async function getUsedFornitoriCodiciTarga(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("id, codice_targa, deleted_at");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    codice_targa: string;
    deleted_at: string | null;
  }>;

  // Tutte le attive (anche incomplete): allineato all’indice unique
  const active = rows
    .filter((r) => !r.deleted_at)
    .map((r) => String(r.codice_targa).toUpperCase());

  const softIds = rows.filter((r) => r.deleted_at).map((r) => r.id);
  if (softIds.length === 0) return [...new Set(active)];

  const { data: materie, error: matError } = await supabase
    .from("materie_prime")
    .select("fornitore_bio_id")
    .in("fornitore_bio_id", softIds)
    .is("deleted_at", null);
  if (matError) throw new Error(matError.message);

  const busy = new Set(
    (materie ?? [])
      .map((m) => String(m.fornitore_bio_id))
      .filter(Boolean)
  );
  const softBusy = rows
    .filter((r) => r.deleted_at && busy.has(r.id))
    .map((r) => String(r.codice_targa).toUpperCase());

  return [...new Set([...active, ...softBusy])];
}

async function loadUsedCodiciTarga(): Promise<string[]> {
  return getUsedFornitoriCodiciTarga();
}

async function assertPartitaIvaUnica(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partitaIva: string,
  excludeId?: string
): Promise<string | null> {
  const vat = normalizeVatKey(partitaIva);
  if (!vat) return "La partita IVA è obbligatoria.";
  const { data, error } = await supabase
    .from("fornitori")
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

function parseFornitoreFormData(formData: FormData): {
  input: FornitoreInput;
  bioPdf: File | null;
} {
  const raw = formData.get("input");
  if (typeof raw !== "string") {
    throw new Error("Dati fornitore mancanti.");
  }
  const input = JSON.parse(raw) as FornitoreInput;
  const file = formData.get("bioPdf");
  const bioPdf = file instanceof File && file.size > 0 ? file : null;
  return { input, bioPdf };
}

async function uploadBioPdf(
  fornitoreId: string,
  file: File
): Promise<{ path: string } | { error: string }> {
  if (file.type !== "application/pdf") {
    return { error: "Il certificato bio deve essere un file PDF." };
  }
  if (file.size > MAX_BIO_PDF_BYTES) {
    return { error: "Il PDF non può superare 10 MB." };
  }

  const supabase = await createClient();
  const path = bioCertificatoStoragePath(fornitoreId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(FORNITORI_BIO_BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) return { error: error.message };
  return { path };
}

async function removeBioPdf(path: string): Promise<void> {
  if (!path) return;
  const supabase = await createClient();
  await supabase.storage.from(FORNITORI_BIO_BUCKET).remove([path]);
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
    .is("deleted_at", null)
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

/** Trova fornitore attivo per P.IVA / CF / ragione sociale (sync ricevute). */
export async function findFornitoreByPartitaIvaAction(
  partitaIva: string,
  ragioneSociale?: string
): Promise<
  | { success: true; fornitore: Fornitore | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const vat = normalizeVatKey(partitaIva);
  const nameKey = normalizeCompanyNameKey(ragioneSociale ?? "");
  if (!vat && !nameKey) return { success: true, fornitore: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("*")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as FornitoreRow[];
  const byVat = vat
    ? rows.find((row) => {
        const piva = normalizeVatKey(row.partita_iva);
        const cf = normalizeVatKey(row.codice_fiscale ?? "");
        return piva === vat || cf === vat;
      })
    : null;
  if (byVat) {
    return { success: true, fornitore: mapFornitoreRow(byVat) };
  }
  const byName = ragioneSociale?.trim()
    ? rows.find((row) =>
        companyNamesMatch(ragioneSociale, row.ragione_sociale ?? "")
      )
    : nameKey
      ? rows.find(
          (row) =>
            normalizeCompanyNameKey(row.ragione_sociale ?? "") === nameKey
        )
      : null;
  return {
    success: true,
    fornitore: byName ? mapFornitoreRow(byName) : null,
  };
}

export async function getBioCertificatoSignedUrlAction(
  path: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  if (!path.trim()) {
    return { success: false, error: "Nessun certificato caricato." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(FORNITORI_BIO_BUCKET)
    .createSignedUrl(path, 60 * 30);

  if (error || !data?.signedUrl) {
    return {
      success: false,
      error: error?.message ?? "Impossibile aprire il certificato.",
    };
  }

  return { success: true, url: data.signedUrl };
}

export async function createFornitoreAction(
  formData: FormData
): Promise<FornitoriActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  let input: FornitoreInput;
  let bioPdf: File | null;
  try {
    ({ input, bioPdf } = parseFornitoreFormData(formData));
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Dati non validi.",
    };
  }

  const normalized = normalizeFornitoreInput(input);
  const anagError = validateFornitoreAnagrafica(normalized);
  if (anagError) {
    return { success: false, error: anagError };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva
  );
  if (vatError) return { success: false, error: vatError };

  let codiceTarga: string;
  try {
    // Create: ignora targa “prenotata” dalla coda sync — sempre la prima libera (F001…).
    const used = await loadUsedCodiciTarga();
    codiceTarga = nextSequentialCodiceTarga("F", used);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Generazione codice targa fallita.",
    };
  }

  const enrichmentSnapshot = {
    ...(normalized.enrichmentSnapshot ?? {}),
    codiceFiscale: normalized.codiceFiscale,
  };

  const insertBase: FornitoreInsert = {
    codice_targa: codiceTarga,
    ragione_sociale: normalized.ragioneSociale,
    partita_iva: normalized.partitaIva,
    email: normalized.email ?? "",
    pec: normalized.pec ?? "",
    sdi_code: normalized.sdiCode ?? "",
    telefono: normalized.telefono ?? "",
    sito_web: normalized.sitoWeb ?? "",
    tipologie: normalized.tipologie ?? [],
    servizi_offerti: normalized.serviziOfferti ?? [],
    prodotti_fornitore: normalized.prodottiFornitore ?? [],
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
    contributi_offerti: normalized.contributiOfferti ?? [],
    bio_certificato: "",
    bio_certificato_path: "",
    bio_codice: normalized.bioCodice ?? "",
    anagrafica_fonte: normalized.anagraficaFonte ?? "manuale",
    verified_by: normalized.anagraficaVerificata ? auth.userId : null,
    verified_at: normalized.anagraficaVerificata
      ? new Date().toISOString()
      : null,
    enrichment_snapshot: enrichmentSnapshot,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  async function tryInsert(
    payload: FornitoreInsert,
    withCf: boolean
  ): Promise<{ row: FornitoreRow | null; error: { code?: string; message?: string } | null }> {
    const body = withCf
      ? { ...payload, codice_fiscale: normalized.codiceFiscale }
      : payload;
    const res = await supabase.from("fornitori").insert(body).select("*").single();
    return {
      row: res.data ? (res.data as FornitoreRow) : null,
      error: res.error,
    };
  }

  let withCf = true;
  let { row, error } = await tryInsert(insertBase, withCf);
  if (!row && isMissingCodiceFiscaleColumn(error)) {
    withCf = false;
    ({ row, error } = await tryInsert(insertBase, false));
  }

  if ((!row || error) && error?.code === "23505") {
    const used = await loadUsedCodiciTarga();
    for (let attempt = 0; attempt < 12 && !row; attempt++) {
      if (codiceTarga) used.push(codiceTarga);
      codiceTarga = nextSequentialCodiceTarga("F", used);
      const retry = await tryInsert(
        { ...insertBase, codice_targa: codiceTarga },
        withCf
      );
      row = retry.row;
      error = retry.error;
      if (row) break;
      if (isMissingCodiceFiscaleColumn(error)) {
        withCf = false;
        continue;
      }
      if (error?.code !== "23505") break;
    }
  }

  if (!row) {
    return {
      success: false,
      error:
        error?.message ??
        "Salvataggio fornitore non riuscito. Controlla i dati obbligatori.",
    };
  }

  if (bioPdf) {
    const uploaded = await uploadBioPdf(row.id, bioPdf);
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error };
    }
    const { data: updated, error: updateError } = await supabase
      .from("fornitori")
      .update({ bio_certificato_path: uploaded.path })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateError || !updated) {
      return {
        success: false,
        error: updateError?.message ?? "PDF salvato ma path non aggiornato.",
      };
    }
    row = updated as FornitoreRow;
  }

  await writeAuditLog({
    entity_type: "fornitori",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata scheda fornitore ${row.codice_targa}`,
    payload: {
      codice_targa: row.codice_targa,
      ragione_sociale: row.ragione_sociale,
      anagrafica_fonte: normalized.anagraficaFonte ?? "manuale",
    },
  });

  if (normalized.anagraficaVerificata && normalized.anagraficaFonte) {
    await writeAuditLog({
      entity_type: "fornitori",
      entity_id: row.id,
      action: "anagrafica_enriched_verified",
      actor_id: auth.userId,
      summary: `Anagrafica fornitore ${row.codice_targa} estratta da ${normalized.anagraficaFonte} e verificata dall’operatore`,
      payload: {
        fonte: normalized.anagraficaFonte,
        partita_iva: row.partita_iva,
        verified_by: auth.userId,
        verified_at: row.verified_at,
        enrichment_snapshot: enrichmentSnapshot,
      },
    });
  }

  if (input.archivioId) {
    await markAnagraficaArchivioRipescatoAction({
      kind: "fornitore",
      archivioId: input.archivioId,
    });
  }

  return {
    success: true,
    fornitore: mapFornitoreRow(row),
  };
}

export async function updateFornitoreAction(
  id: string,
  formData: FormData
): Promise<FornitoriActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  let input: FornitoreInput;
  let bioPdf: File | null;
  try {
    ({ input, bioPdf } = parseFornitoreFormData(formData));
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Dati non validi.",
    };
  }

  const normalized = normalizeFornitoreInput(input);
  const anagError = validateFornitoreAnagrafica(normalized);
  if (anagError) {
    return { success: false, error: anagError };
  }

  const vatError = await assertPartitaIvaUnica(
    supabase,
    normalized.partitaIva,
    id
  );
  if (vatError) return { success: false, error: vatError };

  const { data: existing, error: existingError } = await supabase
    .from("fornitori")
    .select("bio_certificato_path, deleted_at, enrichment_snapshot")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: existingError.message };
  }
  if (!existing || existing.deleted_at) {
    return { success: false, error: "Fornitore non trovato." };
  }

  let nextPath = String(existing.bio_certificato_path ?? "");

  if (normalized.removeBioCertificato && nextPath) {
    await removeBioPdf(nextPath);
    nextPath = "";
  }

  if (bioPdf) {
    const uploaded = await uploadBioPdf(id, bioPdf);
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error };
    }
    nextPath = uploaded.path;
  }

  const updatePayload: Record<string, unknown> = {
    ragione_sociale: normalized.ragioneSociale,
    partita_iva: normalized.partitaIva,
    codice_fiscale: normalized.codiceFiscale,
    email: normalized.email ?? "",
    pec: normalized.pec ?? "",
    sdi_code: normalized.sdiCode ?? "",
    telefono: normalized.telefono ?? "",
    sito_web: normalized.sitoWeb ?? "",
    tipologie: normalized.tipologie ?? [],
    servizi_offerti: normalized.serviziOfferti ?? [],
    prodotti_fornitore: normalized.prodottiFornitore ?? [],
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
    contributi_offerti: normalized.contributiOfferti ?? [],
    bio_certificato: "",
    bio_certificato_path: nextPath,
    bio_codice: normalized.bioCodice ?? "",
    enrichment_snapshot: {
      ...((existing as { enrichment_snapshot?: Record<string, unknown> | null })
        .enrichment_snapshot ?? {}),
      codiceFiscale: normalized.codiceFiscale,
    },
    updated_by: auth.userId,
  };

  let { data, error } = await supabase
    .from("fornitori")
    .update(updatePayload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error && isMissingCodiceFiscaleColumn(error)) {
    const { codice_fiscale: _omit, ...withoutCf } = updatePayload;
    ({ data, error } = await supabase
      .from("fornitori")
      .update(withoutCf)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single());
  }

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Aggiornamento scheda non riuscito.",
    };
  }

  const row = data as FornitoreRow;
  await writeAuditLog({
    entity_type: "fornitori",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata scheda fornitore ${row.codice_targa}`,
    payload: {
      codice_targa: row.codice_targa,
      ragione_sociale: row.ragione_sociale,
    },
  });

  return {
    success: true,
    fornitore: mapFornitoreRow(row),
  };
}

export async function softDeleteFornitoreAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<
  | { success: true; mode: "archived" | "soft_deleted" }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("fornitori")
    .select("id, codice_targa, ragione_sociale, deleted_at")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError) return { success: false, error: loadError.message };
  if (!existing || existing.deleted_at) {
    return { success: false, error: "Fornitore non trovato." };
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
    .from("materie_prime")
    .select("id", { count: "exact", head: true })
    .eq("fornitore_bio_id", input.id)
    .is("deleted_at", null);
  if (actError) return { success: false, error: actError.message };

  if ((count ?? 0) === 0) {
    const { data: archived, error: rpcError } = await supabase.rpc(
      "archive_unused_fornitore",
      {
        p_id: input.id,
        p_motivo: "eliminata",
        p_note: "Eliminazione scheda senza attività",
        p_actor: auth.userId,
      }
    );
    if (rpcError) {
      if (!rpcError.message.includes("HAS_ACTIVITY")) {
        return { success: false, error: rpcError.message };
      }
    } else {
      const payload = (archived ?? {}) as { archivio_id?: string };
      await writeAuditLog({
        entity_type: "fornitori_archivio",
        entity_id: payload.archivio_id ?? input.id,
        action: "soft_delete",
        actor_id: auth.userId,
        summary: `Fornitore ${codice} archiviato (targa liberata)`,
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
    .from("fornitori")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "fornitori",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Soft delete fornitore ${codice} (con attività — targa bloccata)`,
    payload: {
      codice_targa: codice,
      ragione_sociale: existing.ragione_sociale,
      conferma: expected,
    },
  });

  return { success: true, mode: "soft_deleted" };
}
