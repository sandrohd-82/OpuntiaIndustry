"use server";

import { resolveClientePerOrdineFromRawAction } from "@/app/actions/clienti";
import { writeAuditLog } from "@/lib/audit";
import {
  createCampionaturaSchema,
  createReferenteRicezioneSchema,
  formatNumeroCampionatura,
  REFERENTE_RICEZIONE_MERCE,
  type Campionatura,
  type CampionaturaMezzo,
  type CampionaturaOrigine,
  type CampionaturaRiga,
} from "@/lib/amministrazione/campionature";
import { passaCampionaturaScalettaSchema } from "@/lib/amministrazione/scaletta-produzione";
import {
  appendSchedaTimeline,
  ensureSchedaOrdine,
} from "@/lib/produzione/schede-ordini-store";
import { syncSchedaOrdineAziendaNota } from "@/lib/amministrazione/scheda-timeline-nota";
import { inferCarrierFromUrl } from "@/lib/shipping/tracking";
import { assegnaLottoProduzioneDaMagazzino } from "@/app/actions/lotto-produzione-magazzino";
import { getGiacenzaProdottoAction } from "@/app/actions/produzione-capacita";
import {
  giacenzaCopreRichiesta,
  messaggioGiacenzaInsufficiente,
  quantitaRichiestaInBaseKg,
} from "@/lib/amministrazione/approvvigionamento";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { resolveAnagraficaOwnerUserIds } from "@/lib/auth/anagrafica-visibility";
import { loadOwnedAziendaIds } from "@/lib/auth/data-scope-enforce";
import { loadCommercialLineageUserIds } from "@/lib/auth/commerciale-lineage";
import { isCommercialOwnRecord } from "@/lib/auth/commerciale";
import { anagraficaListOrClause } from "@/lib/auth/anagrafica-visibility";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import type { CampionaturaRigaRow, CampionaturaRow } from "@/types/database";

async function requireCampionaturaAccess(mode: "read" | "write") {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { ok: false as const, error: "Non autenticato" };
  }
  if (isSuperadminProfile(auth.profile)) {
    return { ok: true as const, auth };
  }
  const writeOk =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "produzione");
  const readOk =
    writeOk || userCanAccessArea(auth.areas, "magazzino");
  if (mode === "write" ? !writeOk : !readOk) {
    return { ok: false as const, error: "Permesso negato" };
  }
  return { ok: true as const, auth };
}

function mapRiga(row: CampionaturaRigaRow): CampionaturaRiga {
  return {
    id: row.id,
    prodottoId: row.prodotto_id ?? "",
    prodottoCodice: row.prodotto_codice,
    prodottoNome: row.prodotto_nome,
    quantita: Number(row.quantita),
    unitaMisura: row.unita_misura,
    lottoCodice: row.lotto_codice,
    note: row.note,
  };
}

function mapCampionatura(
  row: CampionaturaRow,
  righe: CampionaturaRigaRow[],
  extra?: {
    notaTitolo?: string;
    mailOggetto?: string;
    referenteLabel?: string;
  }
): Campionatura {
  return {
    id: row.id,
    numeroInterno: row.numero_interno,
    clienteId: row.cliente_id ?? "",
    possibileClienteId: row.cliente_possibile_id ?? null,
    cliente: row.cliente_ragione_sociale,
    clienteCodiceTarga: row.cliente_codice_targa,
    dataInvio: row.data_invio,
    origine: ((row.origine as CampionaturaOrigine | undefined) ??
      "da_inviare") as CampionaturaOrigine,
    trackingUrl: row.tracking_url ?? "",
    mezzo: (row.mezzo as CampionaturaMezzo | null) ?? null,
    pnNotaId: row.pn_nota_id,
    pnNotaTitolo: extra?.notaTitolo ?? "",
    webmailMessaggioId: row.webmail_messaggio_id,
    webmailOggetto: extra?.mailOggetto ?? "",
    spedizioneTipo: row.spedizione_tipo ?? "sede_azienda",
    spedizionePrivato: Boolean(row.spedizione_privato),
    referenteRicezioneId: row.referente_ricezione_id,
    referenteRicezioneLabel: extra?.referenteLabel ?? "",
    destinatario: row.destinatario,
    indirizzoSpedizione: row.indirizzo_spedizione,
    note: row.note,
    sedePartenzaId: row.sede_partenza_id ?? null,
    stato: row.stato,
    documentoStato: row.documento_stato,
    versione: row.versione,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    righe: righe
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapRiga),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function nextSeq(
  targa: string
): Promise<{ ok: true; seq: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campionature")
    .select("numero_interno")
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  const code = targa.trim().toUpperCase().replace(/\s+/g, "");
  const re = new RegExp(
    `^Cp-\\d{2}-${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.numero_interno).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { ok: true, seq: max + 1 };
}

function saveErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message && !e.message.startsWith("NEXT_")) {
    return e.message;
  }
  return "Salvataggio non riuscito. Riprova.";
}

export async function listCampionatureAction(): Promise<
  { success: true; items: Campionatura[] } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("read");
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const ownerIds = await resolveAnagraficaOwnerUserIds();
  let ownedClienteIds: string[] | null = null;
  let ownedLeadIds: string[] | null = null;
  if (ownerIds) {
    ownedClienteIds = await loadOwnedAziendaIds(
      supabase,
      gate.auth.userId,
      "clienti"
    );
    const leadClause = await anagraficaListOrClause();
    let leadQ = supabase
      .from("clienti_possibili")
      .select("id")
      .is("deleted_at", null);
    if (leadClause) leadQ = leadQ.or(leadClause);
    const { data: ownLeads } = await leadQ;
    ownedLeadIds = (ownLeads ?? []).map((r) => String(r.id));
    if (ownedClienteIds.length === 0 && ownedLeadIds.length === 0) {
      return { success: true, items: [] };
    }
  }
  let q = supabase
    .from("campionature")
    .select("*")
    .is("deleted_at", null)
    .order("data_invio", { ascending: false })
    .limit(200);
  if (ownedClienteIds) {
    const parts: string[] = [];
    if (ownedClienteIds.length) {
      parts.push(`cliente_id.in.(${ownedClienteIds.join(",")})`);
    }
    if (ownedLeadIds?.length) {
      parts.push(`cliente_possibile_id.in.(${ownedLeadIds.join(",")})`);
    }
    if (parts.length) q = q.or(parts.join(","));
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as CampionaturaRow[];
  const ids = rows.map((r) => r.id);
  const righeByParent = new Map<string, CampionaturaRigaRow[]>();
  if (ids.length) {
    const { data: righe } = await supabase
      .from("campionature_righe")
      .select("*")
      .in("campionatura_id", ids);
    for (const r of (righe ?? []) as CampionaturaRigaRow[]) {
      const list = righeByParent.get(r.campionatura_id) ?? [];
      list.push(r);
      righeByParent.set(r.campionatura_id, list);
    }
  }
  const notaIds = rows.map((r) => r.pn_nota_id).filter(Boolean) as string[];
  const mailIds = rows
    .map((r) => r.webmail_messaggio_id)
    .filter(Boolean) as string[];
  const notaTitle = new Map<string, string>();
  const mailSubject = new Map<string, string>();
  const refLabel = new Map<string, string>();
  const refIds = rows
    .map((r) => r.referente_ricezione_id)
    .filter(Boolean) as string[];
  if (notaIds.length) {
    const { data: note } = await supabase
      .from("pn_note")
      .select("id, titolo")
      .in("id", notaIds);
    for (const n of note ?? []) {
      notaTitle.set(String(n.id), String(n.titolo || "Nota"));
    }
  }
  if (refIds.length) {
    const { data: refs } = await supabase
      .from("rubrica_contatti")
      .select("id, nome, cognome, mansione")
      .in("id", refIds);
    for (const c of refs ?? []) {
      refLabel.set(
        String(c.id),
        `${String(c.nome ?? "")} ${String(c.cognome ?? "")}`.trim() ||
          String(c.mansione || "Ricezione merce")
      );
    }
  }
  if (mailIds.length) {
    const { data: mails } = await supabase
      .from("webmail_messaggi")
      .select("id, subject")
      .in("id", mailIds);
    for (const m of mails ?? []) {
      mailSubject.set(String(m.id), String(m.subject || "(senza oggetto)"));
    }
  }
  return {
    success: true,
    items: rows.map((r) =>
      mapCampionatura(r, righeByParent.get(r.id) ?? [], {
        notaTitolo: r.pn_nota_id ? notaTitle.get(r.pn_nota_id) : undefined,
        mailOggetto: r.webmail_messaggio_id
          ? mailSubject.get(r.webmail_messaggio_id)
          : undefined,
        referenteLabel: r.referente_ricezione_id
          ? refLabel.get(r.referente_ricezione_id)
          : undefined,
      })
    ),
  };
}

export async function createCampionaturaAction(
  raw: unknown
): Promise<
  { success: true; item: Campionatura } | { success: false; error: string }
> {
  try {
    return await createCampionaturaActionInner(raw);
  } catch (e) {
    console.error("[createCampionaturaAction]", e);
    return { success: false, error: saveErrorMessage(e) };
  }
}

async function createCampionaturaActionInner(
  raw: unknown
): Promise<
  { success: true; item: Campionatura } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const resolved = await resolveClientePerOrdineFromRawAction(raw);
  if (!resolved.success) return resolved;
  const supabase = await createClient();
  const ownerIds = await resolveAnagraficaOwnerUserIds();
  if (ownerIds) {
    if (resolved.mode === "cliente" && resolved.clienteId) {
      const owned = await loadOwnedAziendaIds(
        supabase,
        gate.auth.userId,
        "clienti"
      );
      if (!owned.includes(resolved.clienteId)) {
        return {
          success: false,
          error: "Puoi inviare campionature solo alle aziende del tuo perimetro.",
        };
      }
    } else {
      const lineage = await loadCommercialLineageUserIds(gate.auth.userId);
      const own = isCommercialOwnRecord({
        userId: gate.auth.userId,
        createdBy: resolved.createdBy,
        commercialeId: resolved.commercialeId,
        lineageIds: lineage,
      });
      if (!own && !isSuperadminProfile(gate.auth.profile)) {
        return {
          success: false,
          error: "Puoi inviare campionature solo alle aziende del tuo perimetro.",
        };
      }
    }
  }
  const parsed = createCampionaturaSchema.safeParse({
    ...(raw && typeof raw === "object" ? raw : {}),
    clienteId: resolved.clienteId || undefined,
    possibileClienteId: resolved.possibileClienteId,
    cliente: resolved.ragioneSociale,
    codiceTargaCliente: resolved.codiceTarga,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const input = parsed.data;
  const isStorico = input.origine === "storico";
  const now = new Date().toISOString();
  const sentAtStorico = isStorico
    ? `${input.dataInvio}T12:00:00`
    : null;
  const seqRes = await nextSeq(input.codiceTargaCliente);
  if (!seqRes.ok) return { success: false, error: seqRes.error };
  const seq = seqRes.seq;
  const numero = formatNumeroCampionatura(
    input.dataInvio,
    input.codiceTargaCliente,
    seq
  );

  let notaTitolo = "";
  if (input.pnNotaId && !isStorico) {
    const { data: notaCheck, error: notaErr } = await supabase
      .from("pn_note")
      .select("id, titolo, entity_type, entity_id")
      .eq("id", input.pnNotaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (notaErr || !notaCheck) {
      return { success: false, error: "Nota timeline non trovata" };
    }
    const notaSuCliente =
      notaCheck.entity_type === "cliente" &&
      notaCheck.entity_id === input.clienteId;
    const notaSuLead =
      notaCheck.entity_type === "cliente_possibile" &&
      Boolean(resolved.possibileClienteId) &&
      notaCheck.entity_id === resolved.possibileClienteId;
    if (!notaSuCliente && !notaSuLead) {
      return {
        success: false,
        error: "La nota deve appartenere all’azienda selezionata",
      };
    }
    if (notaSuLead && resolved.mode === "cliente" && resolved.clienteId) {
      await supabase
        .from("pn_note")
        .update({
          entity_type: "cliente",
          entity_id: resolved.clienteId,
          entity_label: input.cliente,
          updated_by: gate.auth.userId,
        })
        .eq("id", notaCheck.id)
        .is("deleted_at", null);
    }
    notaTitolo = String(notaCheck.titolo || "Nota");
  }

  const { data, error } = await supabase
    .from("campionature")
    .insert({
      numero_interno: numero,
      cliente_id: resolved.clienteId,
      cliente_possibile_id: resolved.possibileClienteId,
      cliente_ragione_sociale: input.cliente,
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_invio: input.dataInvio,
      origine: input.origine,
      tracking_url: isStorico ? input.trackingUrl || "" : "",
      mezzo: input.mezzo,
      pn_nota_id: isStorico ? null : input.pnNotaId,
      webmail_messaggio_id: isStorico
        ? null
        : input.webmailMessaggioId || null,
      spedizione_tipo: input.spedizioneTipo,
      spedizione_privato: input.spedizionePrivato,
      referente_ricezione_id: input.referenteRicezioneId || null,
      destinatario: input.destinatario || input.cliente,
      indirizzo_spedizione: input.indirizzoSpedizione,
      note: input.note,
      stato: isStorico ? "inviata" : "inserita",
      documento_stato: isStorico ? "chiuso" : "approvato",
      versione: 1,
      approved_at: now,
      approved_by: gate.auth.userId,
      sent_at: sentAtStorico,
      sent_by: isStorico ? gate.auth.userId : null,
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }
  const header = data as CampionaturaRow;

  const { data: righe, error: rErr } = await supabase
    .from("campionature_righe")
    .insert(
      input.righe.map((r, i) => ({
        campionatura_id: header.id,
        prodotto_id: r.prodottoId,
        prodotto_codice: r.prodottoCodice,
        prodotto_nome: r.prodottoNome,
        quantita: r.quantita,
        unita_misura: r.unitaMisura,
        lotto_codice: r.lottoCodice,
        note: r.note ?? "",
        sort_order: i,
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      }))
    )
    .select("*");

  if (rErr) {
    await supabase
      .from("campionature")
      .update({
        deleted_at: now,
        deleted_by: gate.auth.userId,
      })
      .eq("id", header.id);
    return { success: false, error: rErr.message };
  }

  if (input.pnNotaId && !isStorico) {
    const service = createServiceClient();
    await service
      .from("pn_note")
      .update({
        linked_campionatura_id: header.id,
        updated_by: gate.auth.userId,
      })
      .eq("id", input.pnNotaId)
      .is("deleted_at", null);
  }

  if (isStorico && input.trackingUrl) {
    const service = createServiceClient();
    const carrier = inferCarrierFromUrl(input.trackingUrl);
    const { data: tracking, error: trackErr } = await service
      .from("shipping_trackings")
      .insert({
        entity_type: "campionatura",
        entity_id: header.id,
        tracking_url: input.trackingUrl,
        carrier,
        tracking_code: "",
        current_status: "registrato",
        last_check_note: "Creato da campionatura storico",
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      })
      .select("id")
      .single();
    if (trackErr || !tracking) {
      await supabase
        .from("campionature")
        .update({
          deleted_at: now,
          deleted_by: gate.auth.userId,
        })
        .eq("id", header.id);
      return {
        success: false,
        error: trackErr?.message ?? "Creazione tracking fallita",
      };
    }
    await service.from("shipping_tracking_logs").insert({
      tracking_id: tracking.id,
      status: "registrato",
      details: {
        event: "created",
        source: "campionatura_storico",
        carrier,
        trackingUrl: input.trackingUrl,
      },
      created_by: gate.auth.userId,
    });
    await writeAuditLog({
      entity_type: "shipping_tracking",
      entity_id: String(tracking.id),
      action: "create",
      actor_id: gate.auth.userId,
      summary: `Tracking ${carrier} da campionatura ${numero}`,
      payload: {
        tracking_url: input.trackingUrl,
        entity_type: "campionatura",
        entity_id: header.id,
      },
    });
  }

  await syncSchedaOrdineAziendaNota({
    userId: gate.auth.userId,
    campionaturaId: header.id,
    numero,
    clienteLabel: input.cliente,
    prodotto: input.righe[0]?.prodottoCodice,
    stato: isStorico ? "inviata" : "inserita",
    fromCampionaturaTable: true,
    clienteId: resolved.clienteId,
    possibileClienteId: resolved.possibileClienteId,
  });

  await writeAuditLog({
    entity_type: "campionature",
    entity_id: header.id,
    action: "create",
    actor_id: gate.auth.userId,
    summary: isStorico
      ? `Campionatura ${numero} registrata in storico per ${input.cliente}`
      : `Campionatura ${numero} inserita per ${input.cliente}`,
    payload: {
      numero_interno: numero,
      cliente_id: input.clienteId,
      origine: input.origine,
      mezzo: input.mezzo,
      tracking_url: isStorico ? input.trackingUrl || null : null,
      pn_nota_id: isStorico ? null : input.pnNotaId,
      webmail_messaggio_id: isStorico ? null : input.webmailMessaggioId,
      lotti: input.righe.map((r) => r.lottoCodice),
    },
  });
  if (input.pnNotaId && !isStorico) {
    await writeAuditLog({
      entity_type: "pn_note",
      entity_id: input.pnNotaId,
      action: "link_campionatura",
      actor_id: gate.auth.userId,
      summary: `Nota collegata a campionatura ${numero}`,
      payload: { campionatura_id: header.id },
    });
  }

  return {
    success: true,
    item: mapCampionatura(header, (righe ?? []) as CampionaturaRigaRow[], {
      notaTitolo,
    }),
  };
}

export async function previewNumeroCampionaturaAction(input: {
  codiceTargaCliente: string;
  dataInvio: string;
}): Promise<
  { success: true; numeroInterno: string } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("read");
  if (!gate.ok) return { success: false, error: gate.error };
  const seqRes = await nextSeq(input.codiceTargaCliente);
  if (!seqRes.ok) return { success: false, error: seqRes.error };
  return {
    success: true,
    numeroInterno: formatNumeroCampionatura(
      input.dataInvio,
      input.codiceTargaCliente,
      seqRes.seq
    ),
  };
}

export async function softDeleteCampionaturaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("campionature")
    .select("id, numero_interno, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !existing) {
    return { success: false, error: readErr?.message ?? "Record non trovato" };
  }
  const { error } = await supabase
    .from("campionature")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: gate.auth.userId,
      updated_by: gate.auth.userId,
      versione: (existing.versione ?? 1) + 1,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "campionature",
    entity_id: id,
    action: "soft_delete",
    actor_id: gate.auth.userId,
    summary: `Campionatura ${existing.numero_interno} archiviata (soft delete)`,
  });
  return { success: true };
}

export async function createReferenteRicezioneMerceAction(
  raw: unknown
): Promise<
  | {
      success: true;
      id: string;
      destinatario: string;
      label: string;
    }
  | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = createReferenteRicezioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const d = parsed.data;
  const destinatario = d.isPrivato
    ? `${d.nome} ${d.cognome}`.trim()
    : [d.ragioneSociale, `${d.nome} ${d.cognome}`.trim()]
        .filter(Boolean)
        .join(" — ");
  const noteParts = [
    d.isPrivato ? "Spedizione a privato" : `Spedizione presso ${d.ragioneSociale}`,
    d.indirizzo,
  ];
  const service = createServiceClient();
  const { data, error } = await service
    .from("rubrica_contatti")
    .insert({
      nome: d.nome,
      cognome: d.cognome,
      telefono: d.telefono,
      email: d.email,
      rapporto: "referente",
      azienda_tipo: "cliente",
      azienda_id: d.clienteId,
      azienda_label: d.clienteLabel,
      mansione: REFERENTE_RICEZIONE_MERCE,
      note: noteParts.join("\n"),
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("id, nome, cognome")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione referente fallita" };
  }
  const { error: linkErr } = await service.from("clienti_referenti").insert({
    cliente_id: d.clienteId,
    contatto_id: data.id,
    created_by: gate.auth.userId,
  });
  if (linkErr && !/duplicate|unique/i.test(linkErr.message)) {
    return { success: false, error: linkErr.message };
  }
  await writeAuditLog({
    entity_type: "rubrica_contatti",
    entity_id: String(data.id),
    action: "create",
    actor_id: gate.auth.userId,
    summary: `Referente ${REFERENTE_RICEZIONE_MERCE}: ${d.nome} ${d.cognome}`,
    payload: { cliente_id: d.clienteId, campionatura: true },
  });
  return {
    success: true,
    id: String(data.id),
    destinatario,
    label: `${d.nome} ${d.cognome}`.trim(),
  };
}

const processCampionaturaSchema = z.object({
  campionaturaId: z.string().uuid(),
  lottoCodice: z.string().trim().max(80).optional().default(""),
});

/** Inserisce la campionatura in produzione: solo magazzino, mai lavorazione. */
export async function processCampionaturaInProduzioneAction(
  raw: unknown
): Promise<
  { success: true; item: Campionatura } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = processCampionaturaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("campionature")
    .select("*")
    .eq("id", parsed.data.campionaturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false, error: readErr?.message ?? "Record non trovato" };
  }
  const header = row as CampionaturaRow;
  if (header.stato !== "inserita" && header.stato !== "bozza") {
    return {
      success: false,
      error: "Questa campionatura è già in produzione o chiusa.",
    };
  }
  const { data: righeData, error: righeErr } = await supabase
    .from("campionature_righe")
    .select("*")
    .eq("campionatura_id", header.id)
    .order("sort_order", { ascending: true });
  if (righeErr) return { success: false, error: righeErr.message };
  const righe = (righeData ?? []) as CampionaturaRigaRow[];
  if (righe.length === 0) {
    return { success: false, error: "Campionatura senza righe prodotto." };
  }

  for (const r of righe) {
    if (!r.prodotto_id) {
      return { success: false, error: `Riga senza prodotto: ${r.prodotto_nome}` };
    }
    const stock = await getGiacenzaProdottoAction(r.prodotto_id);
    if (!stock.success) return { success: false, error: stock.error };
    const richiesta = quantitaRichiestaInBaseKg(
      Number(r.quantita),
      r.unita_misura
    );
    if (!giacenzaCopreRichiesta(stock.quantitaKg, richiesta)) {
      const need = richiesta ?? Number(r.quantita);
      return {
        success: false,
        error: `${r.prodotto_codice}: ${messaggioGiacenzaInsufficiente(stock.quantitaKg, need)}`,
      };
    }
  }

  const now = new Date().toISOString();
  const lottiPerRiga: Array<{
    rigaId: string;
    lottoCodice: string;
    payload: Record<string, unknown>;
  }> = [];
  for (const r of righe) {
    if (!r.prodotto_id) continue;
    const richiesta =
      quantitaRichiestaInBaseKg(Number(r.quantita), r.unita_misura) ??
      Number(r.quantita);
    const assegnato = await assegnaLottoProduzioneDaMagazzino({
      prodottoId: r.prodotto_id,
      richiestaKg: richiesta,
      prodottoNome: `${r.prodotto_codice} — ${r.prodotto_nome}`,
      userId: gate.auth.userId,
      persist: true,
    });
    if (!assegnato.success) return assegnato;
    lottiPerRiga.push({
      rigaId: r.id,
      lottoCodice: assegnato.anteprima.lottoCodice,
      payload: {
        mode: assegnato.anteprima.mode,
        lotto_esterno_id: assegnato.anteprima.lottoEsternoId,
        lotti_interni: assegnato.anteprima.lottiInterni,
        messaggio: assegnato.anteprima.messaggio,
      },
    });
  }
  const lotto =
    lottiPerRiga[0]?.lottoCodice ?? parsed.data.lottoCodice.trim();

  const { error: updErr } = await supabase
    .from("campionature")
    .update({
      stato: "processata",
      versione: header.versione + 1,
      updated_by: gate.auth.userId,
    })
    .eq("id", header.id)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  for (const item of lottiPerRiga) {
    const { error: lottoErr } = await supabase
      .from("campionature_righe")
      .update({
        lotto_codice: item.lottoCodice,
        updated_at: now,
        updated_by: gate.auth.userId,
      })
      .eq("id", item.rigaId);
    if (lottoErr) return { success: false, error: lottoErr.message };
  }

  await writeAuditLog({
    entity_type: "campionature",
    entity_id: header.id,
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Inserita in produzione ${header.numero_interno} (solo magazzino)`,
    payload: {
      stato_da: header.stato,
      stato_a: "processata",
      approvvigionamento: "magazzino",
      lotto_codice: lotto || null,
      lotti_prelievo: lottiPerRiga.map((l) => ({
        riga_id: l.rigaId,
        lotto_codice: l.lottoCodice,
        ...l.payload,
      })),
    },
  });

  const { data: fresh } = await supabase
    .from("campionature")
    .select("*")
    .eq("id", header.id)
    .maybeSingle();
  const { data: freshRighe } = await supabase
    .from("campionature_righe")
    .select("*")
    .eq("campionatura_id", header.id)
    .order("sort_order", { ascending: true });
  if (!fresh) {
    return { success: false, error: "Processata ma non leggibile." };
  }
  return {
    success: true,
    item: mapCampionatura(
      fresh as CampionaturaRow,
      (freshRighe ?? []) as CampionaturaRigaRow[]
    ),
  };
}

/** Passa la campionatura in Scaletta Produzione (ISO 9001 §8.5.2). */
export async function passaCampionaturaInScalettaAction(
  raw: unknown
): Promise<
  { success: true; item: Campionatura } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = passaCampionaturaScalettaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati scaletta non validi.",
    };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("campionature")
    .select("*")
    .eq("id", d.campionaturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false, error: readErr?.message ?? "Record non trovato." };
  }
  const header = row as CampionaturaRow;
  if (header.stato !== "inserita" && header.stato !== "bozza") {
    return {
      success: false,
      error: "Questa campionatura è già in scaletta o chiusa.",
    };
  }
  const { data: righeData, error: righeErr } = await supabase
    .from("campionature_righe")
    .select("*")
    .eq("campionatura_id", header.id)
    .order("sort_order", { ascending: true });
  if (righeErr) return { success: false, error: righeErr.message };
  const righe = (righeData ?? []) as CampionaturaRigaRow[];
  if (righe.length === 0) {
    return { success: false, error: "Campionatura senza righe prodotto." };
  }
  for (const r of righe) {
    const scelta = d.righe.find((x) => x.rigaId === r.id);
    if (!scelta) {
      return {
        success: false,
        error: `Manca il lotto per ${r.prodotto_codice}.`,
      };
    }
    if (!scelta.conforme && !scelta.processoId) {
      return {
        success: false,
        error: `Indica il processo di trasformazione per ${r.prodotto_codice}.`,
      };
    }
  }

  const now = new Date().toISOString();
  const snapshot = {
    data_lavorazione: d.dataLavorazione,
    data_confezionamento: d.dataConfezionamento,
    righe: d.righe,
    pack: d.pack ?? {},
    sede_partenza_id: d.sedePartenzaId ?? header.sede_partenza_id ?? null,
  };

  const { error: updErr } = await supabase
    .from("campionature")
    .update({
      stato: "processata",
      documento_stato: "approvato",
      data_lavorazione: d.dataLavorazione,
      data_confezionamento: d.dataConfezionamento,
      sede_partenza_id: d.sedePartenzaId ?? header.sede_partenza_id ?? null,
      produzione_snapshot: snapshot,
      approved_at: now,
      approved_by: gate.auth.userId,
      versione: header.versione + 1,
      updated_by: gate.auth.userId,
    })
    .eq("id", header.id)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  for (const scelta of d.righe) {
    const { error: lottoErr } = await supabase
      .from("campionature_righe")
      .update({
        lotto_codice: scelta.lottoInternoCodice,
        updated_at: now,
        updated_by: gate.auth.userId,
      })
      .eq("id", scelta.rigaId)
      .eq("campionatura_id", header.id);
    if (lottoErr) return { success: false, error: lottoErr.message };
  }

  await supabase
    .from("produzione_calendario_impegni")
    .update({
      deleted_at: now,
      deleted_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .eq("campionatura_id", header.id)
    .is("deleted_at", null);

  const prodotti = righe
    .map((r) => r.prodotto_codice)
    .filter(Boolean)
    .join(", ");
  const rowsImpegno: Array<{
    data_giorno: string;
    ordine_id: null;
    campionatura_id: string;
    linea_codice: null;
    etichetta: string;
    note: string;
    created_by: string;
    updated_by: string;
  }> = [
    {
      data_giorno: d.dataLavorazione,
      ordine_id: null,
      campionatura_id: header.id,
      linea_codice: null,
      etichetta: `${header.numero_interno} · ${prodotti} · lavorazione`,
      note: "lavorazione",
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    },
  ];
  if (d.dataConfezionamento) {
    rowsImpegno.push({
      data_giorno: d.dataConfezionamento,
      ordine_id: null,
      campionatura_id: header.id,
      linea_codice: null,
      etichetta: `${header.numero_interno} · ${prodotti} · confezionamento`,
      note: "confezionamento",
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    });
  }
  for (const scelta of d.righe) {
    if (scelta.conforme || !scelta.processoId) continue;
    rowsImpegno.push({
      data_giorno: d.dataLavorazione,
      ordine_id: null,
      campionatura_id: header.id,
      linea_codice: null,
      etichetta: `${header.numero_interno} · ${scelta.processoCodice || "trasformazione"}`,
      note: `trasformazione:${scelta.processoCodice || scelta.processoId}`,
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    });
  }

  const { error: impErr } = await supabase
    .from("produzione_calendario_impegni")
    .insert(rowsImpegno);
  if (impErr) {
    return {
      success: false,
      error: `Processata ma calendario: ${impErr.message}`,
    };
  }

  const scheda = await ensureSchedaOrdine(supabase, {
    campionaturaId: header.id,
    numero: header.numero_interno,
    cliente: header.cliente_ragione_sociale ?? "",
    prodotto: prodotti,
    userId: gate.auth.userId,
  });
  await syncSchedaOrdineAziendaNota({
    userId: gate.auth.userId,
    campionaturaId: header.id,
    numero: header.numero_interno,
    clienteLabel: header.cliente_ragione_sociale ?? "",
    prodotto: prodotti,
    stato: "processata",
    fromCampionaturaTable: true,
    clienteId: header.cliente_id,
    possibileClienteId: header.cliente_possibile_id,
  });
  if (scheda) {
    await appendSchedaTimeline(supabase, {
      schedaId: scheda.id,
      eventoTipo: "scaletta",
      titolo: `Passata in scaletta · ${header.numero_interno}`,
      dettaglio: `Lavorazione ${d.dataLavorazione}${
        d.dataConfezionamento ? ` · confezionamento ${d.dataConfezionamento}` : ""
      }`,
      actorId: gate.auth.userId,
    });
  }

  await writeAuditLog({
    entity_type: "campionature",
    entity_id: header.id,
    action: "ordine_inserisci_scaletta",
    actor_id: gate.auth.userId,
    summary: `Scaletta produzione per ${header.numero_interno}`,
    payload: {
      stato_da: header.stato,
      stato_a: "processata",
      data_lavorazione: d.dataLavorazione,
      data_confezionamento: d.dataConfezionamento,
      lotti: d.righe.map((r) => ({
        riga_id: r.rigaId,
        lotto: r.lottoInternoCodice,
        processo_id: r.processoId ?? null,
      })),
    },
  });

  const { data: fresh } = await supabase
    .from("campionature")
    .select("*")
    .eq("id", header.id)
    .maybeSingle();
  const { data: freshRighe } = await supabase
    .from("campionature_righe")
    .select("*")
    .eq("campionatura_id", header.id)
    .order("sort_order", { ascending: true });
  if (!fresh) {
    return { success: false, error: "In scaletta ma non leggibile." };
  }
  return {
    success: true,
    item: mapCampionatura(
      fresh as CampionaturaRow,
      (freshRighe ?? []) as CampionaturaRigaRow[]
    ),
  };
}
