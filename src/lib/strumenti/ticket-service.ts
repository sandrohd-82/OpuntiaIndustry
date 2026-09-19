import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { userCanAccessArea } from "@/lib/auth/session";
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

function canGestire(auth: AuthBag): boolean {
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
  return { auth, admin: canGestire(auth), db: createServiceClient() };
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
  if (files.length > TICKET_MAX_FILE_PER_MSG) {
    return { error: `Massimo ${TICKET_MAX_FILE_PER_MSG} file per messaggio.` };
  }
  const bucket = await ensureTicketBucket(db);
  if (bucket.error) return bucket;
  for (const file of files) {
    if (!file.bytes.length) continue;
    if (file.bytes.length > TICKET_MAX_FILE_BYTES) {
      return { error: `«${file.name}» supera 15 MB.` };
    }
    const mime = mimeDaFile(file.name, file.mime) || "application/octet-stream";
    const ext = extDaNomeOMime(file.name, mime);
    const path = `${ticketId}/${messaggioId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await db.storage
      .from(TICKET_BUCKET)
      .upload(path, file.bytes, {
        contentType: mime,
        upsert: false,
      });
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
}): Promise<{ success: true; ticketId: string } | { success: false; error: string }> {
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
  if (!parsed.data.descrizione.trim() && !input.audio) {
    return {
      success: false,
      error: "Scrivi il problema oppure registra un vocale.",
    };
  }
  const descrizione =
    parsed.data.descrizione.trim() || (input.audio ? "Nota vocale" : "");
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
    .select("id")
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Ticket non creato." };
  }
  const ticketId = (created as { id: string }).id;
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
  return { success: true, ticketId };
}

export async function inviaMessaggioConAllegati(input: {
  ticketId: string;
  contenuto: string;
  files: TicketAllegatoBytes[];
  audio: TicketAllegatoBytes | null;
  attesi: number;
}): Promise<{ success: true; ticketId: string } | { success: false; error: string }> {
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
  const { auth, admin, db } = await gate();
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
    return { success: false, error: "Scrivi un testo, un vocale o un file." };
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
  if (admin && String(row.documento_stato) === "bozza") {
    await db
      .from("strumenti_ticket")
      .update({
        documento_stato: "in_carico",
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.ticketId);
  }
  return { success: true, ticketId: parsed.data.ticketId };
}
