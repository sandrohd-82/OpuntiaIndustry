import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { userCanAccessArea } from "@/lib/auth/session";
import { loadTicketAddettoUserId, notifyTicketNuovo } from "@/lib/strumenti/ticket-notify";
import type { TicketUrgenza } from "@/lib/strumenti/ticket";
import { createServiceClient } from "@/lib/supabase/server";
import {
  TICKET_BUCKET,
  TICKET_MAX_FILE_BYTES,
  TICKET_MAX_FILE_PER_MSG,
  extDaNomeOMime,
  kindDaMime,
  mimeDaFile,
  ticketCreaSchema,
  ticketMessaggioSchema,
  titoloDaDescrizione,
} from "@/lib/strumenti/ticket";
import type { TicketAllegatoBytes } from "@/lib/strumenti/ticket-bytes";

type AuthBag = Awaited<ReturnType<typeof requireAnyAreaAccess>>["auth"];

function canGestireRuolo(auth: AuthBag): boolean {
  return (
    isSuperadminProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "amministrazione")
  );
}

async function gate() {
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

async function ensureTicketBucket(
  db: ReturnType<typeof createServiceClient>
): Promise<{ error?: string }> {
  const { data } = await db.storage.getBucket(TICKET_BUCKET);
  if (data) return {};
  const { error: createErr } = await db.storage.createBucket(TICKET_BUCKET, {
    public: false,
    fileSizeLimit: TICKET_MAX_FILE_BYTES,
  });
  if (createErr && !/already exists/i.test(createErr.message)) {
    return { error: `Bucket ticket: ${createErr.message}` };
  }
  return {};
}

async function uploadAllegati(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  ticketId: string,
  messaggioId: string,
  files: TicketAllegatoBytes[]
): Promise<{ error?: string }> {
  const bucket = await ensureTicketBucket(db);
  if (bucket.error) return bucket;
  for (const file of files) {
    if (file.bytes.length > TICKET_MAX_FILE_BYTES) {
      return { error: `«${file.name}» supera 500 MB.` };
    }
    const mime = mimeDaFile(file.name, file.mime) || "application/octet-stream";
    const ext = extDaNomeOMime(file.name, mime);
    const path = `${ticketId}/${messaggioId}/${crypto.randomUUID()}.${ext}`;
    let upErr = (
      await db.storage.from(TICKET_BUCKET).upload(path, file.bytes, {
        contentType: mime,
        upsert: true,
      })
    ).error;
    if (upErr) {
      upErr = (
        await db.storage.from(TICKET_BUCKET).upload(path, file.bytes, {
          contentType: "application/octet-stream",
          upsert: true,
        })
      ).error;
    }
    if (upErr) {
      return { error: `Caricamento «${file.name}»: ${upErr.message}` };
    }
    const { error: insErr } = await db.from("strumenti_ticket_file").insert({
      ticket_id: ticketId,
      messaggio_id: messaggioId,
      storage_path: path,
      file_name: file.name || `file.${ext}`,
      mime,
      file_size: file.bytes.length,
      kind: kindDaMime(mime, file.name),
      created_by: userId,
      updated_by: userId,
    });
    if (insErr) return { error: insErr.message };
  }
  return {};
}

export async function creaTicketConAllegati(input: {
  categoria: string;
  urgenza: string;
  descrizione: string;
  files: TicketAllegatoBytes[];
  audio: TicketAllegatoBytes | null;
  attesi: number;
}): Promise<
  | { success: true; ticketId: string; messaggioId: string }
  | { success: false; error: string }
> {
  const parsed = ticketCreaSchema.safeParse({
    categoria: input.categoria,
    urgenza: input.urgenza,
    descrizione: input.descrizione,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati ticket non validi.",
    };
  }
  if (input.attesi > 0 && input.files.length === 0 && !input.audio) {
    return {
      success: false,
      error: "Gli allegati non sono arrivati al server. Riprova ad allegarli.",
    };
  }
  const { auth, db } = await gate();
  if (!parsed.data.descrizione.trim() && !input.audio && !input.files.length) {
    return {
      success: false,
      error: "Scrivi il problema, registra un vocale oppure allega un file.",
    };
  }
  const descrizione =
    parsed.data.descrizione.trim() ||
    (input.audio ? "Nota vocale" : input.files.length ? "Vedi allegato" : "");
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
  const files = [...input.files];
  if (input.audio) files.push(input.audio);
  const tipo =
    input.audio && input.files.length
      ? "misto"
      : input.audio
        ? "vocale"
        : input.files.length
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
  const up = await uploadAllegati(
    db,
    auth.userId,
    ticketId,
    (msg as { id: string }).id,
    files
  );
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
      fileCount: input.files.length,
    },
  });
  void notifyTicketNuovo({
    actorId: auth.userId,
    ticketId,
    codice,
    titolo,
    urgenza: parsed.data.urgenza as TicketUrgenza,
  });
  return { success: true, ticketId, messaggioId: (msg as { id: string }).id };
}

export async function inviaMessaggioConAllegati(input: {
  ticketId: string;
  contenuto: string;
  files: TicketAllegatoBytes[];
  audio: TicketAllegatoBytes | null;
  attesi: number;
}): Promise<
  | { success: true; ticketId: string; messaggioId: string }
  | { success: false; error: string }
> {
  const parsed = ticketMessaggioSchema.safeParse({
    ticketId: input.ticketId,
    contenuto: input.contenuto,
  });
  if (!parsed.success) {
    return { success: false, error: "Messaggio non valido." };
  }
  if (input.attesi > 0 && input.files.length === 0 && !input.audio) {
    return {
      success: false,
      error: "Gli allegati non sono arrivati al server. Riprova ad allegarli.",
    };
  }
  const { auth, admin, isAddetto, db } = await gate();
  const { data, error: seenErr } = await db
    .from("strumenti_ticket")
    .select("id, created_by, archiviato_at, documento_stato")
    .eq("id", parsed.data.ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (seenErr || !data) {
    return { success: false, error: "Ticket non trovato." };
  }
  const row = data as {
    created_by?: string | null;
    archiviato_at?: string | null;
    documento_stato?: string;
  };
  if (!admin && row.created_by !== auth.userId) {
    return { success: false, error: "Non puoi vedere questo ticket." };
  }
  if (row.archiviato_at) {
    return { success: false, error: "Il ticket è archiviato: chat chiusa." };
  }
  if (!parsed.data.contenuto && !input.audio && !input.files.length) {
    return { success: false, error: "Il messaggio è vuoto." };
  }
  const tipo =
    input.audio && (input.files.length || parsed.data.contenuto)
      ? "misto"
      : input.audio
        ? "vocale"
        : input.files.length && !parsed.data.contenuto
          ? "file"
          : "testo";
  const { data: msg, error } = await db
    .from("strumenti_ticket_messaggi")
    .insert({
      ticket_id: parsed.data.ticketId,
      contenuto: parsed.data.contenuto || (input.audio ? "Nota vocale" : ""),
      tipo,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !msg) {
    return { success: false, error: error?.message ?? "Invio fallito." };
  }
  const files = [...input.files];
  if (input.audio) files.push(input.audio);
  const up = await uploadAllegati(
    db,
    auth.userId,
    parsed.data.ticketId,
    (msg as { id: string }).id,
    files
  );
  if (up.error) return { success: false, error: up.error };
  if (isAddetto && String(row.documento_stato) === "bozza") {
    await db
      .from("strumenti_ticket")
      .update({
        documento_stato: "in_carico",
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.ticketId);
  }
  return {
    success: true,
    ticketId: parsed.data.ticketId,
    messaggioId: (msg as { id: string }).id,
  };
}

export async function preparaUploadTicketFile(input: {
  ticketId: string;
  messaggioId: string;
  fileName: string;
  mime: string;
}): Promise<
  | { success: true; path: string; token: string; signedUrl: string }
  | { success: false; error: string }
> {
  const { auth, admin, db } = await gate();
  const { data, error } = await db
    .from("strumenti_ticket")
    .select("id, created_by, archiviato_at")
    .eq("id", input.ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Ticket non trovato." };
  const row = data as { created_by?: string | null; archiviato_at?: string | null };
  if (!admin && row.created_by !== auth.userId) {
    return { success: false, error: "Non puoi caricare file su questo ticket." };
  }
  if (row.archiviato_at) {
    return { success: false, error: "Il ticket è archiviato." };
  }
  const bucket = await ensureTicketBucket(db);
  if (bucket.error) return { success: false, error: bucket.error };
  const mime = mimeDaFile(input.fileName, input.mime) || "application/octet-stream";
  const ext = extDaNomeOMime(input.fileName, mime);
  const path = `${input.ticketId}/${input.messaggioId}/${crypto.randomUUID()}.${ext}`;
  const { data: slot, error: slotErr } = await db.storage
    .from(TICKET_BUCKET)
    .createSignedUploadUrl(path);
  if (slotErr || !slot?.token || !slot.signedUrl) {
    return {
      success: false,
      error: slotErr?.message ?? "Impossibile preparare il caricamento.",
    };
  }
  return {
    success: true,
    path,
    token: slot.token,
    signedUrl: slot.signedUrl,
  };
}

export async function registraTicketFile(input: {
  ticketId: string;
  messaggioId: string;
  path: string;
  fileName: string;
  mime: string;
  size: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth, admin, db } = await gate();
  const { data, error } = await db
    .from("strumenti_ticket")
    .select("id, created_by")
    .eq("id", input.ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Ticket non trovato." };
  const createdBy = (data as { created_by?: string | null }).created_by;
  if (!admin && createdBy !== auth.userId) {
    return { success: false, error: "Non puoi registrare questo file." };
  }
  const mime = mimeDaFile(input.fileName, input.mime) || "application/octet-stream";
  const { error: insErr } = await db.from("strumenti_ticket_file").insert({
    ticket_id: input.ticketId,
    messaggio_id: input.messaggioId,
    storage_path: input.path,
    file_name: input.fileName,
    mime,
    file_size: input.size,
    kind: kindDaMime(mime, input.fileName),
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (insErr) return { success: false, error: insErr.message };
  return { success: true };
}

export async function uploadTicketFileBytes(input: {
  ticketId: string;
  messaggioId: string;
  fileName: string;
  mime: string;
  base64: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth, db } = await gate();
  const raw = input.base64.includes(",")
    ? input.base64.slice(input.base64.indexOf(",") + 1)
    : input.base64;
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) return { success: false, error: "File vuoto." };
  const up = await uploadAllegati(db, auth.userId, input.ticketId, input.messaggioId, [
    { name: input.fileName, mime: input.mime, bytes },
  ]);
  if (up.error) return { success: false, error: up.error };
  return { success: true };
}

export async function salvaUnAllegato(input: {
  ticketId: string;
  messaggioId: string;
  file: TicketAllegatoBytes;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth, admin, db } = await gate();
  const { data, error } = await db
    .from("strumenti_ticket")
    .select("id, created_by, archiviato_at")
    .eq("id", input.ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Ticket non trovato." };
  const row = data as { created_by?: string | null; archiviato_at?: string | null };
  if (!admin && row.created_by !== auth.userId) {
    return { success: false, error: "Non puoi caricare file su questo ticket." };
  }
  const up = await uploadAllegati(db, auth.userId, input.ticketId, input.messaggioId, [
    input.file,
  ]);
  if (up.error) return { success: false, error: up.error };
  return { success: true };
}

export async function eliminaTicketProprio(
  ticketId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth, db } = await gate();
  if (!ticketId) return { success: false, error: "Ticket mancante." };
  const { data, error } = await db
    .from("strumenti_ticket")
    .select("id, codice, created_by")
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Ticket non trovato." };
  const row = data as { codice?: string; created_by?: string | null };
  if (row.created_by !== auth.userId) {
    return {
      success: false,
      error: "Solo chi ha creato il ticket può eliminarlo.",
    };
  }
  const now = new Date().toISOString();
  const soft = {
    deleted_at: now,
    deleted_by: auth.userId,
    updated_by: auth.userId,
  };
  const { error: tErr } = await db
    .from("strumenti_ticket")
    .update(soft)
    .eq("id", ticketId)
    .is("deleted_at", null);
  if (tErr) return { success: false, error: tErr.message };
  await db
    .from("strumenti_ticket_messaggi")
    .update(soft)
    .eq("ticket_id", ticketId)
    .is("deleted_at", null);
  await db
    .from("strumenti_ticket_file")
    .update(soft)
    .eq("ticket_id", ticketId)
    .is("deleted_at", null);
  await writeAuditLog({
    entity_type: "strumenti_ticket",
    entity_id: ticketId,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminato ticket ${String(row.codice ?? ticketId)}`,
    payload: { codice: row.codice ?? null },
  });
  return { success: true };
}
