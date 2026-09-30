"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  PREVENTIVI_SESSIONE_PROVA,
  PREVENTIVI_SESSIONE_PROVA_MSG,
} from "@/lib/amministrazione/preventivo-sessione";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  assertWebmailAccountAccess,
  resolveWebmailAccountVisibility,
} from "@/lib/webmail/account-access";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import {
  AGRINSICILIA_LETTERHEAD,
  AGRINSICILIA_MAIL_FIRMA,
} from "@/lib/amministrazione/preventivo-letterhead";
import { sendMailViaAccount } from "@/lib/webmail/sync";
import {
  CONFEZIONE_STANDARD,
  createPreventivoSchema,
  formatNumeroPreventivo,
  nomeFilePreventivoPdf,
  stimaSpedizioneSchema,
  type Preventivo,
  type PreventivoConfezioneOption,
  type PreventivoRiga,
  type PreventivoScontisticaRiga,
  type PreventivoStato,
} from "@/lib/amministrazione/preventivi";
import {
  fonteDefaultDaConsegna,
  stimaSpedizionePreventivo,
  type StimaSpedizioneResult,
} from "@/lib/amministrazione/preventivo-spedizione";
import {
  mapListinoRigaCondizione,
  previewScontoListino,
} from "@/lib/ecosystem/listini";
import {
  imballaggiPerCondizioneListino,
  mapImballaggioVoceRow,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import type {
  ImballaggioVoceProdottoRow,
  ImballaggioVoceRow,
  ListinoRigaCondizioneRow,
} from "@/types/database";
import {
  loadPreventivoCommercialiRiferimento,
  resolvePreventivoCommercialeRiferimento,
  type PreventivoCommercialeRiferimento,
} from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  coordinateBancarieFallback,
  formatNumeroPreventivoDocumento,
  yearFromPreventivoData,
  type CoordinateBancarieAgrinsicilia,
} from "@/lib/amministrazione/preventivo-letterhead";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { queryListinoVoceVigente } from "@/lib/ecosystem/listino-vigente-query";
import {
  LISTINO_CONTRATTO_MSG,
  valutaListinoPerContratto,
} from "@/lib/ecosystem/listino-vigente";
import type { ListinoDisponibilita } from "@/lib/ecosystem/listini";
import type { PreventivoRigaRow, PreventivoRow } from "@/types/database";
import {
  colonneSuddivisione,
  preparaSuddivisione,
  registraFirmaSuddivisione,
} from "@/lib/amministrazione/sconto-suddivisione-server";

async function righeConSuddivisione<T extends {
  scontoExtraPct?: number;
  scontoSuddivisioneAttiva?: boolean;
  scontoQuotaAziendaPct?: number;
  scontoQuotaCommercialePct?: number;
}>(input: {
  actorId: string;
  clienteId: string | null;
  righe: T[];
}): Promise<
  | { ok: true; righe: Array<{ riga: T; colonne: ReturnType<typeof colonneSuddivisione>; approvata: boolean; approvatore: string | null; quotaAzienda: number; quotaCommerciale: number }> }
  | { ok: false; error: string }
> {
  const righe = [];
  for (const riga of input.righe) {
    const sud = await preparaSuddivisione({
      actorId: input.actorId,
      clienteId: input.clienteId,
      scontoPct: riga.scontoExtraPct ?? 0,
      attiva: Boolean(riga.scontoSuddivisioneAttiva),
      quotaAziendaPct: riga.scontoQuotaAziendaPct ?? 0,
      quotaCommercialePct: riga.scontoQuotaCommercialePct ?? 0,
    });
    if (!sud.ok) return sud;
    righe.push({
      riga,
      colonne: colonneSuddivisione(sud.value),
      approvata: sud.value.stato === "approvata" && sud.value.attiva,
      approvatore: sud.value.approvatore,
      quotaAzienda: sud.value.quotaAziendaPct,
      quotaCommerciale: sud.value.quotaCommercialePct,
    });
  }
  return { ok: true, righe };
}

async function firmaSuddivisioniCreate(input: {
  actorId: string;
  preparate: Extract<
    Awaited<ReturnType<typeof righeConSuddivisione>>,
    { ok: true }
  >["righe"];
  righe: Array<{ id: string; sort_order: number }>;
}): Promise<string | null> {
  for (const row of input.righe) {
    const prep = input.preparate[row.sort_order];
    if (!prep?.approvata) continue;
    const err = await registraFirmaSuddivisione({
      entityType: "preventivo_riga",
      entityId: row.id,
      ruolo: prep.approvatore === "azienda" ? "azienda" : "commerciale_senior",
      esito: "approvato",
      actorId: input.actorId,
      summary: `Suddivisione sconto già approvata in inserimento (${prep.quotaAzienda}% azienda, ${prep.quotaCommerciale}% commerciale)`,
    });
    if (err) return err;
  }
  return null;
}

async function requirePreventiviAccess() {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { ok: false as const, error: "Non autenticato" };
  }
  if (isSuperadminProfile(auth.profile)) return { ok: true as const, auth };
  const ok =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "commerciale");
  if (!ok) return { ok: false as const, error: "Permesso negato" };
  return { ok: true as const, auth };
}

function mapRiga(row: PreventivoRigaRow): PreventivoRiga {
  return {
    id: row.id,
    prodottoId: row.prodotto_id ?? "",
    prodottoCodice: row.prodotto_codice,
    prodottoNome: row.prodotto_nome,
    quantita: Number(row.quantita),
    unitaMisura: row.unita_misura,
    prezzoUnitario: Number(row.prezzo_unitario),
    ivaPercentuale: Number(row.iva_percentuale),
    listinoId: row.listino_id,
    prezzoDaListino: Boolean(row.prezzo_da_listino),
    scontoExtraPct: Number(row.sconto_extra_pct ?? 0),
    scontoQuotaAziendaPct: Number(row.sconto_quota_azienda_pct ?? 0),
    scontoQuotaCommercialePct: Number(row.sconto_quota_commerciale_pct ?? 0),
    scontoSuddivisioneAttiva: Boolean(row.sconto_suddivisione_attiva),
    scontoSuddivisioneStato:
      row.sconto_suddivisione_stato === "in_attesa" ||
      row.sconto_suddivisione_stato === "approvata" ||
      row.sconto_suddivisione_stato === "rifiutata"
        ? row.sconto_suddivisione_stato
        : "non_richiesta",
    confezionamento: row.confezionamento,
    imballaggioVoceId: row.imballaggio_voce_id ?? null,
  };
}

function mapPreventivo(
  row: PreventivoRow,
  righe: PreventivoRigaRow[],
  referenteLabel = ""
): Preventivo {
  return {
    id: row.id,
    numeroInterno: row.numero_interno,
    clienteId: row.cliente_id ?? "",
    cliente: row.cliente_ragione_sociale,
    clienteCodiceTarga: row.cliente_codice_targa,
    dataPreventivo: row.data_preventivo,
    stato: row.stato,
    documentoStato: row.documento_stato,
    versione: row.versione,
    consegnaMetodo: row.consegna_metodo,
    spedizioneACarico: row.spedizione_a_carico,
    spedizioneImporto: Number(row.spedizione_importo),
    spedizioneImportoBase: Number(row.spedizione_importo_base ?? 0),
    spedizioneMarkupPct: Number(row.spedizione_markup_pct ?? 30),
    spedizioneFonte: row.spedizione_fonte ?? "da_concordare",
    tipoPagamento: row.tipo_pagamento,
    tempiPagamentoGiorni: row.tempi_pagamento_giorni,
    tempiPagamentoNote: row.tempi_pagamento_note,
    giorniConsegna: row.giorni_consegna || "da concordare",
    validitaGiorni: Number(row.validita_giorni ?? 15),
    includeCoordinateBancarie: Boolean(row.include_coordinate_bancarie),
    coordinateBanca: row.coordinate_banca ?? "",
    coordinateIban: row.coordinate_iban ?? "",
    coordinateBic: row.coordinate_bic ?? "",
    commercialeRiferimentoId: row.commerciale_riferimento_id ?? null,
    commercialeRiferimentoNome: row.commerciale_riferimento_nome ?? "",
    commercialeRiferimentoTelefono: row.commerciale_riferimento_telefono ?? "",
    commercialeRiferimentoEmail: row.commerciale_riferimento_email ?? "",
    note: row.note,
    webmailAccettazioneId: row.webmail_accettazione_id,
    referenteAccettazioneId: row.referente_accettazione_id,
    referenteAccettazioneLabel: referenteLabel,
    righe: righe
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapRiga),
    createdAt: row.created_at,
  };
}

async function nextSeqAnno(dataPreventivo: string): Promise<number> {
  const year = yearFromPreventivoData(dataPreventivo);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("numero_interno")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const re = new RegExp(`^(\\d+)/${year}$`);
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.numero_interno).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function peekNextNumeroPreventivoAction(
  dataPreventivo: string
): Promise<
  | { success: true; seq: number; year: number; numero: string }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPreventivo)) {
    return { success: false, error: "Data obbligatoria" };
  }
  try {
    const seq = await nextSeqAnno(dataPreventivo);
    const year = yearFromPreventivoData(dataPreventivo);
    return {
      success: true,
      seq,
      year,
      numero: formatNumeroPreventivoDocumento(seq, year),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numero non disponibile",
    };
  }
}

async function attachRighe(
  ids: string[]
): Promise<Map<string, PreventivoRigaRow[]>> {
  const map = new Map<string, PreventivoRigaRow[]>();
  if (!ids.length) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("preventivi_righe")
    .select("*")
    .in("preventivo_id", ids);
  for (const r of (data ?? []) as PreventivoRigaRow[]) {
    const list = map.get(r.preventivo_id) ?? [];
    list.push(r);
    map.set(r.preventivo_id, list);
  }
  return map;
}

export async function listPreventiviAction(): Promise<
  { success: true; items: Preventivo[] } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("*")
    .is("deleted_at", null)
    .order("data_preventivo", { ascending: false })
    .limit(300);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as PreventivoRow[];
  const righe = await attachRighe(rows.map((r) => r.id));
  return {
    success: true,
    items: rows.map((r) => mapPreventivo(r, righe.get(r.id) ?? [])),
  };
}

export async function listPreventiviAccettatiAction(input: {
  clienteId: string;
  prodottoId?: string;
}): Promise<
  { success: true; items: Preventivo[] } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("*")
    .eq("cliente_id", input.clienteId)
    .eq("stato", "accettato")
    .is("deleted_at", null)
    .order("data_preventivo", { ascending: false })
    .limit(80);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as PreventivoRow[];
  const righe = await attachRighe(rows.map((r) => r.id));
  let items = rows.map((r) => mapPreventivo(r, righe.get(r.id) ?? []));
  if (input.prodottoId) {
    items = items.filter(
      (p) =>
        p.righe.length > 1 ||
        p.righe.some((r) => r.prodottoId === input.prodottoId)
    );
  }
  return { success: true, items };
}

export async function getListinoPrezzoVigenteAction(
  prodottoId: string
): Promise<
  | {
      success: true;
      prezzo: number | null;
      iva: number;
      listinoId: string | null;
      disponibilita: ListinoDisponibilita | null;
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const res = await queryListinoVoceVigente(prodottoId);
  if (res.error) return { success: false, error: res.error };
  if (!res.voce) {
    return {
      success: true,
      prezzo: null,
      iva: 22,
      listinoId: null,
      disponibilita: null,
    };
  }
  return {
    success: true,
    prezzo: res.voce.prezzo,
    iva: res.voce.iva,
    listinoId: res.voce.listinoId,
    disponibilita: res.voce.disponibilita,
  };
}

export async function createPreventivoAction(
  raw: unknown
): Promise<
  { success: true; item: Preventivo } | { success: false; error: string }
> {
  const rawRecord =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const isRichiesta = rawRecord.modalitaSpedizionePrezzo === "richiesto";
  if (PREVENTIVI_SESSIONE_PROVA && !isRichiesta) {
    return { success: false, error: PREVENTIVI_SESSIONE_PROVA_MSG };
  }
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = createPreventivoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const input = parsed.data;
  for (const r of input.righe) {
    const q = await queryListinoVoceVigente(r.prodottoId);
    if (q.error) return { success: false, error: q.error };
    const regola = valutaListinoPerContratto(q.voce);
    if (regola.esito === "fuori_produzione") {
      return {
        success: false,
        error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.fuori_produzione}`,
      };
    }
    if (regola.esito === "senza_prezzo") {
      return {
        success: false,
        error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.senza_prezzo}`,
      };
    }
  }
  const riferimento = await resolvePreventivoCommercialeRiferimento(
    input.commercialeRiferimentoId
  );
  if (!riferimento) {
    return {
      success: false,
      error: "Seleziona un commerciale o un admin di riferimento.",
    };
  }
  const intenzione = input.intenzione ?? "bozza";
  const isRichiestaPrezzo = input.modalitaSpedizionePrezzo === "richiesto";
  if (isRichiestaPrezzo && input.mailAccountId) {
    const casella = await assertWebmailAccountAccess(gate.auth, input.mailAccountId);
    if (!casella.ok) return { success: false, error: casella.error };
  }
  if (isRichiestaPrezzo) {
    const incaricati = await profiliCalcoloSpedizioni();
    if (!incaricati.length) {
      return {
        success: false,
        error:
          "Nessuna persona è assegnata a Calcolo spedizioni. Impostala in Impostazioni, Compiti e adempimenti.",
      };
    }
  }
  const stato = isRichiestaPrezzo
    ? ("in_attesa_spedizione" as const)
    : intenzione === "inviato"
      ? ("inviato" as const)
      : ("creato" as const);
  const documentoStato = isRichiestaPrezzo
    ? ("approvato" as const)
    : intenzione === "bozza"
      ? ("bozza" as const)
      : ("approvato" as const);
  const now = new Date().toISOString();
  const seq = await nextSeqAnno(input.dataPreventivo);
  const numero = formatNumeroPreventivo(
    input.dataPreventivo,
    input.codiceTargaCliente ?? "PC",
    seq
  );
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .insert({
      numero_interno: numero,
      cliente_id: input.clienteId ?? null,
      cliente_ragione_sociale: input.cliente,
      cliente_codice_targa: (input.codiceTargaCliente || "PC")
        .trim()
        .toUpperCase(),
      data_preventivo: input.dataPreventivo,
      stato,
      documento_stato: documentoStato,
      versione: 1,
      sent_at: intenzione === "inviato" ? now : null,
      sent_by: intenzione === "inviato" ? gate.auth.userId : null,
      consegna_metodo: input.consegnaMetodo,
      spedizione_a_carico: input.spedizioneACarico,
      spedizione_importo: isRichiestaPrezzo ? 0 : (input.spedizioneImporto ?? 0),
      spedizione_importo_base: input.spedizioneImportoBase ?? 0,
      spedizione_markup_pct: input.spedizioneMarkupPct ?? 30,
      spedizione_fonte:
        input.spedizioneFonte ?? fonteDefaultDaConsegna(input.consegnaMetodo),
      tipo_pagamento: input.tipoPagamento,
      tempi_pagamento_giorni: input.tempiPagamentoGiorni ?? null,
      tempi_pagamento_note: "",
      giorni_consegna: input.giorniConsegna || "da concordare",
      validita_giorni: input.validitaGiorni ?? 15,
      include_coordinate_bancarie: Boolean(input.includeCoordinateBancarie),
      coordinate_banca: input.includeCoordinateBancarie
        ? input.coordinateBanca ?? ""
        : "",
      coordinate_iban: input.includeCoordinateBancarie
        ? input.coordinateIban ?? ""
        : "",
      coordinate_bic: input.includeCoordinateBancarie
        ? input.coordinateBic ?? ""
        : "",
      commerciale_riferimento_id: riferimento.id,
      commerciale_riferimento_nome: riferimento.nome,
      commerciale_riferimento_telefono: riferimento.telefono,
      commerciale_riferimento_email: riferimento.email,
      note: input.note ?? "",
      modalita_spedizione_prezzo: input.modalitaSpedizionePrezzo,
      mail_bozza_account_id: isRichiestaPrezzo ? input.mailAccountId ?? null : null,
      mail_bozza_to: isRichiestaPrezzo ? input.mailTo : "",
      mail_bozza_oggetto: isRichiestaPrezzo ? input.mailOggetto : "",
      mail_bozza_testo: isRichiestaPrezzo ? input.mailTesto : "",
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }
  const header = data as PreventivoRow;
  const preparate = await righeConSuddivisione({
    actorId: gate.auth.userId,
    clienteId: input.clienteId ?? null,
    righe: input.righe,
  });
  if (!preparate.ok) return { success: false, error: preparate.error };
  const { data: righe, error: rErr } = await supabase
    .from("preventivi_righe")
    .insert(
      preparate.righe.map(({ riga: r, colonne }, i) => ({
        preventivo_id: header.id,
        prodotto_id: r.prodottoId,
        prodotto_codice: r.prodottoCodice,
        prodotto_nome: r.prodottoNome,
        quantita: r.quantita,
        unita_misura: r.unitaMisura ?? "kg",
        prezzo_unitario: r.prezzoUnitario,
        iva_percentuale: r.ivaPercentuale ?? 22,
        listino_id: r.listinoId ?? null,
        prezzo_da_listino: Boolean(r.prezzoDaListino),
        sconto_extra_pct: r.scontoExtraPct ?? 0,
        ...colonne,
        confezionamento: r.confezionamento ?? "",
        imballaggio_voce_id: r.imballaggioVoceId ?? null,
        sort_order: i,
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      }))
    )
    .select("*");
  if (rErr) {
    await supabase
      .from("preventivi")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: gate.auth.userId,
      })
      .eq("id", header.id);
    return { success: false, error: rErr.message };
  }
  const firmaErr = await firmaSuddivisioniCreate({
    actorId: gate.auth.userId,
    preparate: preparate.righe,
    righe: (righe ?? []) as Array<{ id: string; sort_order: number }>,
  });
  if (firmaErr) return { success: false, error: firmaErr };
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: header.id,
    action: "create",
    actor_id: gate.auth.userId,
    summary: isRichiestaPrezzo
      ? `Preventivo ${numero} in attesa del calcolo spedizione`
      : `Preventivo ${numero} creato per ${input.cliente}`,
    payload: {
      cliente_id: input.clienteId ?? null,
      cliente_possibile_id: input.clientePossibileId ?? null,
      numero_interno: numero,
      intenzione,
      commerciale_riferimento_id: riferimento.id,
      commerciale_riferimento_nome: riferimento.nome,
    },
  });
  if (isRichiestaPrezzo) {
    const incaricati = await profiliCalcoloSpedizioni();
    await dispatchNotifiche({
      actorId: gate.auth.userId,
      includeActor: true,
      recipientIds: incaricati,
      tipo: "attivita",
      title: "Calcolo spedizione urgente",
      body: `Preventivo ${numero} per ${input.cliente}: inserisci il prezzo di spedizione e completa l'invio. La mail è già compilata.`,
      href: "/app/amministrazione/ordini/preventivi",
      entityType: "preventivi",
      entityId: header.id,
      payload: { priorita: "urgente", compito: "calcolo_spedizioni" },
    });
  }
  return {
    success: true,
    item: mapPreventivo(header, (righe ?? []) as PreventivoRigaRow[]),
  };
}

export async function savePreventivoAction(
  raw: unknown
): Promise<
  { success: true; item: Preventivo } | { success: false; error: string }
> {
  if (PREVENTIVI_SESSIONE_PROVA) {
    return { success: false, error: PREVENTIVI_SESSIONE_PROVA_MSG };
  }
  const parsed = createPreventivoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  if (!parsed.data.id) {
    return createPreventivoAction(raw);
  }
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const input = parsed.data;
  for (const r of input.righe) {
    const q = await queryListinoVoceVigente(r.prodottoId);
    if (q.error) return { success: false, error: q.error };
    const regola = valutaListinoPerContratto(q.voce);
    if (regola.esito === "fuori_produzione") {
      return {
        success: false,
        error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.fuori_produzione}`,
      };
    }
    if (regola.esito === "senza_prezzo") {
      return {
        success: false,
        error: `${r.prodottoCodice}: ${LISTINO_CONTRATTO_MSG.senza_prezzo}`,
      };
    }
  }
  const riferimento = await resolvePreventivoCommercialeRiferimento(
    input.commercialeRiferimentoId
  );
  if (!riferimento) {
    return {
      success: false,
      error: "Seleziona un commerciale o un admin di riferimento.",
    };
  }
  const intenzione = input.intenzione ?? "bozza";
  const stato =
    intenzione === "inviato" ? ("inviato" as const) : ("creato" as const);
  const documentoStato =
    intenzione === "bozza" ? ("bozza" as const) : ("approvato" as const);
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data: prev, error: prevErr } = await supabase
    .from("preventivi")
    .select("*")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (prevErr || !prev) {
    return { success: false, error: prevErr?.message ?? "Preventivo non trovato" };
  }
  const current = prev as PreventivoRow;
  const nextVersione =
    intenzione !== "bozza" && current.documento_stato === "bozza"
      ? Math.max(1, current.versione)
      : current.versione;
  const patch: Record<string, unknown> = {
    cliente_id: input.clienteId ?? null,
    cliente_ragione_sociale: input.cliente,
    cliente_codice_targa: (input.codiceTargaCliente || "PC")
      .trim()
      .toUpperCase(),
    data_preventivo: input.dataPreventivo,
    stato,
    documento_stato: documentoStato,
    versione: nextVersione,
    consegna_metodo: input.consegnaMetodo,
    spedizione_a_carico: input.spedizioneACarico,
    spedizione_importo: input.spedizioneImporto ?? 0,
    spedizione_importo_base: input.spedizioneImportoBase ?? 0,
    spedizione_markup_pct: input.spedizioneMarkupPct ?? 30,
    spedizione_fonte:
      input.spedizioneFonte ?? fonteDefaultDaConsegna(input.consegnaMetodo),
    tipo_pagamento: input.tipoPagamento,
    giorni_consegna: input.giorniConsegna || "da concordare",
    validita_giorni: input.validitaGiorni ?? 15,
    include_coordinate_bancarie: Boolean(input.includeCoordinateBancarie),
    coordinate_banca: input.includeCoordinateBancarie
      ? input.coordinateBanca ?? ""
      : "",
    coordinate_iban: input.includeCoordinateBancarie
      ? input.coordinateIban ?? ""
      : "",
    coordinate_bic: input.includeCoordinateBancarie
      ? input.coordinateBic ?? ""
      : "",
    commerciale_riferimento_id: riferimento.id,
    commerciale_riferimento_nome: riferimento.nome,
    commerciale_riferimento_telefono: riferimento.telefono,
    commerciale_riferimento_email: riferimento.email,
    note: input.note ?? "",
    updated_by: gate.auth.userId,
  };
  if (intenzione === "inviato") {
    patch.sent_at = current.sent_at ?? now;
    patch.sent_by = current.sent_by ?? gate.auth.userId;
  }
  const { data, error } = await supabase
    .from("preventivi")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const header = data as PreventivoRow;
  const preparate = await righeConSuddivisione({
    actorId: gate.auth.userId,
    clienteId: input.clienteId ?? null,
    righe: input.righe,
  });
  if (!preparate.ok) return { success: false, error: preparate.error };
  await supabase.from("preventivi_righe").delete().eq("preventivo_id", header.id);
  const { data: righe, error: rErr } = await supabase
    .from("preventivi_righe")
    .insert(
      preparate.righe.map(({ riga: r, colonne }, i) => ({
        preventivo_id: header.id,
        prodotto_id: r.prodottoId,
        prodotto_codice: r.prodottoCodice,
        prodotto_nome: r.prodottoNome,
        quantita: r.quantita,
        unita_misura: r.unitaMisura ?? "kg",
        prezzo_unitario: r.prezzoUnitario,
        iva_percentuale: r.ivaPercentuale ?? 22,
        listino_id: r.listinoId ?? null,
        prezzo_da_listino: Boolean(r.prezzoDaListino),
        sconto_extra_pct: r.scontoExtraPct ?? 0,
        ...colonne,
        confezionamento: r.confezionamento ?? "",
        imballaggio_voce_id: r.imballaggioVoceId ?? null,
        sort_order: i,
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      }))
    )
    .select("*");
  if (rErr) {
    return { success: false, error: rErr.message };
  }
  const firmaErr = await firmaSuddivisioniCreate({
    actorId: gate.auth.userId,
    preparate: preparate.righe,
    righe: (righe ?? []) as Array<{ id: string; sort_order: number }>,
  });
  if (firmaErr) return { success: false, error: firmaErr };
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: header.id,
    action: "update",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${header.numero_interno} aggiornato (${intenzione})`,
    payload: { intenzione, versione: nextVersione },
  });
  return {
    success: true,
    item: mapPreventivo(header, (righe ?? []) as PreventivoRigaRow[]),
  };
}

export async function setPreventivoStatoAction(input: {
  id: string;
  stato: PreventivoStato;
}): Promise<
  { success: true; item: Preventivo } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const now = new Date().toISOString();
  const documentoStato =
    input.stato === "creato"
      ? "bozza"
      : input.stato === "inviato"
        ? "approvato"
        : "chiuso";
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    stato: input.stato,
    documento_stato: documentoStato,
    updated_by: gate.auth.userId,
  };
  if (input.stato === "inviato") {
    patch.sent_at = now;
    patch.sent_by = gate.auth.userId;
  }
  if (input.stato === "accettato") {
    patch.accepted_at = now;
    patch.accepted_by = gate.auth.userId;
  }
  const { data, error } = await supabase
    .from("preventivi")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const header = data as PreventivoRow;
  const righe = await attachRighe([header.id]);
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: header.id,
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${header.numero_interno} → ${input.stato}`,
  });
  return {
    success: true,
    item: mapPreventivo(header, righe.get(header.id) ?? []),
  };
}

export async function getPreventivoProdottoContestoAction(
  prodottoId: string
): Promise<
  | {
      success: true;
      prezzo: number | null;
      iva: number;
      listinoId: string | null;
      disponibilita: ListinoDisponibilita | null;
      unitaMisura: string;
      condizioni: PreventivoScontisticaRiga[];
      confezioni: PreventivoConfezioneOption[];
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!prodottoId) {
    return { success: false, error: "Seleziona un prodotto" };
  }
  const voceRes = await queryListinoVoceVigente(prodottoId);
  if (voceRes.error) return { success: false, error: voceRes.error };
  const voce = voceRes.voce;
  const supabase = await createClient();

  let condizioni: PreventivoScontisticaRiga[] = [];
  let standardImballaggioId: string | null = null;
  if (voce) {
    const { data: riga } = await supabase
      .from("listini_righe")
      .select("id, unita_misura")
      .eq("listino_id", voce.listinoId)
      .eq("prodotto_id", prodottoId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const rigaId = (riga as { id?: string } | null)?.id;
    const umRiga =
      (riga as { unita_misura?: string } | null)?.unita_misura === "lt"
        ? "lt"
        : voce.unitaMisura;
    if (rigaId) {
      const { data: condRows } = await supabase
        .from("listini_righe_condizioni")
        .select("*")
        .eq("listino_riga_id", rigaId)
        .is("deleted_at", null)
        .order("qty_da", { ascending: true });
      const rows = (condRows ?? []) as ListinoRigaCondizioneRow[];
      const imbIds = [...new Set(rows.map((r) => r.imballaggio_voce_id))];
      const imbMap = new Map<
        string,
        { codice: string; nome: string; nomeCommerciale: string }
      >();
      if (imbIds.length) {
        const { data: vs } = await supabase
          .from("imballaggi_voci")
          .select("id, codice, nome, nome_commerciale")
          .in("id", imbIds);
        for (const v of vs ?? []) {
          const row = v as {
            id: string;
            codice: string;
            nome: string;
            nome_commerciale?: string;
          };
          imbMap.set(row.id, {
            codice: row.codice,
            nome: row.nome,
            nomeCommerciale: row.nome_commerciale ?? "",
          });
        }
      }
      condizioni = rows.map((row) => {
        const mapped = mapListinoRigaCondizione(row, imbMap.get(row.imballaggio_voce_id));
        const label = (
          mapped.imballaggioNomeCommerciale ||
          mapped.imballaggioNome ||
          mapped.imballaggioCodice ||
          "Confezione"
        ).trim();
        if (
          !standardImballaggioId &&
          mapped.kgStandard != null &&
          !mapped.kgForzato
        ) {
          standardImballaggioId = mapped.imballaggioVoceId;
        }
        return {
          id: mapped.id,
          qtyDa: mapped.qtyDa,
          qtyA: mapped.qtyA,
          imballaggioVoceId: mapped.imballaggioVoceId,
          imballaggioLabel: label,
          scontoPct: mapped.scontoPct,
          kgConfezione: mapped.kgConfezione,
          kgStandard: mapped.kgStandard,
          kgForzato: mapped.kgForzato,
          targa: mapped.targa,
          imballaggioCodice: mapped.imballaggioCodice ?? "",
          imballaggioNome: mapped.imballaggioNome ?? "",
          preview: previewScontoListino({
            prezzo: voce.prezzo,
            scontoPct: mapped.scontoPct,
            qtyDa: mapped.qtyDa,
            qtyA: mapped.qtyA,
            unitaMisura: umRiga === "lt" ? "lt" : "kg",
          }),
        };
      });
    }
  }

  const { data: linkRows } = await supabase
    .from("imballaggi_voci_prodotti")
    .select("voce_id")
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null);
  const voceIds = [
    ...new Set(
      ((linkRows ?? []) as Pick<ImballaggioVoceProdottoRow, "voce_id">[]).map(
        (r) => r.voce_id
      )
    ),
  ];
  const extraConfezioni: PreventivoConfezioneOption[] = [];
  if (voceIds.length) {
    const { data: vociRows } = await supabase
      .from("imballaggi_voci")
      .select("*")
      .in("id", voceIds)
      .is("deleted_at", null);
    const mapped = imballaggiPerCondizioneListino(
      ((vociRows ?? []) as ImballaggioVoceRow[]).map((r) =>
        mapImballaggioVoceRow(r, [])
      )
    );
    for (const v of mapped) {
      extraConfezioni.push({
        value: v.id,
        label: (v.nomeCommerciale || v.nome || v.codice).trim(),
        isStandard: false,
        imballaggioVoceId: v.id,
      });
    }
  }

  const seen = new Set<string>([CONFEZIONE_STANDARD]);
  const confezioni: PreventivoConfezioneOption[] = [
    {
      value: CONFEZIONE_STANDARD,
      label: "Standard",
      isStandard: true,
      imballaggioVoceId: standardImballaggioId,
    },
  ];
  for (const c of condizioni) {
    if (!c.imballaggioVoceId || seen.has(c.imballaggioVoceId)) continue;
    seen.add(c.imballaggioVoceId);
    confezioni.push({
      value: c.imballaggioVoceId,
      label: c.imballaggioLabel,
      isStandard: false,
      imballaggioVoceId: c.imballaggioVoceId,
    });
  }
  for (const extra of extraConfezioni) {
    if (seen.has(extra.value)) continue;
    seen.add(extra.value);
    confezioni.push(extra);
  }

  return {
    success: true,
    prezzo: voce?.prezzo ?? null,
    iva: voce?.iva ?? 22,
    listinoId: voce?.listinoId ?? null,
    disponibilita: voce?.disponibilita ?? null,
    unitaMisura: voce?.unitaMisura ?? "kg",
    condizioni,
    confezioni,
  };
}

export async function stimaSpedizionePreventivoAction(
  raw: unknown
): Promise<
  | { success: true; stima: StimaSpedizioneResult }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = stimaSpedizioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati stima non validi",
    };
  }
  return { success: true, stima: stimaSpedizionePreventivo(parsed.data) };
}

export async function getCoordinateBancarieAgrinsiciliaAction(): Promise<
  | { success: true; item: CoordinateBancarieAgrinsicilia }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  return { success: true, item: coordinateBancarieFallback() };
}

export async function listPreventivoCommercialiRiferimentoAction(): Promise<
  | {
      success: true;
      items: PreventivoCommercialeRiferimento[];
      defaultItem: PreventivoCommercialeRiferimento | null;
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  try {
    const items = await loadPreventivoCommercialiRiferimento();
    const defaultItem =
      items.find((item) => item.id === gate.auth.userId) ?? null;
    return { success: true, items, defaultItem };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Elenco non disponibile",
    };
  }
}

export async function contestoSpedizionePreventivoAction(
  preventivoId: string
): Promise<
  | {
      success: true;
      azienda: string;
      indirizzo: string;
      destinatario: {
        ragioneSociale: string;
        partitaIva: string;
        codiceFiscale: string;
        via: string;
        capCitta: string;
      };
    }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const incaricati = await profiliCalcoloSpedizioni();
  if (!isSuperadminProfile(auth.profile) && !incaricati.includes(auth.userId)) {
    return { success: false, error: "Solo chi è assegnato a Calcolo spedizioni può aprire la scheda." };
  }
  const service = createServiceClient();
  const { data: prev, error } = await service
    .from("preventivi")
    .select("cliente_id, cliente_ragione_sociale")
    .eq("id", preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !prev) {
    return { success: false, error: error?.message ?? "Preventivo non trovato." };
  }
  const aziendaPreventivo = String(prev.cliente_ragione_sociale ?? "").trim();
  const clienteId = prev.cliente_id ? String(prev.cliente_id) : "";
  const vuoto = destinatarioScheda(aziendaPreventivo);
  if (!clienteId) {
    return {
      success: true,
      azienda: aziendaPreventivo,
      indirizzo: "Indirizzo non indicato in anagrafica.",
      destinatario: vuoto,
    };
  }
  const { data: cliente, error: cErr } = await service
    .from("clienti")
    .select(
      "ragione_sociale, partita_iva, codice_fiscale, sede_amm_indirizzo, sede_amm_cap, sede_amm_citta, sede_amm_provincia, sede_amm_nazione, sede_mag_indirizzo, sede_mag_cap, sede_mag_citta, sede_mag_provincia, sede_mag_nazione, consegne_altra_azienda"
    )
    .eq("id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cErr || !cliente) {
    return {
      success: true,
      azienda: aziendaPreventivo,
      indirizzo: "Indirizzo non indicato in anagrafica.",
      destinatario: vuoto,
    };
  }
  const destinatario = destinatarioScheda(
    aziendaPreventivo || String(cliente.ragione_sociale ?? ""),
    String(cliente.partita_iva ?? ""),
    String(cliente.codice_fiscale ?? ""),
    {
      indirizzo: cliente.sede_amm_indirizzo,
      cap: cliente.sede_amm_cap,
      citta: cliente.sede_amm_citta,
      provincia: cliente.sede_amm_provincia,
    }
  );
  const altra = Array.isArray(cliente.consegne_altra_azienda)
    ? (cliente.consegne_altra_azienda as Array<Record<string, unknown>>)[0]
    : null;
  const altraNome = String(altra?.ragione_sociale ?? "").trim();
  const altraIndirizzo = altra ? rigaIndirizzoSpedizione(altra) : "";
  if (altraNome && altraIndirizzo) {
    return { success: true, azienda: altraNome, indirizzo: altraIndirizzo, destinatario };
  }
  const mag = rigaIndirizzoSpedizione({
    indirizzo: cliente.sede_mag_indirizzo,
    cap: cliente.sede_mag_cap,
    citta: cliente.sede_mag_citta,
    provincia: cliente.sede_mag_provincia,
    nazione: cliente.sede_mag_nazione,
  });
  const amm = rigaIndirizzoSpedizione({
    indirizzo: cliente.sede_amm_indirizzo,
    cap: cliente.sede_amm_cap,
    citta: cliente.sede_amm_citta,
    provincia: cliente.sede_amm_provincia,
    nazione: cliente.sede_amm_nazione,
  });
  return {
    success: true,
    azienda: aziendaPreventivo || String(cliente.ragione_sociale ?? ""),
    indirizzo: mag || amm || "Indirizzo non indicato in anagrafica.",
    destinatario,
  };
}

function destinatarioScheda(
  nome: string,
  partitaIva = "",
  codiceFiscale = "",
  sede?: {
    indirizzo?: unknown;
    cap?: unknown;
    citta?: unknown;
    provincia?: unknown;
  }
) {
  const via = String(sede?.indirizzo ?? "").trim();
  const citta = String(sede?.citta ?? "").trim().toUpperCase();
  const prov = String(sede?.provincia ?? "").trim().toUpperCase();
  const loc = citta && prov ? `${citta} (${prov})` : citta || prov;
  const capCitta = [String(sede?.cap ?? "").trim(), loc].filter(Boolean).join(" ");
  return {
    ragioneSociale: nome,
    partitaIva: partitaIva.trim(),
    codiceFiscale: codiceFiscale.trim(),
    via,
    capCitta,
  };
}

function rigaIndirizzoSpedizione(sede: Record<string, unknown>): string {
  return ["indirizzo", "cap", "citta", "provincia", "nazione"]
    .map((key) => String(sede[key] ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export async function listCasellePreventivoMailAction(): Promise<
  | { success: true; accounts: Array<{ id: string; label: string; email: string }> }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const vis = await resolveWebmailAccountVisibility(gate.auth);
  if (vis.mode === "granted" && vis.ids.length === 0) {
    return { success: true, accounts: [] };
  }
  const service = createServiceClient();
  let query = service
    .from("webmail_accounts")
    .select("id, label, email_address")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (vis.mode === "granted") query = query.in("id", vis.ids);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: ((data ?? []) as Array<{
      id: string;
      label: string;
      email_address: string;
    }>).map((a) => ({
      id: a.id,
      label: a.label || a.email_address,
      email: a.email_address,
    })),
  };
}

async function profiliCalcoloSpedizioni(): Promise<string[]> {
  const supabase = await createClient();
  const { data: compito } = await supabase
    .from("compiti_adempimenti")
    .select("id")
    .eq("codice", "calcolo_spedizioni")
    .eq("attivo", true)
    .is("deleted_at", null)
    .maybeSingle();
  const compitoId = (compito as { id?: string } | null)?.id;
  if (!compitoId) return [];
  const { data: persone } = await supabase
    .from("compiti_adempimenti_persone")
    .select("profile_id")
    .eq("compito_id", compitoId)
    .is("deleted_at", null);
  return [
    ...new Set(
      ((persone ?? []) as Array<{ profile_id: string }>).map((p) => p.profile_id)
    ),
  ];
}

function testoMailPreventivoConFirma(testo: string): string {
  return `${testo.trim()}\n\n${AGRINSICILIA_MAIL_FIRMA}`;
}

function escapeHtmlMail(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function htmlMailPreventivoConFirma(testo: string): string {
  const corpo = escapeHtmlMail(testo.trim());
  const firma = escapeHtmlMail(AGRINSICILIA_MAIL_FIRMA);
  const logo = `${getPublicAppUrl()}${AGRINSICILIA_LETTERHEAD.logoSrc}`;
  return `<div style="font-family:sans-serif;font-size:14px;color:#111827">${corpo}<br><br><img src="${logo}" alt="${AGRINSICILIA_LETTERHEAD.logoAlt}" width="160" style="display:block;margin:0 0 8px" /><div style="font-size:12px;line-height:1.45">${firma}</div></div>`;
}

function bufferPdfPreventivo(raw: string): Buffer | null {
  const cleaned = raw.replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  if (!cleaned || cleaned.length > 8_000_000) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return null;
  const buf = Buffer.from(cleaned, "base64");
  if (buf.length < 200 || buf.length > 6_000_000) return null;
  if (buf.subarray(0, 5).toString("utf8") !== "%PDF-") return null;
  return buf;
}

export async function completaCalcoloSpedizionePreventivoAction(input: {
  preventivoId: string;
  importo: number;
  pdfBase64: string;
}): Promise<
  { success: true; provaChiusa?: boolean } | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const importo = Number(input.importo);
  if (!Number.isFinite(importo) || importo < 0) {
    return { success: false, error: "Inserisci l'importo della spedizione." };
  }
  const pdfBuffer = bufferPdfPreventivo(input.pdfBase64 ?? "");
  if (!pdfBuffer) {
    return {
      success: false,
      error: "La scheda del preventivo non è allegabile. Riprova.",
    };
  }
  const incaricati = await profiliCalcoloSpedizioni();
  const autorizzato =
    isSuperadminProfile(auth.profile) || incaricati.includes(auth.userId);
  if (!autorizzato) {
    return {
      success: false,
      error: "Solo chi è assegnato a Calcolo spedizioni può completare.",
    };
  }
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("preventivi")
    .select(
      "id, numero_interno, stato, sent_at, data_preventivo, cliente_id, cliente_ragione_sociale, tipo_pagamento, giorni_consegna, validita_giorni, note, consegna_metodo, commerciale_riferimento_nome, commerciale_riferimento_telefono, commerciale_riferimento_email, mail_bozza_account_id, mail_bozza_to, mail_bozza_oggetto, mail_bozza_testo"
    )
    .eq("id", input.preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Preventivo non trovato." };
  }
  const prev = row as {
    id: string;
    numero_interno: string;
    stato: string;
    sent_at: string | null;
    mail_bozza_account_id: string | null;
    mail_bozza_to: string;
    mail_bozza_oggetto: string;
    mail_bozza_testo: string;
  };
  if (prev.stato !== "in_attesa_spedizione") {
    return { success: false, error: "Questo preventivo non è in attesa di spedizione." };
  }
  if (prev.sent_at) {
    return { success: false, error: "La mail di questo preventivo è già stata inviata." };
  }
  if (!prev.mail_bozza_account_id || !prev.mail_bozza_to.includes("@")) {
    return { success: false, error: "Manca la mail preparata dal commerciale." };
  }
  const now = new Date().toISOString();
  const { error: upErr } = await service
    .from("preventivi")
    .update({
      spedizione_importo: importo,
      spedizione_importo_base: importo,
      spedizione_markup_pct: 0,
      spedizione_fonte: "manuale",
      modalita_spedizione_prezzo: "inserito",
      updated_by: auth.userId,
    })
    .eq("id", prev.id);
  if (upErr) return { success: false, error: upErr.message };

  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", prev.mail_bozza_account_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella mail non trovata." };
  }
  const pdf = {
    buffer: pdfBuffer,
    fileName: nomeFilePreventivoPdf(prev.numero_interno),
  };
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
      to: prev.mail_bozza_to,
      subject: prev.mail_bozza_oggetto,
      text: testoMailPreventivoConFirma(prev.mail_bozza_testo),
      html: htmlMailPreventivoConFirma(prev.mail_bozza_testo),
      attachments: [
        {
          filename: pdf.fileName,
          content: pdf.buffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Importo salvato, invio mail non riuscito: ${e.message}`
          : "Importo salvato, invio mail non riuscito.",
    };
  }
  const { error: sentErr } = await service
    .from("preventivi")
    .update({
      stato: "inviato",
      documento_stato: "approvato",
      sent_at: now,
      sent_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", prev.id);
  if (sentErr) return { success: false, error: sentErr.message };
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: prev.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Preventivo ${prev.numero_interno} completato con spedizione ${importo} € e inviato a ${prev.mail_bozza_to}`,
    payload: { importo, mailTo: prev.mail_bozza_to },
  });
  if (PREVENTIVI_SESSIONE_PROVA) {
    const closedAt = new Date().toISOString();
    const { error: delErr } = await service
      .from("preventivi")
      .update({
        deleted_at: closedAt,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", prev.id);
    if (delErr) return { success: false, error: delErr.message };
    await service
      .from("app_notifiche")
      .update({
        deleted_at: closedAt,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("entity_type", "preventivi")
      .eq("entity_id", prev.id)
      .is("deleted_at", null);
    await writeAuditLog({
      entity_type: "preventivi",
      entity_id: prev.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Prova ${prev.numero_interno} inviata a ${prev.mail_bozza_to} e tolta dall'archivio`,
      payload: { importo, mailTo: prev.mail_bozza_to },
    });
    return { success: true, provaChiusa: true };
  }
  return { success: true };
}
