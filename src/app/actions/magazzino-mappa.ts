"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { AREA_ROUTES } from "@/lib/areas/config";
import type { AreaSlug } from "@/types/database";
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
import {
  etichettaUbicazione,
  type MappaAreaDisegnata,
  type UbicazioneElenco,
} from "@/lib/magazzino/ubicazioni";
import {
  etichettaAsseOrigine,
  importaRiferimentiSchema,
  type ImportaRiferimentiInput,
  type MappaAsseOrigine,
  type MappaRiferimentoGruppo,
  type MappaRiferimentoGruppoInput,
} from "@/lib/magazzino/riferimenti";
import {
  MAPPA_MENU_SEED_MAPPA_ID,
  rinominaPercorsoMappaSchema,
  slugMenuVoce,
  type MappaMenuFogliaNav,
  type MappaMenuNodo,
  type MappaMenuOpzione,
  type MappaMenuPercorsoCaricato,
  type MappaMenuPercorsoNodo,
  type RinominaPercorsoMappaInput,
} from "@/lib/magazzino/menu-mappa";
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
  menu_nodo_id?: string | null;
  updated_at?: string;
};

function mapHeader(
  h: HeaderRow,
  linee: MappaLinea[],
  aree: MappaAreaDisegnata[] = [],
  ubicazioni: UbicazioneElenco[] = [],
  riferimenti: MappaRiferimentoGruppo[] = []
): MappaMagazzino {
  return {
    id: h.id,
    nome: h.nome,
    versione: h.versione,
    documentoStato: parseStato(h.documento_stato),
    areaCodice: h.area_codice || "magazzino",
    luogoNome: h.luogo_nome ?? "",
    menuNodoId: h.menu_nodo_id ?? null,
    percorsoEtichetta: "",
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
    aree,
    ubicazioni,
    riferimenti,
  };
}

const HEADER_SELECT =
  "id, nome, versione, documento_stato, area_codice, luogo_nome, menu_nodo_id, slug, vista_etichetta, scala_valore, scala_unita, view_x, view_y, view_zoom, griglia_px, note, approved_at, collegata_at, updated_at";

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
  const h = header as HeaderRow;
  const { data: linee } = await supabase
    .from("magazzino_mappa_linee")
    .select("id, x1, y1, x2, y2, spessore, colore, sort_order")
    .eq("mappa_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const { data: forme } = await supabase
    .from("magazzino_mappa_aree")
    .select(
      "id, ubicazione_id, x, y, width, height, ubicazione:magazzino_ubicazioni(id, codice, nome, parent_id)"
    )
    .eq("mappa_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const aree: MappaAreaDisegnata[] = (
    (forme ?? []) as {
      id: string;
      ubicazione_id: string;
      x: number | string;
      y: number | string;
      width: number | string;
      height: number | string;
      ubicazione:
        | { id: string; codice: string; nome: string; parent_id: string | null }
        | { id: string; codice: string; nome: string; parent_id: string | null }[]
        | null;
    }[]
  ).map((r) => {
    const u = Array.isArray(r.ubicazione) ? r.ubicazione[0] : r.ubicazione;
    return {
      id: r.id,
      ubicazioneId: r.ubicazione_id,
      codice: u?.codice ?? "",
      nome: u?.nome ?? "",
      parentId: u?.parent_id ?? null,
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width),
      height: Number(r.height),
    };
  });
  const ubicazioni = await loadUbicazioniScope(supabase, id, h.luogo_nome ?? "");
  const riferimenti = await loadRiferimentiMappa(supabase, id);
  const mapped = mapHeader(
    h,
    ((linee ?? []) as Parameters<typeof mapLinea>[0][]).map(mapLinea),
    aree,
    ubicazioni,
    riferimenti
  );
  mapped.percorsoEtichetta = await etichettaPercorsoNodo(
    supabase,
    h.menu_nodo_id ?? null,
    h.area_codice ?? "magazzino",
    h.luogo_nome ?? "",
    h.vista_etichetta ?? ""
  );
  return mapped;
}

async function etichettaPercorsoNodo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nodoId: string | null,
  areaSlug: string,
  luogoNome: string,
  vista: string
): Promise<string> {
  const areaLabel =
    AREA_ROUTES[areaSlug as AreaSlug]?.label ?? areaSlug;
  const parts: string[] = [areaLabel];
  if (nodoId) {
    const catena: string[] = [];
    let current: string | null = nodoId;
    for (let i = 0; i < 10 && current; i += 1) {
      const { data } = await supabase
        .from("mappa_menu_nodi")
        .select("parent_id, etichetta")
        .eq("id", current)
        .is("deleted_at", null)
        .maybeSingle();
      const row = data as { parent_id: string | null; etichetta: string } | null;
      if (!row) break;
      catena.unshift(row.etichetta);
      current = row.parent_id;
    }
    parts.push(...catena);
  } else if (luogoNome) {
    parts.push("Mappa Magazzino", luogoNome);
  }
  if (vista) parts.push(`[${vista}]`);
  return parts.join(" > ");
}

async function loadRiferimentiMappa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mappaId: string
): Promise<MappaRiferimentoGruppo[]> {
  const { data } = await supabase
    .from("magazzino_mappa_riferimenti")
    .select(
      "id, gruppo_id, tipo, etichetta, asse_origine, offset_quadrati, limite_width_q, limite_height_q, dest_x, dest_y, dest_width, dest_height, origine_x, origine_y, origine_w, origine_h, sort_order, mappa_origine_id"
    )
    .eq("mappa_id", mappaId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  type RifRow = {
    id: string;
    gruppo_id: string;
    tipo: string;
    etichetta: string;
    asse_origine: string;
    offset_quadrati: number | string;
    limite_width_q: number | string;
    limite_height_q: number | string;
    dest_x: number | string;
    dest_y: number | string;
    dest_width: number | string;
    dest_height: number | string;
    origine_x: number | string;
    origine_y: number | string;
    origine_w: number | string;
    origine_h: number | string;
    sort_order: number;
    mappa_origine_id: string;
  };
  const rows = (data ?? []) as RifRow[];
  const origineIds = [...new Set(rows.map((r) => r.mappa_origine_id))];
  const labels = new Map<string, string>();
  if (origineIds.length) {
    const { data: orig } = await supabase
      .from("magazzino_mappe")
      .select("id, nome, luogo_nome, vista_etichetta")
      .in("id", origineIds);
    for (const o of (orig ?? []) as {
      id: string;
      nome: string;
      luogo_nome: string | null;
      vista_etichetta: string;
    }[]) {
      labels.set(
        o.id,
        o.luogo_nome && o.vista_etichetta
          ? etichettaMappaCollegata(o.luogo_nome, o.vista_etichetta)
          : o.nome
      );
    }
  }
  const groups = new Map<string, MappaRiferimentoGruppo>();
  for (const r of rows) {
    const label = labels.get(r.mappa_origine_id) ?? "Pianta origine";
    let g = groups.get(r.gruppo_id);
    if (!g) {
      g = {
        id: r.gruppo_id,
        asseId: "",
        mappaOrigineId: r.mappa_origine_id,
        mappaOrigineEtichetta: label,
        asseOrigine: r.asse_origine === "y" ? "y" : "x",
        limiteWidthQ: Number(r.limite_width_q),
        limiteHeightQ: Number(r.limite_height_q),
        destX: Number(r.dest_x),
        destY: Number(r.dest_y),
        destWidth: Number(r.dest_width),
        destHeight: Number(r.dest_height),
        origineX: Number(r.origine_x),
        origineY: Number(r.origine_y),
        origineW: Number(r.origine_w),
        origineH: Number(r.origine_h),
        punti: [],
      };
      groups.set(r.gruppo_id, g);
    }
    if (r.tipo === "asse") {
      g.asseId = r.id;
    } else {
      g.punti.push({
        id: r.id,
        etichetta: r.etichetta || `Rif. ${g.punti.length + 1}`,
        offsetQuadrati: Number(r.offset_quadrati),
      });
    }
  }
  return [...groups.values()];
}

async function loadUbicazioniScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mappaId: string,
  luogoNome: string
): Promise<UbicazioneElenco[]> {
  const { data } = await supabase
    .from("magazzino_ubicazioni")
    .select("id, codice, nome, parent_id, luogo_nome, mappa_origine_id")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  const rows = (data ?? []) as {
    id: string;
    codice: string;
    nome: string;
    parent_id: string | null;
    luogo_nome: string;
    mappa_origine_id: string | null;
  }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const luogo = luogoNome.trim().toLowerCase();
  const scoped = rows.filter(
    (r) =>
      r.mappa_origine_id === mappaId ||
      (luogo && r.luogo_nome.trim().toLowerCase() === luogo)
  );
  return scoped.map((r) => {
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    return {
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      parentId: r.parent_id,
      parentCodice: parent?.codice ?? null,
      luogoNome: r.luogo_nome,
      etichetta: etichettaUbicazione(
        r.codice,
        r.nome,
        parent?.codice,
        r.luogo_nome
      ),
    };
  });
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

export async function listMappaMenuNavAction(): Promise<
  | { success: true; nodi: MappaMenuNodo[]; mappe: MappaMenuFogliaNav[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "strumenti",
    "magazzino",
    "produzione",
    "amministrazione",
    "commerciale",
    "action",
    "area-fiscale",
    "promemorie-e-note",
    "area-fornitori",
    "ricerca-sviluppo",
  ]);
  const supabase = await createClient();
  const { data: nodi, error } = await supabase
    .from("mappa_menu_nodi")
    .select("id, parent_id, area_slug, etichetta, slug, tipo, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const { data: mappe } = await supabase
    .from("magazzino_mappe")
    .select("slug, luogo_nome, vista_etichetta, menu_nodo_id")
    .is("deleted_at", null)
    .eq("documento_stato", "approvato")
    .not("slug", "is", null)
    .not("menu_nodo_id", "is", null);
  return {
    success: true,
    nodi: ((nodi ?? []) as {
      id: string;
      parent_id: string | null;
      area_slug: string;
      etichetta: string;
      slug: string;
      tipo: string;
    }[]).map((n) => ({
      id: n.id,
      parentId: n.parent_id,
      areaSlug: n.area_slug,
      etichetta: n.etichetta,
      slug: n.slug,
      tipo: n.tipo === "luogo" ? "luogo" : "ramo",
    })),
    mappe: ((mappe ?? []) as {
      slug: string | null;
      luogo_nome: string;
      vista_etichetta: string;
      menu_nodo_id: string;
    }[])
      .filter((m) => m.slug)
      .map((m) => ({
        nodoId: m.menu_nodo_id,
        slug: m.slug!,
        luogoNome: m.luogo_nome,
        vistaEtichetta: m.vista_etichetta,
      })),
  };
}

export async function listMappaMenuFigliAction(
  areaSlug: string,
  parentId: string | null
): Promise<
  | { success: true; items: MappaMenuOpzione[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "strumenti",
    "magazzino",
    "produzione",
    "amministrazione",
    "commerciale",
    "action",
    "area-fiscale",
    "promemorie-e-note",
    "area-fornitori",
    "ricerca-sviluppo",
  ]);
  const supabase = await createClient();
  let q = supabase
    .from("mappa_menu_nodi")
    .select("id, etichetta, slug, tipo")
    .eq("area_slug", areaSlug)
    .is("deleted_at", null)
    .order("etichetta", { ascending: true });
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const items: MappaMenuOpzione[] = (
    (data ?? []) as { id: string; etichetta: string; slug: string; tipo: string }[]
  ).map((n) => ({
    id: n.id,
    etichetta: n.etichetta,
    slug: n.slug,
    tipo: n.tipo === "luogo" ? "luogo" : "ramo",
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
  const clean = slug.trim();
  if (!clean) return { success: false, error: "Percorso pianta non valido." };
  const supabase = await createClient();
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select("id, area_codice")
    .eq("slug", clean)
    .eq("documento_stato", "approvato")
    .is("deleted_at", null)
    .maybeSingle();
  const row = header as { id: string; area_codice?: string } | null;
  if (!row) return { success: false, error: "Pianta non collegata o non trovata." };
  const area = (row.area_codice || "magazzino") as AreaSlug;
  const allowed: AreaSlug[] = [area, "strumenti"];
  await requireAnyAreaAccess(allowed.filter((s) => s in AREA_ROUTES) as AreaSlug[]);
  const mappa = await loadMappa(supabase, row.id);
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

async function persistAreeMappa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mappaId: string,
  aree: NonNullable<SalvaMappaInput["aree"]>,
  userId: string
): Promise<string | null> {
  const { data: header } = await supabase
    .from("magazzino_mappe")
    .select("luogo_nome")
    .eq("id", mappaId)
    .maybeSingle();
  const luogo = ((header as { luogo_nome?: string } | null)?.luogo_nome ?? "").trim();
  const { data: existingForme } = await supabase
    .from("magazzino_mappa_aree")
    .select("id")
    .eq("mappa_id", mappaId)
    .is("deleted_at", null);
  const keepForme = new Set(
    aree.map((a) => a.id).filter((id): id is string => Boolean(id))
  );
  const now = new Date().toISOString();
  const toSoft = ((existingForme ?? []) as { id: string }[]).filter(
    (r) => !keepForme.has(r.id)
  );
  if (toSoft.length) {
    await supabase
      .from("magazzino_mappa_aree")
      .update({
        deleted_at: now,
        deleted_by: userId,
        updated_by: userId,
      })
      .in(
        "id",
        toSoft.map((r) => r.id)
      );
  }
  const resolvedUbi = new Map<string, string>();
  const pending = [...aree];
  const ordered: typeof aree = [];
  while (pending.length) {
    const next = pending.find((a, idx) => {
      const p = a.parentId ?? null;
      if (!p) return true;
      if (resolvedUbi.has(p)) return true;
      if (aree.some((x) => x.ubicazioneId === p || x.id === p)) {
        return !pending.some((x, j) => j !== idx && (x.id === p || x.ubicazioneId === p));
      }
      return true;
    });
    if (!next) {
      ordered.push(...pending);
      break;
    }
    pending.splice(pending.indexOf(next), 1);
    ordered.push(next);
  }
  for (const [i, area] of ordered.entries()) {
    let ubicazioneId = area.ubicazioneId;
    const parentToken = area.parentId ?? null;
    const parentId = parentToken
      ? resolvedUbi.get(parentToken) ??
        (aree.some((x) => x.id === parentToken || x.ubicazioneId === parentToken)
          ? resolvedUbi.get(parentToken) ?? null
          : parentToken)
      : null;
    const ubPayload = {
      codice: area.codice.trim(),
      nome: area.nome.trim(),
      parent_id: parentId,
      tipo: "riponibile" as const,
      luogo_nome: luogo,
      mappa_origine_id: mappaId,
      updated_by: userId,
    };
    if (!ubicazioneId) {
      let q = supabase
        .from("magazzino_ubicazioni")
        .select("id")
        .is("deleted_at", null)
        .ilike("codice", area.codice.trim())
        .eq("luogo_nome", luogo);
      if (!luogo) q = q.eq("mappa_origine_id", mappaId);
      const { data: existingUb } = await q.maybeSingle();
      const found = existingUb as { id: string } | null;
      if (found?.id) ubicazioneId = found.id;
    }
    if (ubicazioneId) {
      const { error } = await supabase
        .from("magazzino_ubicazioni")
        .update(ubPayload)
        .eq("id", ubicazioneId);
      if (error) return error.message;
    } else {
      const { data: created, error } = await supabase
        .from("magazzino_ubicazioni")
        .insert({ ...ubPayload, created_by: userId })
        .select("id")
        .single();
      if (error || !created) return error?.message ?? "Creazione posto fallita.";
      ubicazioneId = (created as { id: string }).id;
    }
    resolvedUbi.set(area.id ?? ubicazioneId, ubicazioneId);
    if (area.ubicazioneId) resolvedUbi.set(area.ubicazioneId, ubicazioneId);
    const formaPayload = {
      mappa_id: mappaId,
      ubicazione_id: ubicazioneId,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      sort_order: i,
      updated_by: userId,
    };
    if (area.id && keepForme.has(area.id)) {
      const { error } = await supabase
        .from("magazzino_mappa_aree")
        .update(formaPayload)
        .eq("id", area.id)
        .eq("mappa_id", mappaId);
      if (error) return error.message;
    } else {
      const { error } = await supabase.from("magazzino_mappa_aree").insert({
        ...formaPayload,
        created_by: userId,
      });
      if (error) return error.message;
    }
  }
  return null;
}

export async function listUbicazioniRiponibiliAction(): Promise<
  | { success: true; items: UbicazioneElenco[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_ubicazioni")
    .select("id, codice, nome, parent_id, luogo_nome")
    .eq("tipo", "riponibile")
    .is("deleted_at", null)
    .order("luogo_nome", { ascending: true })
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as {
    id: string;
    codice: string;
    nome: string;
    parent_id: string | null;
    luogo_nome: string;
  }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    success: true,
    items: rows.map((r) => {
      const parent = r.parent_id ? byId.get(r.parent_id) : null;
      return {
        id: r.id,
        codice: r.codice,
        nome: r.nome,
        parentId: r.parent_id,
        parentCodice: parent?.codice ?? null,
        luogoNome: r.luogo_nome,
        etichetta: etichettaUbicazione(
          r.codice,
          r.nome,
          parent?.codice,
          r.luogo_nome
        ),
      };
    }),
  };
}

function payloadRiferimentoComune(
  g: MappaRiferimentoGruppoInput,
  userId: string
) {
  return {
    mappa_origine_id: g.mappaOrigineId,
    asse_origine: g.asseOrigine,
    limite_width_q: g.limiteWidthQ,
    limite_height_q: g.limiteHeightQ,
    dest_x: g.destX,
    dest_y: g.destY,
    dest_width: g.destWidth,
    dest_height: g.destHeight,
    origine_x: g.origineX,
    origine_y: g.origineY,
    origine_w: g.origineW,
    origine_h: g.origineH,
    updated_by: userId,
  };
}

async function persistRiferimentiMappa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mappaId: string,
  gruppi: MappaRiferimentoGruppoInput[],
  userId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("magazzino_mappa_riferimenti")
    .select("id")
    .eq("mappa_id", mappaId)
    .is("deleted_at", null);
  const keep = new Set<string>();
  for (const g of gruppi) {
    if (g.asseId) keep.add(g.asseId);
    for (const p of g.punti) if (p.id) keep.add(p.id);
  }
  const now = new Date().toISOString();
  const toSoft = ((existing ?? []) as { id: string }[]).filter((r) => !keep.has(r.id));
  if (toSoft.length) {
    await supabase
      .from("magazzino_mappa_riferimenti")
      .update({ deleted_at: now, deleted_by: userId, updated_by: userId })
      .in(
        "id",
        toSoft.map((r) => r.id)
      );
  }
  for (const [gi, g] of gruppi.entries()) {
    const gruppoId = g.id ?? crypto.randomUUID();
    const common = payloadRiferimentoComune(g, userId);
    const assePayload = {
      ...common,
      mappa_id: mappaId,
      gruppo_id: gruppoId,
      tipo: "asse" as const,
      etichetta: "Quadrato limite",
      offset_quadrati: 0,
      sort_order: gi * 100,
    };
    if (g.asseId && keep.has(g.asseId)) {
      const { error } = await supabase
        .from("magazzino_mappa_riferimenti")
        .update(assePayload)
        .eq("id", g.asseId)
        .eq("mappa_id", mappaId);
      if (error) return error.message;
    } else {
      const { error } = await supabase.from("magazzino_mappa_riferimenti").insert({
        ...assePayload,
        created_by: userId,
      });
      if (error) return error.message;
    }
    for (const [pi, p] of g.punti.entries()) {
      const puntoPayload = {
        ...common,
        mappa_id: mappaId,
        gruppo_id: gruppoId,
        tipo: "punto" as const,
        etichetta: p.etichetta.trim(),
        offset_quadrati: p.offsetQuadrati,
        sort_order: gi * 100 + pi + 1,
      };
      if (p.id && keep.has(p.id)) {
        const { error } = await supabase
          .from("magazzino_mappa_riferimenti")
          .update(puntoPayload)
          .eq("id", p.id)
          .eq("mappa_id", mappaId);
        if (error) return error.message;
      } else {
        const { error } = await supabase.from("magazzino_mappa_riferimenti").insert({
          ...puntoPayload,
          created_by: userId,
        });
        if (error) return error.message;
      }
    }
  }
  return null;
}

export async function listMappeStessoLuogoAction(
  luogoNome: string,
  excludeId: string
): Promise<
  | { success: true; items: { id: string; label: string; documentoStato: string }[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "magazzino"]);
  const luogo = luogoNome.trim().toLowerCase();
  if (!luogo) return { success: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_mappe")
    .select("id, nome, luogo_nome, vista_etichetta, documento_stato")
    .is("deleted_at", null)
    .neq("id", excludeId);
  if (error) return { success: false, error: error.message };
  const items = (
    (data ?? []) as {
      id: string;
      nome: string;
      luogo_nome: string | null;
      vista_etichetta: string;
      documento_stato: string;
    }[]
  )
    .filter((r) => (r.luogo_nome ?? "").trim().toLowerCase() === luogo)
    .map((r) => ({
      id: r.id,
      documentoStato: r.documento_stato,
      label:
        r.luogo_nome && r.vista_etichetta
          ? etichettaMappaCollegata(r.luogo_nome, r.vista_etichetta)
          : r.nome,
    }));
  return { success: true, items };
}

export async function importaRiferimentiDaVistaAction(
  raw: ImportaRiferimentiInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può importare i riferimenti." };
  }
  const parsed = importaRiferimentiSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati importo non validi.",
    };
  }
  const input = parsed.data;
  if (input.mappaId === input.mappaOrigineId) {
    return { success: false, error: "Scegli una pianta diversa da questa." };
  }
  const supabase = await createClient();
  const dest = await loadMappa(supabase, input.mappaId);
  const src = await loadMappa(supabase, input.mappaOrigineId);
  if (!dest || dest.documentoStato !== "bozza") {
    return { success: false, error: "Importo consentito solo su una bozza." };
  }
  if (!src) return { success: false, error: "Pianta di origine non trovata." };
  const gruppo: MappaRiferimentoGruppoInput = {
    mappaOrigineId: input.mappaOrigineId,
    asseOrigine: input.asseOrigine,
    limiteWidthQ: input.limiteWidthQ,
    limiteHeightQ: input.limiteHeightQ,
    destX: input.destX,
    destY: input.destY,
    destWidth: input.destWidth,
    destHeight: input.destHeight,
    origineX: input.origineX,
    origineY: input.origineY,
    origineW: input.origineW,
    origineH: input.origineH,
    punti: input.punti,
  };
  const err = await persistRiferimentiMappa(
    supabase,
    input.mappaId,
    [...(dest.riferimenti ?? []).map(gruppoToInput), gruppo],
    auth.userId
  );
  if (err) return { success: false, error: err };
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Importati riferimenti da ${etichettaMappaCollegata(src.luogoNome || src.nome, src.vistaEtichetta || "vista")} · ${etichettaAsseOrigine(input.asseOrigine as MappaAsseOrigine)} · ${input.punti.length} punti`,
    payload: {
      mappa_origine_id: input.mappaOrigineId,
      asse: input.asseOrigine,
      punti: input.punti.length,
    },
  });
  const mappa = await loadMappa(supabase, input.mappaId);
  if (!mappa) return { success: false, error: "Importo ok, pianta non leggibile." };
  return { success: true, mappa };
}

function gruppoToInput(g: MappaRiferimentoGruppo): MappaRiferimentoGruppoInput {
  return {
    id: g.id,
    asseId: g.asseId || undefined,
    mappaOrigineId: g.mappaOrigineId,
    asseOrigine: g.asseOrigine,
    limiteWidthQ: g.limiteWidthQ,
    limiteHeightQ: g.limiteHeightQ,
    destX: g.destX,
    destY: g.destY,
    destWidth: g.destWidth,
    destHeight: g.destHeight,
    origineX: g.origineX,
    origineY: g.origineY,
    origineW: g.origineW,
    origineH: g.origineH,
    punti: g.punti.map((p) => ({
      id: p.id,
      etichetta: p.etichetta,
      offsetQuadrati: p.offsetQuadrati,
    })),
  };
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

  const areeErr = await persistAreeMappa(
    supabase,
    input.mappaId,
    input.aree ?? [],
    auth.userId
  );
  if (areeErr) return { success: false, error: areeErr };

  if (input.riferimenti) {
    const rifErr = await persistRiferimentiMappa(
      supabase,
      input.mappaId,
      input.riferimenti,
      auth.userId
    );
    if (rifErr) return { success: false, error: rifErr };
  }

  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Salvata bozza editor aree (${input.linee.length} linee, ${(input.aree ?? []).length} aree, ${(input.riferimenti ?? []).length} importi, vista ${input.vistaEtichetta || "—"})`,
    payload: {
      linee: input.linee.length,
      aree: (input.aree ?? []).length,
      riferimenti: (input.riferimenti ?? []).length,
      vista: input.vistaEtichetta,
    },
  });
  const mappa = await loadMappa(supabase, input.mappaId);
  if (!mappa) return { success: false, error: "Pianta salvata ma non leggibile." };
  return { success: true, mappa };
}

type MenuNodoRiga = {
  id: string;
  parent_id: string | null;
  area_slug: string;
  etichetta: string;
  slug: string;
  tipo: string;
  versione?: number;
};

async function loadCatenaNodi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startId: string
): Promise<MenuNodoRiga[]> {
  const catena: MenuNodoRiga[] = [];
  let current: string | null = startId;
  for (let i = 0; i < 10 && current; i += 1) {
    const { data } = await supabase
      .from("mappa_menu_nodi")
      .select("id, parent_id, area_slug, etichetta, slug, tipo, versione")
      .eq("id", current)
      .is("deleted_at", null)
      .maybeSingle();
    const row = data as MenuNodoRiga | null;
    if (!row) break;
    catena.unshift(row);
    current = row.parent_id;
  }
  return catena;
}

async function altreMappePerNodi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  areaSlug: string,
  nodoIds: string[],
  excludeMappaId: string
): Promise<Record<string, number>> {
  const { data: allNodi } = await supabase
    .from("mappa_menu_nodi")
    .select("id, parent_id")
    .eq("area_slug", areaSlug)
    .is("deleted_at", null);
  const nodi = (allNodi ?? []) as { id: string; parent_id: string | null }[];
  const { data: maps } = await supabase
    .from("magazzino_mappe")
    .select("id, menu_nodo_id")
    .is("deleted_at", null)
    .not("menu_nodo_id", "is", null)
    .neq("id", excludeMappaId);
  const children = new Map<string, string[]>();
  for (const n of nodi) {
    const p = n.parent_id ?? "";
    const list = children.get(p) ?? [];
    list.push(n.id);
    children.set(p, list);
  }
  function subtree(id: string): Set<string> {
    const s = new Set<string>([id]);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const ch of children.get(cur) ?? []) {
        if (!s.has(ch)) {
          s.add(ch);
          stack.push(ch);
        }
      }
    }
    return s;
  }
  const counts: Record<string, number> = {};
  for (const id of nodoIds) {
    const sub = subtree(id);
    counts[id] = (
      (maps ?? []) as { id: string; menu_nodo_id: string | null }[]
    ).filter((m) => m.menu_nodo_id && sub.has(m.menu_nodo_id)).length;
  }
  return counts;
}

async function risolviPercorsoMenu(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: CollegaMappaInput,
  userId: string
): Promise<{ postoId: string; luogo: string; nodoIds: string[] } | { error: string }> {
  let parentId: string | null = null;
  const nodoIds: string[] = [];
  for (const ramo of input.rami) {
    const got = await ensureMenuNodo(
      supabase,
      input.areaSlug,
      parentId,
      "ramo",
      ramo.etichetta,
      ramo.slug,
      userId,
      ramo.nodoId
    );
    if ("error" in got) return { error: got.error };
    parentId = got.id;
    nodoIds.push(got.id);
  }
  const posto = await ensureMenuNodo(
    supabase,
    input.areaSlug,
    parentId,
    "luogo",
    input.posto.etichetta,
    undefined,
    userId,
    input.posto.nodoId
  );
  if ("error" in posto) return { error: posto.error };
  nodoIds.push(posto.id);
  return {
    postoId: posto.id,
    luogo: input.posto.etichetta.trim(),
    nodoIds,
  };
}

async function softDeleteNodiOrfani(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nodeIds: string[],
  userId: string
) {
  const now = new Date().toISOString();
  for (const id of [...nodeIds].reverse()) {
    if (id === MAPPA_MENU_SEED_MAPPA_ID) continue;
    const { count: maps } = await supabase
      .from("magazzino_mappe")
      .select("id", { count: "exact", head: true })
      .eq("menu_nodo_id", id)
      .is("deleted_at", null);
    const { count: kids } = await supabase
      .from("mappa_menu_nodi")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id)
      .is("deleted_at", null);
    if ((maps ?? 0) > 0 || (kids ?? 0) > 0) continue;
    await supabase
      .from("mappa_menu_nodi")
      .update({
        deleted_at: now,
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null);
  }
}

export async function getMappaMenuPercorsoAction(
  mappaId: string
): Promise<
  | { success: true; percorso: MappaMenuPercorsoCaricato }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può modificare il percorso." };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("magazzino_mappe")
    .select("id, area_codice, menu_nodo_id")
    .eq("id", mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as {
    id: string;
    area_codice?: string;
    menu_nodo_id?: string | null;
  } | null;
  if (!row?.menu_nodo_id) {
    return { success: false, error: "Questa pianta non ha ancora un percorso di menu." };
  }
  const catena = await loadCatenaNodi(supabase, row.menu_nodo_id);
  if (!catena.length) {
    return { success: false, error: "Percorso di menu non trovato." };
  }
  const areaSlug = row.area_codice || catena[0]?.area_slug || "magazzino";
  const counts = await altreMappePerNodi(
    supabase,
    areaSlug,
    catena.map((n) => n.id),
    mappaId
  );
  const nodi: MappaMenuPercorsoNodo[] = catena.map((n) => ({
    id: n.id,
    parentId: n.parent_id,
    etichetta: n.etichetta,
    slug: n.slug,
    tipo: n.tipo === "luogo" ? "luogo" : "ramo",
    altreMappe: counts[n.id] ?? 0,
  }));
  return { success: true, percorso: { areaSlug, nodi } };
}

async function ensureMenuNodo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  areaSlug: string,
  parentId: string | null,
  tipo: "ramo" | "luogo",
  etichetta: string,
  slugHint: string | undefined,
  userId: string,
  existingId?: string
): Promise<{ id: string } | { error: string }> {
  if (existingId) {
    const { data } = await supabase
      .from("mappa_menu_nodi")
      .select("id, parent_id, area_slug")
      .eq("id", existingId)
      .is("deleted_at", null)
      .maybeSingle();
    const row = data as { id: string; parent_id: string | null; area_slug: string } | null;
    if (!row || row.area_slug !== areaSlug) {
      return { error: "Voce di menu non valida per quest'area." };
    }
    return { id: row.id };
  }
  const nome = etichetta.trim();
  const slug = slugMenuVoce(slugHint || nome);
  let find = supabase
    .from("mappa_menu_nodi")
    .select("id")
    .eq("area_slug", areaSlug)
    .ilike("etichetta", nome)
    .is("deleted_at", null);
  find = parentId ? find.eq("parent_id", parentId) : find.is("parent_id", null);
  const { data: found } = await find.maybeSingle();
  if (found) return { id: (found as { id: string }).id };
  const { data: created, error } = await supabase
    .from("mappa_menu_nodi")
    .insert({
      parent_id: parentId,
      area_slug: areaSlug,
      etichetta: nome,
      slug,
      tipo,
      documento_stato: "approvato",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error?.message.includes("mag_menu_")) {
      let again = supabase
        .from("mappa_menu_nodi")
        .select("id")
        .eq("area_slug", areaSlug)
        .ilike("etichetta", nome)
        .is("deleted_at", null);
      again = parentId ? again.eq("parent_id", parentId) : again.is("parent_id", null);
      const { data: retry } = await again.maybeSingle();
      if (retry) return { id: (retry as { id: string }).id };
    }
    return { error: error?.message ?? "Creazione voce di menu fallita." };
  }
  return { id: (created as { id: string }).id };
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
  if (!(input.areaSlug in AREA_ROUTES)) {
    return { success: false, error: "Area di primo livello non valida." };
  }
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
  const resolved = await risolviPercorsoMenu(supabase, input, auth.userId);
  if ("error" in resolved) return { success: false, error: resolved.error };
  const vista = input.vistaEtichetta.trim();
  const luogo = resolved.luogo;
  const baseSlug = slugMappaArea(luogo, vista);
  const slug = await slugLibero(supabase, baseSlug, input.mappaId);
  const { error } = await supabase
    .from("magazzino_mappe")
    .update({
      documento_stato: "approvato",
      area_codice: input.areaSlug,
      luogo_nome: luogo,
      menu_nodo_id: resolved.postoId,
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
    if (error.message.includes("magazzino_mappe_collegata_nodo_vista")) {
      return {
        success: false,
        error: `Esiste già una pianta con vista «${vista}» su questo posto.`,
      };
    }
    return { success: false, error: error.message };
  }
  await supabase
    .from("magazzino_ubicazioni")
    .update({
      luogo_nome: luogo,
      documento_stato: "approvato",
      updated_by: auth.userId,
    })
    .eq("mappa_origine_id", input.mappaId)
    .is("deleted_at", null);
  const mappa = await loadMappa(supabase, input.mappaId);
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Collegata pianta a ${mappa?.percorsoEtichetta || luogo}`,
    payload: {
      area: input.areaSlug,
      luogo,
      vista,
      slug,
      menu_nodo_id: resolved.postoId,
    },
  });
  if (!mappa) return { success: false, error: "Collegamento ok, pianta non leggibile." };
  return { success: true, mappa };
}

export async function rinominaPercorsoMappaAction(
  raw: RinominaPercorsoMappaInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può rinominare il percorso." };
  }
  const parsed = rinominaPercorsoMappaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Nomi percorso non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("magazzino_mappe")
    .select("id, menu_nodo_id, area_codice")
    .eq("id", input.mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = cur as {
    id: string;
    menu_nodo_id?: string | null;
    area_codice?: string;
  } | null;
  if (!row?.menu_nodo_id) {
    return { success: false, error: "Questa pianta non ha un percorso da rinominare." };
  }
  const catena = await loadCatenaNodi(supabase, row.menu_nodo_id);
  const idsOk = new Set(catena.map((n) => n.id));
  const prima = catena.map((n) => n.etichetta);
  const cambi: { id: string; da: string; a: string; tipo: string }[] = [];

  for (const item of input.nodi) {
    if (!idsOk.has(item.nodoId)) {
      return { success: false, error: "Una voce non appartiene al percorso di questa pianta." };
    }
    const nodo = catena.find((n) => n.id === item.nodoId);
    if (!nodo) continue;
    const nuovo = item.etichetta.trim();
    if (nuovo.toLowerCase() === nodo.etichetta.trim().toLowerCase() && nuovo === nodo.etichetta) {
      continue;
    }
    let clash = supabase
      .from("mappa_menu_nodi")
      .select("id")
      .eq("area_slug", nodo.area_slug)
      .ilike("etichetta", nuovo)
      .neq("id", nodo.id)
      .is("deleted_at", null);
    clash = nodo.parent_id
      ? clash.eq("parent_id", nodo.parent_id)
      : clash.is("parent_id", null);
    const { data: esistente } = await clash.maybeSingle();
    if (esistente) {
      return {
        success: false,
        error: `Il nome «${nuovo}» è già usato allo stesso livello.`,
      };
    }
    const newSlug = slugMenuVoce(nuovo);
    let slugClash = supabase
      .from("mappa_menu_nodi")
      .select("id")
      .eq("area_slug", nodo.area_slug)
      .eq("slug", newSlug)
      .neq("id", nodo.id)
      .is("deleted_at", null);
    slugClash = nodo.parent_id
      ? slugClash.eq("parent_id", nodo.parent_id)
      : slugClash.is("parent_id", null);
    const { data: slugEsistente } = await slugClash.maybeSingle();
    const { error } = await supabase
      .from("mappa_menu_nodi")
      .update({
        etichetta: nuovo,
        slug: slugEsistente ? nodo.slug : newSlug,
        versione: (nodo.versione ?? 1) + 1,
        updated_by: auth.userId,
      })
      .eq("id", nodo.id)
      .is("deleted_at", null);
    if (error) {
      if (error.message.includes("mag_menu_")) {
        return {
          success: false,
          error: `Il nome «${nuovo}» è già usato allo stesso livello.`,
        };
      }
      return { success: false, error: error.message };
    }
    if (nodo.tipo === "luogo") {
      await supabase
        .from("magazzino_mappe")
        .update({ luogo_nome: nuovo, updated_by: auth.userId })
        .eq("menu_nodo_id", nodo.id)
        .is("deleted_at", null);
      const { data: mappePosto } = await supabase
        .from("magazzino_mappe")
        .select("id")
        .eq("menu_nodo_id", nodo.id)
        .is("deleted_at", null);
      const ids = ((mappePosto ?? []) as { id: string }[]).map((m) => m.id);
      if (ids.length) {
        await supabase
          .from("magazzino_ubicazioni")
          .update({ luogo_nome: nuovo, updated_by: auth.userId })
          .in("mappa_origine_id", ids)
          .is("deleted_at", null);
      }
    }
    cambi.push({ id: nodo.id, da: nodo.etichetta, a: nuovo, tipo: nodo.tipo });
  }

  const mappa = await loadMappa(supabase, input.mappaId);
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: cambi.length
      ? `Rinominato percorso pianta: ${cambi.map((c) => `${c.da} → ${c.a}`).join(", ")}`
      : "Percorso pianta invariato (nessun nome modificato)",
    payload: {
      prima,
      cambi,
      dopo: mappa?.percorsoEtichetta,
    },
  });
  if (!mappa) return { success: false, error: "Nomi salvati, pianta non leggibile." };
  return { success: true, mappa };
}

export async function spostaMappaPercorsoAction(
  raw: CollegaMappaInput
): Promise<
  | { success: true; mappa: MappaMagazzino }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  if (!canProgettare(auth.profile)) {
    return { success: false, error: "Solo il Super Admin può spostare il percorso." };
  }
  const parsed = collegaMappaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Percorso non valido.",
    };
  }
  const input = parsed.data;
  if (!(input.areaSlug in AREA_ROUTES)) {
    return { success: false, error: "Area di primo livello non valida." };
  }
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("magazzino_mappe")
    .select("id, menu_nodo_id, vista_etichetta, area_codice")
    .eq("id", input.mappaId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = cur as {
    id: string;
    menu_nodo_id?: string | null;
    vista_etichetta?: string;
    area_codice?: string;
  } | null;
  if (!row) return { success: false, error: "Pianta non trovata." };
  const oldChain = row.menu_nodo_id
    ? (await loadCatenaNodi(supabase, row.menu_nodo_id)).map((n) => n.id)
    : [];
  const resolved = await risolviPercorsoMenu(supabase, input, auth.userId);
  if ("error" in resolved) return { success: false, error: resolved.error };
  const vista = (input.vistaEtichetta || row.vista_etichetta || "").trim();
  const { error } = await supabase
    .from("magazzino_mappe")
    .update({
      area_codice: input.areaSlug,
      luogo_nome: resolved.luogo,
      menu_nodo_id: resolved.postoId,
      updated_by: auth.userId,
    })
    .eq("id", input.mappaId)
    .is("deleted_at", null);
  if (error) {
    if (error.message.includes("magazzino_mappe_collegata_nodo_vista")) {
      return {
        success: false,
        error: `Esiste già una pianta con vista «${vista}» su questo posto.`,
      };
    }
    return { success: false, error: error.message };
  }
  await supabase
    .from("magazzino_ubicazioni")
    .update({
      luogo_nome: resolved.luogo,
      updated_by: auth.userId,
    })
    .eq("mappa_origine_id", input.mappaId)
    .is("deleted_at", null);
  const stillUsed = new Set(resolved.nodoIds);
  await softDeleteNodiOrfani(
    supabase,
    oldChain.filter((id) => !stillUsed.has(id)),
    auth.userId
  );
  const mappa = await loadMappa(supabase, input.mappaId);
  await writeAuditLog({
    entity_type: "magazzino_mappe",
    entity_id: input.mappaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Spostata pianta su ${mappa?.percorsoEtichetta || resolved.luogo}`,
    payload: {
      da: oldChain,
      a: resolved.nodoIds,
      area: input.areaSlug,
      luogo: resolved.luogo,
      menu_nodo_id: resolved.postoId,
    },
  });
  if (!mappa) return { success: false, error: "Spostamento ok, pianta non leggibile." };
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
