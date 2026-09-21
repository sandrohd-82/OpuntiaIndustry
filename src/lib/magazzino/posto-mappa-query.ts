import { isVistaDallAlto } from "@/lib/magazzino/posto-foto";
import { queryFotoPrincipali } from "@/lib/magazzino/posto-foto-query";
import { queryRiepilogoOccupazionePosti } from "@/lib/magazzino/posto-occupazione-query";
import type { MappaLinea, MappaMagazzino } from "@/lib/magazzino/mappa";
import { capienzaDaRiga, type MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";
import { createServiceClient } from "@/lib/supabase/server";

const VISTE_LATERALI = [
  "latofronte",
  "latodx",
  "latodx.",
  "latosx",
  "retro",
  "lato",
];

function chiaveVista(etichetta: string): string {
  return etichetta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´’.]/g, "")
    .replace(/\s+/g, "");
}

function punteggioVistaLaterale(etichetta: string): number {
  const k = chiaveVista(etichetta);
  if (isVistaDallAlto(etichetta)) return 999;
  const i = VISTE_LATERALI.findIndex((p) => k.includes(p));
  return i >= 0 ? i : 80;
}

export async function queryMappaLateralePosto(ubicazioneId: string): Promise<
  | {
      success: true;
      mappa: MappaMagazzino;
      postoCodice: string;
      postoNome: string;
    }
  | { success: false; error: string }
> {
  if (!ubicazioneId) {
    return { success: false, error: "Posto non indicato." };
  }
  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return { success: false, error: "Mappa non disponibile." };
  }

  const { data: forme, error: formeErr } = await db
    .from("magazzino_mappa_aree")
    .select("mappa_id")
    .eq("ubicazione_id", ubicazioneId)
    .is("deleted_at", null);
  if (formeErr) return { success: false, error: formeErr.message };
  const mappaIds = [
    ...new Set(
      ((forme ?? []) as { mappa_id: string }[]).map((r) => r.mappa_id)
    ),
  ];
  if (!mappaIds.length) {
    return { success: false, error: "Nessuna vista pianta per questo posto." };
  }

  const { data: headers, error: hErr } = await db
    .from("magazzino_mappe")
    .select(
      "id, nome, versione, documento_stato, area_codice, luogo_nome, menu_nodo_id, slug, vista_etichetta, scala_valore, scala_unita, view_x, view_y, view_zoom, griglia_px, note, approved_at, collegata_at"
    )
    .in("id", mappaIds)
    .eq("documento_stato", "approvato")
    .is("deleted_at", null);
  if (hErr) return { success: false, error: hErr.message };

  const laterali = ((headers ?? []) as Array<{
    id: string;
    nome: string;
    versione: number;
    documento_stato: string;
    area_codice: string;
    luogo_nome: string | null;
    menu_nodo_id: string | null;
    slug: string | null;
    vista_etichetta: string | null;
    scala_valore: number | string | null;
    scala_unita: string | null;
    view_x: number | string | null;
    view_y: number | string | null;
    view_zoom: number | string | null;
    griglia_px: number | string | null;
    note: string | null;
    approved_at: string | null;
    collegata_at: string | null;
  }>).filter((h) => !isVistaDallAlto(h.vista_etichetta || ""));

  laterali.sort(
    (a, b) =>
      punteggioVistaLaterale(a.vista_etichetta || "") -
      punteggioVistaLaterale(b.vista_etichetta || "")
  );
  const h = laterali[0];
  if (!h) {
    return {
      success: false,
      error: "Nessuna vista laterale (non dall’alto) per questo posto.",
    };
  }

  const [{ data: linee }, { data: areeRows }] = await Promise.all([
    db
      .from("magazzino_mappa_linee")
      .select("id, x1, y1, x2, y2, spessore, colore, sort_order")
      .eq("mappa_id", h.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    db
      .from("magazzino_mappa_aree")
      .select(
        "id, ubicazione_id, x, y, width, height, ubicazione:magazzino_ubicazioni(id, codice, nome, parent_id, peso_max_kg, misura_unita, misura_max_larghezza, misura_max_profondita, misura_max_altezza, misura_min_larghezza, misura_min_profondita, misura_min_altezza, occupazione_stato)"
      )
      .eq("mappa_id", h.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  let postoCodice = "";
  let postoNome = "";
  const aree: MappaAreaDisegnata[] = (
    (areeRows ?? []) as Array<{
      id: string;
      ubicazione_id: string;
      x: number | string;
      y: number | string;
      width: number | string;
      height: number | string;
      ubicazione:
        | {
            id: string;
            codice: string;
            nome: string;
            parent_id: string | null;
            peso_max_kg?: unknown;
            misura_unita?: unknown;
            misura_max_larghezza?: unknown;
            misura_max_profondita?: unknown;
            misura_max_altezza?: unknown;
            misura_min_larghezza?: unknown;
            misura_min_profondita?: unknown;
            misura_min_altezza?: unknown;
            occupazione_stato?: unknown;
          }
        | {
            id: string;
            codice: string;
            nome: string;
            parent_id: string | null;
          }[]
        | null;
    }>
  ).map((r) => {
    const u = Array.isArray(r.ubicazione) ? r.ubicazione[0] : r.ubicazione;
    if (r.ubicazione_id === ubicazioneId) {
      postoCodice = u?.codice ?? "";
      postoNome = u?.nome ?? "";
    }
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
      ...capienzaDaRiga(
        u as Parameters<typeof capienzaDaRiga>[0]
      ),
    };
  });

  const mappedLinee: MappaLinea[] = (
    (linee ?? []) as Array<{
      id: string;
      x1: number | string;
      y1: number | string;
      x2: number | string;
      y2: number | string;
      spessore: number | string;
      colore: string;
      sort_order: number;
    }>
  ).map((l) => ({
    id: l.id,
    x1: Number(l.x1),
    y1: Number(l.y1),
    x2: Number(l.x2),
    y2: Number(l.y2),
    spessore: Number(l.spessore),
    colore: l.colore,
    sortOrder: l.sort_order,
  }));

  const mappa: MappaMagazzino = {
    id: h.id,
    nome: h.nome,
    versione: h.versione,
    documentoStato: "approvato",
    areaCodice: h.area_codice,
    luogoNome: h.luogo_nome ?? "",
    menuNodoId: h.menu_nodo_id,
    percorsoEtichetta: h.luogo_nome ?? "",
    slug: h.slug,
    vistaEtichetta: h.vista_etichetta || "Vista laterale",
    scalaValore: Number(h.scala_valore) || 1,
    scalaUnita: h.scala_unita === "m" ? "m" : "cm",
    viewX: Number(h.view_x) || 0,
    viewY: Number(h.view_y) || 0,
    viewZoom: Number(h.view_zoom) || 1,
    grigliaPx: Number(h.griglia_px) || 20,
    note: h.note ?? "",
    approvedAt: h.approved_at,
    collegataAt: h.collegata_at,
    linee: mappedLinee,
    aree,
    ubicazioni: [],
    riferimenti: [],
  };

  return { success: true, mappa, postoCodice, postoNome };
}

export async function queryMappaLateralePostoConDati(ubicazioneId: string) {
  const base = await queryMappaLateralePosto(ubicazioneId);
  if (!base.success) return base;
  const [foto, riep] = await Promise.all([
    queryFotoPrincipali([ubicazioneId]),
    queryRiepilogoOccupazionePosti([ubicazioneId]),
  ]);
  return {
    success: true as const,
    mappa: base.mappa,
    postoCodice: base.postoCodice,
    postoNome: base.postoNome,
    fotoPrincipali: foto.success ? foto.perPosto : {},
    riepilogoPosti: riep.success ? riep.perPosto : {},
  };
}
