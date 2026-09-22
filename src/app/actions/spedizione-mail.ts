"use server";

import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { generaTestoMailSpedizione } from "@/lib/amministrazione/spedizione-mail-ai";
import {
  mapSpedizioneMailRow,
  spedizioneMailUpsertSchema,
  trackingMancante,
  type SpedizioneMailPrenotazione,
} from "@/lib/amministrazione/spedizione-mail";
import { inferCarrierFromUrl } from "@/lib/shipping/tracking";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMailViaAccount } from "@/lib/webmail/sync";
import { z } from "zod";

const BUCKET = "spedizione-mail";
const COLS =
  "id, entity_type, entity_id, stato, documento_stato, versione, tracking_url, lettera_via_path, lettera_via_name, allegati, allega_tracking, allega_lettera, allega_file, destinatario_email, oggetto, corpo, account_id, prenotata_at, inviata_at, created_at";

async function gateWrite() {
  return requireAnyAreaAccess(["amministrazione", "produzione"]);
}

export async function getPrenotazioneSpedizioneMailAction(input: {
  entityType: "campionatura" | "ordine";
  entityId: string;
}): Promise<
  | { success: true; item: SpedizioneMailPrenotazione | null }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "produzione", "webmail"]);
  if (!input.entityId) return { success: true, item: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spedizione_mail_prenotazioni")
    .select(COLS)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    item: data ? mapSpedizioneMailRow(data as Record<string, unknown>) : null,
  };
}

export async function getClienteEmailSpedizioneAction(
  clienteId: string | null | undefined
): Promise<{ success: true; email: string } | { success: false; error: string }> {
  await requireAnyAreaAccess(["amministrazione", "produzione"]);
  if (!clienteId) return { success: true, email: "" };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clienti")
    .select("email")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, email: String(data?.email ?? "").trim() };
}

export async function uploadSpedizioneMailFileAction(
  formData: FormData
): Promise<
  | { success: true; path: string; name: string; contentType: string }
  | { success: false; error: string }
> {
  const { auth } = await gateWrite();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un file." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { success: false, error: "File oltre 15 MB." };
  }
  const ext = (file.name.split(".").pop() || "bin").replace(/[^\w]+/g, "");
  const safe = file.name.replace(/[^\w.\- ()àèéìòù]+/gi, "_").slice(0, 80);
  const path = `${auth.userId}/${randomUUID()}.${ext || "bin"}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    path,
    name: safe || file.name,
    contentType: file.type || "application/octet-stream",
  };
}

export async function generaCorpoMailSpedizioneAction(input: {
  cliente: string;
  numero: string;
  prodotti: string;
  trackingUrl: string;
  haLettera: boolean;
}): Promise<
  | { success: true; subject: string; bodyText: string }
  | { success: false; error: string }
> {
  await gateWrite();
  const testo = await generaTestoMailSpedizione(input);
  return {
    success: true,
    subject: testo.subject,
    bodyText: testo.bodyText,
  };
}

export async function upsertPrenotazioneSpedizioneMailAction(
  raw: unknown
): Promise<
  | { success: true; item: SpedizioneMailPrenotazione; apriBozza: boolean }
  | { success: false; error: string }
> {
  const { auth } = await gateWrite();
  const parsed = spedizioneMailUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const d = parsed.data;
  if (d.allegaLettera && !d.letteraViaPath) {
    return { success: false, error: "Carica la lettera di via oppure togli la spunta." };
  }
  if (d.allegaFile && d.allegati.length === 0) {
    return { success: false, error: "Carica almeno un file oppure togli la spunta." };
  }
  if (d.modo === "prenota" && !trackingMancante(d.allegaTracking, d.trackingUrl)) {
    return {
      success: false,
      error: "Prenota mail serve quando hai chiesto il tracking ma non è ancora caricato.",
    };
  }
  if (d.modo === "compila" && trackingMancante(d.allegaTracking, d.trackingUrl)) {
    return {
      success: false,
      error: "Manca il tracking. Usa Prenota mail oppure carica l’URL.",
    };
  }
  if (d.trackingUrl) {
    try {
      const u = new URL(d.trackingUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("protocol");
      }
    } catch {
      return { success: false, error: "URL tracking non valido (http o https)." };
    }
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("spedizione_mail_prenotazioni")
    .select(COLS)
    .eq("entity_type", d.entityType)
    .eq("entity_id", d.entityId)
    .is("deleted_at", null)
    .maybeSingle();

  const now = new Date().toISOString();
  const mancaTracking = trackingMancante(d.allegaTracking, d.trackingUrl);
  const stato =
    d.modo === "prenota" || mancaTracking ? "prenotata" : "pronta";
  const payload = {
    entity_type: d.entityType,
    entity_id: d.entityId,
    stato,
    documento_stato: "bozza",
    tracking_url: d.trackingUrl,
    lettera_via_path: d.letteraViaPath,
    lettera_via_name: d.letteraViaName,
    allegati: d.allegati,
    allega_tracking: d.allegaTracking,
    allega_lettera: d.allegaLettera,
    allega_file: d.allegaFile,
    destinatario_email: d.destinatarioEmail,
    oggetto: d.oggetto,
    corpo: d.corpo,
    account_id: d.accountId ?? null,
    prenotata_at: stato === "prenotata" ? now : existing?.prenotata_at ?? now,
    prenotata_by: auth.userId,
    updated_by: auth.userId,
  };

  let row: Record<string, unknown>;
  if (existing) {
    const { data, error } = await supabase
      .from("spedizione_mail_prenotazioni")
      .update({
        ...payload,
        versione: Number(existing.versione ?? 1) + 1,
      })
      .eq("id", existing.id)
      .select(COLS)
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito." };
    }
    row = data as Record<string, unknown>;
  } else {
    const { data, error } = await supabase
      .from("spedizione_mail_prenotazioni")
      .insert({
        ...payload,
        created_by: auth.userId,
      })
      .select(COLS)
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio fallito." };
    }
    row = data as Record<string, unknown>;
  }

  if (d.trackingUrl && d.entityType === "campionatura") {
    await supabase
      .from("campionature")
      .update({
        tracking_url: d.trackingUrl,
        updated_by: auth.userId,
      })
      .eq("id", d.entityId)
      .is("deleted_at", null);
    const { data: already } = await supabase
      .from("shipping_trackings")
      .select("id")
      .eq("entity_type", "campionatura")
      .eq("entity_id", d.entityId)
      .eq("tracking_url", d.trackingUrl)
      .maybeSingle();
    if (!already) {
      await supabase.from("shipping_trackings").insert({
        entity_type: "campionatura",
        entity_id: d.entityId,
        tracking_url: d.trackingUrl,
        carrier: inferCarrierFromUrl(d.trackingUrl),
        tracking_code: "",
        current_status: "registrato",
        last_check_note:
          "Inserito da Inserisci in produzione / prenotazione mail",
        created_by: auth.userId,
        updated_by: auth.userId,
      });
    }
  }

  const item = mapSpedizioneMailRow(row);
  await writeAuditLog({
    entity_type: "spedizione_mail_prenotazioni",
    entity_id: item.id,
    action: existing ? "update" : "create",
    actor_id: auth.userId,
    summary:
      stato === "prenotata"
        ? `Prenotata mail spedizione ${d.entityType} (manca tracking)`
        : `Bozza mail spedizione ${d.entityType} pronta`,
    payload: {
      entity_type: d.entityType,
      entity_id: d.entityId,
      stato,
      modo: d.modo,
      allega_tracking: d.allegaTracking,
      tracking: Boolean(d.trackingUrl),
    },
  });

  return {
    success: true,
    item,
    apriBozza: d.modo === "compila" && !mancaTracking,
  };
}

const inviaSchema = z.object({
  prenotazioneId: z.string().uuid(),
  accountId: z.string().uuid(),
  to: z.string().trim().email("Email destinatario non valida"),
  subject: z.string().trim().min(1).max(240),
  bodyText: z.string().trim().min(1).max(20000),
});

export async function inviaMailSpedizioneAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await gateWrite();
  const parsed = inviaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati invio non validi.",
    };
  }
  const d = parsed.data;
  const service = createServiceClient();
  const { data: pren, error: pErr } = await service
    .from("spedizione_mail_prenotazioni")
    .select(COLS)
    .eq("id", d.prenotazioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !pren) {
    return { success: false, error: pErr?.message ?? "Prenotazione non trovata." };
  }
  const item = mapSpedizioneMailRow(pren as Record<string, unknown>);
  if (item.stato === "inviata") {
    return { success: false, error: "Mail già inviata." };
  }
  if (trackingMancante(item.allegaTracking, item.trackingUrl)) {
    return { success: false, error: "Manca ancora il tracking: non si può inviare." };
  }

  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", d.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella webmail non trovata." };
  }

  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }> = [];
  if (item.allegaLettera && item.letteraViaPath) {
    const { data: file } = await service.storage
      .from(BUCKET)
      .download(item.letteraViaPath);
    if (file) {
      attachments.push({
        filename: item.letteraViaName || "lettera-di-via.pdf",
        content: Buffer.from(await file.arrayBuffer()),
      });
    }
  }
  if (item.allegaFile) {
    for (const a of item.allegati) {
      const { data: file } = await service.storage.from(BUCKET).download(a.path);
      if (!file) continue;
      attachments.push({
        filename: a.name,
        content: Buffer.from(await file.arrayBuffer()),
        contentType: a.contentType || undefined,
      });
    }
  }
  let body = d.bodyText;
  if (item.allegaTracking && item.trackingUrl && !body.includes(item.trackingUrl)) {
    body = `${body}\n\nTracking: ${item.trackingUrl}`;
  }

  try {
    await sendMailViaAccount({
      account: account as {
        id: string;
        email_address: string;
        imap_host: string;
        imap_port: number;
        imap_secure: boolean;
        smtp_host: string;
        smtp_port: number;
        smtp_secure: boolean;
        username: string;
        password_encrypted: string;
      },
      to: d.to,
      subject: d.subject,
      text: body,
      attachments,
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Invio SMTP fallito.",
    };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await service
    .from("spedizione_mail_prenotazioni")
    .update({
      stato: "inviata",
      documento_stato: "chiuso",
      destinatario_email: d.to,
      oggetto: d.subject,
      corpo: body,
      account_id: d.accountId,
      inviata_at: now,
      inviata_by: auth.userId,
      updated_by: auth.userId,
      versione: item.versione + 1,
    })
    .eq("id", item.id);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: "spedizione_mail_prenotazioni",
    entity_id: item.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Inviata mail spedizione a ${d.to}`,
    payload: {
      entity_type: item.entityType,
      entity_id: item.entityId,
      stato_da: item.stato,
      stato_a: "inviata",
    },
  });
  return { success: true };
}

export async function listCaselleSpedizioneMailAction(): Promise<
  | { success: true; accounts: Array<{ id: string; label: string; email: string }> }
  | { success: false; error: string }
> {
  await gateWrite();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select("id, label, email_address")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: ((data ?? []) as Array<{
      id: string;
      label: string;
      email_address: string;
    }>).map((a) => ({
      id: a.id,
      label: a.label,
      email: a.email_address,
    })),
  };
}
