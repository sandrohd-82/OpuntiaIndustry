"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  CONTRATTO_SELECT,
  createContrattoSchema,
  mapContratto,
  type ContrattoFiscale,
} from "@/lib/amministrazione/contratti-fiscali";
import { createClient } from "@/lib/supabase/server";

async function guard() {
  return requireAreaAccess("area-fiscale");
}

export async function listContrattiFiscaliAction(input: {
  archivio: boolean;
}): Promise<
  | { success: true; items: ContrattoFiscale[] }
  | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  let q = supabase
    .from("contratti_fiscali")
    .select(CONTRATTO_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (input.archivio) {
    q = q.in("stato", ["archiviato", "scaduto"]);
  } else {
    q = q.in("stato", ["bozza", "attivo"]);
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) =>
      mapContratto(r as Parameters<typeof mapContratto>[0])
    ),
  };
}

export async function createContrattoFiscaleAction(input: unknown): Promise<
  | { success: true; item: ContrattoFiscale }
  | { success: false; error: string }
> {
  const { auth } = await guard();
  const parsed = createContrattoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contratti_fiscali")
    .insert({
      tipologia: v.tipologia,
      oggetto: v.oggetto,
      controparte_nome: v.controparteNome,
      importo: v.importo,
      periodicita: v.periodicita,
      iva_percentuale: v.ivaPercentuale ?? null,
      ha_periodo: v.haPeriodo,
      data_inizio: v.haPeriodo ? v.dataInizio ?? null : null,
      data_fine:
        v.haPeriodo && !v.aTempoIndeterminato ? v.dataFine ?? null : null,
      a_tempo_indeterminato: v.haPeriodo ? v.aTempoIndeterminato : false,
      sostituisce_fattura: v.sostituisceFattura,
      pagamento_soggetto_a_fattura: v.pagamentoSoggettoAFattura,
      note: v.note ?? "",
      stato: v.stato ?? "attivo",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(CONTRATTO_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }

  const item = mapContratto(data as Parameters<typeof mapContratto>[0]);
  await writeAuditLog({
    entity_type: "contratti_fiscali",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Contratto ${item.tipologia}: ${item.oggetto}`,
    payload: {
      importo: item.importo,
      sostituisce_fattura: item.sostituisceFattura,
      soggetto_fattura: item.pagamentoSoggettoAFattura,
    },
  });
  return { success: true, item };
}

export async function archiveContrattoFiscaleAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratti_fiscali")
    .update({
      stato: "archiviato",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "contratti_fiscali",
    entity_id: id,
    action: "archive",
    actor_id: auth.userId,
    summary: "Contratto archiviato",
    payload: {},
  });
  return { success: true };
}

export async function softDeleteContrattoFiscaleAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratti_fiscali")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "contratti_fiscali",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Contratto soft-delete",
    payload: {},
  });
  return { success: true };
}

export async function uploadContrattoAllegatoAction(input: {
  contrattoId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const buf = Buffer.from(input.base64, "base64");
  if (buf.length > 20 * 1024 * 1024) {
    return { success: false, error: "File troppo grande (max 20MB)" };
  }
  const safe = input.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${input.contrattoId}/${Date.now()}_${safe}`;
  const { error: upErr } = await supabase.storage
    .from("contratti-fiscali")
    .upload(path, buf, {
      contentType: input.mimeType || "application/pdf",
      upsert: false,
    });
  if (upErr) return { success: false, error: upErr.message };

  const { error } = await supabase
    .from("contratti_fiscali")
    .update({
      allegato_path: path,
      allegato_nome: input.fileName.slice(0, 255),
      updated_by: auth.userId,
    })
    .eq("id", input.contrattoId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "contratti_fiscali",
    entity_id: input.contrattoId,
    action: "upload_allegato",
    actor_id: auth.userId,
    summary: `Allegato contratto: ${input.fileName}`,
    payload: { path },
  });
  return { success: true };
}

export async function getContrattoAllegatoUrlAction(
  storagePath: string
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("contratti-fiscali")
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? "URL non disponibile" };
  }
  return { success: true, url: data.signedUrl };
}
