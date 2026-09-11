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
  type CampionaturaRiga,
} from "@/lib/amministrazione/campionature";
import { getGiacenzaProdottoAction } from "@/app/actions/produzione-capacita";
import {
  giacenzaCopreRichiesta,
  messaggioGiacenzaInsufficiente,
  quantitaRichiestaInBaseKg,
} from "@/lib/amministrazione/approvvigionamento";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
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
    cliente: row.cliente_ragione_sociale,
    clienteCodiceTarga: row.cliente_codice_targa,
    dataInvio: row.data_invio,
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
  const { data, error } = await supabase
    .from("campionature")
    .select("*")
    .is("deleted_at", null)
    .order("data_invio", { ascending: false })
    .limit(200);
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
  const parsed = createCampionaturaSchema.safeParse({
    ...(raw && typeof raw === "object" ? raw : {}),
    clienteId: resolved.cliente.id,
    cliente: resolved.cliente.ragioneSociale,
    codiceTargaCliente: resolved.cliente.codiceTarga,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const input = parsed.data;
  const now = new Date().toISOString();
  const seqRes = await nextSeq(input.codiceTargaCliente);
  if (!seqRes.ok) return { success: false, error: seqRes.error };
  const seq = seqRes.seq;
  const numero = formatNumeroCampionatura(
    input.dataInvio,
    input.codiceTargaCliente,
    seq
  );

  const supabase = await createClient();
  let notaTitolo = "";
  if (input.pnNotaId) {
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
    if (notaSuLead) {
      await supabase
        .from("pn_note")
        .update({
          entity_type: "cliente",
          entity_id: input.clienteId,
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
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente,
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_invio: input.dataInvio,
      mezzo: input.mezzo,
      pn_nota_id: input.pnNotaId,
      webmail_messaggio_id: input.webmailMessaggioId || null,
      spedizione_tipo: input.spedizioneTipo,
      spedizione_privato: input.spedizionePrivato,
      referente_ricezione_id: input.referenteRicezioneId || null,
      destinatario: input.destinatario || input.cliente,
      indirizzo_spedizione: input.indirizzoSpedizione,
      note: input.note,
      stato: "inserita",
      documento_stato: "approvato",
      versione: 1,
      approved_at: now,
      approved_by: gate.auth.userId,
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

  if (input.pnNotaId) {
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

  await writeAuditLog({
    entity_type: "campionature",
    entity_id: header.id,
    action: "create",
    actor_id: gate.auth.userId,
    summary: `Campionatura ${numero} inserita per ${input.cliente}`,
    payload: {
      numero_interno: numero,
      cliente_id: input.clienteId,
      mezzo: input.mezzo,
      pn_nota_id: input.pnNotaId,
      webmail_messaggio_id: input.webmailMessaggioId,
      lotti: input.righe.map((r) => r.lottoCodice),
    },
  });
  if (input.pnNotaId) {
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
  const lotto = parsed.data.lottoCodice.trim();
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

  if (lotto && righe[0]?.id) {
    const { error: lottoErr } = await supabase
      .from("campionature_righe")
      .update({
        lotto_codice: lotto,
        updated_at: now,
        updated_by: gate.auth.userId,
      })
      .eq("id", righe[0].id);
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
