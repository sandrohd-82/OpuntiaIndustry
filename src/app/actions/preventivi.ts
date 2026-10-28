"use server";

import { createHash, randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import {
  FASE_TEST_INVIO_PREVENTIVO,
  PREVENTIVI_SESSIONE_PROVA,
  PREVENTIVI_SESSIONE_PROVA_MSG,
} from "@/lib/amministrazione/preventivo-sessione";
import { EMAIL_CONTROLLO_DEFAULT } from "@/lib/amministrazione/prova-ordine";
import { applicaDicituraTraduzioneAi } from "@/lib/amministrazione/dicitura-traduzione-ai";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import {
  accettazioneSeniorBloccaInvio,
  parseAccettazioneSeniorStato,
} from "@/lib/amministrazione/accettazione-senior";
import {
  colonneAccettazioneSenior,
  decisioneAccettazioneSenior,
  notificaAccettazioneSenior,
} from "@/lib/amministrazione/accettazione-senior-server";
import {
  perimetroPreventiviOr,
  resolvePerimetroDocumenti,
  rigaNelPerimetro,
} from "@/lib/auth/anagrafica-visibility";
import { collectAziendaEmailHints } from "@/app/actions/azienda-timeline";
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
import {
  registraCopiaMailInviata,
  sendMailViaAccount,
} from "@/lib/webmail/sync";
import {
  CONFEZIONE_STANDARD,
  conteggiPreventiviVuoti,
  createPreventivoSchema,
  inviaPreventivoMailSchema,
  formatNumeroPreventivo,
  PREVENTIVI_RACCOLTA_GIORNI,
  PREVENTIVO_RACCOLTE,
  spedizioneLockAttivo,
  statiPreventivoRaccolta,
  type PreventivoModificaFoglio,
  type PreventivoRaccolta,
  nomeFilePreventivoPdf,
  stimaSpedizioneSchema,
  type Preventivo,
  type PreventivoPdfEmesso,
  type PreventivoConfezioneOption,
  type PreventivoRiga,
  type PreventivoScontisticaRiga,
  type PreventivoStato,
  normalizzaVoceSpedizioneMail,
} from "@/lib/amministrazione/preventivi";
import { CONFEZIONE_SISTEMA } from "@/lib/amministrazione/preventivo-confezionamento";
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
  caricaMailProfili,
  emailReferenteDaProfilo,
  loadPreventivoCommercialiRiferimento,
  MAIL_PROFESSIONALE_MANCANTE,
  resolvePreventivoCommercialeRiferimento,
  type PreventivoCommercialeRiferimento,
} from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  coordinateBancarieFallback,
  formatNumeroPreventivoDocumento,
  PREVENTIVO_PRIMO_NUMERO_2026,
  seqDaNumeroPreventivo,
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
    scontoListinoStandardPct: Number(row.sconto_listino_standard_pct ?? 0),
    scontoListinoPct: Number(row.sconto_listino_pct ?? 0),
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
    accordoId: row.accordo_id ?? null,
    accordoModalita: row.accordo_modalita ?? null,
    accordoValoreOrigine:
      row.accordo_valore_origine == null
        ? null
        : Number(row.accordo_valore_origine),
    accordoGiustificazione: row.accordo_giustificazione ?? "",
    accordoForzato: Boolean(row.accordo_forzato),
  };
}

async function conMailProfessionale(items: Preventivo[]): Promise<Preventivo[]> {
  const mail = await caricaMailProfili(
    items
      .map((item) => item.commercialeRiferimentoId)
      .filter((id): id is string => Boolean(id))
  );
  return items.map((item) => {
    const id = item.commercialeRiferimentoId;
    if (!id) return item;
    const info = mail.get(id);
    if (!info) return item;
    return {
      ...item,
      commercialeRiferimentoEmail: emailReferenteDaProfilo({
        salvata: item.commercialeRiferimentoEmail,
        accesso: info.accesso,
        professionale: info.professionale,
      }),
    };
  });
}

function mapPreventivo(
  row: PreventivoRow,
  righe: PreventivoRigaRow[],
  referenteLabel = "",
  viewerId = "",
  viewerIsSuperadmin = false,
  pdfEmessi: PreventivoPdfEmesso[] = []
): Preventivo {
  const lockAttivo =
    Boolean(row.spedizione_lock_by) &&
    spedizioneLockAttivo(row.spedizione_lock_at);
  const accettazioneSeniorStato = parseAccettazioneSeniorStato(
    row.accettazione_senior_stato
  );
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
    webmailInvioId: row.webmail_invio_id ?? null,
    referenteAccettazioneId: row.referente_accettazione_id,
    referenteAccettazioneLabel: referenteLabel,
    archiviatoAt: row.archiviato_at,
    spedizioneInCorso: lockAttivo && row.spedizione_lock_by !== viewerId,
    accettazioneSeniorStato,
    accettazioneSeniorNota: row.accettazione_senior_nota ?? "",
    accettazioneSeniorPuoRispondere:
      accettazioneSeniorStato === "in_attesa" &&
      (viewerIsSuperadmin ||
        Boolean(
          row.accettazione_senior_user_id &&
            row.accettazione_senior_user_id === viewerId
        )),
    righe: righe
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapRiga),
    pdfEmessi,
    createdAt: row.created_at,
  };
}

async function nextSeqAnno(dataPreventivo: string): Promise<number> {
  const year = yearFromPreventivoData(dataPreventivo);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("numero_interno");
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data ?? []) {
    const value = seqDaNumeroPreventivo(String(row.numero_interno ?? ""), year);
    if (value != null && value > max) max = value;
  }
  const next = max + 1;
  if (year === 2026) return Math.max(next, PREVENTIVO_PRIMO_NUMERO_2026);
  return next;
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

async function attachPdfEmessi(
  ids: string[]
): Promise<Map<string, PreventivoPdfEmesso[]>> {
  const map = new Map<string, PreventivoPdfEmesso[]>();
  if (!ids.length) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("preventivi_documenti_emessi")
    .select(
      "id, preventivo_id, versione, filename, inviato_at, mail_to, lingua, allegato_inviato"
    )
    .in("preventivo_id", ids)
    .eq("stato", "inviato")
    .is("deleted_at", null)
    .order("versione", { ascending: true });
  for (const row of data ?? []) {
    const preventivoId = String(row.preventivo_id);
    const list = map.get(preventivoId) ?? [];
    list.push({
      id: String(row.id),
      versione: Number(row.versione),
      filename: String(row.filename ?? ""),
      inviatoAt: row.inviato_at ? String(row.inviato_at) : "",
      mailTo: String(row.mail_to ?? ""),
      lingua: String(row.lingua ?? "it"),
      allegatoInviato: row.allegato_inviato !== false,
    });
    map.set(preventivoId, list);
  }
  return map;
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
    .in("preventivo_id", ids)
    .is("deleted_at", null);
  for (const r of (data ?? []) as PreventivoRigaRow[]) {
    const list = map.get(r.preventivo_id) ?? [];
    list.push(r);
    map.set(r.preventivo_id, list);
  }
  return map;
}

async function trasferisciPreventiviScaduti(userId: string): Promise<void> {
  const limite = new Date(
    Date.now() - PREVENTIVI_RACCOLTA_GIORNI * 86_400_000
  ).toISOString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("preventivi")
    .select("id, numero_interno, versione")
    .is("deleted_at", null)
    .is("archiviato_at", null)
    .lt("created_at", limite)
    .limit(100);
  if (!data?.length) return;
  const now = new Date().toISOString();
  for (const row of data) {
    const versione = Number(row.versione ?? 1) + 1;
    const { error } = await supabase
      .from("preventivi")
      .update({
        archiviato_at: now,
        archiviato_by: userId,
        updated_by: userId,
        versione,
      })
      .eq("id", row.id)
      .is("deleted_at", null)
      .is("archiviato_at", null);
    if (error) continue;
    await writeAuditLog({
      entity_type: "preventivi",
      entity_id: String(row.id),
      action: "update",
      actor_id: userId,
      summary: `Preventivo ${String(row.numero_interno ?? "")} spostato in archivio dopo ${PREVENTIVI_RACCOLTA_GIORNI} giorni`,
      payload: { versione, archiviato_at: now },
    });
  }
}

export async function listPreventiviAction(input?: {
  raccolta?: PreventivoRaccolta;
  archivio?: boolean;
}): Promise<
  | {
      success: true;
      items: Preventivo[];
      conteggi: Record<PreventivoRaccolta, number>;
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const raccolta = input?.raccolta ?? "da_completare";
  const archivio = Boolean(input?.archivio);
  await trasferisciPreventiviScaduti(gate.auth.userId);
  const supabase = await createClient();
  const perimetro = await resolvePerimetroDocumenti();
  const filtro = perimetroPreventiviOr(perimetro);
  if (!perimetro.unrestricted && !filtro) {
    return {
      success: true,
      items: [],
      conteggi: conteggiPreventiviVuoti(),
    };
  }
  let query = supabase
    .from("preventivi")
    .select("*")
    .is("deleted_at", null)
    .in("stato", statiPreventivoRaccolta(raccolta))
    .order("data_preventivo", { ascending: false })
    .limit(300);
  query = archivio
    ? query.not("archiviato_at", "is", null)
    : query.is("archiviato_at", null);
  if (filtro) query = query.or(filtro);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as PreventivoRow[];
  const righe = await attachRighe(rows.map((r) => r.id));
  const pdfEmessi = await attachPdfEmessi(rows.map((r) => r.id));
  const conteggi = conteggiPreventiviVuoti();
  for (const nome of PREVENTIVO_RACCOLTE) {
    let countQuery = supabase
      .from("preventivi")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("stato", statiPreventivoRaccolta(nome));
    countQuery = archivio
      ? countQuery.not("archiviato_at", "is", null)
      : countQuery.is("archiviato_at", null);
    if (filtro) countQuery = countQuery.or(filtro);
    const counted = await countQuery;
    conteggi[nome] = counted.count ?? 0;
  }
  const items = await conMailProfessionale(
    rows.map((r) =>
      mapPreventivo(
        r,
        righe.get(r.id) ?? [],
        "",
        gate.auth.userId,
        isSuperadminProfile(gate.auth.profile),
        pdfEmessi.get(r.id) ?? []
      )
    )
  );
  return {
    success: true,
    items,
    conteggi,
  };
}

export async function acquisisciLockSpedizionePreventivoAction(
  preventivoId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("preventivi")
    .select("id, stato, spedizione_lock_by, spedizione_lock_at")
    .eq("id", preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Preventivo non trovato" };
  }
  if (row.stato !== "in_attesa_spedizione") {
    return { success: false, error: "Questo preventivo non è più da completare." };
  }
  const { data: preso, error: lockErr } = await supabase.rpc(
    "acquisisci_lock_spedizione_preventivo",
    { p_id: preventivoId }
  );
  if (lockErr) return { success: false, error: lockErr.message };
  if (!preso) {
    return {
      success: false,
      error: "Un altro operatore sta già inserendo il costo di spedizione.",
    };
  }
  return { success: true };
}

export async function rinnovaLockSpedizionePreventivoAction(
  preventivoId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("preventivi")
    .update({
      spedizione_lock_at: new Date().toISOString(),
      updated_by: gate.auth.userId,
    })
    .eq("id", preventivoId)
    .eq("spedizione_lock_by", gate.auth.userId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function rilasciaLockSpedizionePreventivoAction(
  preventivoId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("preventivi")
    .update({
      spedizione_lock_by: null,
      spedizione_lock_at: null,
      updated_by: gate.auth.userId,
    })
    .eq("id", preventivoId)
    .eq("spedizione_lock_by", gate.auth.userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getPreventivoPerModificaAction(
  id: string
): Promise<
  | { success: true; foglio: PreventivoModificaFoglio }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { success: false, error: "Preventivo non valido" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Preventivo non trovato" };
  }
  const row = data as PreventivoRow;
  const perimetro = await resolvePerimetroDocumenti();
  if (!rigaNelPerimetro(row, perimetro, { riferimento: true })) {
    return { success: false, error: "Preventivo non trovato" };
  }
  const righeMap = await attachRighe([row.id]);
  const righe = (righeMap.get(row.id) ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const modalita = row.modalita_spedizione_prezzo;
  const prezzoAcquirenteModo =
    modalita === "richiesto" || modalita === "in_fattura" || modalita === "inserito"
      ? modalita
      : Number(row.spedizione_importo ?? 0) > 0 ||
          Number(row.spedizione_importo_base ?? 0) > 0
        ? "inserito"
        : "in_fattura";
  const base =
    prezzoAcquirenteModo !== "inserito"
      ? 0
      : row.consegna_metodo === "corriere_nostro"
        ? Number(row.spedizione_importo_base ?? 0)
        : Number(row.spedizione_importo ?? 0);
  const destinatario = await destinatarioPerModifica(
    row.cliente_id,
    row.cliente_ragione_sociale,
    row.cliente_codice_targa,
    row.cliente_possibile_id
  );
  let mailMittente = "";
  if (row.mail_bozza_account_id) {
    const service = createServiceClient();
    const { data: casella } = await service
      .from("webmail_accounts")
      .select("email_address")
      .eq("id", row.mail_bozza_account_id)
      .is("deleted_at", null)
      .maybeSingle();
    mailMittente = String(
      (casella as { email_address?: string } | null)?.email_address ?? ""
    );
  }
  const mailProfilo = row.commerciale_riferimento_id
    ? (await caricaMailProfili([row.commerciale_riferimento_id])).get(
        row.commerciale_riferimento_id
      )
    : undefined;
  const emailReferente = emailReferenteDaProfilo({
    salvata: row.commerciale_riferimento_email ?? "",
    accesso: mailProfilo?.accesso ?? "",
    professionale: mailProfilo?.professionale ?? "",
  });
  return {
    success: true,
    foglio: {
      id: row.id,
      numeroInterno: row.numero_interno,
      stato: row.stato,
      documentoStato: row.documento_stato,
      sentAt: row.sent_at,
      dataPreventivo: row.data_preventivo,
      note: row.note,
      giorniConsegna: row.giorni_consegna || "da concordare",
      validitaGiorni: Number(row.validita_giorni ?? 15),
      tipoPagamento: row.tipo_pagamento,
      consegnaMetodo: row.consegna_metodo,
      spedizioneACarico: row.spedizione_a_carico,
      spedizioneFonte: row.spedizione_fonte ?? "da_concordare",
      prezzoAcquirenteModo,
      spedizioneBase: prezzoAcquirenteModo !== "inserito" || base <= 0 ? null : base,
      ivaDocumento: Number(righe[0]?.iva_percentuale ?? 22),
      destinatario,
      commerciale: row.commerciale_riferimento_id
        ? {
            id: row.commerciale_riferimento_id,
            nome: row.commerciale_riferimento_nome ?? "",
            telefono: row.commerciale_riferimento_telefono ?? "",
            email: emailReferente,
          }
        : null,
      mailAccountId: row.mail_bozza_account_id ?? "",
      mailMittente,
      mailTo: row.mail_bozza_to ?? "",
      mailOggetto: row.mail_bozza_oggetto ?? "",
      mailTesto: row.mail_bozza_testo ?? "",
      righe: righe.map((r) => ({
        key: r.id,
        prodottoId: r.prodotto_id ?? "",
        prodottoCodice: r.prodotto_codice,
        prodottoNome: r.prodotto_nome,
        quantita: Number(r.quantita),
        unitaMisura: r.unita_misura,
        prezzoUnitario: Number(r.prezzo_unitario),
        ivaPercentuale: Number(r.iva_percentuale),
        listinoId: r.listino_id,
        prezzoDaListino: Boolean(r.prezzo_da_listino),
        scontoExtraPct: Number(r.sconto_extra_pct ?? 0),
        scontoListinoPct: Number(r.sconto_listino_pct ?? 0),
        scontoListinoStandardPct: Number(
          r.sconto_listino_standard_pct ?? r.sconto_listino_pct ?? 0
        ),
        scontoSuddivisioneAttiva: Boolean(r.sconto_suddivisione_attiva),
        scontoQuotaAziendaPct: Number(r.sconto_quota_azienda_pct ?? 0),
        scontoQuotaCommercialePct: Number(r.sconto_quota_commerciale_pct ?? 0),
        confezioneValue: r.imballaggio_voce_id ?? CONFEZIONE_SISTEMA,
        confezionamento: r.confezionamento,
        imballaggioVoceId: r.imballaggio_voce_id ?? null,
        accordoId: r.accordo_id ?? null,
        accordoModalita: r.accordo_modalita ?? null,
        accordoValoreOrigine:
          r.accordo_valore_origine == null
            ? null
            : Number(r.accordo_valore_origine),
        accordoGiustificazione: r.accordo_giustificazione ?? "",
        accordoForzato: Boolean(r.accordo_forzato),
      })),
    },
  };
}

export async function eliminaPreventivoBozzaAction(input: {
  id: string;
  conferma: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) {
    return { success: false, error: "Preventivo non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select(
      "id, numero_interno, stato, documento_stato, sent_at, versione, cliente_id, cliente_possibile_id, created_by, commerciale_riferimento_id"
    )
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Preventivo non trovato." };
  }
  const row = data as PreventivoRow;
  const perimetro = await resolvePerimetroDocumenti();
  if (!rigaNelPerimetro(row, perimetro, { riferimento: true })) {
    return { success: false, error: "Preventivo non trovato." };
  }
  if (row.documento_stato !== "bozza" || row.sent_at) {
    return {
      success: false,
      error: "Si può eliminare solo un preventivo ancora in bozza e non inviato.",
    };
  }
  const attesa = fraseConfermaSoftDelete(row.numero_interno);
  if (input.conferma.trim() !== attesa) {
    return { success: false, error: `Per eliminare scrivi: ${attesa}` };
  }
  const now = new Date().toISOString();
  const marca = {
    deleted_at: now,
    deleted_by: gate.auth.userId,
    updated_by: gate.auth.userId,
  };
  const righe = await supabase
    .from("preventivi_righe")
    .update(marca)
    .eq("preventivo_id", row.id)
    .is("deleted_at", null);
  if (righe.error) return { success: false, error: righe.error.message };
  const allegati = await supabase
    .from("preventivi_allegati_invio")
    .update(marca)
    .eq("preventivo_id", row.id)
    .is("deleted_at", null);
  if (allegati.error) return { success: false, error: allegati.error.message };
  const pdf = await supabase
    .from("preventivi_documenti_emessi")
    .update(marca)
    .eq("preventivo_id", row.id)
    .is("deleted_at", null);
  if (pdf.error) return { success: false, error: pdf.error.message };
  const header = await supabase
    .from("preventivi")
    .update(marca)
    .eq("id", row.id)
    .eq("documento_stato", "bozza")
    .is("sent_at", null)
    .is("deleted_at", null)
    .select("id");
  if (header.error) return { success: false, error: header.error.message };
  if (!header.data?.length) {
    return { success: false, error: "La bozza non è più eliminabile." };
  }
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: row.id,
    action: "soft_delete",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${row.numero_interno} eliminato da bozza. Il numero non viene riusato.`,
    payload: { numero: row.numero_interno, versione: row.versione },
  });
  return { success: true };
}

const COLONNE_SEDE_ANAGRAFICA =
  "id, ragione_sociale, partita_iva, codice_fiscale, email, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo, sede_mag_nazione, sede_mag_provincia, sede_mag_citta, sede_mag_cap, sede_mag_indirizzo, consegne_altra_azienda";

type RigaSedeAnagrafica = {
  id: string;
  ragione_sociale?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  email?: string | null;
  codice_targa?: string | null;
  sede_amm_nazione?: string | null;
  sede_amm_provincia?: string | null;
  sede_amm_citta?: string | null;
  sede_amm_cap?: string | null;
  sede_amm_indirizzo?: string | null;
  sede_mag_nazione?: string | null;
  sede_mag_provincia?: string | null;
  sede_mag_citta?: string | null;
  sede_mag_cap?: string | null;
  sede_mag_indirizzo?: string | null;
  consegne_altra_azienda?: unknown;
};

function sedeIntestazioneDaAnagrafica(row: RigaSedeAnagrafica): {
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
} {
  const ammVia = String(row.sede_amm_indirizzo ?? "").trim();
  const ammCap = String(row.sede_amm_cap ?? "").trim();
  if (ammVia || ammCap) {
    return {
      nazione: String(row.sede_amm_nazione ?? ""),
      provincia: String(row.sede_amm_provincia ?? ""),
      citta: String(row.sede_amm_citta ?? ""),
      cap: ammCap,
      indirizzo: ammVia,
    };
  }
  return {
    nazione: String(row.sede_mag_nazione ?? ""),
    provincia: String(row.sede_mag_provincia ?? ""),
    citta: String(row.sede_mag_citta ?? ""),
    cap: String(row.sede_mag_cap ?? ""),
    indirizzo: String(row.sede_mag_indirizzo ?? ""),
  };
}

async function leggiAnagraficaDestinatario(
  clienteId: string | null,
  possibileId: string | null
): Promise<
  | { kind: "cliente"; row: RigaSedeAnagrafica }
  | { kind: "possibile"; row: RigaSedeAnagrafica }
  | null
> {
  const service = createServiceClient();
  if (clienteId) {
    const { data } = await service
      .from("clienti")
      .select(`${COLONNE_SEDE_ANAGRAFICA}, codice_targa`)
      .eq("id", clienteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return { kind: "cliente", row: data as RigaSedeAnagrafica };
  }
  if (possibileId) {
    const { data } = await service
      .from("clienti_possibili")
      .select(COLONNE_SEDE_ANAGRAFICA)
      .eq("id", possibileId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return { kind: "possibile", row: data as RigaSedeAnagrafica };
  }
  return null;
}

async function destinatarioPerModifica(
  clienteId: string | null,
  ragioneSociale: string,
  codiceTarga: string,
  possibileId: string | null = null
): Promise<PreventivoModificaFoglio["destinatario"]> {
  const trovato = await leggiAnagraficaDestinatario(clienteId, possibileId);
  if (!trovato) return null;
  const sede = sedeIntestazioneDaAnagrafica(trovato.row);
  return {
    kind: trovato.kind,
    id: String(trovato.row.id),
    ragioneSociale: String(trovato.row.ragione_sociale || ragioneSociale),
    partitaIva: String(trovato.row.partita_iva ?? ""),
    codiceFiscale: String(trovato.row.codice_fiscale ?? ""),
    codiceTarga: String(trovato.row.codice_targa || codiceTarga || "PC"),
    email: String(trovato.row.email ?? ""),
    sede,
  };
}

export async function countPreventiviAttesaSpedizioneNavAction(): Promise<
  { success: true; totale: number } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: true, totale: 0 };
  await trasferisciPreventiviScaduti(gate.auth.userId);
  const supabase = await createClient();
  const perimetro = await resolvePerimetroDocumenti();
  const filtro = perimetroPreventiviOr(perimetro);
  if (!perimetro.unrestricted && !filtro) return { success: true, totale: 0 };
  let countQuery = supabase
    .from("preventivi")
    .select("id", { count: "exact", head: true })
    .eq("stato", "in_attesa_spedizione")
    .is("archiviato_at", null)
    .is("deleted_at", null);
  if (filtro) countQuery = countQuery.or(filtro);
  const { count, error } = await countQuery;
  if (error) return { success: false, error: error.message };
  const { count: ordiniAttesa } = await supabase
    .from("ordini")
    .select("id", { count: "exact", head: true })
    .eq("modalita_spedizione_prezzo", "richiesto")
    .is("deleted_at", null);
  return { success: true, totale: (count ?? 0) + (ordiniAttesa ?? 0) };
}

export async function listPreventiviAccettatiAction(input: {
  clienteId: string;
  prodottoId?: string;
}): Promise<
  { success: true; items: Preventivo[] } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const perimetro = await resolvePerimetroDocumenti();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("*")
    .eq("cliente_id", input.clienteId)
    .in("stato", ["accettato", "inviato"])
    .is("deleted_at", null)
    .order("data_preventivo", { ascending: false })
    .limit(80);
  if (error) return { success: false, error: error.message };
  const rows = ((data ?? []) as PreventivoRow[]).filter((row) =>
    rigaNelPerimetro(row, perimetro, { riferimento: true })
  );
  const righe = await attachRighe(rows.map((r) => r.id));
  const pdfEmessi = await attachPdfEmessi(rows.map((r) => r.id));
  let items = rows.map((r) =>
    mapPreventivo(r, righe.get(r.id) ?? [], "", "", false, pdfEmessi.get(r.id) ?? [])
  );
  if (input.prodottoId) {
    items = items.filter(
      (p) =>
        p.righe.length > 1 ||
        p.righe.some((r) => r.prodottoId === input.prodottoId)
    );
  }
  return { success: true, items: await conMailProfessionale(items) };
}

export type PreventivoMailTrovata = {
  id: string;
  subject: string;
  fromAddress: string;
  direction: "inbound" | "outbound";
  at: string | null;
};

function emailPerFiltro(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, "")
    .slice(0, 200);
}

async function preventiviDaMailAzienda(
  clienteId: string,
  auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>
): Promise<{ mail: PreventivoMailTrovata[]; extra: PreventivoRow[] }> {
  const vuoto = { mail: [] as PreventivoMailTrovata[], extra: [] as PreventivoRow[] };
  try {
    const hints = await collectAziendaEmailHints("cliente", clienteId);
    const emails = hints.emails
      .map((voce) => emailPerFiltro(voce.email))
      .filter((voce) => voce.includes("@"))
      .slice(0, 12);
    const vis = await resolveWebmailAccountVisibility(auth);
    if (vis.mode === "granted" && vis.ids.length === 0) return vuoto;
    const orParts = emails.flatMap((addr) => [
      `from_address.ilike.%${addr}%`,
      `to_addresses.cs.{"${addr}"}`,
    ]);
    orParts.push(`and(azienda_tipo.eq.cliente,azienda_id.eq.${clienteId})`);
    const supabase = await createClient();
    let mailQ = supabase
      .from("webmail_messaggi")
      .select("id, subject, from_address, direction, received_at, sent_at")
      .is("deleted_at", null)
      .or(orParts.join(","))
      .order("received_at", { ascending: false })
      .limit(40);
    mailQ = mailQ.neq("folder", "TRASH").neq("folder", "JUNK");
    if (vis.mode === "granted") mailQ = mailQ.in("account_id", vis.ids);
    const { data: msgs, error } = await mailQ;
    if (error || !msgs) return vuoto;
    const mail: PreventivoMailTrovata[] = msgs.map((row) => ({
      id: String(row.id),
      subject: String(row.subject ?? "").trim() || "(senza oggetto)",
      fromAddress: String(row.from_address ?? ""),
      direction: row.direction === "outbound" ? "outbound" : "inbound",
      at: row.sent_at
        ? String(row.sent_at)
        : (row.received_at ? String(row.received_at) : null),
    }));
    const ids = mail.map((voce) => voce.id);
    const extra: PreventivoRow[] = [];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("preventivi")
        .select("*")
        .in("webmail_invio_id", ids)
        .is("deleted_at", null)
        .limit(40);
      extra.push(...((data ?? []) as PreventivoRow[]));
    }
    if (emails.length > 0) {
      const { data } = await supabase
        .from("preventivi")
        .select("*")
        .or(emails.map((voce) => `mail_bozza_to.ilike.%${voce}%`).join(","))
        .is("deleted_at", null)
        .limit(40);
      extra.push(...((data ?? []) as PreventivoRow[]));
    }
    return { mail, extra };
  } catch {
    return vuoto;
  }
}

/** Ricerca preventivi per collegarli a un ordine. Rispetta il perimetro commerciale. */
export async function cercaPreventiviPerOrdineAction(raw: {
  dataDa?: string;
  dataA?: string;
  azienda?: string;
  numero?: string;
  stato?: PreventivoStato | "";
  archivio?: "tutti" | "operativi" | "archivio";
  clienteId?: string;
  email?: string;
  includiMail?: boolean;
}): Promise<
  | {
      success: true;
      items: Preventivo[];
      mail: PreventivoMailTrovata[];
      truncated: boolean;
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const dataDa = /^\d{4}-\d{2}-\d{2}$/.test(raw.dataDa ?? "") ? raw.dataDa : "";
  const dataA = /^\d{4}-\d{2}-\d{2}$/.test(raw.dataA ?? "") ? raw.dataA : "";
  const azienda = (raw.azienda ?? "").trim().replace(/[%_]/g, "").slice(0, 120);
  const numero = (raw.numero ?? "").trim().replace(/[%_]/g, "").slice(0, 40);
  const stato = raw.stato && PREVENTIVO_STATI_CERCA.includes(raw.stato) ? raw.stato : "";
  const archivio = raw.archivio ?? "tutti";
  const clienteId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    raw.clienteId ?? ""
  )
    ? String(raw.clienteId)
    : "";
  const email = emailPerFiltro(raw.email ?? "");
  const perimetro = await resolvePerimetroDocumenti();
  const filtro = perimetroPreventiviOr(perimetro);
  if (!perimetro.unrestricted && !filtro) {
    return { success: true, items: [], mail: [], truncated: false };
  }
  const supabase = await createClient();
  const limite = 80;
  let query = supabase
    .from("preventivi")
    .select("*")
    .is("deleted_at", null)
    .order("data_preventivo", { ascending: false })
    .limit(limite);
  if (dataDa) query = query.gte("data_preventivo", dataDa);
  if (dataA) query = query.lte("data_preventivo", dataA);
  if (stato) query = query.eq("stato", stato);
  if (archivio === "operativi") query = query.is("archiviato_at", null);
  if (archivio === "archivio") query = query.not("archiviato_at", "is", null);
  if (numero) query = query.ilike("numero_interno", `%${numero}%`);
  if (azienda) query = query.ilike("cliente_ragione_sociale", `%${azienda}%`);
  const orCliente = clienteId
    ? `cliente_id.eq.${clienteId},cliente_possibile_id.eq.${clienteId}`
    : "";
  const orEmail = email.includes("@")
    ? `mail_bozza_to.ilike.%${email}%,commerciale_riferimento_email.ilike.%${email}%`
    : "";
  let orFinale = filtro ?? "";
  if (orCliente && orEmail) {
    orFinale = `and(or(${orCliente}),or(${orEmail}))`;
  } else if (orCliente) {
    orFinale = orCliente;
  } else if (orEmail && filtro) {
    orFinale = `and(or(${orEmail}),or(${filtro}))`;
  } else if (orEmail) {
    orFinale = orEmail;
  }
  if (orFinale) query = query.or(orFinale);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  const daMail =
    raw.includiMail && clienteId
      ? await preventiviDaMailAzienda(clienteId, gate.auth)
      : { mail: [] as PreventivoMailTrovata[], extra: [] as PreventivoRow[] };
  const visti = new Set<string>();
  const rows = ([...((data ?? []) as PreventivoRow[]), ...daMail.extra] as PreventivoRow[])
    .filter((row) => {
      if (visti.has(row.id)) return false;
      visti.add(row.id);
      return rigaNelPerimetro(row, perimetro, { riferimento: true });
    });
  const righe = await attachRighe(rows.map((r) => r.id));
  const pdfEmessi = await attachPdfEmessi(rows.map((r) => r.id));
  return {
    success: true,
    truncated: (data ?? []).length >= limite,
    mail: daMail.mail,
    items: await conMailProfessionale(
      rows.map((r) =>
        mapPreventivo(r, righe.get(r.id) ?? [], "", "", false, pdfEmessi.get(r.id) ?? [])
      )
    ),
  };
}

const PREVENTIVO_STATI_CERCA: PreventivoStato[] = [
  "creato",
  "in_attesa_spedizione",
  "creato_da_inviare",
  "inviato",
  "accettato",
  "respinto",
];

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
  if (!riferimento.personaSenzaAccount && !riferimento.email.includes("@")) {
    return { success: false, error: MAIL_PROFESSIONALE_MANCANTE };
  }
  const intenzione = input.intenzione ?? "bozza";
  const bozza = intenzione === "bozza";
  const isRichiestaPrezzo = input.modalitaSpedizionePrezzo === "richiesto";
  const daInviare = intenzione === "da_inviare";
  const senzaImporto =
    !daInviare &&
    (isRichiestaPrezzo || input.modalitaSpedizionePrezzo === "in_fattura");
  if (!bozza && isRichiestaPrezzo && !daInviare && input.mailAccountId) {
    const casella = await assertWebmailAccountAccess(gate.auth, input.mailAccountId);
    if (!casella.ok) return { success: false, error: casella.error };
  }
  if (!bozza && isRichiestaPrezzo && !daInviare) {
    const incaricati = await profiliCalcoloSpedizioni();
    if (!incaricati.length) {
      return {
        success: false,
        error:
          "Nessuna persona è assegnata a Calcolo spedizioni. Impostala in Impostazioni, Compiti e adempimenti.",
      };
    }
  }
  const accettazione = await decisioneAccettazioneSenior({
    clienteId: input.clienteId,
    possibileClienteId: input.clientePossibileId,
    actorId: gate.auth.userId,
    actorProfile: gate.auth.profile,
  });
  if (
    accettazione.stato === "in_attesa" &&
    intenzione === "inviato" &&
    !isRichiestaPrezzo
  ) {
    return {
      success: false,
      error:
        "Questa azienda è affiancata: salva il preventivo come bozza. L'invio si sblocca quando il senior accetta.",
    };
  }
  let stato: "creato" | "inviato" | "in_attesa_spedizione" | "creato_da_inviare" =
    "creato";
  let documentoStato: "bozza" | "approvato" = "approvato";
  if (bozza) {
    stato = "creato";
    documentoStato = "bozza";
  } else if (daInviare) {
    stato = "creato_da_inviare";
    documentoStato = "approvato";
  } else if (isRichiestaPrezzo) {
    stato = "in_attesa_spedizione";
    documentoStato = "approvato";
  } else if (intenzione === "inviato") {
    stato = "inviato";
    documentoStato = "approvato";
  }
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
      cliente_possibile_id: input.clientePossibileId ?? null,
      cliente_ragione_sociale: input.cliente,
      ...colonneAccettazioneSenior(accettazione),
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
      spedizione_importo: senzaImporto ? 0 : (input.spedizioneImporto ?? 0),
      spedizione_importo_base: senzaImporto ? 0 : (input.spedizioneImportoBase ?? 0),
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
        sconto_listino_standard_pct: r.scontoListinoStandardPct ?? 0,
        sconto_listino_pct: r.scontoListinoPct ?? 0,
        ...colonne,
        confezionamento: r.confezionamento ?? "",
        imballaggio_voce_id: r.imballaggioVoceId ?? null,
        accordo_id: r.accordoId ?? null,
        accordo_modalita: r.accordoModalita ?? null,
        accordo_valore_origine: r.accordoValoreOrigine ?? null,
        accordo_giustificazione: r.accordoGiustificazione ?? "",
        accordo_forzato: Boolean(r.accordoForzato),
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
      sconti_standard: input.righe
        .filter(
          (riga) =>
            (riga.scontoListinoPct ?? 0) + 0.0001 <
            (riga.scontoListinoStandardPct ?? 0)
        )
        .map((riga) => ({
          prodotto: riga.prodottoCodice,
          standard: riga.scontoListinoStandardPct ?? 0,
          applicato: riga.scontoListinoPct ?? 0,
        })),
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
  if (accettazione.stato === "in_attesa") {
    await notificaAccettazioneSenior({
      actorId: gate.auth.userId,
      seniorUserId: accettazione.seniorUserId,
      title: `Accetta il preventivo ${numero}`,
      body: `${input.cliente}: il sottoposto ha preparato il preventivo. Resta fermo finché non lo accetti.`,
      href: "/app/amministrazione/ordini/preventivi",
      entityType: "preventivi",
      entityId: header.id,
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
  const parsed = createPreventivoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  if (!parsed.data.id) {
    if (PREVENTIVI_SESSIONE_PROVA) {
      return { success: false, error: PREVENTIVI_SESSIONE_PROVA_MSG };
    }
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
  if (!riferimento.personaSenzaAccount && !riferimento.email.includes("@")) {
    return { success: false, error: MAIL_PROFESSIONALE_MANCANTE };
  }
  const intenzione = input.intenzione ?? "bozza";
  const bozza = intenzione === "bozza";
  const isRichiestaPrezzo = input.modalitaSpedizionePrezzo === "richiesto";
  const daInviare =
    intenzione === "da_inviare" && !PREVENTIVI_SESSIONE_PROVA;
  const senzaImporto =
    !daInviare &&
    (isRichiestaPrezzo || input.modalitaSpedizionePrezzo === "in_fattura");
  if (!bozza && isRichiestaPrezzo && !daInviare && input.mailAccountId) {
    const casella = await assertWebmailAccountAccess(gate.auth, input.mailAccountId);
    if (!casella.ok) return { success: false, error: casella.error };
  }
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
  const accettazione = await decisioneAccettazioneSenior({
    clienteId: input.clienteId,
    possibileClienteId: input.clientePossibileId,
    actorId: gate.auth.userId,
    actorProfile: gate.auth.profile,
  });
  if (
    accettazione.stato === "in_attesa" &&
    !PREVENTIVI_SESSIONE_PROVA &&
    intenzione === "inviato" &&
    !isRichiestaPrezzo
  ) {
    return {
      success: false,
      error:
        "Questa azienda è affiancata: il senior deve accettare il preventivo prima dell'invio.",
    };
  }
  if (current.sent_at && (isRichiestaPrezzo || daInviare)) {
    return {
      success: false,
      error:
        "La mail di questo preventivo è già partita. Non si può rimettere in attesa del calcolo spedizione.",
    };
  }
  const entraInAttesa =
    !bozza &&
    isRichiestaPrezzo &&
    !daInviare &&
    current.stato !== "in_attesa_spedizione";
  if (entraInAttesa) {
    const incaricati = await profiliCalcoloSpedizioni();
    if (!incaricati.length) {
      return {
        success: false,
        error:
          "Nessuna persona è assegnata a Calcolo spedizioni. Impostala in Impostazioni, Compiti e adempimenti.",
      };
    }
  }
  let stato = current.stato;
  let documentoStato = current.documento_stato;
  if (bozza && !current.sent_at) {
    stato = "creato";
    documentoStato = "bozza";
  } else if (daInviare) {
    stato = "creato_da_inviare";
    documentoStato = "approvato";
  } else if (isRichiestaPrezzo) {
    stato = "in_attesa_spedizione";
    documentoStato = "approvato";
  } else if (
    !PREVENTIVI_SESSIONE_PROVA &&
    !FASE_TEST_INVIO_PREVENTIVO &&
    intenzione === "inviato"
  ) {
    stato = "inviato";
    documentoStato = "approvato";
  }
  const nextVersione = current.versione + 1;
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
    modalita_spedizione_prezzo: input.modalitaSpedizionePrezzo ?? "non_applicabile",
    mail_bozza_account_id: input.mailAccountId ?? null,
    mail_bozza_to: input.mailTo ?? "",
    mail_bozza_oggetto: input.mailOggetto ?? "",
    mail_bozza_testo: input.mailTesto ?? "",
    consegna_metodo: input.consegnaMetodo,
    spedizione_a_carico: input.spedizioneACarico,
    spedizione_importo: senzaImporto ? 0 : (input.spedizioneImporto ?? 0),
    spedizione_importo_base: senzaImporto ? 0 : (input.spedizioneImportoBase ?? 0),
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
    cliente_possibile_id: input.clientePossibileId ?? null,
    updated_by: gate.auth.userId,
    ...(accettazione.stato === "in_attesa"
      ? colonneAccettazioneSenior(accettazione)
      : {}),
  };
  if (
    !PREVENTIVI_SESSIONE_PROVA &&
    !FASE_TEST_INVIO_PREVENTIVO &&
    intenzione === "inviato" &&
    !isRichiestaPrezzo
  ) {
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
        sconto_listino_standard_pct: r.scontoListinoStandardPct ?? 0,
        sconto_listino_pct: r.scontoListinoPct ?? 0,
        ...colonne,
        confezionamento: r.confezionamento ?? "",
        imballaggio_voce_id: r.imballaggioVoceId ?? null,
        accordo_id: r.accordoId ?? null,
        accordo_modalita: r.accordoModalita ?? null,
        accordo_valore_origine: r.accordoValoreOrigine ?? null,
        accordo_giustificazione: r.accordoGiustificazione ?? "",
        accordo_forzato: Boolean(r.accordoForzato),
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
    summary: `Preventivo ${header.numero_interno} modificato, versione ${nextVersione}`,
    payload: {
      intenzione,
      versione: nextVersione,
      stato,
      sconti_standard: input.righe
        .filter(
          (riga) =>
            (riga.scontoListinoPct ?? 0) + 0.0001 <
            (riga.scontoListinoStandardPct ?? 0)
        )
        .map((riga) => ({
          prodotto: riga.prodottoCodice,
          standard: riga.scontoListinoStandardPct ?? 0,
          applicato: riga.scontoListinoPct ?? 0,
        })),
    },
  });
  if (entraInAttesa) {
    const incaricati = await profiliCalcoloSpedizioni();
    await dispatchNotifiche({
      actorId: gate.auth.userId,
      includeActor: true,
      recipientIds: incaricati,
      tipo: "attivita",
      title: "Calcolo spedizione urgente",
      body: `Preventivo ${header.numero_interno} per ${input.cliente}: inserisci il prezzo di spedizione e completa l'invio. La mail è già compilata.`,
      href: "/app/amministrazione/ordini/preventivi",
      entityType: "preventivi",
      entityId: header.id,
      payload: { priorita: "urgente", compito: "calcolo_spedizioni" },
    });
  }
  if (
    accettazione.stato === "in_attesa" &&
    parseAccettazioneSeniorStato(current.accettazione_senior_stato) !== "in_attesa"
  ) {
    await notificaAccettazioneSenior({
      actorId: gate.auth.userId,
      seniorUserId: accettazione.seniorUserId,
      title: `Accetta il preventivo ${header.numero_interno}`,
      body: `${input.cliente}: il sottoposto ha aggiornato il preventivo. Resta fermo finché non lo accetti.`,
      href: "/app/amministrazione/ordini/preventivi",
      entityType: "preventivi",
      entityId: header.id,
    });
  }
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
  if (FASE_TEST_INVIO_PREVENTIVO && input.stato === "inviato") {
    return {
      success: false,
      error:
        "Fase di prova: il preventivo non si segna inviato. La mail di controllo parte solo verso sandrohd@gmail.com e la fase resta quella attuale.",
    };
  }
  const now = new Date().toISOString();
  const supabase = await createClient();
  if (input.stato === "inviato" || input.stato === "accettato") {
    const { data: attuale } = await supabase
      .from("preventivi")
      .select("accettazione_senior_stato, stato")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    const attualeRiga = attuale as {
      accettazione_senior_stato?: string | null;
      stato?: string | null;
    } | null;
    if (
      input.stato === "inviato" &&
      attualeRiga?.stato === "creato_da_inviare"
    ) {
      return {
        success: false,
        error:
          "Collega la mail già inviata dal pulsante Preventivo inviato.",
      };
    }
    if (
      accettazioneSeniorBloccaInvio(
        parseAccettazioneSeniorStato(attualeRiga?.accettazione_senior_stato)
      )
    ) {
      return {
        success: false,
        error:
          "Il senior deve accettare questo preventivo prima che si possa inviare o segnare accettato.",
      };
    }
  }
  const documentoStato =
    input.stato === "creato"
      ? "bozza"
      : input.stato === "inviato"
        ? "approvato"
        : "chiuso";
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
  if (input.stato === "inviato") {
    await notificaCommercialePreventivoInviato({
      actorId: gate.auth.userId,
      preventivoId: header.id,
      numero: header.numero_interno,
      cliente: header.cliente_ragione_sociale,
      commercialeId: header.commerciale_riferimento_id,
      mailTo: header.mail_bozza_to,
    });
  }
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

export async function listPreventivoCommercialiRiferimentoAction(opts?: {
  includiSenzaAccount?: boolean;
}): Promise<
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
    const items = await loadPreventivoCommercialiRiferimento({
      includiSenzaAccount: Boolean(opts?.includiSenzaAccount),
    });
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
    .select("cliente_id, cliente_possibile_id, cliente_ragione_sociale")
    .eq("id", preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !prev) {
    return { success: false, error: error?.message ?? "Preventivo non trovato." };
  }
  const aziendaPreventivo = String(prev.cliente_ragione_sociale ?? "").trim();
  const clienteId = prev.cliente_id ? String(prev.cliente_id) : "";
  const possibileId = prev.cliente_possibile_id
    ? String(prev.cliente_possibile_id)
    : "";
  const vuoto = destinatarioScheda(aziendaPreventivo);
  if (!clienteId && !possibileId) {
    return {
      success: true,
      azienda: aziendaPreventivo,
      indirizzo: "Indirizzo non indicato in anagrafica.",
      destinatario: vuoto,
    };
  }
  const anagrafica = await leggiAnagraficaDestinatario(
    clienteId || null,
    possibileId || null
  );
  const cliente = anagrafica?.row ?? null;
  if (!cliente) {
    return {
      success: true,
      azienda: aziendaPreventivo,
      indirizzo: "Indirizzo non indicato in anagrafica.",
      destinatario: vuoto,
    };
  }
  const sedeIntestazione = sedeIntestazioneDaAnagrafica(cliente);
  const destinatario = destinatarioScheda(
    aziendaPreventivo || String(cliente.ragione_sociale ?? ""),
    String(cliente.partita_iva ?? ""),
    String(cliente.codice_fiscale ?? ""),
    sedeIntestazione
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

function motivoBloccoInvioPreventivo(row: {
  stato: string;
  modalita_spedizione_prezzo?: string | null;
  spedizione_importo?: number | null;
  consegna_metodo?: string | null;
}): string | null {
  if (
    row.stato === "in_attesa_spedizione" ||
    row.modalita_spedizione_prezzo === "richiesto"
  ) {
    return "La mail parte solo dopo che l'operatore del calcolo spedizione inserisce il prezzo e conferma l'invio.";
  }
  if (row.modalita_spedizione_prezzo === "in_fattura") return null;
  const consegna = String(row.consegna_metodo ?? "");
  const importo = Number(row.spedizione_importo ?? 0);
  if (
    (consegna === "corriere_cliente" || consegna === "corriere_nostro") &&
    !(importo > 0)
  ) {
    return "Manca il costo di spedizione. La mail non parte.";
  }
  return null;
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

const PREVENTIVI_PDF_BUCKET = "preventivi-pdf";
const PREVENTIVI_ALLEGATI_BUCKET = "preventivi-allegati";
const ALLEGATI_INVIO_MAX = 8;
const ALLEGATI_INVIO_BYTES = 15 * 1024 * 1024;
const ALLEGATI_INVIO_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function mimeAllegatoInvio(file: File): string | null {
  const type = file.type.toLowerCase();
  if (ALLEGATI_INVIO_MIME[type]) return type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

async function leggiAllegatiInvioPreventivo(preventivoId: string): Promise<
  | {
      ok: true;
      files: Array<{ filename: string; content: Buffer; contentType: string }>;
    }
  | { ok: false; error: string }
> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("preventivi_allegati_invio")
    .select("storage_path, file_name, content_type")
    .eq("preventivo_id", preventivoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    return {
      ok: false,
      error: `Allegati non letti, la mail non è partita: ${error.message}`,
    };
  }
  const files: Array<{ filename: string; content: Buffer; contentType: string }> =
    [];
  for (const row of data ?? []) {
    const nome = String(row.file_name || "allegato");
    const scaricato = await service.storage
      .from(PREVENTIVI_ALLEGATI_BUCKET)
      .download(String(row.storage_path));
    if (scaricato.error || !scaricato.data) {
      return {
        ok: false,
        error: `Manca l'allegato «${nome}». La mail non è partita.`,
      };
    }
    const content = Buffer.from(await scaricato.data.arrayBuffer());
    if (content.length < 1) {
      return {
        ok: false,
        error: `L'allegato «${nome}» è vuoto. La mail non è partita.`,
      };
    }
    files.push({
      filename: nome,
      content,
      contentType: String(row.content_type || "application/octet-stream"),
    });
  }
  return { ok: true, files };
}

function nomePdfEmesso(numero: string, versione: number, lingua: string): string {
  const base = nomeFilePreventivoPdf(numero).replace(/\.pdf$/i, "");
  const suffisso = lingua === "it" ? "" : `-${lingua}`;
  if (versione <= 1) return `${base}${suffisso}.pdf`;
  return `${base}${suffisso}-v${versione}.pdf`;
}

/** Archivia il PDF prima della mail. Se fallisce, l'invio non deve partire. */
async function preparaPdfPreventivoEmesso(input: {
  preventivoId: string;
  numero: string;
  pdf: Buffer;
  userId: string;
  mailTo: string;
  mailOggetto: string;
  lingua?: string;
  allegatoInviato?: boolean;
  versioneCondivisa?: number;
}): Promise<
  | {
      ok: true;
      documentoId: string;
      versione: number;
      filename: string;
      sha256: string;
    }
  | { ok: false; error: string }
> {
  const service = createServiceClient();
  const lingua = input.lingua?.trim() || "it";
  const allegatoInviato = input.allegatoInviato !== false;
  const { data: aperto, error: openErr } = await service
    .from("preventivi_documenti_emessi")
    .select("id, versione")
    .eq("preventivo_id", input.preventivoId)
    .eq("stato", "preparato")
    .eq("lingua", lingua)
    .is("deleted_at", null)
    .maybeSingle();
  if (openErr) {
    return {
      ok: false,
      error: `Il PDF non è stato archiviato, la mail non è partita: ${openErr.message}`,
    };
  }
  let documentoId = "";
  let versione = input.versioneCondivisa ?? 0;
  if (aperto) {
    documentoId = String(aperto.id);
    versione = Number(aperto.versione);
  } else {
    documentoId = randomUUID();
    if (!versione) {
      const { data: last, error: lastErr } = await service
        .from("preventivi_documenti_emessi")
        .select("versione")
        .eq("preventivo_id", input.preventivoId)
        .eq("stato", "inviato")
        .is("deleted_at", null)
        .order("versione", { ascending: false })
        .limit(1);
      if (lastErr) {
        return {
          ok: false,
          error: `Il PDF non è stato archiviato, la mail non è partita: ${lastErr.message}`,
        };
      }
      versione = Number(last?.[0]?.versione ?? 0) + 1;
    }
  }
  const filename = nomePdfEmesso(input.numero, versione, lingua);
  const path = `${input.preventivoId}/${documentoId}.pdf`;
  const sha256 = createHash("sha256").update(input.pdf).digest("hex");
  const upload = await service.storage
    .from(PREVENTIVI_PDF_BUCKET)
    .upload(path, input.pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upload.error) {
    return {
      ok: false,
      error: `Il PDF non è stato archiviato, la mail non è partita: ${upload.error.message}`,
    };
  }
  if (aperto) {
    const { error } = await service
      .from("preventivi_documenti_emessi")
      .update({
        filename,
        storage_bucket: PREVENTIVI_PDF_BUCKET,
        storage_path: path,
        mime_type: "application/pdf",
        size_bytes: input.pdf.length,
        sha256,
        mail_to: input.mailTo,
        mail_oggetto: input.mailOggetto,
        lingua,
        allegato_inviato: allegatoInviato,
        updated_by: input.userId,
      })
      .eq("id", documentoId)
      .eq("stato", "preparato");
    if (error) {
      return {
        ok: false,
        error: `Il PDF non è stato archiviato, la mail non è partita: ${error.message}`,
      };
    }
  } else {
    const { error } = await service.from("preventivi_documenti_emessi").insert({
      id: documentoId,
      preventivo_id: input.preventivoId,
      versione,
      stato: "preparato",
      documento_stato: "bozza",
      storage_bucket: PREVENTIVI_PDF_BUCKET,
      storage_path: path,
      filename,
      mime_type: "application/pdf",
      size_bytes: input.pdf.length,
      sha256,
      mail_to: input.mailTo,
      mail_oggetto: input.mailOggetto,
      lingua,
      allegato_inviato: allegatoInviato,
      created_by: input.userId,
      updated_by: input.userId,
    });
    if (error) {
      await service.storage.from(PREVENTIVI_PDF_BUCKET).remove([path]);
      return {
        ok: false,
        error: `Il PDF non è stato archiviato, la mail non è partita: ${error.message}`,
      };
    }
  }
  return { ok: true, documentoId, versione, filename, sha256 };
}

async function chiudiPdfPreventivoEmesso(input: {
  documentoId: string;
  userId: string;
  messageId: string | null;
}): Promise<string | null> {
  const service = createServiceClient();
  const { error } = await service
    .from("preventivi_documenti_emessi")
    .update({
      stato: "inviato",
      documento_stato: "approvato",
      inviato_at: new Date().toISOString(),
      inviato_by: input.userId,
      mail_message_id: input.messageId ?? "",
      updated_by: input.userId,
    })
    .eq("id", input.documentoId)
    .eq("stato", "preparato")
    .is("deleted_at", null);
  return error?.message ?? null;
}

function destinatarioProvaPreventivo():
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const email = EMAIL_CONTROLLO_DEFAULT.trim();
  if (email.toLowerCase() !== "sandrohd@gmail.com") {
    return {
      ok: false,
      error: "La prova può scrivere solo a sandrohd@gmail.com.",
    };
  }
  return { ok: true, email };
}

async function notificaCommercialePreventivoInviato(input: {
  actorId: string;
  preventivoId: string;
  numero: string;
  cliente: string;
  commercialeId: string | null | undefined;
  mailTo: string;
}): Promise<boolean> {
  const id = String(input.commercialeId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const cliente = input.cliente.trim() || "il cliente";
  const verso = input.mailTo.trim() || "il cliente";
  const res = await dispatchNotifiche({
    actorId: input.actorId,
    includeActor: true,
    allowRepeat: true,
    recipientIds: [id],
    tipo: "attivita",
    title: `Preventivo ${input.numero} inviato`,
    body: `Preventivo ${input.numero} per ${cliente} inviato a ${verso}. Lo stato è passato a Inviato.`,
    href: "/app/commerciale/preventivi",
    entityType: "preventivi",
    entityId: input.preventivoId,
    payload: { stato: "inviato", mailTo: verso },
  });
  return res.created > 0;
}

/** Mail identica a quella del cliente, ma solo verso l'indirizzo di controllo. Nessun cambio di fase. */
async function inviaMailControlloPreventivo(input: {
  accountId: string;
  preventivoId: string;
  numero: string;
  oggetto: string;
  testo: string;
  html: string;
  pdf: Buffer;
  pdfNome: string;
  extra: Array<{ filename: string; content: Buffer; contentType: string }>;
  userId: string;
  destinatarioPrevisto: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const verso = destinatarioProvaPreventivo();
  if (!verso.ok) return verso;
  const service = createServiceClient();
  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", input.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { ok: false, error: accErr?.message ?? "Casella mail non trovata." };
  }
  const accountRow = account as {
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
  };
  try {
    await sendMailViaAccount({
      account: accountRow,
      to: verso.email,
      subject: input.oggetto,
      text: input.testo,
      html: input.html,
      attachments: [
        {
          filename: input.pdfNome,
          content: input.pdf,
          contentType: "application/pdf",
        },
        ...input.extra,
      ],
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Invio di prova non riuscito: ${e.message}`
          : "Invio di prova non riuscito.",
    };
  }
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: input.preventivoId,
    action: "export",
    actor_id: input.userId,
    summary: `Prova preventivo ${input.numero}: mail solo a ${verso.email}, fase invariata`,
    payload: {
      fase: "prova",
      destinatarioEffettivo: verso.email,
      destinatarioPrevisto: input.destinatarioPrevisto,
      statoInvariato: true,
    },
  });
  return { ok: true };
}

export async function inviaPreventivoMailAction(
  raw: unknown
): Promise<
  | {
      success: true;
      item: Preventivo;
      provaInvio?: boolean;
      notificaCommerciale?: boolean;
    }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = inviaPreventivoMailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mail non validi",
    };
  }
  const input = parsed.data;
  const casella = await assertWebmailAccountAccess(
    gate.auth,
    input.mailAccountId
  );
  if (!casella.ok) return { success: false, error: casella.error };
  const pdfBuffer = bufferPdfPreventivo(input.pdfBase64);
  if (!pdfBuffer) {
    return {
      success: false,
      error:
        "Preventivo salvato in archivio. La scheda non è allegabile: riprova l'invio.",
    };
  }
  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("preventivi")
    .select(
      "id, numero_interno, stato, sent_at, accettazione_senior_stato, modalita_spedizione_prezzo, spedizione_importo, consegna_metodo, cliente_id, cliente_possibile_id, cliente_ragione_sociale, commerciale_riferimento_id"
    )
    .eq("id", input.preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rowErr || !row) {
    return { success: false, error: rowErr?.message ?? "Preventivo non trovato" };
  }
  const prev = row as {
    id: string;
    numero_interno: string;
    stato: string;
    sent_at: string | null;
    accettazione_senior_stato: string | null;
    modalita_spedizione_prezzo: string | null;
    spedizione_importo: number | null;
    consegna_metodo: string | null;
    cliente_id: string | null;
    cliente_possibile_id: string | null;
    cliente_ragione_sociale: string | null;
    commerciale_riferimento_id: string | null;
  };
  if (
    accettazioneSeniorBloccaInvio(
      parseAccettazioneSeniorStato(prev.accettazione_senior_stato)
    )
  ) {
    return {
      success: false,
      error:
        "Preventivo salvato in archivio. Il senior deve accettarlo prima dell'invio della mail.",
    };
  }
  if (prev.sent_at) {
    return {
      success: false,
      error: "La mail di questo preventivo è già stata inviata.",
    };
  }
  const bloccoInvio = motivoBloccoInvioPreventivo(prev);
  if (bloccoInvio) return { success: false, error: bloccoInvio };
  if (FASE_TEST_INVIO_PREVENTIVO) {
    const metodoSpedizione =
      prev.consegna_metodo === "corriere_cliente" ||
      prev.consegna_metodo === "corriere_nostro" ||
      prev.consegna_metodo === "da_concordare" ||
      prev.consegna_metodo === "ritiro"
        ? prev.consegna_metodo
        : "corriere_cliente";
    const corpoMail = normalizzaVoceSpedizioneMail(
      input.mailTesto,
      metodoSpedizione,
      prev.modalita_spedizione_prezzo ?? ""
    );
    const linguaAllegato = input.linguaAllegato?.trim() || "it";
    const corpoConDicitura =
      linguaAllegato !== "it"
        ? applicaDicituraTraduzioneAi(corpoMail, input.modelloTraduzione)
        : corpoMail;
    const extraAllegati = await leggiAllegatiInvioPreventivo(prev.id);
    if (!extraAllegati.ok) {
      return { success: false, error: extraAllegati.error };
    }
    const prova = await inviaMailControlloPreventivo({
      accountId: input.mailAccountId,
      preventivoId: prev.id,
      numero: prev.numero_interno,
      oggetto: input.mailOggetto,
      testo: testoMailPreventivoConFirma(corpoConDicitura),
      html: htmlMailPreventivoConFirma(corpoConDicitura),
      pdf: pdfBuffer,
      pdfNome: nomePdfEmesso(prev.numero_interno, 1, linguaAllegato),
      extra: extraAllegati.files,
      userId: gate.auth.userId,
      destinatarioPrevisto: input.mailTo,
    });
    if (!prova.ok) return { success: false, error: prova.error };
    const { data: fresco, error: frescoErr } = await supabase
      .from("preventivi")
      .select("*")
      .eq("id", prev.id)
      .is("deleted_at", null)
      .single();
    if (frescoErr || !fresco) {
      return {
        success: false,
        error:
          frescoErr?.message ??
          "Mail di prova inviata, ma non rileggo il preventivo.",
      };
    }
    const { data: righe } = await supabase
      .from("preventivi_righe")
      .select("*")
      .eq("preventivo_id", prev.id)
      .order("sort_order", { ascending: true });
    const pdfEmessi = await attachPdfEmessi([prev.id]);
    return {
      success: true,
      provaInvio: true,
      item: mapPreventivo(
        fresco as PreventivoRow,
        (righe ?? []) as PreventivoRigaRow[],
        "",
        gate.auth.userId,
        isSuperadminProfile(gate.auth.profile),
        pdfEmessi.get(prev.id) ?? []
      ),
    };
  }
  const now = new Date().toISOString();
  const { error: draftErr } = await supabase
    .from("preventivi")
    .update({
      mail_bozza_account_id: input.mailAccountId,
      mail_bozza_to: input.mailTo,
      mail_bozza_oggetto: input.mailOggetto,
      mail_bozza_testo: input.mailTesto,
      updated_by: gate.auth.userId,
    })
    .eq("id", prev.id)
    .is("deleted_at", null);
  if (draftErr) {
    return { success: false, error: draftErr.message };
  }
  const service = createServiceClient();
  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", input.mailAccountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return {
      success: false,
      error:
        accErr?.message ??
        "Preventivo salvato in archivio. Casella mail non trovata.",
    };
  }
  const accountRow = account as {
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
  };
  const metodoSpedizione =
    prev.consegna_metodo === "corriere_cliente" ||
    prev.consegna_metodo === "corriere_nostro" ||
    prev.consegna_metodo === "da_concordare" ||
    prev.consegna_metodo === "ritiro"
      ? prev.consegna_metodo
      : "corriere_cliente";
  const corpoMail = normalizzaVoceSpedizioneMail(
    input.mailTesto,
    metodoSpedizione,
    prev.modalita_spedizione_prezzo ?? ""
  );
  const linguaAllegato = input.linguaAllegato?.trim() || "it";
  const corpoConDicitura =
    linguaAllegato !== "it"
      ? applicaDicituraTraduzioneAi(corpoMail, input.modelloTraduzione)
      : corpoMail;
  const mailTestoFirmato = testoMailPreventivoConFirma(corpoConDicitura);
  const mailHtmlFirmato = htmlMailPreventivoConFirma(corpoConDicitura);
  const pdfArchivio = input.pdfArchivioBase64
    ? bufferPdfPreventivo(input.pdfArchivioBase64)
    : null;
  const salvaItaliano =
    linguaAllegato !== "it" && pdfArchivio != null && pdfArchivio.length > 0;
  let archivioItaliano: Awaited<
    ReturnType<typeof preparaPdfPreventivoEmesso>
  > | null = null;
  if (salvaItaliano && pdfArchivio) {
    archivioItaliano = await preparaPdfPreventivoEmesso({
      preventivoId: prev.id,
      numero: prev.numero_interno,
      pdf: pdfArchivio,
      userId: gate.auth.userId,
      mailTo: input.mailTo,
      mailOggetto: input.mailOggetto,
      lingua: "it",
      allegatoInviato: false,
    });
    if (!archivioItaliano.ok) {
      return { success: false, error: archivioItaliano.error };
    }
  }
  const archivio = await preparaPdfPreventivoEmesso({
    preventivoId: prev.id,
    numero: prev.numero_interno,
    pdf: pdfBuffer,
    userId: gate.auth.userId,
    mailTo: input.mailTo,
    mailOggetto: input.mailOggetto,
    lingua: linguaAllegato,
    allegatoInviato: true,
    versioneCondivisa: archivioItaliano?.ok
      ? archivioItaliano.versione
      : undefined,
  });
  if (!archivio.ok) return { success: false, error: archivio.error };
  const pdfNome = archivio.filename;
  const extraAllegati = await leggiAllegatiInvioPreventivo(prev.id);
  if (!extraAllegati.ok) {
    return {
      success: false,
      error: `Preventivo salvato in archivio. ${extraAllegati.error}`,
    };
  }
  const allegatiMail = [
    {
      filename: pdfNome,
      content: pdfBuffer,
      contentType: "application/pdf",
    },
    ...extraAllegati.files,
  ];
  let smtpMessageId: string | null = null;
  try {
    const sent = await sendMailViaAccount({
      account: accountRow,
      to: input.mailTo,
      subject: input.mailOggetto,
      text: mailTestoFirmato,
      html: mailHtmlFirmato,
      attachments: allegatiMail,
    });
    smtpMessageId = sent.messageId;
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Preventivo salvato in archivio. Invio mail non riuscito: ${e.message}`
          : "Preventivo salvato in archivio. Invio mail non riuscito.",
    };
  }
  const chiusuraPdf = await chiudiPdfPreventivoEmesso({
    documentoId: archivio.documentoId,
    userId: gate.auth.userId,
    messageId: smtpMessageId,
  });
  const chiusuraItaliano =
    archivioItaliano?.ok
      ? await chiudiPdfPreventivoEmesso({
          documentoId: archivioItaliano.documentoId,
          userId: gate.auth.userId,
          messageId: smtpMessageId,
        })
      : null;
  const aziendaTipo = prev.cliente_id
    ? "cliente"
    : prev.cliente_possibile_id
      ? "cliente_possibile"
      : null;
  const aziendaId = prev.cliente_id || prev.cliente_possibile_id || null;
  await registraCopiaMailInviata({
    supabase: service,
    accountId: accountRow.id,
    fromAddress: accountRow.email_address,
    to: input.mailTo,
    subject: input.mailOggetto,
    text: mailTestoFirmato,
    html: mailHtmlFirmato,
    messageId: smtpMessageId,
    userId: gate.auth.userId,
    aziendaTipo,
    aziendaId,
    aziendaLabel: prev.cliente_ragione_sociale ?? "",
    attachments: allegatiMail,
  });
  const { data: updated, error: sentErr } = await supabase
    .from("preventivi")
    .update({
      stato: "inviato",
      documento_stato: "approvato",
      sent_at: now,
      sent_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .eq("id", prev.id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (sentErr || !updated) {
    return {
      success: false,
      error:
        sentErr?.message ??
        "Mail inviata, ma lo stato del preventivo non è stato aggiornato.",
    };
  }
  const { data: righe } = await supabase
    .from("preventivi_righe")
    .select("*")
    .eq("preventivo_id", prev.id)
    .order("sort_order", { ascending: true });
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: prev.id,
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${prev.numero_interno} inviato a ${input.mailTo}`,
    payload: {
      mailTo: input.mailTo,
      mailAccountId: input.mailAccountId,
      documentoId: archivio.documentoId,
      documentoItalianoId: archivioItaliano?.ok
        ? archivioItaliano.documentoId
        : null,
      versionePdf: archivio.versione,
      sha256: archivio.sha256,
      linguaAllegato,
    },
  });
  const notificaCommerciale = await notificaCommercialePreventivoInviato({
    actorId: gate.auth.userId,
    preventivoId: prev.id,
    numero: prev.numero_interno,
    cliente: prev.cliente_ragione_sociale ?? "",
    commercialeId: prev.commerciale_riferimento_id,
    mailTo: input.mailTo,
  });
  if (chiusuraPdf || chiusuraItaliano) {
    return {
      success: false,
      error: `Mail inviata. Il PDF è in archivio ma non è stato chiuso come documento emesso: ${chiusuraPdf || chiusuraItaliano}`,
    };
  }
  await writeAuditLog({
    entity_type: "preventivi_documenti_emessi",
    entity_id: archivio.documentoId,
    action: "create",
    actor_id: gate.auth.userId,
    summary: `PDF v${archivio.versione} del preventivo ${prev.numero_interno} archiviato`,
    payload: {
      preventivoId: prev.id,
      filename: archivio.filename,
      sha256: archivio.sha256,
      mailTo: input.mailTo,
    },
  });
  return {
    success: true,
    notificaCommerciale,
    item: mapPreventivo(
      updated as PreventivoRow,
      (righe ?? []) as PreventivoRigaRow[],
      "",
      gate.auth.userId,
      isSuperadminProfile(gate.auth.profile),
      [
        ...(archivioItaliano?.ok
          ? [
              {
                id: archivioItaliano.documentoId,
                versione: archivioItaliano.versione,
                filename: archivioItaliano.filename,
                inviatoAt: now,
                mailTo: input.mailTo,
                lingua: "it",
                allegatoInviato: false,
              },
            ]
          : []),
        {
          id: archivio.documentoId,
          versione: archivio.versione,
          filename: archivio.filename,
          inviatoAt: now,
          mailTo: input.mailTo,
          lingua: linguaAllegato,
          allegatoInviato: true,
        },
      ]
    ),
  };
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
  confermaInvio: boolean;
}): Promise<
  | {
      success: true;
      provaChiusa?: boolean;
      provaInvio?: boolean;
      notificaCommerciale?: boolean;
    }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const importo = Number(input.importo);
  if (!Number.isFinite(importo) || !(importo > 0)) {
    return { success: false, error: "Inserisci il costo della spedizione." };
  }
  if (input.confermaInvio !== true) {
    return {
      success: false,
      error:
        "Conferma l'invio della mail dopo aver inserito il prezzo. Senza conferma non parte nulla.",
    };
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
      "id, numero_interno, stato, sent_at, accettazione_senior_stato, spedizione_lock_by, spedizione_lock_at, data_preventivo, cliente_id, cliente_ragione_sociale, tipo_pagamento, giorni_consegna, validita_giorni, note, consegna_metodo, commerciale_riferimento_id, commerciale_riferimento_nome, commerciale_riferimento_telefono, commerciale_riferimento_email, mail_bozza_account_id, mail_bozza_to, mail_bozza_oggetto, mail_bozza_testo"
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
    accettazione_senior_stato?: string | null;
    cliente_ragione_sociale?: string | null;
    commerciale_riferimento_id?: string | null;
  };
  if (
    accettazioneSeniorBloccaInvio(
      parseAccettazioneSeniorStato(prev.accettazione_senior_stato)
    )
  ) {
    return {
      success: false,
      error:
        "Il senior deve accettare questo preventivo prima dell'invio della mail.",
    };
  }
  if (prev.stato !== "in_attesa_spedizione") {
    return { success: false, error: "Questo preventivo non è in attesa di spedizione." };
  }
  const lockRow = row as {
    spedizione_lock_by?: string | null;
    spedizione_lock_at?: string | null;
  };
  if (
    lockRow.spedizione_lock_by &&
    lockRow.spedizione_lock_by !== auth.userId &&
    spedizioneLockAttivo(lockRow.spedizione_lock_at)
  ) {
    return {
      success: false,
      error: "Un altro operatore sta già inserendo il costo di spedizione.",
    };
  }
  if (prev.sent_at) {
    return { success: false, error: "La mail di questo preventivo è già stata inviata." };
  }
  if (!prev.mail_bozza_account_id || !prev.mail_bozza_to.includes("@")) {
    return { success: false, error: "Manca la mail preparata dal commerciale." };
  }
  if (FASE_TEST_INVIO_PREVENTIVO) {
    const extraAllegati = await leggiAllegatiInvioPreventivo(prev.id);
    if (!extraAllegati.ok) return { success: false, error: extraAllegati.error };
    const testo = testoMailPreventivoConFirma(prev.mail_bozza_testo);
    const prova = await inviaMailControlloPreventivo({
      accountId: prev.mail_bozza_account_id,
      preventivoId: prev.id,
      numero: prev.numero_interno,
      oggetto: prev.mail_bozza_oggetto,
      testo,
      html: htmlMailPreventivoConFirma(prev.mail_bozza_testo),
      pdf: pdfBuffer,
      pdfNome: nomePdfEmesso(prev.numero_interno, 1, "it"),
      extra: extraAllegati.files,
      userId: auth.userId,
      destinatarioPrevisto: prev.mail_bozza_to,
    });
    if (!prova.ok) return { success: false, error: prova.error };
    const { error: lockErr } = await service
      .from("preventivi")
      .update({
        spedizione_lock_by: null,
        spedizione_lock_at: null,
      })
      .eq("id", prev.id)
      .eq("stato", "in_attesa_spedizione");
    if (lockErr) return { success: false, error: lockErr.message };
    return { success: true, provaInvio: true };
  }
  const now = new Date().toISOString();
  const archivio = await preparaPdfPreventivoEmesso({
    preventivoId: prev.id,
    numero: prev.numero_interno,
    pdf: pdfBuffer,
    userId: auth.userId,
    mailTo: prev.mail_bozza_to,
    mailOggetto: prev.mail_bozza_oggetto,
  });
  if (!archivio.ok) return { success: false, error: archivio.error };
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
    fileName: archivio.filename,
  };
  const accountRow = account as {
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
  };
  const mailTestoFirmato = testoMailPreventivoConFirma(prev.mail_bozza_testo);
  const mailHtmlFirmato = htmlMailPreventivoConFirma(prev.mail_bozza_testo);
  const extraAllegati = await leggiAllegatiInvioPreventivo(prev.id);
  if (!extraAllegati.ok) {
    return { success: false, error: `Importo salvato. ${extraAllegati.error}` };
  }
  const allegatiMail = [
    {
      filename: pdf.fileName,
      content: pdf.buffer,
      contentType: "application/pdf",
    },
    ...extraAllegati.files,
  ];
  let smtpMessageId: string | null = null;
  try {
    const sent = await sendMailViaAccount({
      account: accountRow,
      to: prev.mail_bozza_to,
      subject: prev.mail_bozza_oggetto,
      text: mailTestoFirmato,
      html: mailHtmlFirmato,
      attachments: allegatiMail,
    });
    smtpMessageId = sent.messageId;
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Importo salvato, invio mail non riuscito: ${e.message}`
          : "Importo salvato, invio mail non riuscito.",
    };
  }
  const chiusuraPdf = await chiudiPdfPreventivoEmesso({
    documentoId: archivio.documentoId,
    userId: auth.userId,
    messageId: smtpMessageId,
  });
  await registraCopiaMailInviata({
    supabase: service,
    accountId: accountRow.id,
    fromAddress: accountRow.email_address,
    to: prev.mail_bozza_to,
    subject: prev.mail_bozza_oggetto,
    text: mailTestoFirmato,
    html: mailHtmlFirmato,
    messageId: smtpMessageId,
    userId: auth.userId,
    attachments: allegatiMail,
  });
  const { error: sentErr } = await service
    .from("preventivi")
    .update({
      stato: "inviato",
      documento_stato: "approvato",
      sent_at: now,
      sent_by: auth.userId,
      spedizione_lock_by: null,
      spedizione_lock_at: null,
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
    payload: {
      importo,
      mailTo: prev.mail_bozza_to,
      documentoId: archivio.documentoId,
      versionePdf: archivio.versione,
      sha256: archivio.sha256,
    },
  });
  const notificaCommerciale = await notificaCommercialePreventivoInviato({
    actorId: auth.userId,
    preventivoId: prev.id,
    numero: prev.numero_interno,
    cliente: prev.cliente_ragione_sociale ?? "",
    commercialeId: prev.commerciale_riferimento_id,
    mailTo: prev.mail_bozza_to,
  });
  if (chiusuraPdf) {
    return {
      success: false,
      error: `Mail inviata. Il PDF è in archivio ma non è stato chiuso come documento emesso: ${chiusuraPdf}`,
    };
  }
  await writeAuditLog({
    entity_type: "preventivi_documenti_emessi",
    entity_id: archivio.documentoId,
    action: "create",
    actor_id: auth.userId,
    summary: `PDF v${archivio.versione} del preventivo ${prev.numero_interno} archiviato`,
    payload: {
      preventivoId: prev.id,
      filename: archivio.filename,
      sha256: archivio.sha256,
      mailTo: prev.mail_bozza_to,
    },
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
    return { success: true, provaChiusa: true, notificaCommerciale };
  }
  return { success: true, notificaCommerciale };
}

export async function apriPdfPreventivoEmessoAction(
  documentoId: string
): Promise<
  { success: true; url: string; filename: string } | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(documentoId)) {
    return { success: false, error: "Documento non valido" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi_documenti_emessi")
    .select("id, preventivo_id, storage_bucket, storage_path, filename")
    .eq("id", documentoId)
    .eq("stato", "inviato")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "PDF non trovato" };
  }
  const { data: prev, error: prevErr } = await supabase
    .from("preventivi")
    .select("*")
    .eq("id", String(data.preventivo_id))
    .maybeSingle();
  if (prevErr || !prev) {
    return { success: false, error: "Preventivo non trovato" };
  }
  const perimetro = await resolvePerimetroDocumenti();
  if (!rigaNelPerimetro(prev as PreventivoRow, perimetro, { riferimento: true })) {
    return { success: false, error: "PDF non trovato" };
  }
  const service = createServiceClient();
  const signed = await service.storage
    .from(String(data.storage_bucket || PREVENTIVI_PDF_BUCKET))
    .createSignedUrl(String(data.storage_path), 120);
  if (signed.error || !signed.data?.signedUrl) {
    return {
      success: false,
      error: signed.error?.message ?? "PDF non apribile",
    };
  }
  return {
    success: true,
    url: signed.data.signedUrl,
    filename: String(data.filename ?? "preventivo.pdf"),
  };
}

export async function sostituisciAllegatiInvioPreventivoAction(
  formData: FormData
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  const preventivoId = String(formData.get("preventivoId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(preventivoId)) {
    return { success: false, error: "Preventivo non valido." };
  }
  const files = formData
    .getAll("file")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > ALLEGATI_INVIO_MAX) {
    return { success: false, error: "Puoi allegare al massimo 8 file." };
  }
  for (const file of files) {
    if (!mimeAllegatoInvio(file)) {
      return {
        success: false,
        error: `Tipo non ammesso per «${file.name}». Usa PDF, JPEG, PNG o WebP.`,
      };
    }
    if (file.size > ALLEGATI_INVIO_BYTES) {
      return { success: false, error: `«${file.name}» supera 15 MB.` };
    }
  }
  const service = createServiceClient();
  const { data: prev, error: prevErr } = await service
    .from("preventivi")
    .select("id, stato, sent_at, numero_interno")
    .eq("id", preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (prevErr || !prev) {
    return { success: false, error: prevErr?.message ?? "Preventivo non trovato." };
  }
  if (prev.sent_at || prev.stato === "inviato") {
    return {
      success: false,
      error: "Il preventivo è già stato inviato: gli allegati non si sostituiscono.",
    };
  }
  const nuovi: string[] = [];
  const now = new Date().toISOString();
  try {
    for (const file of files) {
      const mime = mimeAllegatoInvio(file);
      if (!mime) throw new Error(`Tipo non ammesso per «${file.name}».`);
      const id = randomUUID();
      const safe = file.name.replace(/[^\w.\- ()àèéìòù]+/gi, "_").slice(0, 80);
      const path = `${preventivoId}/${id}-${safe || "allegato"}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await service.storage
        .from(PREVENTIVI_ALLEGATI_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const inserted = await service.from("preventivi_allegati_invio").insert({
        id,
        preventivo_id: preventivoId,
        storage_path: path,
        file_name: file.name.slice(0, 180),
        content_type: mime,
        byte_size: bytes.length,
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      });
      if (inserted.error) throw new Error(inserted.error.message);
      nuovi.push(id);
    }
  } catch (e) {
    if (nuovi.length) {
      await service
        .from("preventivi_allegati_invio")
        .update({
          deleted_at: now,
          deleted_by: gate.auth.userId,
          updated_by: gate.auth.userId,
        })
        .in("id", nuovi);
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Allegati non salvati.",
    };
  }
  const { data: vivi, error: viviErr } = await service
    .from("preventivi_allegati_invio")
    .select("id")
    .eq("preventivo_id", preventivoId)
    .is("deleted_at", null);
  if (viviErr) return { success: false, error: viviErr.message };
  const vecchi = (vivi ?? [])
    .map((row) => String(row.id))
    .filter((id) => !nuovi.includes(id));
  if (vecchi.length) {
    const rimossi = await service
      .from("preventivi_allegati_invio")
      .update({
        deleted_at: now,
        deleted_by: gate.auth.userId,
        updated_by: gate.auth.userId,
        updated_at: now,
      })
      .in("id", vecchi);
    if (rimossi.error) return { success: false, error: rimossi.error.message };
  }
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: preventivoId,
    action: files.length ? "attachment_upload" : "attachment_remove",
    actor_id: gate.auth.userId,
    summary: files.length
      ? `Allegati del preventivo ${prev.numero_interno}: ${files.length} file`
      : `Allegati del preventivo ${prev.numero_interno} rimossi`,
    payload: { nomi: files.map((file) => file.name) },
  });
  return { success: true, count: files.length };
}

export type MailInviataCollegabile = {
  id: string;
  oggetto: string;
  destinatario: string;
  inviataIl: string;
  mittente: string;
};

function testoIndirizzi(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value ?? "");
}

export async function listMailInviatePerPreventivoAction(
  preventivoId: string
): Promise<
  | { success: true; messaggi: MailInviataCollegabile[]; verso: string }
  | { success: false; error: string }
> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (!/^[0-9a-f-]{36}$/i.test(preventivoId)) {
    return { success: false, error: "Preventivo non valido." };
  }
  const service = createServiceClient();
  const { data: prev, error: prevErr } = await service
    .from("preventivi")
    .select("id, mail_bozza_to, cliente_id, cliente_possibile_id, stato")
    .eq("id", preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (prevErr || !prev) {
    return { success: false, error: prevErr?.message ?? "Preventivo non trovato." };
  }
  if (prev.stato !== "creato_da_inviare") {
    return { success: false, error: "Questo preventivo non è in Creato da inviare." };
  }
  let verso = String(prev.mail_bozza_to ?? "").trim().toLowerCase();
  if (!verso.includes("@") && prev.cliente_id) {
    const { data } = await service
      .from("clienti")
      .select("email")
      .eq("id", prev.cliente_id)
      .maybeSingle();
    verso = String(data?.email ?? "").trim().toLowerCase();
  }
  if (!verso.includes("@") && prev.cliente_possibile_id) {
    const { data } = await service
      .from("clienti_possibili")
      .select("email")
      .eq("id", prev.cliente_possibile_id)
      .maybeSingle();
    verso = String(data?.email ?? "").trim().toLowerCase();
  }
  const vis = await resolveWebmailAccountVisibility(gate.auth);
  if (vis.mode === "granted" && vis.ids.length === 0) {
    return { success: true, messaggi: [], verso };
  }
  const dal = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let query = service
    .from("webmail_messaggi")
    .select("id, subject, to_addresses, from_address, sent_at, created_at")
    .eq("direction", "outbound")
    .is("deleted_at", null)
    .gte("created_at", dal)
    .order("created_at", { ascending: false })
    .limit(100);
  if (vis.mode === "granted") query = query.in("account_id", vis.ids);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  const tutte = (data ?? []).map((row) => ({
    id: String(row.id),
    oggetto: String(row.subject ?? "") || "(senza oggetto)",
    destinatario: testoIndirizzi(row.to_addresses),
    inviataIl: String(row.sent_at || row.created_at || ""),
    mittente: String(row.from_address ?? ""),
  }));
  const mirate = verso.includes("@")
    ? tutte.filter((row) => row.destinatario.toLowerCase().includes(verso))
    : [];
  return {
    success: true,
    messaggi: mirate.length ? mirate : tutte,
    verso,
  };
}

export async function collegaInvioManualePreventivoAction(input: {
  preventivoId: string;
  messaggioId: string;
}): Promise<{ success: true; item: Preventivo } | { success: false; error: string }> {
  const gate = await requirePreventiviAccess();
  if (!gate.ok) return { success: false, error: gate.error };
  if (FASE_TEST_INVIO_PREVENTIVO) {
    return {
      success: false,
      error:
        "Fase di prova: il preventivo non si segna inviato. La mail di controllo parte solo verso sandrohd@gmail.com e la fase resta quella attuale.",
    };
  }
  if (
    !/^[0-9a-f-]{36}$/i.test(input.preventivoId) ||
    !/^[0-9a-f-]{36}$/i.test(input.messaggioId)
  ) {
    return { success: false, error: "Dati non validi." };
  }
  const service = createServiceClient();
  const { data: prev, error: prevErr } = await service
    .from("preventivi")
    .select(
      "id, stato, numero_interno, sent_at, accettazione_senior_stato, cliente_ragione_sociale, commerciale_riferimento_id, mail_bozza_to"
    )
    .eq("id", input.preventivoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (prevErr || !prev) {
    return { success: false, error: prevErr?.message ?? "Preventivo non trovato." };
  }
  if (prev.stato !== "creato_da_inviare" || prev.sent_at) {
    return { success: false, error: "Questo preventivo non è in attesa di conferma invio." };
  }
  if (
    accettazioneSeniorBloccaInvio(
      parseAccettazioneSeniorStato(prev.accettazione_senior_stato)
    )
  ) {
    return {
      success: false,
      error: "Il senior deve accettare questo preventivo prima di segnarlo inviato.",
    };
  }
  const vis = await resolveWebmailAccountVisibility(gate.auth);
  let mailQuery = service
    .from("webmail_messaggi")
    .select("id, subject, account_id")
    .eq("id", input.messaggioId)
    .eq("direction", "outbound")
    .is("deleted_at", null);
  if (vis.mode === "granted") mailQuery = mailQuery.in("account_id", vis.ids);
  const { data: mail, error: mailErr } = await mailQuery.maybeSingle();
  if (mailErr || !mail) {
    return { success: false, error: "Mail inviata non trovata nella tua casella." };
  }
  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await service
    .from("preventivi")
    .update({
      stato: "inviato",
      documento_stato: "approvato",
      sent_at: now,
      sent_by: gate.auth.userId,
      webmail_invio_id: mail.id,
      updated_by: gate.auth.userId,
    })
    .eq("id", prev.id)
    .eq("stato", "creato_da_inviare")
    .is("deleted_at", null)
    .select("*")
    .single();
  if (upErr || !updated) {
    return { success: false, error: upErr?.message ?? "Stato non aggiornato." };
  }
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: prev.id,
    action: "status_change",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${prev.numero_interno} segnato inviato e collegato alla mail «${mail.subject ?? ""}»`,
    payload: { webmailInvioId: mail.id, oggetto: mail.subject ?? "" },
  });
  const collegato = updated as PreventivoRow;
  await notificaCommercialePreventivoInviato({
    actorId: gate.auth.userId,
    preventivoId: collegato.id,
    numero: collegato.numero_interno,
    cliente: collegato.cliente_ragione_sociale,
    commercialeId: collegato.commerciale_riferimento_id,
    mailTo: collegato.mail_bozza_to,
  });
  const righe = await attachRighe([prev.id]);
  const pdfEmessi = await attachPdfEmessi([prev.id]);
  return {
    success: true,
    item: mapPreventivo(
      updated as PreventivoRow,
      righe.get(prev.id) ?? [],
      "",
      gate.auth.userId,
      isSuperadminProfile(gate.auth.profile),
      pdfEmessi.get(prev.id) ?? []
    ),
  };
}
