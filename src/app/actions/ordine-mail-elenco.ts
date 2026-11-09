"use server";

import { writeAuditLog } from "@/lib/audit";
import { inviaFatturaDaWebmailAction } from "@/app/actions/fattura-mail";
import { inviaMailSpedizioneAction } from "@/app/actions/spedizione-mail";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";
import { WEBMAIL_SENT_FOLDER } from "@/lib/webmail/types";
import { z } from "zod";

export type InvioVoceMailOrdine = {
  tipo: "cortesia" | "proforma" | "spedizione";
  fatturaId: string | null;
  prenotazioneId: string | null;
  accountId: string;
  to: string;
  subject: string;
  bodyText: string;
};

export type VoceMailOrdine = {
  id: string;
  tipologia: string;
  situazione: "inviata" | "non_inviata" | "prenotata";
  oggetto: string;
  corpo: string;
  quando: string | null;
  accountId: string | null;
  messaggioId: string | null;
  motivo: string;
  invio: InvioVoceMailOrdine | null;
};

type FatturaMail = {
  id: string;
  tipo: string;
  numero: string;
  interno: string;
  courtesy: boolean;
  ei: string;
  sentAt: string | null;
  email: string;
};

type MessaggioMail = {
  id: string;
  accountId: string;
  subject: string;
  sentAt: string | null;
};

function testo(value: unknown): string {
  return String(value ?? "").trim();
}

function stessoOggetto(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function numeroCercabile(value: string): boolean {
  const t = value.trim();
  return t.length >= 6 && /[A-Za-z]/.test(t);
}

function ilikeContiene(value: string): string {
  return `%${value.replace(/[%_\\]/g, "")}%`;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function tipologiaDaOggetto(subject: string, tipoDocumento: string): string {
  const s = subject.toLowerCase();
  if (tipoDocumento === "proforma" || s.includes("proforma")) return "Proforma";
  if (s.includes("fattura") || s.includes("cortesia")) return "Copia fattura";
  if (s.includes("tracking") || s.includes("spediz")) return "Tracking";
  return "Mail ordine";
}

async function gate() {
  return requireAnyAreaAccess(["amministrazione", "produzione", "webmail"]);
}

export async function elencoMailOrdineAction(
  ordineId: string
): Promise<
  { success: true; voci: VoceMailOrdine[] } | { success: false; error: string }
> {
  await gate();
  const id = uuid(ordineId);
  if (!id) return { success: false, error: "Ordine non valido." };
  const service = createServiceClient();

  const [ordineRes, fattureRes, prenRes, contenutiRes] = await Promise.all([
    service
      .from("ordini")
      .select(
        "id, numero_interno, created_at, avvisa_merce_pronta, avviso_valore, avviso_etichetta, avviso_includi_orari, avviso_includi_sede, avviso_includi_misure, avviso_includi_peso"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    service
      .from("fatture_emesse")
      .select(
        "id, tipo_documento, numero_fattura, numero_interno, courtesy_email_sent, ei_status, sent_at, invio_email"
      )
      .eq("ordine_id", id)
      .is("deleted_at", null),
    service
      .from("spedizione_mail_prenotazioni")
      .select(
        "id, stato, oggetto, corpo, destinatario_email, account_id, prenotata_at, inviata_at, allega_tracking, tracking_url"
      )
      .eq("entity_type", "ordine")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    service
      .from("spedizioni_gruppi_contenuti")
      .select("gruppo_id")
      .eq("entity_type", "ordine")
      .eq("entity_id", id)
      .is("deleted_at", null),
  ]);
  if (ordineRes.error) return { success: false, error: ordineRes.error.message };
  if (!ordineRes.data) return { success: false, error: "Ordine non trovato." };
  if (fattureRes.error) return { success: false, error: fattureRes.error.message };
  if (prenRes.error) return { success: false, error: prenRes.error.message };

  const ordine = ordineRes.data as Record<string, unknown>;
  const numero = testo(ordine.numero_interno);
  const fatture: FatturaMail[] = (fattureRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: testo(r.id),
      tipo: testo(r.tipo_documento),
      numero: testo(r.numero_fattura),
      interno: testo(r.numero_interno),
      courtesy: Boolean(r.courtesy_email_sent),
      ei: testo(r.ei_status),
      sentAt: (r.sent_at as string | null) ?? null,
      email: testo(r.invio_email),
    };
  });
  const fatturaIds = fatture.map((f) => f.id).filter(Boolean);

  const auditRes = fatturaIds.length
    ? await service
        .from("audit_log")
        .select("entity_id, payload, created_at")
        .eq("entity_type", "fatture_emesse")
        .in("entity_id", fatturaIds)
        .order("created_at", { ascending: false })
        .limit(80)
    : { data: [], error: null };
  if (auditRes.error) return { success: false, error: auditRes.error.message };

  const messaggioIds = new Set<string>();
  for (const row of auditRes.data ?? []) {
    const payload = (row as { payload?: unknown }).payload;
    if (!payload || typeof payload !== "object") continue;
    const mid = uuid((payload as { messaggio_id?: unknown }).messaggio_id);
    if (mid) messaggioIds.add(mid);
  }

  const numeri = [numero, ...fatture.flatMap((f) => [f.numero, f.interno])].filter(
    numeroCercabile
  );
  const messaggi: MessaggioMail[] = [];
  const visti = new Set<string>();
  const aggiungi = (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      const mid = testo(row.id);
      if (!mid || visti.has(mid)) continue;
      if (testo(row.folder) && testo(row.folder) !== WEBMAIL_SENT_FOLDER) continue;
      if (testo(row.direction) && testo(row.direction) !== "outbound") continue;
      visti.add(mid);
      messaggi.push({
        id: mid,
        accountId: testo(row.account_id),
        subject: testo(row.subject),
        sentAt: (row.sent_at as string | null) ?? null,
      });
    }
  };

  if (messaggioIds.size > 0) {
    const byId = await service
      .from("webmail_messaggi")
      .select("id, account_id, subject, sent_at, folder, direction")
      .in("id", [...messaggioIds])
      .is("deleted_at", null);
    if (byId.error) return { success: false, error: byId.error.message };
    aggiungi((byId.data ?? []) as Array<Record<string, unknown>>);
  }
  for (const cerca of [...new Set(numeri)]) {
    const bySub = await service
      .from("webmail_messaggi")
      .select("id, account_id, subject, sent_at, folder, direction")
      .eq("direction", "outbound")
      .eq("folder", WEBMAIL_SENT_FOLDER)
      .ilike("subject", ilikeContiene(cerca))
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(30);
    if (bySub.error) return { success: false, error: bySub.error.message };
    aggiungi((bySub.data ?? []) as Array<Record<string, unknown>>);
  }

  const voci: VoceMailOrdine[] = [];
  const oggettiInviati = new Set(
    messaggi.map((m) => m.subject.trim().toLowerCase()).filter(Boolean)
  );

  for (const msg of messaggi) {
    const doc = fatture.find((f) =>
      (f.numero && msg.subject.includes(f.numero)) ||
      (f.interno && msg.subject.includes(f.interno)) ||
      stessoOggetto(msg.subject, `Fattura ordine ${numero}`) ||
      stessoOggetto(msg.subject, `Fattura ${f.numero}`)
    );
    voci.push({
      id: `wm-${msg.id}`,
      tipologia: tipologiaDaOggetto(msg.subject, doc?.tipo ?? ""),
      situazione: "inviata",
      oggetto: msg.subject || "Mail inviata",
      corpo: "",
      quando: msg.sentAt,
      accountId: msg.accountId || null,
      messaggioId: msg.id,
      motivo: "",
      invio: null,
    });
  }

  for (const fat of fatture) {
    if (!fat.courtesy) continue;
    const gia = messaggi.some((m) => {
      if (fat.tipo === "proforma") {
        return (
          /proforma/i.test(m.subject) &&
          ((fat.numero && m.subject.includes(fat.numero)) ||
            (fat.interno && m.subject.includes(fat.interno)))
        );
      }
      return (
        (fat.numero && m.subject.includes(fat.numero)) ||
        (fat.interno && m.subject.includes(fat.interno)) ||
        stessoOggetto(m.subject, `Fattura ordine ${numero}`)
      );
    });
    if (gia) continue;
    voci.push({
      id: `fat-${fat.id}`,
      tipologia: fat.tipo === "proforma" ? "Proforma" : "Copia fattura",
      situazione: "inviata",
      oggetto: fat.numero
        ? `${fat.tipo === "proforma" ? "Proforma" : "Copia fattura"} ${fat.numero}`
        : "Copia fattura",
      corpo: "",
      quando: fat.sentAt,
      accountId: null,
      messaggioId: null,
      motivo: "Inviata. Nella casella Inviati non risulta la copia.",
      invio: null,
    });
  }

  for (const raw of prenRes.data ?? []) {
    const pren = raw as Record<string, unknown>;
    const stato = testo(pren.stato);
    if (stato === "annullata") continue;
    const oggetto = testo(pren.oggetto) || "Mail dell'ordine";
    const corpo = testo(pren.corpo);
    const accountId = testo(pren.account_id);
    const to = testo(pren.destinatario_email);
    const sembraProforma = /proforma/i.test(oggetto);
    const sembraFattura = /fattura/i.test(oggetto) && !sembraProforma;
    const doc = sembraProforma
      ? fatture.find((f) => f.tipo === "proforma") ?? null
      : fatture.find((f) => f.tipo !== "proforma") ?? null;
    const trackingManca =
      Boolean(pren.allega_tracking) && !testo(pren.tracking_url);
    const giaInviata =
      stato === "inviata" ||
      oggettiInviati.has(oggetto.toLowerCase()) ||
      Boolean(doc?.courtesy && (sembraFattura || sembraProforma));
    if (giaInviata) {
      if (stato !== "inviata") {
        if (trackingManca) {
          voci.push({
            id: `track-${testo(pren.id)}`,
            tipologia: "Tracking",
            situazione: "prenotata",
            oggetto: "Mail prenotata per il tracking",
            corpo: "",
            quando: (pren.prenotata_at as string | null) ?? null,
            accountId: accountId || null,
            messaggioId: null,
            motivo: "In attesa del tracking.",
            invio: null,
          });
        }
        continue;
      }
      if (oggettiInviati.has(oggetto.toLowerCase())) continue;
      voci.push({
        id: `pren-${testo(pren.id)}`,
        tipologia: tipologiaDaOggetto(oggetto, doc?.tipo ?? ""),
        situazione: "inviata",
        oggetto,
        corpo,
        quando: (pren.inviata_at as string | null) ?? null,
        accountId: accountId || null,
        messaggioId: null,
        motivo: "Inviata. Nella casella Inviati non risulta la copia.",
        invio: null,
      });
      continue;
    }

    const dopoSdi = doc?.ei === "sent";
    let tipologia = "Mail ordine";
    let situazione: VoceMailOrdine["situazione"] = "non_inviata";
    let motivo = "";
    let invio: InvioVoceMailOrdine | null = null;
    const baseInvio = {
      prenotazioneId: testo(pren.id),
      accountId,
      to,
      subject: oggetto,
      bodyText: corpo,
    };
    if (sembraProforma) {
      tipologia = "Proforma";
      if (!doc) motivo = "La proforma non è ancora registrata.";
      else if (!accountId || !to || !corpo) motivo = "Manca casella, destinatario o testo.";
      else {
        invio = { ...baseInvio, tipo: "proforma", fatturaId: doc.id };
      }
    } else if (sembraFattura) {
      tipologia = "Copia fattura";
      if (!doc) motivo = "La fattura non è ancora registrata.";
      else if (!dopoSdi) {
        motivo =
          "La copia fattura si invia solo dopo lo SDI. Altrimenti si scarica e si manda a mano.";
      } else if (!accountId || !to || !corpo) {
        motivo = "Manca casella, destinatario o testo.";
      } else {
        invio = { ...baseInvio, tipo: "cortesia", fatturaId: doc.id };
      }
    } else if (trackingManca) {
      tipologia = "Tracking";
      situazione = "prenotata";
      motivo = "In attesa del tracking.";
    } else if (!accountId || !to || !corpo) {
      motivo = "Manca casella, destinatario o testo.";
    } else {
      invio = { ...baseInvio, tipo: "spedizione", fatturaId: null };
    }
    voci.push({
      id: `pren-${testo(pren.id)}`,
      tipologia,
      situazione,
      oggetto,
      corpo,
      quando: (pren.prenotata_at as string | null) ?? null,
      accountId: accountId || null,
      messaggioId: null,
      motivo,
      invio,
    });
  }

  const gruppoIds = [
    ...new Set(
      (contenutiRes.data ?? [])
        .map((row) => testo((row as { gruppo_id?: string }).gruppo_id))
        .filter(Boolean)
    ),
  ];
  if (!contenutiRes.error && gruppoIds.length > 0) {
    const gruppiRes = await service
      .from("spedizioni_gruppi")
      .select("id, numero, unica_mail, mail_inviata_at, stato, tracking_url")
      .in("id", gruppoIds)
      .is("deleted_at", null);
    if (!gruppiRes.error) {
      for (const raw of gruppiRes.data ?? []) {
        const gruppo = raw as Record<string, unknown>;
        if (!gruppo.unica_mail) continue;
        const num = testo(gruppo.numero);
        if (num && messaggi.some((m) => m.subject.includes(num))) continue;
        const inviata = Boolean(gruppo.mail_inviata_at);
        voci.push({
          id: `gruppo-${testo(gruppo.id)}`,
          tipologia: "Tracking di gruppo",
          situazione: inviata ? "inviata" : "prenotata",
          oggetto: num ? `Mail di gruppo ${num}` : "Mail di gruppo",
          corpo: testo(gruppo.tracking_url)
            ? `Tracking: ${testo(gruppo.tracking_url)}`
            : "",
          quando: (gruppo.mail_inviata_at as string | null) ?? null,
          accountId: null,
          messaggioId: null,
          motivo: inviata
            ? ""
            : "Prenotata con la spedizione di gruppo. Si invia da lì.",
          invio: null,
        });
      }
    }
  }

  if (ordine.avvisa_merce_pronta) {
    const include = [
      ordine.avviso_includi_orari ? "orari" : "",
      ordine.avviso_includi_sede ? "sede" : "",
      ordine.avviso_includi_misure ? "misure" : "",
      ordine.avviso_includi_peso ? "peso" : "",
    ].filter(Boolean);
    const canale = testo(ordine.avviso_etichetta) || "mail";
    const dest = testo(ordine.avviso_valore);
    voci.push({
      id: `avviso-${id}`,
      tipologia: "Avviso merce pronta",
      situazione: "prenotata",
      oggetto: "Mail prenotata per l'avviso di merce pronta",
      corpo: [
        `Canale: ${canale}.`,
        dest ? `Destinatario: ${dest}.` : "",
        include.length
          ? `Sarà indicato: ${include.join(", ")}.`
          : "Nessun dettaglio extra selezionato.",
      ]
        .filter(Boolean)
        .join(" "),
      quando: null,
      accountId: null,
      messaggioId: null,
      motivo: "Parte quando la merce è pronta per il ritiro.",
      invio: null,
    });
  }

  const peso = { inviata: 0, non_inviata: 1, prenotata: 2 };
  voci.sort((a, b) => {
    const diff = peso[a.situazione] - peso[b.situazione];
    if (diff !== 0) return diff;
    return (b.quando ?? "").localeCompare(a.quando ?? "");
  });
  return { success: true, voci };
}

const invioSchema = z.object({
  ordineId: z.string().uuid(),
  tipo: z.enum(["cortesia", "proforma", "spedizione"]),
  fatturaId: z.string().uuid().nullable(),
  prenotazioneId: z.string().uuid().nullable(),
  accountId: z.string().uuid(),
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
  conferma: z.literal(true),
});

export async function inviaBozzaMailOrdineAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await gate();
  const parsed = invioSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati invio non validi.",
    };
  }
  const d = parsed.data;
  const service = createServiceClient();
  const { data: ordine, error: ordErr } = await service
    .from("ordini")
    .select("id")
    .eq("id", d.ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (ordErr || !ordine) {
    return { success: false, error: ordErr?.message ?? "Ordine non trovato." };
  }

  if (d.tipo === "spedizione") {
    if (!d.prenotazioneId) {
      return { success: false, error: "Bozza non indicata." };
    }
    const { data: pren } = await service
      .from("spedizione_mail_prenotazioni")
      .select("id")
      .eq("id", d.prenotazioneId)
      .eq("entity_type", "ordine")
      .eq("entity_id", d.ordineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!pren) return { success: false, error: "Bozza non trovata su questo ordine." };
    const sent = await inviaMailSpedizioneAction({
      prenotazioneId: d.prenotazioneId,
      accountId: d.accountId,
      to: d.to,
      subject: d.subject.slice(0, 240),
      bodyText: d.bodyText.slice(0, 20000),
    });
    if (!sent.success) return sent;
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: d.ordineId,
      action: "update",
      actor_id: auth.userId,
      summary: "Inviata dal dettaglio ordine la bozza mail non ancora partita.",
      payload: {
        tipo: d.tipo,
        prenotazione_id: d.prenotazioneId,
        oggetto: d.subject,
      },
    });
    return { success: true };
  }

  if (!d.fatturaId) return { success: false, error: "Documento non indicato." };
  const { data: fat } = await service
    .from("fatture_emesse")
    .select("id, tipo_documento, ei_status")
    .eq("id", d.fatturaId)
    .eq("ordine_id", d.ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!fat) return { success: false, error: "Documento non trovato su questo ordine." };
  const tipoDoc = testo((fat as { tipo_documento?: string }).tipo_documento);
  const ei = testo((fat as { ei_status?: string }).ei_status);
  if (d.tipo === "proforma" && tipoDoc !== "proforma") {
    return { success: false, error: "Il documento non è una proforma." };
  }
  if (d.tipo === "cortesia" && ei !== "sent") {
    return {
      success: false,
      error:
        "La copia fattura si invia solo dopo lo SDI. Altrimenti si scarica e si manda a mano.",
    };
  }
  const sent = await inviaFatturaDaWebmailAction({
    fatturaId: d.fatturaId,
    accountId: d.accountId,
    to: d.to,
    subject: d.subject,
    bodyText: d.bodyText,
    doppiaConferma: true,
  });
  if (!sent.success) return sent;
  await writeAuditLog({
    entity_type: "ordini",
    entity_id: d.ordineId,
    action: "update",
    actor_id: auth.userId,
    summary:
      d.tipo === "proforma"
        ? "Inviata dal dettaglio ordine la bozza della proforma."
        : "Inviata dal dettaglio ordine la bozza della copia fattura.",
    payload: {
      tipo: d.tipo,
      fattura_id: d.fatturaId,
      oggetto: d.subject,
    },
  });
  return { success: true };
}
