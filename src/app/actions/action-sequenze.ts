"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type { DocumentoStatoCatalogo } from "@/lib/action/azioni-catalogo";
import type { IotAttuatoreTipo, IotPrecondizione } from "@/lib/action/iot-componenti";
import {
  copiaSequenzaSchema,
  nomeSequenzaCopia,
  sequenzaPassoInputSchema,
  sequenzaPassoUpdateSchema,
  sequenzaTestataSchema,
  type ActionSequenza,
  type SequenzaComando,
  type SequenzaEsecuzioneStato,
  type SequenzaPasso,
  type SequenzaTipo,
} from "@/lib/action/sequenze";
import { z } from "zod";

type SeqRow = {
  id: string;
  essiccatore_id: string;
  nome: string;
  descrizione: string;
  tipo: string;
  versione: number;
  documento_stato: string;
  esecuzione_stato: string;
  created_at: string;
  copiata_da_id?: string | null;
};

type PassoRow = {
  id: string;
  sequenza_id: string;
  componente_id: string;
  sort_order: number;
  comando: string;
  valore: number | null;
  durata_comando_sec: number | null;
  stallo_dopo_sec: number | null;
  precondizione: string;
};

const SEQ_COLS =
  "id, essiccatore_id, nome, descrizione, tipo, versione, documento_stato, esecuzione_stato, created_at, copiata_da_id";
const PASSO_COLS =
  "id, sequenza_id, componente_id, sort_order, comando, valore, durata_comando_sec, stallo_dopo_sec, precondizione";

function mapPasso(
  p: PassoRow,
  comp: { nome: string; tipo: string; mexCmd: number | null }
): SequenzaPasso {
  return {
    id: p.id,
    sequenzaId: p.sequenza_id,
    componenteId: p.componente_id,
    componenteNome: comp.nome,
    componenteTipo: comp.tipo as IotAttuatoreTipo,
    mexCmd: comp.mexCmd,
    sortOrder: p.sort_order,
    comando: p.comando as SequenzaComando,
    valore: p.valore == null ? null : Number(p.valore),
    durataComandoSec:
      p.durata_comando_sec == null ? null : Number(p.durata_comando_sec),
    stalloDopoSec: p.stallo_dopo_sec == null ? null : Number(p.stallo_dopo_sec),
    precondizione: (p.precondizione as IotPrecondizione) || "nessuna",
  };
}

function mapSeq(r: SeqRow, passi: SequenzaPasso[]): ActionSequenza {
  return {
    id: r.id,
    essiccatoreId: r.essiccatore_id,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    tipo: r.tipo as SequenzaTipo,
    versione: Number(r.versione ?? 1),
    documentoStato: (r.documento_stato as DocumentoStatoCatalogo) || "bozza",
    esecuzioneStato: (r.esecuzione_stato === "in_corso"
      ? "in_corso"
      : "ferma") as SequenzaEsecuzioneStato,
    passi,
    createdAt: r.created_at,
    copiataDaId: r.copiata_da_id ?? null,
  };
}

async function loadPassiBySeq(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, SequenzaPasso[]>> {
  const out = new Map<string, SequenzaPasso[]>();
  if (!ids.length) return out;
  const { data: passi } = await supabase
    .from("action_sequenza_passi")
    .select(PASSO_COLS)
    .in("sequenza_id", ids)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const rows = (passi ?? []) as PassoRow[];
  const cids = [...new Set(rows.map((p) => p.componente_id))];
  const comps = new Map<string, { nome: string; tipo: string; mexCmd: number | null }>();
  if (cids.length) {
    const { data } = await supabase
      .from("action_iot_componenti")
      .select("id, nome, tipo_attuatore, modulo_id, mex_cmd")
      .in("id", cids);
    const modIds = [
      ...new Set(
        (data ?? [])
          .map((c) => (c.modulo_id ? String(c.modulo_id) : ""))
          .filter(Boolean)
      ),
    ];
    const modNomi = new Map<string, string>();
    if (modIds.length) {
      const { data: mods } = await supabase
        .from("action_iot_moduli")
        .select("id, nome")
        .in("id", modIds);
      for (const m of mods ?? []) {
        modNomi.set(String(m.id), String(m.nome));
      }
    }
    for (const c of data ?? []) {
      const modulo = c.modulo_id ? modNomi.get(String(c.modulo_id)) : "";
      comps.set(String(c.id), {
        nome: modulo ? `${modulo} · ${String(c.nome)}` : String(c.nome),
        tipo: String(c.tipo_attuatore ?? "on_off"),
        mexCmd: c.mex_cmd == null ? null : Number(c.mex_cmd),
      });
    }
  }
  for (const p of rows) {
    const list = out.get(p.sequenza_id) ?? [];
    list.push(
      mapPasso(
        p,
        comps.get(p.componente_id) ?? {
          nome: "Componente",
          tipo: "on_off",
          mexCmd: null,
        }
      )
    );
    out.set(p.sequenza_id, list);
  }
  return out;
}

export async function listSequenzeAction(raw: {
  essiccatoreId: string;
}): Promise<
  { success: true; items: ActionSequenza[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const ess = String(raw?.essiccatoreId ?? "").trim();
  if (!ess) return { success: false, error: "Essiccatore non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("essiccatore_id", ess)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as SeqRow[];
  const passi = await loadPassiBySeq(
    supabase,
    rows.map((r) => r.id)
  );
  return {
    success: true,
    items: rows.map((r) => mapSeq(r, passi.get(r.id) ?? [])),
  };
}

export async function upsertSequenzaTestataAction(
  raw: unknown
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = sequenzaTestataSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati sequenza non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  if (input.id) {
    const { data: prev } = await supabase
      .from("action_sequenze")
      .select("versione, esecuzione_stato")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!prev) return { success: false, error: "Sequenza non trovata." };
    if (String(prev.esecuzione_stato) === "in_corso") {
      return { success: false, error: "Non si modifica una sequenza in corso." };
    }
    const { data, error } = await supabase
      .from("action_sequenze")
      .update({
        nome: input.nome.trim(),
        descrizione: input.descrizione ?? "",
        tipo: input.tipo,
        versione: Number(prev.versione ?? 1) + 1,
        updated_by: auth.userId,
      })
      .eq("id", input.id)
      .select(SEQ_COLS)
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito." };
    }
    await writeAuditLog({
      entity_type: "action_sequenze",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Sequenza «${input.nome.trim()}» testata V+1`,
    });
    const passi = await loadPassiBySeq(supabase, [input.id]);
    return { success: true, item: mapSeq(data as SeqRow, passi.get(input.id) ?? []) };
  }
  const { data, error } = await supabase
    .from("action_sequenze")
    .insert({
      essiccatore_id: input.essiccatoreId,
      nome: input.nome.trim(),
      descrizione: input.descrizione ?? "",
      tipo: input.tipo,
      versione: 1,
      documento_stato: "bozza",
      esecuzione_stato: "ferma",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(SEQ_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita." };
  }
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: String((data as SeqRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Bozza sequenza «${input.nome.trim()}» (${input.tipo})`,
  });
  return { success: true, item: mapSeq(data as SeqRow, []) };
}

export async function copiaSequenzaAction(
  raw: unknown
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = copiaSequenzaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Copia non valida.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: fonte } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("id", input.fonteId)
    .eq("essiccatore_id", input.essiccatoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!fonte) {
    return { success: false, error: "Sequenza da copiare non trovata." };
  }
  const nome = (input.nome?.trim() || nomeSequenzaCopia(String(fonte.nome))).slice(
    0,
    120
  );
  const { data: created, error } = await supabase
    .from("action_sequenze")
    .insert({
      essiccatore_id: input.essiccatoreId,
      nome,
      descrizione:
        input.descrizione ?? String(fonte.descrizione ?? ""),
      tipo: input.tipo ?? String(fonte.tipo),
      versione: 1,
      documento_stato: "bozza",
      esecuzione_stato: "ferma",
      copiata_da_id: input.fonteId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(SEQ_COLS)
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Copia fallita." };
  }
  const nuovaId = String((created as SeqRow).id);
  const { data: passiFonte } = await supabase
    .from("action_sequenza_passi")
    .select(PASSO_COLS)
    .eq("sequenza_id", input.fonteId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const daCopiare = (passiFonte ?? []) as PassoRow[];
  if (daCopiare.length) {
    const { error: passiErr } = await supabase.from("action_sequenza_passi").insert(
      daCopiare.map((p, i) => ({
        sequenza_id: nuovaId,
        componente_id: p.componente_id,
        sort_order: i,
        comando: p.comando,
        valore: p.valore,
        durata_comando_sec: p.durata_comando_sec,
        stallo_dopo_sec: p.stallo_dopo_sec,
        precondizione: p.precondizione,
        versione: 1,
        documento_stato: "approvato",
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    );
    if (passiErr) {
      await supabase
        .from("action_sequenze")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: auth.userId,
          documento_stato: "chiuso",
          updated_by: auth.userId,
        })
        .eq("id", nuovaId);
      return { success: false, error: passiErr.message };
    }
  }
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: nuovaId,
    action: "create",
    actor_id: auth.userId,
    summary: `Bozza sequenza «${nome}» copiata da «${String(fonte.nome)}»`,
    payload: {
      copiata_da_id: input.fonteId,
      passi: daCopiare.length,
    },
  });
  const passi = await loadPassiBySeq(supabase, [nuovaId]);
  return {
    success: true,
    item: mapSeq(created as SeqRow, passi.get(nuovaId) ?? []),
  };
}

export async function addSequenzaPassoAction(
  raw: unknown
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = sequenzaPassoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Action non valida.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("action_sequenze")
    .select("id, esecuzione_stato, versione")
    .eq("id", input.sequenzaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!seq) return { success: false, error: "Sequenza non trovata." };
  if (String(seq.esecuzione_stato) === "in_corso") {
    return { success: false, error: "Non si aggiungono passi a una sequenza in corso." };
  }
  const { data: comp } = await supabase
    .from("action_iot_componenti")
    .select("id, documento_stato, ruolo")
    .eq("id", input.componenteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!comp || String(comp.documento_stato) === "chiuso") {
    return { success: false, error: "Componente IoT non disponibile." };
  }
  if (String(comp.ruolo) === "sensore") {
    return {
      success: false,
      error: "Un sensore non è un'azione: scegli un attuatore o un regolatore.",
    };
  }
  const { data: last } = await supabase
    .from("action_sequenza_passi")
    .select("sort_order")
    .eq("sequenza_id", input.sequenzaId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("action_sequenza_passi").insert({
    sequenza_id: input.sequenzaId,
    componente_id: input.componenteId,
    sort_order: Number(last?.sort_order ?? -1) + 1,
    comando: input.comando,
    valore: input.valore ?? null,
    durata_comando_sec: input.durataComandoSec ?? null,
    stallo_dopo_sec: input.stalloDopoSec ?? null,
    precondizione: input.precondizione,
    versione: 1,
    documento_stato: "approvato",
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };
  await supabase
    .from("action_sequenze")
    .update({
      versione: Number(seq.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", input.sequenzaId);
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: input.sequenzaId,
    action: "update",
    actor_id: auth.userId,
    summary: "Aggiunto passo Action alla sequenza",
    payload: { componenteId: input.componenteId, comando: input.comando },
  });
  const { data: fresh } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("id", input.sequenzaId)
    .single();
  const passi = await loadPassiBySeq(supabase, [input.sequenzaId]);
  return {
    success: true,
    item: mapSeq(fresh as SeqRow, passi.get(input.sequenzaId) ?? []),
  };
}

export async function updateSequenzaPassoAction(
  raw: unknown
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = sequenzaPassoUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Action non valida.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("action_sequenze")
    .select("id, esecuzione_stato, versione, documento_stato")
    .eq("id", input.sequenzaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!seq) return { success: false, error: "Sequenza non trovata." };
  if (String(seq.esecuzione_stato) === "in_corso") {
    return { success: false, error: "Non si modifica una sequenza in corso." };
  }
  const { data: passo } = await supabase
    .from("action_sequenza_passi")
    .select("id, versione")
    .eq("id", input.id)
    .eq("sequenza_id", input.sequenzaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!passo) return { success: false, error: "Action non trovata." };
  const { data: comp } = await supabase
    .from("action_iot_componenti")
    .select("id, documento_stato, ruolo")
    .eq("id", input.componenteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!comp || String(comp.documento_stato) === "chiuso") {
    return { success: false, error: "Componente IoT non disponibile." };
  }
  if (String(comp.ruolo) === "sensore") {
    return {
      success: false,
      error: "Un sensore non è un'azione: scegli un attuatore o un regolatore.",
    };
  }
  const { error } = await supabase
    .from("action_sequenza_passi")
    .update({
      componente_id: input.componenteId,
      comando: input.comando,
      valore: input.valore ?? null,
      durata_comando_sec: input.durataComandoSec ?? null,
      stallo_dopo_sec: input.stalloDopoSec ?? null,
      precondizione: input.precondizione,
      versione: Number(passo.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const tornaBozza = String(seq.documento_stato) === "approvato";
  await supabase
    .from("action_sequenze")
    .update({
      versione: Number(seq.versione ?? 1) + 1,
      documento_stato: tornaBozza ? "bozza" : seq.documento_stato,
      updated_by: auth.userId,
    })
    .eq("id", input.sequenzaId);
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: input.sequenzaId,
    action: "update",
    actor_id: auth.userId,
    summary: tornaBozza
      ? "Modificato passo Action: sequenza torna in bozza"
      : "Modificato passo Action della sequenza",
    payload: { passoId: input.id, comando: input.comando },
  });
  const { data: fresh } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("id", input.sequenzaId)
    .single();
  const passi = await loadPassiBySeq(supabase, [input.sequenzaId]);
  return {
    success: true,
    item: mapSeq(fresh as SeqRow, passi.get(input.sequenzaId) ?? []),
  };
}

export async function approvaSequenzaAction(
  idRaw: string
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return { success: false, error: "Sequenza non valida." };
  const supabase = await createClient();
  const passi = await loadPassiBySeq(supabase, [id.data]);
  if ((passi.get(id.data) ?? []).length < 1) {
    return { success: false, error: "Salva almeno un’Action prima della sequenza." };
  }
  const { data, error } = await supabase
    .from("action_sequenze")
    .update({
      documento_stato: "approvato",
      updated_by: auth.userId,
    })
    .eq("id", id.data)
    .is("deleted_at", null)
    .select(SEQ_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Approvazione fallita." };
  }
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: id.data,
    action: "approve",
    actor_id: auth.userId,
    summary: `Sequenza «${(data as SeqRow).nome}» approvata`,
  });
  return {
    success: true,
    item: mapSeq(data as SeqRow, passi.get(id.data) ?? []),
  };
}

export async function avviaSequenzaAction(
  raw: unknown
): Promise<
  { success: true; item: ActionSequenza } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = z.object({ id: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return { success: false, error: "Sequenza non valida." };
  const supabase = await createClient();
  const { data: seq, error } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !seq) {
    return { success: false, error: error?.message ?? "Sequenza non trovata." };
  }
  const row = seq as SeqRow;
  if (row.documento_stato !== "approvato") {
    return { success: false, error: "Avvia solo sequenze approvate." };
  }
  const passi = await loadPassiBySeq(supabase, [row.id]);
  if ((passi.get(row.id) ?? []).length < 1) {
    return { success: false, error: "Sequenza senza Action." };
  }
  const { data: esec, error: esecErr } = await supabase
    .from("action_sequenza_esecuzioni")
    .insert({
      sequenza_id: row.id,
      essiccatore_id: row.essiccatore_id,
      stato: "in_corso",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (esecErr || !esec) {
    return { success: false, error: esecErr?.message ?? "Esecuzione non aperta." };
  }
  const { error: upErr } = await supabase
    .from("action_sequenze")
    .update({
      esecuzione_stato: "in_corso",
      esecuzione_id: esec.id,
      updated_by: auth.userId,
    })
    .eq("id", row.id);
  if (upErr) {
    return {
      success: false,
      error:
        upErr.message.includes("action_seq_in_corso")
          ? "C’è già una sequenza in corso su questo essiccatore."
          : upErr.message,
    };
  }
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: row.id,
    action: "execute",
    actor_id: auth.userId,
    summary: `Avviata sequenza «${row.nome}»`,
    payload: { esecuzioneId: esec.id },
  });
  const { data: fresh } = await supabase
    .from("action_sequenze")
    .select(SEQ_COLS)
    .eq("id", row.id)
    .single();
  return {
    success: true,
    item: mapSeq((fresh ?? row) as SeqRow, passi.get(row.id) ?? []),
  };
}

export async function arrestaSequenzaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = z.object({ id: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return { success: false, error: "Sequenza non valida." };
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("action_sequenze")
    .select("id, esecuzione_id, nome")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!seq) return { success: false, error: "Sequenza non trovata." };
  const now = new Date().toISOString();
  if (seq.esecuzione_id) {
    await supabase
      .from("action_sequenza_esecuzioni")
      .update({
        stato: "interrotta",
        ended_at: now,
        esito_note: "Arresta operatore",
        updated_by: auth.userId,
      })
      .eq("id", seq.esecuzione_id);
  }
  await supabase
    .from("action_sequenze")
    .update({
      esecuzione_stato: "ferma",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id);
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Sequenza «${seq.nome}» interrotta`,
  });
  return { success: true };
}

export async function chiudiEsecuzioneSequenzaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = z.object({ id: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return { success: false, error: "Sequenza non valida." };
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("action_sequenze")
    .select("id, esecuzione_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const now = new Date().toISOString();
  if (seq?.esecuzione_id) {
    await supabase
      .from("action_sequenza_esecuzioni")
      .update({
        stato: "ok",
        ended_at: now,
        updated_by: auth.userId,
      })
      .eq("id", seq.esecuzione_id)
      .eq("stato", "in_corso");
  }
  await supabase
    .from("action_sequenze")
    .update({ esecuzione_stato: "ferma", updated_by: auth.userId })
    .eq("id", parsed.data.id);
  return { success: true };
}

export async function softDeleteSequenzaAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return { success: false, error: "Sequenza non valida." };
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("action_sequenze")
    .select("esecuzione_stato")
    .eq("id", id.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!seq) return { success: false, error: "Sequenza non trovata." };
  if (String(seq.esecuzione_stato) === "in_corso") {
    return { success: false, error: "Arresta prima di archiviare." };
  }
  const now = new Date().toISOString();
  await supabase
    .from("action_sequenza_passi")
    .update({ deleted_at: now, deleted_by: auth.userId, updated_by: auth.userId })
    .eq("sequenza_id", id.data)
    .is("deleted_at", null);
  const { error } = await supabase
    .from("action_sequenze")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id.data);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_sequenze",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Sequenza archiviata",
  });
  return { success: true };
}
