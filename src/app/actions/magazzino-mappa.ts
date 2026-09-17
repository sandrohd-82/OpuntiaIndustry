"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import {
  MAPPA_LINEA_COLORE_DEFAULT,
  MAPPA_STATI,
  collegaMappaSchema,
  creaMappaBozzaSchema,
  etichettaMappaCollegata,
  normalizzaColoreLinea,
  parseScalaUnita,
  salvaMappaSchema,
  slugMappaArea,
  type CollegaMappaInput,
  type MappaDocumentoStato,
  type MappaElencoItem,
  type MappaLinea,
  type MappaMagazzino,
  type MappaNavItem,
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
  colore?: string | null;
  sort_order: number;
}): MappaLinea {
  return {
    id: r.id,
    x1: Number(r.x1),
    y1: Number(r.y1),
    x2: Number(r.x2),
    y2: Number(r.y2),
    spessore: Number(r.spessore),
    colore: normalizzaColoreLinea(r.colore ?? MAPPA_LINEA_COLORE_DEFAULT),
    sortOrder: r.sort_order,
  };
}

function parseStato(v: string): MappaDocumentoStato {
  return (MAPPA_STATI as readonly string[]).includes(v)
    ? (v as MappaDocumentoStato)
    : "bozza";
}

type HeaderRow = {
  id: string;
  nome: string;
  versione: number;
  documento_stato: string;
  area_codice?: string | null;
  luogo_nome?: string | null;
  slug?: string | null;
  vista_etichetta: string;
  scala_valore: number | string;
  scala_unita: string;
  view_x: number;
  view_y: number;
  view_zoom: number;
  griglia_px: number;
  note: string;
  approved_at: string | null;
  collegata_at?: string | null;
  updated_at?: string;
};

function mapHeader(h: HeaderRow, linee: MappaLinea[]): MappaMagazzino {
  return {
    id: h.id,
    nome: h.nome,
    versione: h.versione,
    documentoStato: parseStato(h.documento_stato),
    areaCodice: h.area_codice || "magazzino",
    luogoNome: h.luogo_nome ?? "",
    slug: h.slug ?? null,
    vistaEtichetta: h.vista_etichetta ?? "",
    scalaValore: Number(h.scala_valore) > 0 ? Number(h.scala_valore) : 10,
    scalaUnita: parseScalaUnita(h.scala_unita),
    viewX: Number(h.view_x),
    viewY: Number(h.view_y),
    viewZoom: Number(h.view_zoom),
    grigliaPx: Number(h.griglia_px),
    note: h.note ?? "",
    approvedAt: h.approved_at,
    collegataAt: h.collegata_at ?? null,
    linee,
  };
}

const HEADER_SELECT =
  "id, nome, versione, documento_stato, area_codice, luogo_nome, slug, vista_etichetta, scala_valore, scala_unita, view_x, view_y, view_zoom, griglia_px, note, approved_at, collegata_at, updated_at";

async function loadMappa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<MappaMagazzino | null> {
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select(HEADER_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!header) return null;
  const { data: linee } = await supabase
    .from("magazzino_mappa_linee")
    .select("id, x1, y1, x2, y2, spessore, colore, sort_order")
    .eq("mappa_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return mapHeader(
    header as HeaderRow,
    ((linee ?? []) as Parameters<typeof mapLinea>[0][]).map(mapLinea)
  );
}

async function slugLibero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base;
  for (let i = 0; i < 20; i += 1) {
    let q = supabase
      .from("magazzino_mappe")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listMappeEditorAction(): Promise<
  | { success: true; items: MappaElencoItem[]; canDesign: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "magazzino"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_mappe")
    .select(
      "id, nome, versione, documento_stato, luogo_nome, slug, vista_etichetta, updated_at"
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  const items: MappaElencoItem[] = (
    (data ?? []) as {
      id: string;
      nome: string;
      versione: number;
      documento_stato: string;
      luogo_nome: string | null;
      slug: string | null;
      vista_etichetta: string;
      updated_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    nome: r.nome,
    versione: r.versione,
    documentoStato: parseStato(r.documento_stato),
    luogoNome: r.luogo_nome ?? "",
    slug: r.slug,
    vistaEtichetta: r.vista_etichetta ?? "",
    updatedAt: r.updated_at,
  }));
  return { success: true, items, canDesign: canProgettare(auth.profile) };
}

export async function listMappeCollegateAction(): Promise<
  | { success: true; items: MappaNavItem[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_mappe")
    .select("slug, luogo_nome, vista_etichetta")
    .is("deleted_at", null)
    .eq("documento_stato", "approvato")
    .neq("luogo_nome", "")
    .not("slug", "is", null)
    .order("luogo_nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const items: MappaNavItem[] = (
    (data ?? []) as {
      slug: string | null;
      luogo_nome: string;
      vista_etichetta: string;
    }[]
  )
    .filter((r) => r.slug)
    .map((r) => ({
      slug: r.slug!,
      luogoNome: r.luogo_nome,
      vistaEtichetta: r.vista_etichetta,
    }));
  return { success: true, items };
}

export async function getMappaByIdAction(
  mappaId: string
): Promise<
  | { success: true; mappa: MappaMagazzino; canDesign: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "magazzino"]);
  const supabase = await createClient();
  const mappa = await loadMappa(supabase, mappaId);
  if (!mappa) return { success: false, error: "Pianta non trovata." };
  return { success: true, mappa, canDesign: canProgettare(auth.profile) };
}

export async function getMappaBySlugAction(
  slug: string
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const clean = slug.trim();
  if (!clean) return { success: false, error: "Percorso pianta non valido." };
  const supabase = await createClient();
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select("id")
    .eq("slug", clean)
    .eq("documento_stato", "approvato")
    .is("deleted_at", null)
    .maybeSingle();
  const id = (header as { id: string } | null)?.id;
  if (!id) return { success: false, error: "Pianta non collegata o non trovata." };
  const mappa = await loadMappa(supabase, id);
  if (!mappa) return { success: false, error: "Pianta non trovata." };
  return { success: true, mappa };
}

export async function creaMappaBozzaAction(
  raw?: { nome?: string }
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può creare una bozza." };
  }
  const parsed = creaMappaBozzaSchema.safeParse(raw ?? {});
  const nome =
    parsed.success && parsed.data.nome
      ? parsed.data.nome
      : `Bozza ${new Date().toLocaleDateString("it-IT")}`;
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("magazzino_mappe")
    .insert({
      nome,
      versione: 1,
      documento_stato: "bozza",
      area_codice: "magazzino",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Creazione bozza fallita." };
  }
  const id = (created as { id: string }).id;
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata bozza editor aree (${nome})`,
  });
  const mappa = await loadMappa(supabase, id);
  if (!mappa) return { success: false, error: "Bozza creata ma non leggibile." };
  return { success: true, mappa };
}

export async function salvaMappaMagazzinoAction(
  raw: SalvaMappaInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
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
      error: "La pianta è collegata. Riapri la progettazione per modificarla.",
    };
  }
  if (input.linee.length > 0 && !input.vistaEtichetta) {
    return {
      success: false,
      error: "Imposta prima il testo Vista (es. Dall’alto, Lato fronte, Lato Dx).",
    };
  }

  const { error: upErr } = await supabase
    .from("magazzino_mappe")
    .update({
      nome: input.nome?.trim() || undefined,
      vista_etichetta: input.vistaEtichetta,
      scala_valore: input.scalaValore,
      scala_unita: input.scalaUnita,
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
      colore: linea.colore,
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
    summary: `Salvata bozza editor aree (${input.linee.length} linee, vista ${input.vistaEtichetta || "—"})`,
    payload: {
      linee: input.linee.length,
      vista: input.vistaEtichetta,
    },
  });
  const mappa = await loadMappa(supabase, input.mappaId);
  if (!mappa) return { success: false, error: "Pianta salvata ma non leggibile." };
  return { success: true, mappa };
}

export async function collegaMappaAdAreaAction(
  raw: CollegaMappaInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può collegare la pianta." };
  }
  const parsed = collegaMappaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati collegamento non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("magazzino_mappe")
    .select("id, documento_stato, vista_etichetta")
    .eq("id", input.mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = cur as {
    id: string;
    documento_stato: string;
    vista_etichetta?: string;
  } | null;
  if (!row) return { success: false, error: "Pianta non trovata." };
  if (row.documento_stato !== "bozza") {
    return { success: false, error: "Questa pianta è già collegata. Riapri per modificarla." };
  }
  const vista = input.vistaEtichetta.trim();
  const luogo = input.luogoNome.trim();
  const baseSlug = slugMappaArea(luogo, vista);
  const slug = await slugLibero(supabase, baseSlug, input.mappaId);
  const { error } = await supabase
    .from("magazzino_mappe")
    .update({
      documento_stato: "approvato",
      area_codice: "magazzino",
      luogo_nome: luogo,
      vista_etichetta: vista,
      slug,
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
      collegata_at: new Date().toISOString(),
      collegata_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.mappaId)
    .is("deleted_at", null);
  if (error) {
    if (error.message.includes("magazzino_mappe_collegata_luogo_vista")) {
      return {
        success: false,
        error: `Esiste già una pianta collegata per ${etichettaMappaCollegata(luogo, vista)}.`,
      };
    }
    return { success: false, error: error.message };
  }
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Collegata pianta a Magazzino > Mappa Magazzino > ${etichettaMappaCollegata(luogo, vista)}`,
    payload: { luogo, vista, slug },
  });
  const mappa = await loadMappa(supabase, input.mappaId);
  if (!mappa) return { success: false, error: "Collegamento ok, pianta non leggibile." };
  return { success: true, mappa };
}

export async function riapriProgettazioneMappaAction(
  mappaId: string
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
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
