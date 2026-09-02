"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  createPreventivoSchema,
  formatNumeroPreventivo,
  type Preventivo,
  type PreventivoRiga,
  type PreventivoStato,
} from "@/lib/amministrazione/preventivi";
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
    confezionamento: row.confezionamento,
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
    tipoPagamento: row.tipo_pagamento,
    tempiPagamentoGiorni: row.tempi_pagamento_giorni,
    tempiPagamentoNote: row.tempi_pagamento_note,
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

async function nextSeq(targa: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .select("numero_interno")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const code = targa.trim().toUpperCase().replace(/\s+/g, "");
  const re = new RegExp(
    `^Pv-\\d{2}-${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.numero_interno).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
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
  const seq = await nextSeq(input.codiceTargaCliente);
  const numero = formatNumeroPreventivo(
    input.dataPreventivo,
    input.codiceTargaCliente,
    seq
  );
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preventivi")
    .insert({
      numero_interno: numero,
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente,
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_preventivo: input.dataPreventivo,
      stato: "creato",
      documento_stato: "bozza",
      versione: 1,
      consegna_metodo: input.consegnaMetodo,
      spedizione_a_carico: input.spedizioneACarico,
      spedizione_importo: input.spedizioneImporto ?? 0,
      tipo_pagamento: input.tipoPagamento,
      tempi_pagamento_giorni: input.tempiPagamentoGiorni ?? null,
      tempi_pagamento_note: input.tempiPagamentoNote ?? "",
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
        confezionamento: r.confezionamento ?? "",
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
