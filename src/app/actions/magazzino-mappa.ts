"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import {
  MAPPA_STATI,
  salvaMappaSchema,
  type MappaDocumentoStato,
  type MappaLinea,
  type MappaMagazzino,
  type SalvaMappaInput,
} from "@/lib/magazzino/mappa";
import { createClient } from "@/lib/supabase/server";

function canProgettare(profile: Parameters<typeof isSuperadminProfile>[0]) {
  return isSuperadminProfile(profile);
}

function mapLinea(r: {
  id: string;
  x1: number | string;
  y1: number | string;
  x2: number | string;
  y2: number | string;
  spessore: number | string;
  sort_order: number;
}): MappaLinea {
  return {
    id: r.id,
    x1: Number(r.x1),
    y1: Number(r.y1),
    x2: Number(r.x2),
    y2: Number(r.y2),
    spessore: Number(r.spessore),
    sortOrder: r.sort_order,
  };
}

function parseStato(v: string): MappaDocumentoStato {
  return (MAPPA_STATI as readonly string[]).includes(v)
    ? (v as MappaDocumentoStato)
    : "bozza";
}

async function loadMappa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<MappaMagazzino | null> {
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select(
      "id, nome, versione, documento_stato, view_x, view_y, view_zoom, griglia_px, note, approved_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!header) return null;
  const { data: linee } = await supabase
    .from("magazzino_mappa_linee")
    .select("id, x1, y1, x2, y2, spessore, sort_order")
    .eq("mappa_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const h = header as {
    id: string;
    nome: string;
    versione: number;
    documento_stato: string;
    view_x: number;
    view_y: number;
    view_zoom: number;
    griglia_px: number;
    note: string;
    approved_at: string | null;
  };
  return {
    id: h.id,
    nome: h.nome,
    versione: h.versione,
    documentoStato: parseStato(h.documento_stato),
    viewX: Number(h.view_x),
    viewY: Number(h.view_y),
    viewZoom: Number(h.view_zoom),
    grigliaPx: Number(h.griglia_px),
    note: h.note ?? "",
    approvedAt: h.approved_at,
    linee: ((linee ?? []) as Parameters<typeof mapLinea>[0][]).map(mapLinea),
  };
}

export async function getMappaMagazzinoAction(): Promise<
  | { success: true; mappa: MappaMagazzino; canDesign: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const canDesign = canProgettare(auth.profile);
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("magazzino_mappe")
    .select("id")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  let id = (existing as { id: string } | null)?.id ?? null;
  if (!id && canDesign) {
    const { data: created, error: cErr } = await supabase
      .from("magazzino_mappe")
      .insert({
        nome: "Pianta principale",
        versione: 1,
        documento_stato: "bozza",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return { success: false, error: cErr?.message ?? "Creazione pianta fallita." };
    }
    id = (created as { id: string }).id;
    await writeAuditLog({
      entity_type: "magazzino_mappe",
      entity_id: id,
      action: "create",
      actor_id: auth.userId,
      summary: "Creata pianta magazzino (bozza v1)",
    });
  }
  if (!id) {
    return { success: false, error: "Nessuna pianta approvata. Attendi il Super Admin." };
  }
  const mappa = await loadMappa(supabase, id);
  if (!mappa) return { success: false, error: "Pianta non trovata." };
  return { success: true, mappa, canDesign };
}

export async function salvaMappaMagazzinoAction(
  raw: SalvaMappaInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può progettare la pianta." };
  }
  const parsed = salvaMappaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati pianta non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select("id, documento_stato, versione")
    .eq("id", input.mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const h = header as {
    id: string;
    documento_stato: string;
    versione: number;
  } | null;
  if (!h) return { success: false, error: "Pianta non trovata." };
  if (h.documento_stato !== "bozza") {
    return {
      success: false,
      error: "La pianta è approvata. Riapri la progettazione per modificarla.",
    };
  }

  const { error: upErr } = await supabase
    .from("magazzino_mappe")
    .update({
      nome: input.nome?.trim() || undefined,
      view_x: input.viewX,
      view_y: input.viewY,
      view_zoom: input.viewZoom,
      griglia_px: input.grigliaPx ?? undefined,
      updated_by: auth.userId,
    })
    .eq("id", input.mappaId);
  if (upErr) return { success: false, error: upErr.message };

  const { data: existingLines } = await supabase
    .from("magazzino_mappa_linee")
    .select("id")
    .eq("mappa_id", input.mappaId)
    .is("deleted_at", null);
  const keep = new Set(
    input.linee.map((l) => l.id).filter((id): id is string => Boolean(id))
  );
  const now = new Date().toISOString();
  const toSoft = ((existingLines ?? []) as { id: string }[]).filter(
    (r) => !keep.has(r.id)
  );
  if (toSoft.length) {
    await supabase
      .from("magazzino_mappa_linee")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in(
        "id",
        toSoft.map((r) => r.id)
      );
  }

  for (const [i, linea] of input.linee.entries()) {
    const payload = {
      x1: linea.x1,
      y1: linea.y1,
      x2: linea.x2,
      y2: linea.y2,
      spessore: linea.spessore,
      sort_order: linea.sortOrder ?? i,
      updated_by: auth.userId,
    };
    if (linea.id && keep.has(linea.id)) {
      const { error } = await supabase
        .from("magazzino_mappa_linee")
        .update(payload)
        .eq("id", linea.id)
        .eq("mappa_id", input.mappaId);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from("magazzino_mappa_linee").insert({
        ...payload,
        mappa_id: input.mappaId,
        created_by: auth.userId,
      });
      if (error) return { success: false, error: error.message };
    }
  }

  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Salvata pianta magazzino (${input.linee.length} linee)`,
    payload: { linee: input.linee.length, view_zoom: input.viewZoom },
  });
  const mappa = await loadMappa(supabase, input.mappaId);
  if (!mappa) return { success: false, error: "Pianta salvata ma non leggibile." };
  return { success: true, mappa };
}

export async function approvaMappaMagazzinoAction(
  mappaId: string
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può approvare la pianta." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("magazzino_mappe")
    .update({
      documento_stato: "approvato",
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", mappaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: mappaId,
    action: "status_change",
    actor_id: auth.userId,
    summary: "Approvata pianta magazzino",
  });
  const mappa = await loadMappa(supabase, mappaId);
  if (!mappa) return { success: false, error: "Approvazione ok, pianta non leggibile." };
  return { success: true, mappa };
}

export async function riapriProgettazioneMappaAction(
  mappaId: string
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può riaprire la progettazione." };
  }
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("magazzino_mappe")
    .select("versione")
    .eq("id", mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const versione = ((cur as { versione?: number } | null)?.versione ?? 1) + 1;
  const { error } = await supabase
    .from("magazzino_mappe")
    .update({
      documento_stato: "bozza",
      versione,
      approved_at: null,
      approved_by: null,
      updated_by: auth.userId,
    })
    .eq("id", mappaId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Riaperta progettazione pianta (v${versione})`,
    payload: { versione },
  });
  const mappa = await loadMappa(supabase, mappaId);
  if (!mappa) return { success: false, error: "Riapertura ok, pianta non leggibile." };
  return { success: true, mappa };
}
