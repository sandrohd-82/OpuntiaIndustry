"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  processoAttivitaInputSchema,
  processoComposizioneSchema,
  processoInputSchema,
  type Processo,
  type ProcessoAttivita,
  type ProcessoAttivitaInput,
  type ProcessoComposizioneInput,
  type ProcessoDocumentoStato,
  type ProcessoInput,
  type ProcessoPasso,
} from "@/lib/produzione/processi";
import { createClient } from "@/lib/supabase/server";

type AttivitaRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  attivo: boolean;
  note: string | null;
  created_at: string;
};

type ProcessoRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  attivo: boolean;
  note: string | null;
  versione: number;
  documento_stato: ProcessoDocumentoStato;
  approvato_at: string | null;
  approvato_by: string | null;
  created_at: string;
};

type PassoRow = {
  id: string;
  processo_id: string;
  attivita_id: string;
  sort_order: number;
  obbligatorio: boolean;
  note: string | null;
  produzione_processo_attivita: {
    codice: string;
    nome: string;
  } | null;
};

function mapAttivita(row: AttivitaRow): ProcessoAttivita {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

function mapProcesso(row: ProcessoRow, passiCount = 0): Processo {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    versione: row.versione,
    documentoStato: row.documento_stato,
    approvatoAt: row.approvato_at,
    approvatoBy: row.approvato_by,
    createdAt: row.created_at,
    passiCount,
  };
}

function mapPasso(row: PassoRow): ProcessoPasso {
  return {
    id: row.id,
    processoId: row.processo_id,
    attivitaId: row.attivita_id,
    sortOrder: row.sort_order,
    obbligatorio: Boolean(row.obbligatorio),
    note: row.note ?? "",
    attivitaCodice: row.produzione_processo_attivita?.codice ?? "",
    attivitaNome: row.produzione_processo_attivita?.nome ?? "",
  };
}

async function countPassiByProcesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (processoIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_passi")
    .select("processo_id")
    .in("processo_id", processoIds)
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const id = (row as { processo_id: string }).processo_id;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Attività di processo
// ---------------------------------------------------------------------------

export async function listProcessoAttivitaAction(): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .select("id, codice, nome, descrizione, attivo, note, created_at")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as AttivitaRow[]).map(mapAttivita),
  };
}

export async function listProcessoAttivitaAttiveAction(): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .select("id, codice, nome, descrizione, attivo, note, created_at")
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as AttivitaRow[]).map(mapAttivita),
  };
}

export async function createProcessoAttivitaAction(
  raw: ProcessoAttivitaInput
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoAttivitaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice, nome, descrizione, attivo, note, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice attività già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapAttivita(data as AttivitaRow);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata attività di processo ${item.codice}`,
    payload: { codice: item.codice, nome: item.nome },
  });
  return { success: true, item };
}

export async function updateProcessoAttivitaAction(
  id: string,
  raw: ProcessoAttivitaInput
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoAttivitaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, codice, nome, descrizione, attivo, note, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice attività già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapAttivita(data as AttivitaRow);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata attività di processo ${item.codice}`,
    payload: { codice: item.codice, nome: item.nome },
  });
  return { success: true, item };
}

export async function softDeleteProcessoAttivitaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();

  const { count } = await supabase
    .from("produzione_processo_passi")
    .select("id", { count: "exact", head: true })
    .eq("attivita_id", id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error:
        "Attività ancora usata in uno o più processi. Rimuovila dalle composizioni prima di eliminarla.",
    };
  }

  const { error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete attività di processo",
    payload: {},
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Processi
// ---------------------------------------------------------------------------

export async function listProcessiAction(): Promise<
  { success: true; items: Processo[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as ProcessoRow[];
  const counts = await countPassiByProcesso(
    supabase,
    rows.map((r) => r.id)
  );
  return {
    success: true,
    items: rows.map((r) => mapProcesso(r, counts.get(r.id) ?? 0)),
  };
}

export async function getProcessoAction(
  id: string
): Promise<
  | { success: true; item: Processo; passi: ProcessoPasso[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Processo non trovato." };

  const passiRes = await listProcessoPassiInternal(supabase, id);
  if (!passiRes.success) return passiRes;

  return {
    success: true,
    item: mapProcesso(data as ProcessoRow, passiRes.passi.length),
    passi: passiRes.passi,
  };
}

export async function createProcessoAction(
  raw: ProcessoInput
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      versione: 1,
      documento_stato: "bozza",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice processo già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapProcesso(data as ProcessoRow, 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato processo ${item.codice}`,
    payload: { codice: item.codice, nome: item.nome, versione: 1 },
  });
  return { success: true, item };
}

export async function updateProcessoAction(
  id: string,
  raw: ProcessoInput
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();

  const { data: existing, error: loadErr } = await supabase
    .from("produzione_processi")
    .select("id, documento_stato, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Processo non trovato." };

  const stato = (existing as { documento_stato: ProcessoDocumentoStato })
    .documento_stato;
  if (stato === "chiuso") {
    return {
      success: false,
      error: "Processo chiuso: non modificabile. Creane una nuova versione.",
    };
  }

  const wasApprovato = stato === "approvato";
  const nextVersione = wasApprovato
    ? Number((existing as { versione: number }).versione) + 1
    : Number((existing as { versione: number }).versione);

  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      updated_by: auth.userId,
      ...(wasApprovato
        ? {
            documento_stato: "bozza",
            versione: nextVersione,
            approvato_at: null,
            approvato_by: null,
          }
        : {}),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice processo già esistente." };
    }
    return { success: false, error: error.message };
  }
  const counts = await countPassiByProcesso(supabase, [id]);
  const item = mapProcesso(data as ProcessoRow, counts.get(id) ?? 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: wasApprovato
      ? `Modifica processo ${item.codice}: nuova bozza v${item.versione}`
      : `Aggiornato processo ${item.codice}`,
    payload: {
      codice: item.codice,
      nome: item.nome,
      versione: item.versione,
      documento_stato: item.documentoStato,
    },
  });
  return { success: true, item };
}

export async function approvaProcessoAction(
  id: string
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      documento_stato: "approvato",
      approvato_at: now,
      approvato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .neq("documento_stato", "chiuso")
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Processo non trovato o chiuso." };
  const counts = await countPassiByProcesso(supabase, [id]);
  const item = mapProcesso(data as ProcessoRow, counts.get(id) ?? 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "approve",
    actor_id: auth.userId,
    summary: `Approvato processo ${item.codice} v${item.versione}`,
    payload: { versione: item.versione, approvato_at: now },
  });
  return { success: true, item };
}

export async function chiudiProcessoAction(
  id: string
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      documento_stato: "chiuso",
      attivo: false,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(
      "id, codice, nome, descrizione, attivo, note, versione, documento_stato, approvato_at, approvato_by, created_at"
    )
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Processo non trovato." };
  const counts = await countPassiByProcesso(supabase, [id]);
  const item = mapProcesso(data as ProcessoRow, counts.get(id) ?? 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "close",
    actor_id: auth.userId,
    summary: `Chiuso processo ${item.codice} v${item.versione}`,
    payload: { versione: item.versione },
  });
  return { success: true, item };
}

export async function softDeleteProcessoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: passiErr } = await supabase
    .from("produzione_processo_passi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("processo_id", id)
    .is("deleted_at", null);
  if (passiErr) return { success: false, error: passiErr.message };

  const { error } = await supabase
    .from("produzione_processi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete processo",
    payload: {},
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Composizione
// ---------------------------------------------------------------------------

async function listProcessoPassiInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  const { data, error } = await supabase
    .from("produzione_processo_passi")
    .select(
      "id, processo_id, attivita_id, sort_order, obbligatorio, note, produzione_processo_attivita(codice, nome)"
    )
    .eq("processo_id", processoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    passi: ((data ?? []) as unknown as PassoRow[]).map(mapPasso),
  };
}

export async function listProcessoPassiAction(
  processoId: string
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  return listProcessoPassiInternal(supabase, processoId);
}

export async function setProcessoComposizioneAction(
  processoId: string,
  raw: ProcessoComposizioneInput
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoComposizioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Composizione non valida.",
    };
  }

  const attivitaIds = parsed.data.passi.map((p) => p.attivitaId);
  if (new Set(attivitaIds).size !== attivitaIds.length) {
    return {
      success: false,
      error: "La stessa attività non può comparire due volte nello stesso processo.",
    };
  }

  const supabase = await createClient();

  const { data: processo, error: loadErr } = await supabase
    .from("produzione_processi")
    .select("id, codice, documento_stato, versione")
    .eq("id", processoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!processo) return { success: false, error: "Processo non trovato." };

  const stato = (processo as { documento_stato: ProcessoDocumentoStato })
    .documento_stato;
  if (stato === "chiuso") {
    return { success: false, error: "Processo chiuso: composizione non modificabile." };
  }

  if (attivitaIds.length > 0) {
    const { count } = await supabase
      .from("produzione_processo_attivita")
      .select("id", { count: "exact", head: true })
      .in("id", attivitaIds)
      .is("deleted_at", null)
      .eq("attivo", true);
    if ((count ?? 0) !== attivitaIds.length) {
      return {
        success: false,
        error: "Una o più attività non sono valide o non sono attive.",
      };
    }
  }

  const now = new Date().toISOString();
  const { error: softErr } = await supabase
    .from("produzione_processo_passi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("processo_id", processoId)
    .is("deleted_at", null);
  if (softErr) return { success: false, error: softErr.message };

  if (parsed.data.passi.length > 0) {
    const rows = parsed.data.passi.map((p, index) => ({
      processo_id: processoId,
      attivita_id: p.attivitaId,
      sort_order: index + 1,
      obbligatorio: p.obbligatorio ?? true,
      note: p.note?.trim() ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    }));
    const { error: insertErr } = await supabase
      .from("produzione_processo_passi")
      .insert(rows);
    if (insertErr) return { success: false, error: insertErr.message };
  }

  const wasApprovato = stato === "approvato";
  if (wasApprovato) {
    const nextVersione =
      Number((processo as { versione: number }).versione) + 1;
    await supabase
      .from("produzione_processi")
      .update({
        documento_stato: "bozza",
        versione: nextVersione,
        approvato_at: null,
        approvato_by: null,
        updated_by: auth.userId,
      })
      .eq("id", processoId)
      .is("deleted_at", null);
  } else {
    await supabase
      .from("produzione_processi")
      .update({ updated_by: auth.userId })
      .eq("id", processoId)
      .is("deleted_at", null);
  }

  const passiRes = await listProcessoPassiInternal(supabase, processoId);
  if (!passiRes.success) return passiRes;

  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: processoId,
    action: "update_composition",
    actor_id: auth.userId,
    summary: `Aggiornata composizione processo ${(processo as { codice: string }).codice}`,
    payload: {
      passi: passiRes.passi.map((p) => ({
        attivita_id: p.attivitaId,
        codice: p.attivitaCodice,
        sort_order: p.sortOrder,
      })),
      tornato_bozza: wasApprovato,
    },
  });

  return { success: true, passi: passiRes.passi };
}
