"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  CONFEZIONE_STANDARD,
  createPreventivoSchema,
  formatNumeroPreventivo,
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
  coordinateBancarieFallback,
  formatNumeroPreventivoDocumento,
  yearFromPreventivoData,
  type CoordinateBancarieAgrinsicilia,
} from "@/lib/amministrazione/preventivo-letterhead";
import { fetchFicPaymentAccounts } from "@/lib/fic";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { queryListinoVoceVigente } from "@/lib/ecosystem/listino-vigente-query";
import {
  LISTINO_CONTRATTO_MSG,
  valutaListinoPerContratto,
} from "@/lib/ecosystem/listino-vigente";
import type { ListinoDisponibilita } from "@/lib/ecosystem/listini";
import type { PreventivoRigaRow, PreventivoRow } from "@/types/database";

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
    includeCoordinateBancarie: Boolean(row.include_coordinate_bancarie),
    coordinateBanca: row.coordinate_banca ?? "",
    coordinateIban: row.coordinate_iban ?? "",
    coordinateBic: row.coordinate_bic ?? "",
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
      stato: "creato",
      documento_stato: "bozza",
      versione: 1,
      consegna_metodo: input.consegnaMetodo,
      spedizione_a_carico: input.spedizioneACarico,
      spedizione_importo: input.spedizioneImporto ?? 0,
      spedizione_importo_base: input.spedizioneImportoBase ?? 0,
      spedizione_markup_pct: input.spedizioneMarkupPct ?? 30,
      spedizione_fonte:
        input.spedizioneFonte ?? fonteDefaultDaConsegna(input.consegnaMetodo),
      tipo_pagamento: input.tipoPagamento,
      tempi_pagamento_giorni: input.tempiPagamentoGiorni ?? null,
      tempi_pagamento_note: "",
      giorni_consegna: input.giorniConsegna || "da concordare",
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
      note: input.note ?? "",
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }
  const header = data as PreventivoRow;
  const { data: righe, error: rErr } = await supabase
    .from("preventivi_righe")
    .insert(
      input.righe.map((r, i) => ({
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
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: header.id,
    action: "create",
    actor_id: gate.auth.userId,
    summary: `Preventivo ${numero} creato per ${input.cliente}`,
    payload: {
      cliente_id: input.clienteId ?? null,
      cliente_possibile_id: input.clientePossibileId ?? null,
      numero_interno: numero,
    },
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
  const fallback = coordinateBancarieFallback();
  try {
    const accounts = await fetchFicPaymentAccounts();
    const preferred =
      accounts.find(
        (a) => a.iban && /don\s*rizzo|bcc|ts\s*pay/i.test(a.name)
      ) ?? accounts.find((a) => Boolean(a.iban));
    if (preferred?.iban) {
      return {
        success: true,
        item: {
          banca: preferred.name || fallback.banca,
          iban: preferred.iban,
          bic: fallback.bic,
          intestatario: fallback.intestatario,
        },
      };
    }
  } catch {
    /* FiC assente: prova snapshot fatture / env */
  }
  const supabase = await createClient();
  const { data, error: fattErr } = await supabase
    .from("fatture_emesse")
    .select("iban")
    .not("iban", "eq", "")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const fromFattura = fattErr
    ? undefined
    : ((data ?? []) as { iban?: string }[]).find((r) =>
        Boolean(r.iban?.trim())
      );
  if (fromFattura?.iban) {
    return {
      success: true,
      item: { ...fallback, iban: fromFattura.iban.replace(/\s+/g, "") },
    };
  }
  return { success: true, item: fallback };
}
