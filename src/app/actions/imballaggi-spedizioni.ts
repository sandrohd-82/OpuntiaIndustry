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
  normalizeCiCodice,
  otherDualStadio,
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

function voceSharedFields(
  v: {
    nome: string;
    largoMm?: number | null;
    profonditaMm?: number | null;
    altezzaMm?: number | null;
    capacitaLt?: number | null;
    note?: string;
    sortOrder?: number;
  },
  codice: string,
  doppio: boolean,
  userId: string
) {
  return {
    codice,
    nome: v.nome.trim(),
    largo_mm: v.largoMm ?? null,
    profondita_mm: v.profonditaMm ?? null,
    altezza_mm: v.altezzaMm ?? null,
    capacita_lt: v.capacitaLt ?? null,
    note: (v.note ?? "").trim(),
    sort_order: v.sortOrder ?? 0,
    doppio_ruolo: doppio,
    updated_by: userId,
  };
}

async function createVoceGemella(
  source: ImballaggioVoceRow,
  userId: string
): Promise<{ id: string } | { error: string }> {
  const other = otherDualStadio(source.stadio);
  if (!other) return { error: "Doppio ruolo non valido per questo stadio." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .insert({
      stadio: other,
      codice: source.codice,
      nome: source.nome,
      largo_mm: source.largo_mm,
      profondita_mm: source.profondita_mm,
      altezza_mm: source.altezza_mm,
      capacita_lt: source.capacita_lt,
      note: source.note,
      sort_order: source.sort_order,
      doppio_ruolo: true,
      voce_gemella_id: source.id,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Creazione gemella C&I fallita." };
  }
  const twinId = (data as { id: string }).id;
  const { error: linkErr } = await supabase
    .from("imballaggi_voci")
    .update({ voce_gemella_id: twinId, updated_by: userId })
    .eq("id", source.id);
  if (linkErr) return { error: linkErr.message };
  await copyProdottiLinks(source.id, twinId, userId);
  return { id: twinId };
}

async function copyProdottiLinks(
  fromId: string,
  toId: string,
  userId: string
): Promise<void> {
  const links = await attachProdottiLinks([fromId]);
  const list = links.get(fromId) ?? [];
  if (!list.length) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("imballaggi_voci_prodotti")
    .select("prodotto_id")
    .eq("voce_id", toId)
    .is("deleted_at", null);
  const have = new Set(
    ((existing ?? []) as { prodotto_id: string }[]).map((r) => r.prodotto_id)
  );
  const toInsert = list.filter((l) => !have.has(l.prodottoId));
  if (!toInsert.length) return;
  await supabase.from("imballaggi_voci_prodotti").insert(
    toInsert.map((l) => ({
      voce_id: toId,
      prodotto_id: l.prodottoId,
      max_kg: l.maxKg,
      unita_misura: l.unitaMisura,
      created_by: userId,
      updated_by: userId,
    }))
  );
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
  const doppio = Boolean(v.doppioRuolo) && v.stadio !== "movimentazione";
  const codice = doppio ? normalizeCiCodice(v.codice) : v.codice.trim();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .insert({
      stadio: v.stadio,
      ...voceSharedFields(v, codice, doppio, auth.userId),
      created_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  let row = data as ImballaggioVoceRow;
  if (doppio) {
    const twin = await createVoceGemella(row, auth.userId);
    if ("error" in twin) {
      return { success: false, error: twin.error };
    }
    row = { ...row, voce_gemella_id: twin.id, codice, doppio_ruolo: true };
  }
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
      voce_gemella_id: row.voce_gemella_id,
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
  const { data: current, error: readErr } = await supabase
    .from("imballaggi_voci")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) {
    return { success: false, error: readErr?.message ?? "Voce non trovata." };
  }
  const prev = current as ImballaggioVoceRow;
  const doppio = Boolean(v.doppioRuolo) && v.stadio !== "movimentazione";
  const codice = doppio ? normalizeCiCodice(v.codice) : v.codice.trim();

  const { data, error } = await supabase
    .from("imballaggi_voci")
    .update(voceSharedFields(v, codice, doppio, auth.userId))
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  let row = data as ImballaggioVoceRow;

  if (doppio && !prev.voce_gemella_id) {
    const twin = await createVoceGemella(row, auth.userId);
    if ("error" in twin) {
      return { success: false, error: twin.error };
    }
    row = { ...row, voce_gemella_id: twin.id };
  } else if (doppio && prev.voce_gemella_id) {
    const { error: twinErr } = await supabase
      .from("imballaggi_voci")
      .update(voceSharedFields(v, codice, true, auth.userId))
      .eq("id", prev.voce_gemella_id)
      .is("deleted_at", null);
    if (twinErr) return { success: false, error: twinErr.message };
    await copyProdottiLinks(row.id, prev.voce_gemella_id, auth.userId);
    row = { ...row, voce_gemella_id: prev.voce_gemella_id };
  } else if (!doppio && prev.voce_gemella_id) {
    const now = new Date().toISOString();
    await supabase
      .from("imballaggi_voci")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
        voce_gemella_id: null,
      })
      .eq("id", prev.voce_gemella_id)
      .is("deleted_at", null);
    await supabase
      .from("imballaggi_voci")
      .update({ voce_gemella_id: null, updated_by: auth.userId })
      .eq("id", row.id);
    row = { ...row, voce_gemella_id: null };
  }

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
      voce_gemella_id: row.voce_gemella_id,
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

  if (row.voce_gemella_id) {
    const gemellaRes = await replaceProdottiLinks(
      row.voce_gemella_id,
      links,
      auth.userId
    );
    if (gemellaRes) return { success: false, error: gemellaRes };
  }

  const refreshed = await attachProdottiLinks([voceId]);
  return {
    success: true,
    item: mapImballaggioVoceRow(row, refreshed.get(voceId) ?? []),
  };
}

async function replaceProdottiLinks(
  voceId: string,
  links: ImballaggioVoceProdottoLink[],
  userId: string
): Promise<string | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error: delErr } = await supabase
    .from("imballaggi_voci_prodotti")
    .update({
      deleted_at: now,
      deleted_by: userId,
      updated_by: userId,
    })
    .eq("voce_id", voceId)
    .is("deleted_at", null);
  if (delErr) return delErr.message;
  if (!links.length) return null;
  const { error } = await supabase.from("imballaggi_voci_prodotti").insert(
    links.map((l) => ({
      voce_id: voceId,
      prodotto_id: l.prodottoId,
      max_kg: l.maxKg,
      unita_misura: l.unitaMisura ?? "kg",
      created_by: userId,
      updated_by: userId,
    }))
  );
  return error?.message ?? null;
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
  const { data: found } = await supabase
    .from("imballaggi_voci")
    .select("id, voce_gemella_id")
    .in("id", ids)
    .is("deleted_at", null);
  const allIds = new Set(ids);
  for (const r of (found ?? []) as { id: string; voce_gemella_id: string | null }[]) {
    if (r.voce_gemella_id) allIds.add(r.voce_gemella_id);
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("imballaggi_voci")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .in("id", [...allIds])
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
