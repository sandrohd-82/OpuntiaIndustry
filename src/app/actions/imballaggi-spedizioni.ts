"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAreaAccess } from "@/lib/areas/guard";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import {
  corriereInputSchema,
  imballaggioVoceInputSchema,
  mapCorriereRow,
  mapImballaggioVoceRow,
  parseImballaggioProdottoUm,
  syncImballaggioVoceProdottiSchema,
  type Corriere,
  type CorriereInput,
  type ImballaggioStadio,
  type ImballaggioVoce,
  type ImballaggioVoceInput,
  type ImballaggioVoceProdottoLink,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import type {
  CorriereRow,
  ImballaggioVoceProdottoRow,
  ImballaggioVoceRow,
} from "@/types/database";

type ListVociResult =
  | { success: true; items: ImballaggioVoce[] }
  | { success: false; error: string };

type VoceResult =
  | { success: true; item: ImballaggioVoce }
  | { success: false; error: string };

type ListCorrieriResult =
  | { success: true; items: Corriere[] }
  | { success: false; error: string };

type CorriereResult =
  | { success: true; item: Corriere }
  | { success: false; error: string };

async function attachProdottiLinks(
  ids: string[]
): Promise<Map<string, ImballaggioVoceProdottoLink[]>> {
  const map = new Map<string, ImballaggioVoceProdottoLink[]>();
  if (!ids.length) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("imballaggi_voci_prodotti")
    .select("voce_id, prodotto_id, max_kg, unita_misura")
    .in("voce_id", ids)
    .is("deleted_at", null);
  for (const r of (data ?? []) as Pick<
    ImballaggioVoceProdottoRow,
    "voce_id" | "prodotto_id" | "max_kg" | "unita_misura"
  >[]) {
    const list = map.get(r.voce_id) ?? [];
    list.push({
      prodottoId: r.prodotto_id,
      maxKg: Number(r.max_kg),
      unitaMisura: parseImballaggioProdottoUm(r.unita_misura),
    });
    map.set(r.voce_id, list);
  }
  return map;
}

export async function listImballaggiVociAction(
  stadio?: ImballaggioStadio
): Promise<ListVociResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  let q = supabase
    .from("imballaggi_voci")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (stadio) q = q.eq("stadio", stadio);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as ImballaggioVoceRow[];
  const links = await attachProdottiLinks(rows.map((r) => r.id));
  return {
    success: true,
    items: rows.map((r) => mapImballaggioVoceRow(r, links.get(r.id) ?? [])),
  };
}

export async function createImballaggioVoceAction(
  raw: ImballaggioVoceInput
): Promise<VoceResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = imballaggioVoceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .insert({
      stadio: v.stadio,
      codice: v.codice.trim(),
      nome: v.nome.trim(),
      largo_mm: v.largoMm ?? null,
      profondita_mm: v.profonditaMm ?? null,
      altezza_mm: v.altezzaMm ?? null,
      capacita_lt: v.capacitaLt ?? null,
      note: (v.note ?? "").trim(),
      sort_order: v.sortOrder ?? 0,
      doppio_ruolo: Boolean(v.doppioRuolo) && v.stadio !== "movimentazione",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const row = data as ImballaggioVoceRow;
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata voce imballaggio ${row.stadio} ${row.codice}`,
    payload: {
      codice: row.codice,
      nome: row.nome,
      stadio: row.stadio,
      doppio_ruolo: row.doppio_ruolo,
    },
  });
  return { success: true, item: mapImballaggioVoceRow(row) };
}

export async function updateImballaggioVoceAction(
  id: string,
  raw: ImballaggioVoceInput
): Promise<VoceResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = imballaggioVoceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .update({
      codice: v.codice.trim(),
      nome: v.nome.trim(),
      largo_mm: v.largoMm ?? null,
      profondita_mm: v.profonditaMm ?? null,
      altezza_mm: v.altezzaMm ?? null,
      capacita_lt: v.capacitaLt ?? null,
      note: (v.note ?? "").trim(),
      sort_order: v.sortOrder ?? 0,
      doppio_ruolo: Boolean(v.doppioRuolo) && v.stadio !== "movimentazione",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  const row = data as ImballaggioVoceRow;
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata voce imballaggio ${row.codice}`,
    payload: {
      codice: row.codice,
      nome: row.nome,
      doppio_ruolo: row.doppio_ruolo,
    },
  });
  const links = await attachProdottiLinks([row.id]);
  return {
    success: true,
    item: mapImballaggioVoceRow(row, links.get(row.id) ?? []),
  };
}

export async function syncImballaggioVoceProdottiAction(raw: unknown): Promise<
  | { success: true; item: ImballaggioVoce }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = syncImballaggioVoceProdottiSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const { voceId, links } = parsed.data;
  const supabase = await createClient();
  const { data: voce, error: voceErr } = await supabase
    .from("imballaggi_voci")
    .select("*")
    .eq("id", voceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (voceErr || !voce) {
    return { success: false, error: voceErr?.message ?? "Voce non trovata." };
  }
  const row = voce as ImballaggioVoceRow;
  if (row.stadio === "movimentazione") {
    return {
      success: false,
      error: "Lo stadio movimentazione non si collega ai prodotti.",
    };
  }
  if (row.stadio === "confezione" && !row.doppio_ruolo) {
    return {
      success: false,
      error: "Collega i prodotti solo a un isolamento o a una confezione a doppio ruolo.",
    };
  }

  const { data: existing } = await supabase
    .from("imballaggi_voci_prodotti")
    .select("*")
    .eq("voce_id", voceId)
    .is("deleted_at", null);
  const current = (existing ?? []) as ImballaggioVoceProdottoRow[];
  const wanted = new Map(
    links.map((l) => [
      l.prodottoId,
      { maxKg: l.maxKg, unitaMisura: l.unitaMisura ?? "kg" },
    ])
  );
  const now = new Date().toISOString();

  for (const cur of current) {
    const next = wanted.get(cur.prodotto_id);
    if (next == null) {
      const { error } = await supabase
        .from("imballaggi_voci_prodotti")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", cur.id)
        .is("deleted_at", null);
      if (error) return { success: false, error: error.message };
    } else if (
      Number(cur.max_kg) !== next.maxKg ||
      parseImballaggioProdottoUm(cur.unita_misura) !== next.unitaMisura
    ) {
      const { error } = await supabase
        .from("imballaggi_voci_prodotti")
        .update({
          max_kg: next.maxKg,
          unita_misura: next.unitaMisura,
          updated_by: auth.userId,
        })
        .eq("id", cur.id)
        .is("deleted_at", null);
      if (error) return { success: false, error: error.message };
    }
    wanted.delete(cur.prodotto_id);
  }

  const toInsert = [...wanted.entries()];
  if (toInsert.length) {
    const { error } = await supabase.from("imballaggi_voci_prodotti").insert(
      toInsert.map(([prodotto_id, v]) => ({
        voce_id: voceId,
        prodotto_id,
        max_kg: v.maxKg,
        unita_misura: v.unitaMisura,
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    );
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "imballaggi_voci_prodotti",
    entity_id: voceId,
    action: "update",
    actor_id: auth.userId,
    summary: `Collegati ${links.length} prodotti a ${row.codice}`,
    payload: {
      prodotto_ids: links.map((l) => l.prodottoId),
      max_kg: links.map((l) => l.maxKg),
      unita_misura: links.map((l) => l.unitaMisura),
    },
  });

  const refreshed = await attachProdottiLinks([voceId]);
  return {
    success: true,
    item: mapImballaggioVoceRow(row, refreshed.get(voceId) ?? []),
  };
}

function checkConferma(
  confermaTestuale: string,
  codice: string
): string | null {
  const expected = fraseConfermaSoftDelete(codice);
  if (confermaTestuale.trim() !== expected) {
    return `Digita esattamente: ${expected}`;
  }
  return null;
}

export async function softDeleteImballaggioVoceAction(input: {
  id: string;
  confermaTestuale: string;
  confirmCode: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const mismatch = checkConferma(input.confermaTestuale, input.confirmCode);
  if (mismatch) return { success: false, error: mismatch };
  return softDeleteImballaggiVociBulkAction({
    ids: [input.id],
    confermaTestuale: input.confermaTestuale,
    confirmCode: input.confirmCode,
  });
}

export async function softDeleteImballaggiVociBulkAction(input: {
  ids: string[];
  confermaTestuale: string;
  confirmCode: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const mismatch = checkConferma(input.confermaTestuale, input.confirmCode);
  if (mismatch) return { success: false, error: mismatch };
  const ids = [...new Set(input.ids.filter(Boolean))];
  if (!ids.length) return { success: false, error: "Nessun record selezionato." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("imballaggi_voci")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: ids[0],
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminate (soft) ${ids.length} voci imballaggio`,
    payload: { ids, count: ids.length },
  });
  return { success: true };
}

export async function listCorrieriAction(): Promise<ListCorrieriResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corrieri")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as CorriereRow[]).map(mapCorriereRow),
  };
}

export async function createCorriereAction(
  raw: CorriereInput
): Promise<CorriereResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = corriereInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corrieri")
    .insert({
      nome: parsed.data.nome.trim(),
      note: (parsed.data.note ?? "").trim(),
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const row = data as CorriereRow;
  await writeAuditLog({
    entity_type: "corrieri",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato corriere ${row.nome}`,
    payload: { nome: row.nome },
  });
  return { success: true, item: mapCorriereRow(row) };
}

export async function updateCorriereAction(
  id: string,
  raw: CorriereInput
): Promise<CorriereResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = corriereInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corrieri")
    .update({
      nome: parsed.data.nome.trim(),
      note: (parsed.data.note ?? "").trim(),
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  const row = data as CorriereRow;
  await writeAuditLog({
    entity_type: "corrieri",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato corriere ${row.nome}`,
    payload: { nome: row.nome },
  });
  return { success: true, item: mapCorriereRow(row) };
}

export async function softDeleteCorriereAction(input: {
  id: string;
  confermaTestuale: string;
  confirmCode: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  return softDeleteCorrieriBulkAction({
    ids: [input.id],
    confermaTestuale: input.confermaTestuale,
    confirmCode: input.confirmCode,
  });
}

export async function softDeleteCorrieriBulkAction(input: {
  ids: string[];
  confermaTestuale: string;
  confirmCode: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const mismatch = checkConferma(input.confermaTestuale, input.confirmCode);
  if (mismatch) return { success: false, error: mismatch };
  const ids = [...new Set(input.ids.filter(Boolean))];
  if (!ids.length) return { success: false, error: "Nessun record selezionato." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("corrieri")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "corrieri",
    entity_id: ids[0],
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminati (soft) ${ids.length} corrieri`,
    payload: { ids, count: ids.length },
  });
  return { success: true };
}
