"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { createClient } from "@/lib/supabase/server";
import { markDocumentazioniScadute } from "@/lib/amministrazione/documentazioni-scadute";
import {
  DOCUMENTAZIONI_BUCKET,
  DOCUMENTAZIONI_MAX_FILE_BYTES,
  DOCUMENTAZIONI_MAX_FILE_PER_VERSIONE,
  DOCUMENTAZIONI_MIME,
  documentazioneInputSchema,
  documentazioneRinnovoSchema,
  documentazioneUpdateSchema,
  extFromMime,
  isScadutaByDate,
  type DocumentazioneDocumentoStato,
  type DocumentazioneFile,
  type DocumentazioneRepartoOpt,
  type DocumentazioneScheda,
  type DocumentazioneStatoOperativo,
  type DocumentazioneVersione,
} from "@/lib/amministrazione/documentazioni";

const SCHEDA_COLS =
  "id, codice, nome, reparto_id, spiegazione, data_inizio, data_scadenza, necessita_rinnovo, stato_operativo, documento_stato, versione, approved_by, approved_at, archiviato_at, archiviato_by, created_at, updated_at";

const FILE_COLS =
  "id, documentazione_id, versione, storage_path, file_name, mime, file_size, sort_order, created_at";

const VERS_COLS =
  "id, documentazione_id, versione, nome, reparto_id, spiegazione, data_inizio, data_scadenza, necessita_rinnovo, stato_operativo, documento_stato, rinnovato_at";

type Gate =
  | { ok: true; auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>> }
  | { ok: false; error: string };

async function gateDocumentazioni(): Promise<Gate> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, error: "Non autenticato." };
  if (!isSuperadminProfile(auth.profile)) {
    return {
      ok: false,
      error: "Solo il Super Admin può gestire le documentazioni.",
    };
  }
  return { ok: true, auth };
}

function revalidateDocumentazioni() {
  revalidatePath("/app/amministrazione/documentazioni");
  revalidatePath("/app/archivio/amministrazione/documentazioni");
}

function asStatoOp(v: string): DocumentazioneStatoOperativo {
  if (v === "in_carico" || v === "scaduto") return v;
  return "in_attesa";
}

function asDocStato(v: string): DocumentazioneDocumentoStato {
  if (v === "approvato" || v === "chiuso") return v;
  return "bozza";
}

function mapFile(
  row: Record<string, unknown>,
  urls: Map<string, string>
): DocumentazioneFile {
  const path = String(row.storage_path ?? "");
  return {
    id: String(row.id),
    documentazioneId: String(row.documentazione_id),
    versione: Number(row.versione ?? 1),
    storagePath: path,
    fileName: String(row.file_name ?? ""),
    mime: String(row.mime ?? ""),
    fileSize: Number(row.file_size ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    url: urls.get(path) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapScheda(
  row: Record<string, unknown>,
  files: DocumentazioneFile[],
  versioni: DocumentazioneVersione[],
  repartoNome: string
): DocumentazioneScheda {
  const versione = Number(row.versione ?? 1);
  return {
    id: String(row.id),
    codice: String(row.codice ?? ""),
    nome: String(row.nome ?? ""),
    repartoId: String(row.reparto_id ?? ""),
    repartoNome,
    spiegazione: String(row.spiegazione ?? ""),
    dataInizio: String(row.data_inizio ?? "").slice(0, 10),
    dataScadenza: String(row.data_scadenza ?? "").slice(0, 10),
    necessitaRinnovo: Boolean(row.necessita_rinnovo),
    statoOperativo: asStatoOp(String(row.stato_operativo ?? "in_attesa")),
    documentoStato: asDocStato(String(row.documento_stato ?? "bozza")),
    versione,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    archiviatoAt: row.archiviato_at ? String(row.archiviato_at) : null,
    archiviatoBy: row.archiviato_by ? String(row.archiviato_by) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    files: files
      .filter((f) => f.versione === versione)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.fileName.localeCompare(b.fileName)),
    versioni,
  };
}

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(DOCUMENTAZIONI_BUCKET)
    .createSignedUrls(unique, 60 * 60);
  (data ?? []).forEach((row, i) => {
    const path = unique[i];
    if (path && row?.signedUrl) map.set(path, row.signedUrl);
  });
  return map;
}

async function hydrateSchede(
  rows: Record<string, unknown>[]
): Promise<DocumentazioneScheda[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((r) => String(r.id));
  const repartoIds = [
    ...new Set(rows.map((r) => String(r.reparto_id ?? "")).filter(Boolean)),
  ];

  const [filesRes, versiRes, repartiRes] = await Promise.all([
    supabase
      .from("documentazioni_file")
      .select(FILE_COLS)
      .in("documentazione_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("documentazioni_versioni")
      .select(VERS_COLS)
      .in("documentazione_id", ids)
      .is("deleted_at", null)
      .order("versione", { ascending: false }),
    repartoIds.length
      ? supabase
          .from("organigramma_reparti")
          .select("id, nome")
          .in("id", repartoIds)
      : Promise.resolve({ data: [] as Array<{ id: string; nome: string }> }),
  ]);

  const fileRows = (filesRes.data ?? []) as Record<string, unknown>[];
  const versiRows = (versiRes.data ?? []) as Record<string, unknown>[];
  const extraRepartoIds = versiRows
    .map((v) => String(v.reparto_id ?? ""))
    .filter((id) => id && !repartoIds.includes(id));
  let extraReparti: Array<{ id: string; nome: string }> = [];
  if (extraRepartoIds.length) {
    const extra = await supabase
      .from("organigramma_reparti")
      .select("id, nome")
      .in("id", extraRepartoIds);
    extraReparti = (extra.data ?? []) as Array<{ id: string; nome: string }>;
  }

  const repartoNome = new Map<string, string>();
  for (const r of (repartiRes.data ?? []) as Array<{ id: string; nome: string }>) {
    repartoNome.set(r.id, r.nome);
  }
  for (const r of extraReparti) repartoNome.set(r.id, r.nome);

  const urls = await signedUrls(
    fileRows.map((f) => String(f.storage_path ?? ""))
  );
  const files = fileRows.map((f) => mapFile(f, urls));
  const filesByScheda = new Map<string, DocumentazioneFile[]>();
  for (const f of files) {
    const list = filesByScheda.get(f.documentazioneId) ?? [];
    list.push(f);
    filesByScheda.set(f.documentazioneId, list);
  }

  const versioniByScheda = new Map<string, DocumentazioneVersione[]>();
  for (const v of versiRows) {
    const sid = String(v.documentazione_id);
    const ver = Number(v.versione ?? 1);
    const rid = v.reparto_id ? String(v.reparto_id) : null;
    const item: DocumentazioneVersione = {
      id: String(v.id),
      documentazioneId: sid,
      versione: ver,
      nome: String(v.nome ?? ""),
      repartoId: rid,
      repartoNome: rid ? (repartoNome.get(rid) ?? "—") : "—",
      spiegazione: String(v.spiegazione ?? ""),
      dataInizio: String(v.data_inizio ?? "").slice(0, 10),
      dataScadenza: String(v.data_scadenza ?? "").slice(0, 10),
      necessitaRinnovo: Boolean(v.necessita_rinnovo),
      statoOperativo: asStatoOp(String(v.stato_operativo ?? "scaduto")),
      documentoStato: asDocStato(String(v.documento_stato ?? "chiuso")),
      rinnovatoAt: String(v.rinnovato_at ?? ""),
      files: (filesByScheda.get(sid) ?? [])
        .filter((f) => f.versione === ver)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
    const list = versioniByScheda.get(sid) ?? [];
    list.push(item);
    versioniByScheda.set(sid, list);
  }

  return rows.map((row) => {
    const id = String(row.id);
    const rid = String(row.reparto_id ?? "");
    return mapScheda(
      row,
      filesByScheda.get(id) ?? [],
      versioniByScheda.get(id) ?? [],
      rid ? (repartoNome.get(rid) ?? "—") : "—"
    );
  });
}

export async function listDocumentazioniRepartiAction(): Promise<
  | { success: true; items: DocumentazioneRepartoOpt[] }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_reparti")
    .select("id, codice, nome")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      codice: String(r.codice ?? ""),
      nome: String(r.nome ?? ""),
    })),
  };
}

export async function listDocumentazioniAction(
  mode: "viva" | "archivio"
): Promise<
  | { success: true; items: DocumentazioneScheda[] }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  await markDocumentazioniScadute(supabase, gate.auth.userId);

  let q = supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .is("deleted_at", null);
  q =
    mode === "archivio"
      ? q.not("archiviato_at", "is", null).order("archiviato_at", {
          ascending: false,
        })
      : q.is("archiviato_at", null).order("data_scadenza", { ascending: true });

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const items = await hydrateSchede((data ?? []) as Record<string, unknown>[]);
  return { success: true, items };
}

export async function createDocumentazioneAction(
  raw: unknown
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = documentazioneInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const scaduta = isScadutaByDate(parsed.data.dataScadenza);
  const { data, error } = await supabase
    .from("documentazioni_aziendali")
    .insert({
      nome: parsed.data.nome,
      reparto_id: parsed.data.repartoId,
      spiegazione: parsed.data.spiegazione ?? "",
      data_inizio: parsed.data.dataInizio,
      data_scadenza: parsed.data.dataScadenza,
      necessita_rinnovo: parsed.data.necessitaRinnovo ?? false,
      stato_operativo: scaduta ? "scaduto" : "in_attesa",
      documento_stato: "bozza",
      versione: 1,
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select(SCHEDA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione non riuscita." };
  }
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: String(data.id),
    action: "create",
    actor_id: gate.auth.userId,
    summary: `Creata documentazione ${data.codice}`,
    payload: {
      codice: data.codice,
      nome: data.nome,
      versione: 1,
    },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([data as Record<string, unknown>]);
  return { success: true, item: items[0] };
}

export async function updateDocumentazioneAction(
  raw: unknown
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = documentazioneUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  if (current.archiviato_at) {
    return {
      success: false,
      error: "Le schede in archivio non si modificano.",
    };
  }
  const scaduta = isScadutaByDate(parsed.data.dataScadenza);
  let stato = asStatoOp(String(current.stato_operativo));
  if (scaduta) stato = "scaduto";
  else if (stato === "scaduto") {
    stato =
      asDocStato(String(current.documento_stato)) === "approvato"
        ? "in_carico"
        : "in_attesa";
  }
  const { data, error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      nome: parsed.data.nome,
      reparto_id: parsed.data.repartoId,
      spiegazione: parsed.data.spiegazione ?? "",
      data_inizio: parsed.data.dataInizio,
      data_scadenza: parsed.data.dataScadenza,
      necessita_rinnovo: parsed.data.necessitaRinnovo ?? false,
      stato_operativo: stato,
      updated_by: gate.auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .is("archiviato_at", null)
    .select(SCHEDA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio non riuscito." };
  }
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: String(data.id),
    action: "update",
    actor_id: gate.auth.userId,
    summary: `Aggiornata documentazione ${data.codice}`,
    payload: {
      codice: data.codice,
      nome: data.nome,
      versione: data.versione,
      stato_operativo: stato,
    },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([data as Record<string, unknown>]);
  return { success: true, item: items[0] };
}

export async function mettiInCaricoDocumentazioneAction(
  id: string
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { success: false, error: "Identificativo non valido." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      stato_operativo: "in_carico",
      documento_stato: "approvato",
      approved_by: gate.auth.userId,
      approved_at: now,
      updated_by: gate.auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .is("archiviato_at", null)
    .neq("stato_operativo", "scaduto")
    .select(SCHEDA_COLS)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error: "Impossibile mettere In carico: scheda assente, scaduta o archiviata.",
    };
  }
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: String(data.id),
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Documentazione ${data.codice} messa In carico (approvata)`,
    payload: { codice: data.codice, stato_operativo: "in_carico" },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([data as Record<string, unknown>]);
  return { success: true, item: items[0] };
}

export async function rinnovaDocumentazioneAction(
  raw: unknown
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = documentazioneRinnovoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  if (current.archiviato_at) {
    return {
      success: false,
      error: "Non si rinnova una scheda già archiviata.",
    };
  }

  const oldVer = Number(current.versione ?? 1);
  const now = new Date().toISOString();
  const { error: snapErr } = await supabase.from("documentazioni_versioni").insert({
    documentazione_id: current.id,
    versione: oldVer,
    nome: current.nome,
    reparto_id: current.reparto_id,
    spiegazione: current.spiegazione ?? "",
    data_inizio: current.data_inizio,
    data_scadenza: current.data_scadenza,
    necessita_rinnovo: current.necessita_rinnovo,
    stato_operativo: current.stato_operativo,
    documento_stato: current.documento_stato,
    rinnovato_at: now,
    rinnovato_by: gate.auth.userId,
    created_by: gate.auth.userId,
    updated_by: gate.auth.userId,
  });
  if (snapErr) {
    return {
      success: false,
      error: snapErr.message.includes("duplicate")
        ? "Questa versione è già nello storico."
        : snapErr.message,
    };
  }

  const newVer = oldVer + 1;
  const scaduta = isScadutaByDate(parsed.data.dataScadenza);
  const { data, error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      data_inizio: parsed.data.dataInizio,
      data_scadenza: parsed.data.dataScadenza,
      spiegazione:
        parsed.data.spiegazione !== undefined
          ? parsed.data.spiegazione
          : current.spiegazione,
      necessita_rinnovo: parsed.data.necessitaRinnovo ?? true,
      versione: newVer,
      stato_operativo: scaduta ? "scaduto" : "in_attesa",
      documento_stato: "bozza",
      approved_by: null,
      approved_at: null,
      updated_by: gate.auth.userId,
    })
    .eq("id", current.id)
    .is("deleted_at", null)
    .select(SCHEDA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Rinnovo non riuscito." };
  }

  if (parsed.data.copiaFile !== false) {
    const { data: oldFiles } = await supabase
      .from("documentazioni_file")
      .select(FILE_COLS)
      .eq("documentazione_id", current.id)
      .eq("versione", oldVer)
      .is("deleted_at", null);
    const copies = (oldFiles ?? []).map((f, i) => ({
      documentazione_id: current.id,
      versione: newVer,
      storage_path: f.storage_path,
      file_name: f.file_name,
      mime: f.mime,
      file_size: f.file_size,
      sort_order: Number(f.sort_order ?? i),
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    }));
    if (copies.length) {
      const { error: copyErr } = await supabase
        .from("documentazioni_file")
        .insert(copies);
      if (copyErr) {
        return { success: false, error: copyErr.message };
      }
    }
  }

  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: String(data.id),
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Rinnovata documentazione ${data.codice} (v${oldVer} → v${newVer})`,
    payload: {
      codice: data.codice,
      versioneDa: oldVer,
      versioneA: newVer,
      dataInizio: parsed.data.dataInizio,
      dataScadenza: parsed.data.dataScadenza,
    },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([data as Record<string, unknown>]);
  return { success: true, item: items[0] };
}

export async function archiviaDocumentazioneAction(
  id: string,
  confermaTestuale: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  if (current.archiviato_at) {
    return { success: false, error: "Scheda già in archivio." };
  }
  const expected = fraseConfermaSoftDelete(String(current.codice));
  if (confermaTestuale.trim() !== expected) {
    return { success: false, error: `Digita esattamente: ${expected}` };
  }
  if (asStatoOp(String(current.stato_operativo)) !== "scaduto") {
    return {
      success: false,
      error: "Si archivia solo una documentazione Scaduta.",
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      archiviato_at: now,
      archiviato_by: gate.auth.userId,
      documento_stato: "chiuso",
      updated_by: gate.auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .is("archiviato_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: id,
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Documentazione ${current.codice} archiviata`,
    payload: { codice: current.codice, versione: current.versione },
  });
  revalidateDocumentazioni();
  return { success: true };
}

export async function softDeleteDocumentazioneAction(
  id: string,
  confermaTestuale: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select("id, codice, archiviato_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  const expected = fraseConfermaSoftDelete(String(current.codice));
  if (confermaTestuale.trim() !== expected) {
    return { success: false, error: `Digita esattamente: ${expected}` };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      deleted_at: now,
      deleted_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: id,
    action: "soft_delete",
    actor_id: gate.auth.userId,
    summary: `Soft delete documentazione ${current.codice}`,
    payload: { codice: current.codice },
  });
  revalidateDocumentazioni();
  return { success: true };
}

export async function uploadDocumentazioneFileAction(
  formData: FormData
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const documentazioneId = String(formData.get("documentazioneId") ?? "");
  const file = formData.get("file");
  if (!documentazioneId || !(file instanceof File) || file.size === 0) {
    return { success: false, error: "File o scheda mancanti." };
  }
  if (file.size > DOCUMENTAZIONI_MAX_FILE_BYTES) {
    return { success: false, error: "File troppo grande (max 15 MB)." };
  }
  if (!DOCUMENTAZIONI_MIME.includes(file.type as (typeof DOCUMENTAZIONI_MIME)[number])) {
    return { success: false, error: "Formato ammesso: PDF, JPG, PNG, WebP." };
  }
  const supabase = await createClient();
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .eq("id", documentazioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  if (current.archiviato_at) {
    return { success: false, error: "Non si caricano file su una scheda in archivio." };
  }
  const versione = Number(current.versione ?? 1);
  const { count } = await supabase
    .from("documentazioni_file")
    .select("id", { count: "exact", head: true })
    .eq("documentazione_id", documentazioneId)
    .eq("versione", versione)
    .is("deleted_at", null);
  if ((count ?? 0) >= DOCUMENTAZIONI_MAX_FILE_PER_VERSIONE) {
    return {
      success: false,
      error: `Massimo ${DOCUMENTAZIONI_MAX_FILE_PER_VERSIONE} file per versione.`,
    };
  }
  const ext = extFromMime(file.type);
  const path = `${documentazioneId}/v${versione}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTAZIONI_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { success: false, error: upErr.message };
  const { error: insErr } = await supabase.from("documentazioni_file").insert({
    documentazione_id: documentazioneId,
    versione,
    storage_path: path,
    file_name: file.name,
    mime: file.type,
    file_size: file.size,
    sort_order: count ?? 0,
    created_by: gate.auth.userId,
    updated_by: gate.auth.userId,
  });
  if (insErr) return { success: false, error: insErr.message };
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: documentazioneId,
    action: "attachment_upload",
    actor_id: gate.auth.userId,
    summary: `Caricato file su ${current.codice} (v${versione})`,
    payload: { codice: current.codice, fileName: file.name, versione },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([current as Record<string, unknown>]);
  return { success: true, item: items[0] };
}

export async function softDeleteDocumentazioneFileAction(
  fileId: string
): Promise<
  | { success: true; item: DocumentazioneScheda }
  | { success: false; error: string }
> {
  const gate = await gateDocumentazioni();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: file, error: fileErr } = await supabase
    .from("documentazioni_file")
    .select(FILE_COLS)
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fileErr || !file) {
    return { success: false, error: fileErr?.message ?? "File non trovato." };
  }
  const { data: current, error: curErr } = await supabase
    .from("documentazioni_aziendali")
    .select(SCHEDA_COLS)
    .eq("id", file.documentazione_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Scheda non trovata." };
  }
  if (current.archiviato_at) {
    return { success: false, error: "Non si rimuovono file da una scheda in archivio." };
  }
  if (Number(file.versione) !== Number(current.versione)) {
    return {
      success: false,
      error: "I file delle versioni scadute restano nello storico e non si eliminano.",
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("documentazioni_file")
    .update({
      deleted_at: now,
      deleted_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .eq("id", fileId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "documentazioni_aziendali",
    entity_id: String(current.id),
    action: "attachment_remove",
    actor_id: gate.auth.userId,
    summary: `Rimosso file da ${current.codice}`,
    payload: { codice: current.codice, fileName: file.file_name },
  });
  revalidateDocumentazioni();
  const items = await hydrateSchede([current as Record<string, unknown>]);
  return { success: true, item: items[0] };
}
