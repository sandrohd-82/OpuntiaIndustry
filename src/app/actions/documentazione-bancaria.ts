"use server";

import { createHash, randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import {
  bloccaScritturaOspite,
  negaOspiteFuoriElaborazione,
  requireCommercialistaLettura,
} from "@/lib/amministrazione/commercialista-ospite-accesso";
import { registraAuditOspite } from "@/lib/amministrazione/commercialista-ospite";
import {
  DOCUMENTAZIONE_BANCA_BUCKET,
  DOCUMENTAZIONE_BANCA_MAX_BYTES,
  SLOT_DOCUMENTAZIONE_BANCA,
  estensioneAccettata,
  nomeFileDocumentazioneBancaria,
  periodoDocumentazioneBancariaSchema,
  slotDocumentazioneBancaria,
  slotDocumentazioneBancariaSchema,
  type GruppoDocumentazioneBanca,
  type SlotDocumentazioneBanca,
} from "@/lib/amministrazione/documentazione-bancaria";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

export type VoceDocumentazioneBancaria = {
  slot: SlotDocumentazioneBanca;
  gruppo: GruppoDocumentazioneBanca;
  titolo: string;
  nomeFile: string;
  caricato: boolean;
  id: string | null;
  versione: number | null;
  caricatoAt: string | null;
  mime: string | null;
  fileSize: number | null;
};

type RigaBanca = {
  id: string;
  anno: number;
  trimestre: number;
  slot: string;
  versione: number;
  storage_path: string;
  file_name: string;
  mime: string;
  file_size: number;
  created_at: string;
};

async function periodoConsentito(anno: number, trimestre: TrimestreNumero) {
  const parsed = periodoDocumentazioneBancariaSchema.safeParse({
    anno,
    trimestre,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Trimestre non valido.",
    };
  }
  const accesso = await requireCommercialistaLettura();
  await negaOspiteFuoriElaborazione({
    anno: parsed.data.anno,
    trimestre: parsed.data.trimestre,
    operazione: "documentazione_bancaria",
    soloTrimestre: true,
  });
  return { ok: true as const, accesso, periodo: parsed.data };
}

export async function elencoDocumentazioneBancariaAction(input: {
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | { success: true; voci: VoceDocumentazioneBancaria[] }
  | { success: false; error: string }
> {
  const gate = await periodoConsentito(input.anno, input.trimestre);
  if (!gate.ok) return { success: false, error: gate.error };
  const { data, error } = await gate.accesso.supabase
    .from("documentazione_bancaria")
    .select("id, slot, versione, file_name, mime, file_size, created_at")
    .eq("anno", gate.periodo.anno)
    .eq("trimestre", gate.periodo.trimestre)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const perSlot = new Map<string, RigaBanca>();
  for (const row of (data ?? []) as RigaBanca[]) {
    perSlot.set(row.slot, row);
  }
  const voci = SLOT_DOCUMENTAZIONE_BANCA.map((slot) => {
    const row = perSlot.get(slot.id);
    const nomeFile = nomeFileDocumentazioneBancaria(
      slot.id,
      gate.periodo.anno,
      gate.periodo.trimestre
    );
    return {
      slot: slot.id,
      gruppo: slot.gruppo,
      titolo: slot.titolo,
      nomeFile,
      caricato: Boolean(row),
      id: row?.id ?? null,
      versione: row?.versione ?? null,
      caricatoAt: row?.created_at ?? null,
      mime: row?.mime ?? null,
      fileSize: row?.file_size ?? null,
    };
  });
  return { success: true, voci };
}

export async function caricaDocumentazioneBancariaAction(
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  await bloccaScritturaOspite("carica_documentazione_bancaria");
  const anno = Number(formData.get("anno"));
  const trimestre = Number(formData.get("trimestre"));
  const slotParsed = slotDocumentazioneBancariaSchema.safeParse(
    String(formData.get("slot") ?? "")
  );
  const periodo = periodoDocumentazioneBancariaSchema.safeParse({
    anno,
    trimestre,
  });
  if (!periodo.success || !slotParsed.success) {
    return { success: false, error: "Posto o trimestre non validi." };
  }
  const slot = slotDocumentazioneBancaria(slotParsed.data);
  const file = formData.get("file");
  if (!slot || !(file instanceof File) || file.size <= 0) {
    return { success: false, error: "File mancante." };
  }
  if (file.size > DOCUMENTAZIONE_BANCA_MAX_BYTES) {
    return { success: false, error: "File troppo grande (max 40 MB)." };
  }
  if (!estensioneAccettata(slot.id, file.name)) {
    return {
      success: false,
      error: `Questo posto accetta solo un file .${slot.ext}.`,
    };
  }
  const gate = await periodoConsentito(periodo.data.anno, periodo.data.trimestre);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = gate.accesso.supabase;
  const { data: current, error: curErr } = await supabase
    .from("documentazione_bancaria")
    .select("id, versione, file_name")
    .eq("anno", periodo.data.anno)
    .eq("trimestre", periodo.data.trimestre)
    .eq("slot", slot.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr) return { success: false, error: curErr.message };
  const precedente = current as { id: string; versione: number; file_name: string } | null;
  const versione = precedente ? precedente.versione + 1 : 1;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const nomeFile = nomeFileDocumentazioneBancaria(
    slot.id,
    periodo.data.anno,
    periodo.data.trimestre
  );
  const storagePath = `${periodo.data.anno}/T${periodo.data.trimestre}/${slot.id}/v${versione}/${randomUUID()}.${slot.ext}`;
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTAZIONE_BANCA_BUCKET)
    .upload(storagePath, bytes, { contentType: slot.mime, upsert: false });
  if (upErr) return { success: false, error: upErr.message };
  const now = new Date().toISOString();
  if (precedente) {
    const { error: delErr } = await supabase
      .from("documentazione_bancaria")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", precedente.id)
      .is("deleted_at", null);
    if (delErr) return { success: false, error: delErr.message };
  }
  const { data: inserted, error: insErr } = await supabase
    .from("documentazione_bancaria")
    .insert({
      anno: periodo.data.anno,
      trimestre: periodo.data.trimestre,
      slot: slot.id,
      versione,
      documento_stato: "approvato",
      storage_path: storagePath,
      file_name: nomeFile,
      original_file_name: file.name.slice(0, 240),
      mime: slot.mime,
      file_size: bytes.length,
      sha256,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    if (precedente) {
      await supabase
        .from("documentazione_bancaria")
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_by: auth.userId,
        })
        .eq("id", precedente.id);
    }
    return { success: false, error: insErr?.message ?? "Salvataggio non riuscito." };
  }
  const id = String((inserted as { id: string }).id);
  await writeAuditLog({
    entity_type: "documentazione_bancaria",
    entity_id: id,
    action: precedente ? "update" : "create",
    actor_id: auth.userId,
    summary: precedente
      ? `Sostituito ${nomeFile}`
      : `Caricato ${nomeFile}`,
    payload: {
      anno: periodo.data.anno,
      trimestre: periodo.data.trimestre,
      slot: slot.id,
      versione,
      fileName: nomeFile,
      originale: file.name,
      precedenteId: precedente?.id ?? null,
      sha256,
    },
  });
  return { success: true };
}

export async function urlDocumentazioneBancariaAction(input: {
  id: string;
  modo: "mostra" | "scarica";
}): Promise<
  | { success: true; url: string; fileName: string; mime: string }
  | { success: false; error: string }
> {
  if (input.modo !== "mostra" && input.modo !== "scarica") {
    return { success: false, error: "Operazione non valida." };
  }
  const id = input.id.trim();
  if (!id) return { success: false, error: "Documento mancante." };
  const accesso = await requireCommercialistaLettura();
  const { data, error } = await accesso.supabase
    .from("documentazione_bancaria")
    .select("id, anno, trimestre, slot, storage_path, file_name, mime")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const row = data as RigaBanca | null;
  if (!row) return { success: false, error: "Documento non trovato." };
  const trimestre = row.trimestre as TrimestreNumero;
  await negaOspiteFuoriElaborazione({
    anno: row.anno,
    trimestre,
    operazione: `documentazione_bancaria_${input.modo}`,
    soloTrimestre: true,
  });
  const { data: signed, error: signErr } = await accesso.supabase.storage
    .from(DOCUMENTAZIONE_BANCA_BUCKET)
    .createSignedUrl(row.storage_path, 600);
  if (signErr || !signed?.signedUrl) {
    return { success: false, error: signErr?.message ?? "Link non disponibile." };
  }
  if (accesso.ospite && accesso.linkId) {
    await registraAuditOspite({
      entityId: accesso.linkId,
      action: "status_change",
      summary: `${input.modo === "mostra" ? "Mostra" : "Scarica"} ${row.file_name}`,
      payload: {
        documentoId: row.id,
        slot: row.slot,
        anno: row.anno,
        trimestre: row.trimestre,
        modo: input.modo,
      },
    });
  } else {
    await writeAuditLog({
      entity_type: "documentazione_bancaria",
      entity_id: row.id,
      action: input.modo === "mostra" ? "view" : "export",
      actor_id: accesso.userId,
      summary: `${input.modo === "mostra" ? "Mostra" : "Scarica"} ${row.file_name}`,
      payload: {
        slot: row.slot,
        anno: row.anno,
        trimestre: row.trimestre,
        modo: input.modo,
      },
    });
  }
  return {
    success: true,
    url: signed.signedUrl,
    fileName: row.file_name,
    mime: row.mime,
  };
}

export async function fileDocumentazioneBancariaExportAction(input: {
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | {
      success: true;
      files: Array<{
        gruppo: GruppoDocumentazioneBanca;
        fileName: string;
        mime: string;
        url: string;
      }>;
    }
  | { success: false; error: string }
> {
  const gate = await periodoConsentito(input.anno, input.trimestre);
  if (!gate.ok) return { success: false, error: gate.error };
  const { data, error } = await gate.accesso.supabase
    .from("documentazione_bancaria")
    .select("id, slot, storage_path, file_name, mime")
    .eq("anno", gate.periodo.anno)
    .eq("trimestre", gate.periodo.trimestre)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const files: Array<{
    gruppo: GruppoDocumentazioneBanca;
    fileName: string;
    mime: string;
    url: string;
  }> = [];
  for (const row of (data ?? []) as RigaBanca[]) {
    const slot = slotDocumentazioneBancaria(row.slot);
    if (!slot) continue;
    const { data: signed, error: signErr } = await gate.accesso.supabase.storage
      .from(DOCUMENTAZIONE_BANCA_BUCKET)
      .createSignedUrl(row.storage_path, 900);
    if (signErr || !signed?.signedUrl) {
      return {
        success: false,
        error: signErr?.message ?? `Non riesco a leggere ${row.file_name}.`,
      };
    }
    files.push({
      gruppo: slot.gruppo,
      fileName: row.file_name,
      mime: row.mime,
      url: signed.signedUrl,
    });
  }
  return { success: true, files };
}
