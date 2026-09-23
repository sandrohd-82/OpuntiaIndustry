"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { formatOperatorShortName } from "@/lib/auth/operator-short-name";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { userCanAccessArea } from "@/lib/auth/session";
import { loadTicketAddettoUserId, notifyTicketNuovo } from "@/lib/strumenti/ticket-notify";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  TICKET_BUCKET,
  TICKET_MAX_FILE_BYTES,
  TICKET_MAX_FILE_PER_MSG,
  extDaNomeOMime,
  kindDaMime,
  mimeAmmesso,
  mimeDaFile,
  ticketCreaSchema,
  ticketMessaggioSchema,
  titoloDaDescrizione,
  type TicketCategoria,
  type TicketDocumentoStato,
  type TicketFile,
  type TicketMessaggio,
  type TicketRiga,
  type TicketScheda,
  type TicketUrgenza,
} from "@/lib/strumenti/ticket";

const TICKET_COLS =
  "id, codice, categoria, urgenza, titolo, descrizione, documento_stato, versione, resolved_by, resolved_at, archiviato_at, archiviato_by, created_by, created_at, updated_at";

type AuthBag = Awaited<ReturnType<typeof requireAnyAreaAccess>>["auth"];

function canGestireRuolo(auth: AuthBag): boolean {
  return (
    isSuperadminProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "amministrazione")
  );
}

async function gateTicket() {
  const { auth } = await requireAnyAreaAccess([
    "strumenti",
    "amministrazione",
  ]);
  const db = createServiceClient();
  const addettoId = await loadTicketAddettoUserId();
  const isAddetto = Boolean(addettoId && addettoId === auth.userId);
  const admin = canGestireRuolo(auth) || isAddetto;
  return { auth, admin, isAddetto, db };
}

function revalidateTicket() {
  revalidatePath("/app/strumenti/ticket");
  revalidatePath("/app/archivio/strumenti/ticket");
}

function asCategoria(v: string): TicketCategoria {
  if (v === "funzioni" || v === "miglioramenti") return v;
  return "bug";
}

function asUrgenza(v: string): TicketUrgenza {
  if (v === "poco_urgente" || v === "urgente") return v;
  return "non_urgente";
}

function asStato(v: string): TicketDocumentoStato {
  if (v === "in_carico" || v === "risolto" || v === "archiviato") return v;
  return "bozza";
}

async function nomiOperatori(
  db: ReturnType<typeof createServiceClient>,
  ids: string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data } = await db
    .from("profiles")
    .select("id, first_name, last_name, full_name, email")
    .in("id", uniq);
  for (const p of (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
  }>) {
    out.set(p.id, formatOperatorShortName(p));
  }
  return out;
}

async function signedUrls(
  db: ReturnType<typeof createServiceClient>,
  paths: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data } = await db.storage
    .from(TICKET_BUCKET)
    .createSignedUrls(unique, 60 * 60);
  (data ?? []).forEach((row, i) => {
    const path =
      (row as { path?: string | null }).path || unique[i] || "";
    const url =
      row.signedUrl ||
      (row as { signedURL?: string }).signedURL ||
      "";
    if (path && url) out.set(path, url);
  });
  for (const path of unique) {
    if (out.has(path)) continue;
    const { data: one } = await db.storage
      .from(TICKET_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (one?.signedUrl) out.set(path, one.signedUrl);
  }
  return out;
}

async function normalizeUpload(
  v: FormDataEntryValue | null
): Promise<File | null> {
  if (!v || typeof v === "string") return null;
  const blob = v as Blob;
  if (typeof blob.arrayBuffer !== "function") return null;
  let buf: ArrayBuffer;
  try {
    buf = await blob.arrayBuffer();
  } catch {
    return null;
  }
  if (!buf.byteLength) return null;
  const named = v as File;
  const name =
    typeof named.name === "string" && named.name.trim()
      ? named.name
      : "allegato.bin";
  return new File([buf], name, { type: blob.type || "" });
}

async function filesDaFormData(formData: FormData): Promise<File[]> {
  const raw: FormDataEntryValue[] = [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
    ...formData.getAll("allegati"),
  ];
  for (let i = 0; i < TICKET_MAX_FILE_PER_MSG + 2; i++) {
    const v = formData.get(`file_${i}`);
    if (v) raw.push(v);
  }
  const seen = new Set<string>();
  const out: File[] = [];
  for (const v of raw) {
    const f = await normalizeUpload(v);
    if (!f) continue;
    const key = `${f.name}:${f.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function mapFile(
  row: Record<string, unknown>,
  urls: Map<string, string>
): TicketFile {
  const path = String(row.storage_path ?? "");
  const fileName = String(row.file_name ?? "");
  const mime = String(row.mime ?? "");
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    messaggioId: row.messaggio_id ? String(row.messaggio_id) : null,
    storagePath: path,
    fileName,
    mime,
    fileSize: Number(row.file_size ?? 0),
    kind: kindDaMime(mime, fileName),
    url: urls.get(path) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapRiga(
  row: Record<string, unknown>,
  nomi: Map<string, string>,
  messaggiCount: number
): TicketRiga {
  const createdBy = row.created_by ? String(row.created_by) : null;
  return {
    id: String(row.id),
    codice: String(row.codice ?? ""),
    categoria: asCategoria(String(row.categoria ?? "")),
    urgenza: asUrgenza(String(row.urgenza ?? "")),
    titolo: String(row.titolo ?? ""),
    descrizione: String(row.descrizione ?? ""),
    documentoStato: asStato(String(row.documento_stato ?? "")),
    versione: Number(row.versione ?? 1),
    createdBy,
    autoreNome: createdBy ? nomi.get(createdBy) ?? "Operatore" : "Operatore",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    archiviatoAt: row.archiviato_at ? String(row.archiviato_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    messaggiCount,
  };
}

async function assertVede(
  db: ReturnType<typeof createServiceClient>,
  auth: AuthBag,
  admin: boolean,
  ticketId: string
) {
  const { data, error } = await db
    .from("strumenti_ticket")
    .select(TICKET_COLS)
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "Ticket non trovato." };
  const createdBy = (data as { created_by?: string | null }).created_by;
  if (!admin && createdBy !== auth.userId) {
    return { ok: false as const, error: "Non puoi vedere questo ticket." };
  }
  return { ok: true as const, row: data as Record<string, unknown> };
}

async function uploadFiles(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  ticketId: string,
  messaggioId: string,
  files: File[]
): Promise<{ error?: string }> {
  if (files.length > TICKET_MAX_FILE_PER_MSG) {
    return { error: `Massimo ${TICKET_MAX_FILE_PER_MSG} file per messaggio.` };
  }
  for (const file of files) {
    if (!file.size) continue;
    if (file.size > TICKET_MAX_FILE_BYTES) {
      return { error: `«${file.name}» supera 15 MB.` };
    }
    const mime = mimeDaFile(file.name, file.type);
    if (!mimeAmmesso(mime, file.name)) {
      return { error: `Formato non ammesso: ${file.name}` };
    }
    const ext = extDaNomeOMime(file.name, mime);
    const path = `${ticketId}/${messaggioId}/${crypto.randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await db.storage
      .from(TICKET_BUCKET)
      .upload(path, buf, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
    if (upErr) return { error: `Caricamento «${file.name}»: ${upErr.message}` };
    const { error: insErr } = await db.from("strumenti_ticket_file").insert({
      ticket_id: ticketId,
      messaggio_id: messaggioId,
      storage_path: path,
      file_name: file.name || `file.${ext}`,
      mime: mime || "application/octet-stream",
      file_size: file.size,
      kind: kindDaMime(mime, file.name),
      created_by: userId,
      updated_by: userId,
    });
    if (insErr) return { error: insErr.message };
  }
  return {};
}

export async function listTicketAction(input: {
  archivio: boolean;
  categoria?: TicketCategoria | "";
  urgenza?: TicketUrgenza | "";
  q?: string;
  sort?: "recenti" | "urgenza" | "categoria";
}): Promise<
  | {
      success: true;
      items: TicketRiga[];
      canGestire: boolean;
      isAddetto: boolean;
      meId: string;
    }
  | { success: false; error: string }
> {
  const { auth, admin, isAddetto, db } = await gateTicket();
  let q = db
    .from("strumenti_ticket")
    .select(TICKET_COLS)
    .is("deleted_at", null);
  if (input.archivio) q = q.not("archiviato_at", "is", null);
  else q = q.is("archiviato_at", null);
  if (!admin) q = q.eq("created_by", auth.userId);
  if (input.categoria) q = q.eq("categoria", input.categoria);
  if (input.urgenza) q = q.eq("urgenza", input.urgenza);
  const term = (input.q ?? "").trim();
  if (term) {
    q = q.or(
      `codice.ilike.%${term}%,titolo.ilike.%${term}%,descrizione.ilike.%${term}%`
    );
  }
  if (input.sort === "categoria") {
    q = q
      .order("categoria", { ascending: true })
      .order("created_at", { ascending: false });
  } else if (input.sort === "urgenza") {
    q = q.order("created_at", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const nomi = await nomiOperatori(
    db,
    rows.map((r) => String(r.created_by ?? ""))
  );
  const ids = rows.map((r) => String(r.id));
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: msgs } = await db
      .from("strumenti_ticket_messaggi")
      .select("ticket_id")
      .in("ticket_id", ids)
      .is("deleted_at", null);
    for (const m of (msgs ?? []) as { ticket_id: string }[]) {
      counts.set(m.ticket_id, (counts.get(m.ticket_id) ?? 0) + 1);
    }
  }
  let items = rows.map((r) =>
    mapRiga(r, nomi, counts.get(String(r.id)) ?? 0)
  );
  if (input.sort === "urgenza") {
    const rank: Record<TicketUrgenza, number> = {
      urgente: 0,
      poco_urgente: 1,
      non_urgente: 2,
    };
    items = items.sort(
      (a, b) =>
        rank[a.urgenza] - rank[b.urgenza] ||
        b.createdAt.localeCompare(a.createdAt)
    );
  }
  return {
    success: true,
    items,
    canGestire: admin,
    isAddetto,
    meId: auth.userId,
  };
}

export async function getTicketAction(
  ticketId: string
): Promise<
  | { success: true; ticket: TicketScheda; canGestire: boolean; isAddetto: boolean }
  | { success: false; error: string }
> {
  const { auth, admin, isAddetto, db } = await gateTicket();
  const seen = await assertVede(db, auth, admin, ticketId);
  if (!seen.ok) return { success: false, error: seen.error };
  const { data: msgs, error: mErr } = await db
    .from("strumenti_ticket_messaggi")
    .select("id, ticket_id, contenuto, tipo, created_by, created_at")
    .eq("ticket_id", ticketId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (mErr) return { success: false, error: mErr.message };
  const { data: files } = await db
    .from("strumenti_ticket_file")
    .select(
      "id, ticket_id, messaggio_id, storage_path, file_name, mime, file_size, kind, created_at"
    )
    .eq("ticket_id", ticketId)
    .is("deleted_at", null);
  const fileRows = (files ?? []) as Record<string, unknown>[];
  const urls = await signedUrls(
    db,
    fileRows.map((f) => String(f.storage_path ?? ""))
  );
  const mappedFiles = fileRows.map((f) => mapFile(f, urls));
  const byMsg = new Map<string, TicketFile[]>();
  for (const f of mappedFiles) {
    if (!f.messaggioId) continue;
    const list = byMsg.get(f.messaggioId) ?? [];
    list.push(f);
    byMsg.set(f.messaggioId, list);
  }
  const msgRows = (msgs ?? []) as Record<string, unknown>[];
  const nomi = await nomiOperatori(db, [
    String(seen.row.created_by ?? ""),
    ...msgRows.map((m) => String(m.created_by ?? "")),
  ]);
  const messaggi: TicketMessaggio[] = msgRows.map((m) => {
    const createdBy = m.created_by ? String(m.created_by) : null;
    const tipoRaw = String(m.tipo ?? "testo");
    const tipo =
      tipoRaw === "vocale" || tipoRaw === "file" || tipoRaw === "misto"
        ? tipoRaw
        : "testo";
    return {
      id: String(m.id),
      ticketId,
      contenuto: String(m.contenuto ?? ""),
      tipo,
      createdBy,
      autoreNome: createdBy ? nomi.get(createdBy) ?? "Operatore" : "Operatore",
      createdAt: String(m.created_at ?? ""),
      files: byMsg.get(String(m.id)) ?? [],
    };
  });
  return {
    success: true,
    canGestire: admin,
    isAddetto,
    ticket: {
      ...mapRiga(seen.row, nomi, messaggi.length),
      messaggi,
    },
  };
}

export async function createTicketAction(
  formData: FormData
): Promise<
  | { success: true; ticket: TicketScheda; canGestire: boolean; isAddetto: boolean }
  | { success: false; error: string }
> {
  const { auth, admin, db } = await gateTicket();
  const parsed = ticketCreaSchema.safeParse({
    categoria: String(formData.get("categoria") ?? ""),
    urgenza: String(formData.get("urgenza") ?? ""),
    descrizione: String(formData.get("descrizione") ?? ""),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati ticket non validi.",
    };
  }
  const files = await filesDaFormData(formData);
  const audioFile = await normalizeUpload(formData.get("audio"));
  if (!parsed.data.descrizione.trim() && !audioFile) {
    return {
      success: false,
      error: "Scrivi il problema oppure registra un vocale.",
    };
  }
  const descrizione =
    parsed.data.descrizione.trim() ||
    (audioFile ? "Nota vocale" : "");
  const titolo = titoloDaDescrizione(descrizione);
  const { data: created, error } = await db
    .from("strumenti_ticket")
    .insert({
      categoria: parsed.data.categoria,
      urgenza: parsed.data.urgenza,
      titolo,
      descrizione,
      documento_stato: "bozza",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice")
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Ticket non creato." };
  }
  const ticketId = (created as { id: string }).id;
  const codice = String((created as { codice?: string }).codice ?? "");
  const tipo =
    audioFile && files.length
      ? "misto"
      : audioFile
        ? "vocale"
        : files.length
          ? "file"
          : "testo";
  const { data: msg, error: msgErr } = await db
    .from("strumenti_ticket_messaggi")
    .insert({
      ticket_id: ticketId,
      contenuto: descrizione,
      tipo,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    return {
      success: false,
      error: msgErr?.message ?? "Messaggio iniziale non salvato.",
    };
  }
  const msgId = (msg as { id: string }).id;
  const toUpload = [...files];
  if (audioFile) toUpload.push(audioFile);
  const up = await uploadFiles(db, auth.userId, ticketId, msgId, toUpload);
  if (up.error) return { success: false, error: up.error };
  await writeAuditLog({
    entity_type: "strumenti_ticket",
    entity_id: ticketId,
    action: "create",
    actor_id: auth.userId,
    summary: `Aperto ticket ${titolo}`,
    payload: {
      categoria: parsed.data.categoria,
      urgenza: parsed.data.urgenza,
    },
  });
  void notifyTicketNuovo({
    actorId: auth.userId,
    ticketId,
    codice,
    titolo,
    urgenza: parsed.data.urgenza,
  });
  revalidateTicket();
  return getTicketAction(ticketId);
}

export async function sendTicketMessaggioAction(
  formData: FormData
): Promise<
  | { success: true; ticket: TicketScheda; canGestire: boolean; isAddetto: boolean }
  | { success: false; error: string }
> {
  const { auth, admin, isAddetto, db } = await gateTicket();
  const parsed = ticketMessaggioSchema.safeParse({
    ticketId: String(formData.get("ticketId") ?? ""),
    contenuto: String(formData.get("contenuto") ?? ""),
  });
  if (!parsed.success) {
    return { success: false, error: "Messaggio non valido." };
  }
  const seen = await assertVede(db, auth, admin, parsed.data.ticketId);
  if (!seen.ok) return { success: false, error: seen.error };
  if (seen.row.archiviato_at) {
    return { success: false, error: "Il ticket è archiviato: chat chiusa." };
  }
  const files = await filesDaFormData(formData);
  const audioFile = await normalizeUpload(formData.get("audio"));
  if (!parsed.data.contenuto && !audioFile && !files.length) {
    return { success: false, error: "Il messaggio è vuoto." };
  }
  const tipo =
    audioFile && (files.length || parsed.data.contenuto)
      ? "misto"
      : audioFile
        ? "vocale"
        : files.length && !parsed.data.contenuto
          ? "file"
          : "testo";
  const { data: msg, error } = await db
    .from("strumenti_ticket_messaggi")
    .insert({
      ticket_id: parsed.data.ticketId,
      contenuto: parsed.data.contenuto || (audioFile ? "Nota vocale" : ""),
      tipo,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !msg) {
    return { success: false, error: error?.message ?? "Invio fallito." };
  }
  const up = await uploadFiles(
    db,
    auth.userId,
    parsed.data.ticketId,
    (msg as { id: string }).id,
    [...files, ...(audioFile ? [audioFile] : [])]
  );
  if (up.error) return { success: false, error: up.error };
  if (isAddetto && String(seen.row.documento_stato) === "bozza") {
    await db
      .from("strumenti_ticket")
      .update({
        documento_stato: "in_carico",
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.ticketId);
  }
  revalidateTicket();
  return getTicketAction(parsed.data.ticketId);
}

export async function prendiInCaricoTicketAction(
  ticketId: string
): Promise<
  | { success: true; ticket: TicketScheda; canGestire: boolean; isAddetto: boolean }
  | { success: false; error: string }
> {
  const { auth, admin, isAddetto, db } = await gateTicket();
  if (!isAddetto) {
    return {
      success: false,
      error: "Solo l'addetto alla risoluzione può prendere in carico il ticket.",
    };
  }
  const seen = await assertVede(db, auth, admin, ticketId);
  if (!seen.ok) return { success: false, error: seen.error };
  if (seen.row.archiviato_at) {
    return { success: false, error: "Ticket già archiviato." };
  }
  const { error } = await db
    .from("strumenti_ticket")
    .update({
      documento_stato: "in_carico",
      updated_by: auth.userId,
    })
    .eq("id", ticketId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "strumenti_ticket",
    entity_id: ticketId,
    action: "update",
    actor_id: auth.userId,
    summary: `Ticket ${String(seen.row.codice)} in carico`,
    payload: { documento_stato: "in_carico" },
  });
  revalidateTicket();
  return getTicketAction(ticketId);
}

export async function risolviArchiviaTicketAction(
  ticketId: string
): Promise<
  | { success: true; ticket: TicketScheda; canGestire: boolean; isAddetto: boolean }
  | { success: false; error: string }
> {
  const { auth, admin, isAddetto, db } = await gateTicket();
  if (!isAddetto) {
    return {
      success: false,
      error: "Solo l'addetto alla risoluzione può archiviare il ticket.",
    };
  }
  const seen = await assertVede(db, auth, admin, ticketId);
  if (!seen.ok) return { success: false, error: seen.error };
  if (seen.row.archiviato_at) {
    return { success: false, error: "Ticket già archiviato." };
  }
  const now = new Date().toISOString();
  const { error } = await db
    .from("strumenti_ticket")
    .update({
      documento_stato: "archiviato",
      resolved_by: auth.userId,
      resolved_at: now,
      archiviato_at: now,
      archiviato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", ticketId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "strumenti_ticket",
    entity_id: ticketId,
    action: "update",
    actor_id: auth.userId,
    summary: `Risolto e archiviato ticket ${String(seen.row.codice)}`,
    payload: { documento_stato: "archiviato" },
  });
  revalidateTicket();
  return getTicketAction(ticketId);
}

export async function creaTicketTestoAction(input: {
  categoria: string;
  urgenza: string;
  descrizione: string;
}): Promise<
  | { success: true; ticketId: string; messaggioId: string }
  | { success: false; error: string }
> {
  const { creaTicketConAllegati } = await import(
    "@/lib/strumenti/ticket-service"
  );
  return creaTicketConAllegati({
    categoria: input.categoria,
    urgenza: input.urgenza,
    descrizione: input.descrizione,
    files: [],
    audio: null,
    attesi: 0,
  });
}

export async function inviaTicketTestoAction(input: {
  ticketId: string;
  contenuto: string;
}): Promise<
  | { success: true; ticketId: string; messaggioId: string }
  | { success: false; error: string }
> {
  const { inviaMessaggioConAllegati } = await import(
    "@/lib/strumenti/ticket-service"
  );
  return inviaMessaggioConAllegati({
    ticketId: input.ticketId,
    contenuto: input.contenuto,
    files: [],
    audio: null,
    attesi: 0,
  });
}

export async function preparaTicketUploadAction(input: {
  ticketId: string;
  messaggioId: string;
  fileName: string;
  mime: string;
}) {
  const { preparaUploadTicketFile } = await import(
    "@/lib/strumenti/ticket-service"
  );
  return preparaUploadTicketFile(input);
}

export async function registraTicketFileAction(input: {
  ticketId: string;
  messaggioId: string;
  path: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  const { registraTicketFile } = await import("@/lib/strumenti/ticket-service");
  return registraTicketFile(input);
}

export async function uploadTicketFileBase64Action(input: {
  ticketId: string;
  messaggioId: string;
  fileName: string;
  mime: string;
  base64: string;
}) {
  const { uploadTicketFileBytes } = await import(
    "@/lib/strumenti/ticket-service"
  );
  return uploadTicketFileBytes(input);
}

export async function eliminaTicketAction(
  ticketId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { eliminaTicketProprio } = await import(
    "@/lib/strumenti/ticket-service"
  );
  const res = await eliminaTicketProprio(ticketId);
  if (res.success) revalidateTicket();
  return res;
}
