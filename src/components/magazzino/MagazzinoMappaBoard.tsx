"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collegaMappaAdAreaAction,
  getMappaByIdAction,
  riapriProgettazioneMappaAction,
  salvaMappaMagazzinoAction,
} from "@/app/actions/magazzino-mappa";
import { ImportaRiferimentiVista } from "@/components/magazzino/ImportaRiferimentiVista";
import { CopiaAreaGuidata } from "@/components/magazzino/CopiaAreaGuidata";
import { ElencoAreeMappa } from "@/components/magazzino/ElencoAreeMappa";
import { MAGAZZINO_MAPPE_NAV_EVENT } from "@/lib/areas/magazzino";
import { MAPPA_MENU_NAV_EVENT } from "@/lib/magazzino/menu-mappa";
import { CollegaMappaPercorsoModal } from "@/components/magazzino/CollegaMappaPercorsoModal";
import { MagazzinoMappaPalette } from "@/components/magazzino/MagazzinoMappaPalette";
import { MagazzinoMappaRighelli } from "@/components/magazzino/MagazzinoMappaRighelli";
import {
  accavallamentoPuntoSuLinee,
  calcolaFoglioMappa,
  clampPuntoNelFoglio,
  distanzaPuntoSegmento,
  formattaLunghezzaReale,
  formattaMisuraSegmento,
  formattaQuadrati,
  headingCardinale,
  MAPPA_FOGLIO_MARGINE_PCT,
  MAPPA_LINEA_COLORE_DEFAULT,
  MAPPA_QUADRATI_MAX,
  MAPPA_STATO_LABEL,
  MAPPA_VISTA_SUGGERITE,
  MAPPA_ZOOM_MAX,
  MAPPA_ZOOM_MIN,
  normalizzaColoreLinea,
  puntiRiferimentoLinea,
  puntoDopoQuadrati,
  etichettaSensoRettangolo,
  puntoOppostoRettangolo,
  rettangoloHaArea,
  ruotaHeading,
  segniRettangolo,
  snapToGrid,
  verticiRettangoloDaAngoli,
  type AccavallamentoLinea,
  type FoglioMappa,
  type MappaLinea,
  type MappaMagazzino,
  type MappaPunto,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";
import { codicePostoFiglio, type MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";
import {
  etichettaAsseOrigine,
  xGuidaDest,
  type MappaRiferimentoGruppo,
} from "@/lib/magazzino/riferimenti";

type Tool = "linea" | "seleziona" | "rettangolo" | "poligono" | "area";

type FormaStato = {
  tipo: "rettangolo" | "poligono";
  vertici: MappaPunto[];
  lati: number[];
  senso: 1 | -1;
  heading: number;
  opposto: MappaPunto | null;
  fase: "senso" | "misure";
  sx: 1 | -1;
  sy: 1 | -1;
  latoA: number | null;
  latoB: number | null;
};

function newLocalId(): string {
  return crypto.randomUUID();
}

function headingForma(
  forma: FormaStato,
  cursor: MappaPunto | null
): number {
  const from = forma.vertici[forma.vertici.length - 1];
  if (!from) return forma.heading;
  if (forma.tipo === "rettangolo" && forma.vertici.length >= 2) {
    const h0 = headingCardinale(forma.vertici[0]!, forma.vertici[1]!);
    let h = h0;
    for (let i = 0; i < forma.lati.length; i += 1) {
      h = ruotaHeading(h, forma.senso);
    }
    return h;
  }
  if (
    cursor &&
    (Math.abs(cursor.x - from.x) > 0.0001 || Math.abs(cursor.y - from.y) > 0.0001)
  ) {
    return headingCardinale(from, cursor);
  }
  return forma.heading;
}

const FOGLIO_PAD_X = 16;
const FOGLIO_PAD_TOP = 16;
const FOGLIO_PAD_BOTTOM = 52;

export function MagazzinoMappaBoard({
  mappaId,
  mode = "editor",
}: {
  mappaId: string;
  mode?: "editor" | "lettura";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState({ w: 0, h: 0 });
  const [mappa, setMappa] = useState<MappaMagazzino | null>(null);
  const [canDesign, setCanDesign] = useState(false);
  const [linee, setLinee] = useState<MappaLinea[]>([]);
  const [aree, setAree] = useState<MappaAreaDisegnata[]>([]);
  const [riferimenti, setRiferimenti] = useState<MappaRiferimentoGruppo[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [collegaOpen, setCollegaOpen] = useState(false);
  const [collegaBusy, setCollegaBusy] = useState(false);
  const [collegaError, setCollegaError] = useState<string | null>(null);
  const [selectedRifId, setSelectedRifId] = useState<string | null>(null);
  const [dragRif, setDragRif] = useState<{
    id: string;
    sx: number;
    sy: number;
    ax: number;
    ay: number;
  } | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [areaEditOpen, setAreaEditOpen] = useState(false);
  const [copiaOpen, setCopiaOpen] = useState(false);
  const [copiaSourceId, setCopiaSourceId] = useState<string | null>(null);
  const [pendingArea, setPendingArea] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [areaCodice, setAreaCodice] = useState("");
  const [areaNome, setAreaNome] = useState("");
  const [areaParentId, setAreaParentId] = useState<string>("");
  const [dragArea, setDragArea] = useState<{
    id: string;
    sx: number;
    sy: number;
    ax: number;
    ay: number;
  } | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [griglia, setGriglia] = useState(20);
  const [nomePianta, setNomePianta] = useState("");
  const [luogoNome, setLuogoNome] = useState("");
  const [vistaEtichetta, setVistaEtichetta] = useState("");
  const [scalaValore, setScalaValore] = useState(10);
  const [scalaUnita, setScalaUnita] = useState<MappaScalaUnita>("cm");
  const [spessore, setSpessore] = useState(6);
  const [colore, setColore] = useState(MAPPA_LINEA_COLORE_DEFAULT);
  const [tool, setTool] = useState<Tool>("linea");
  const [draftStart, setDraftStart] = useState<MappaPunto | null>(null);
  const [forma, setForma] = useState<FormaStato | null>(null);
  const [quadratiLato, setQuadratiLato] = useState(4);
  const [cursor, setCursor] = useState<MappaPunto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{
    sx: number;
    sy: number;
    px: number;
    py: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const foglioFitKey = useRef("");

  const editing = Boolean(
    mode === "editor" && canDesign && mappa?.documentoStato === "bozza"
  );
  const vistaOk = vistaEtichetta.trim().length > 0;
  const canDraw = editing && vistaOk;
  const scalaOk = scalaValore > 0;

  async function reload() {
    const res = await getMappaByIdAction(mappaId);
    if (!res.success) {
      setError(res.error);
      setMappa(null);
      return;
    }
    setMappa(res.mappa);
    setCanDesign(mode === "editor" && res.canDesign);
    setLinee(res.mappa.linee);
    setAree(res.mappa.aree ?? []);
    setRiferimenti(res.mappa.riferimenti ?? []);
    setNomePianta(res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
    setGriglia(res.mappa.grigliaPx);
    setError(null);
  }

  useEffect(() => {
    setReady(false);
    void reload().finally(() => setReady(true));
  }, [mappaId]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onNativeWheel = (ev: WheelEvent) => ev.preventDefault();
    svg.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onNativeWheel);
  }, [ready]);

  function worldFromEvent(e: React.PointerEvent | React.WheelEvent): MappaPunto | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  const snappedCursor = useMemo(() => {
    if (!cursor) return null;
    return {
      x: snapToGrid(cursor.x, griglia),
      y: snapToGrid(cursor.y, griglia),
    };
  }, [cursor, griglia]);

  function tolleranzaLinea(): number {
    return Math.max(10 / zoom, griglia * 0.35);
  }

  function hitLine(wx: number, wy: number): string | null {
    const tol = tolleranzaLinea();
    let best: { id: string; d: number } | null = null;
    for (const l of linee) {
      const d = distanzaPuntoSegmento(wx, wy, l.x1, l.y1, l.x2, l.y2);
      const extra = l.spessore / 2;
      if (d <= tol + extra && (!best || d < best.d)) {
        best = { id: l.id, d };
      }
    }
    return best?.id ?? null;
  }

  function hitArea(wx: number, wy: number): string | null {
    for (let i = aree.length - 1; i >= 0; i -= 1) {
      const a = aree[i]!;
      if (wx >= a.x && wx <= a.x + a.width && wy >= a.y && wy <= a.y + a.height) {
        return a.id;
      }
    }
    return null;
  }

  function hitRif(wx: number, wy: number): string | null {
    for (let i = riferimenti.length - 1; i >= 0; i -= 1) {
      const g = riferimenti[i]!;
      if (
        wx >= g.destX &&
        wx <= g.destX + g.destWidth &&
        wy >= g.destY &&
        wy <= g.destY + g.destHeight
      ) {
        return g.id;
      }
    }
    return null;
  }

  function risolviPuntoDisegno(w: MappaPunto): {
    punto: MappaPunto;
    acc: AccavallamentoLinea | null;
  } {
    const acc = accavallamentoPuntoSuLinee(
      w,
      linee,
      griglia,
      tolleranzaLinea(),
      null
    );
    if (acc) return { punto: acc.hit, acc };
    return {
      punto: { x: snapToGrid(w.x, griglia), y: snapToGrid(w.y, griglia) },
      acc: null,
    };
  }

  function fitToFoglio(target: FoglioMappa) {
    const box =
      svgWrapRef.current?.getBoundingClientRect() ??
      canvasWrapRef.current?.getBoundingClientRect();
    const width = box?.width || canvasBox.w;
    const height = box?.height || canvasBox.h;
    if (width < 80 || height < 80) return;
    const innerW = Math.max(40, width - FOGLIO_PAD_X * 2);
    const innerH = Math.max(40, height - FOGLIO_PAD_TOP - FOGLIO_PAD_BOTTOM);
    const zx = innerW / Math.max(target.width, 1);
    const zy = innerH / Math.max(target.height, 1);
    const z = Math.min(MAPPA_ZOOM_MAX, Math.max(MAPPA_ZOOM_MIN, Math.min(zx, zy)));
    setZoom(z);
    setPan({
      x: FOGLIO_PAD_X + (innerW - target.width * z) / 2 - target.x * z,
      y: FOGLIO_PAD_TOP + (innerH - target.height * z) / 2 - target.y * z,
    });
  }

  function addLinea(a: MappaPunto, b: MappaPunto): string {
    const linea: MappaLinea = {
      id: newLocalId(),
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      spessore,
      colore,
      sortOrder: linee.length,
    };
    setLinee((prev) => [...prev, { ...linea, sortOrder: prev.length }]);
    setSelectedId(linea.id);
    return linea.id;
  }

  const latoBloccato = useMemo(() => {
    if (!forma || forma.tipo !== "rettangolo") return null;
    if (forma.lati.length === 2) return forma.lati[0] ?? null;
    if (forma.lati.length === 3) return forma.lati[1] ?? null;
    return null;
  }, [forma]);

  const quadratiCorrenti =
    latoBloccato != null ? latoBloccato : Math.max(1, Math.round(quadratiLato) || 1);

  const previewForma = useMemo(() => {
    if (!forma || !canDraw) return null;
    if (forma.tipo === "rettangolo") {
      const from = forma.vertici[0];
      if (!from) return null;
      const to = forma.opposto;
      if (!to) return { from, to: from, heading: forma.heading, ghost: [] as MappaPunto[] };
      return {
        from,
        to,
        heading: headingCardinale(from, to),
        ghost: verticiRettangoloDaAngoli(from, to, griglia),
      };
    }
    const from = forma.vertici[forma.vertici.length - 1];
    if (!from) return null;
    const heading = headingForma(forma, snappedCursor);
    const n = quadratiCorrenti;
    const to = puntoDopoQuadrati(from, heading, n, griglia);
    return { from, to, heading, ghost: [] as MappaPunto[] };
  }, [forma, canDraw, snappedCursor, quadratiCorrenti, griglia]);

  const extraPunti = useMemo(() => {
    const p: MappaPunto[] = [];
    if (forma) p.push(...forma.vertici);
    if (
      forma?.tipo === "rettangolo" &&
      forma.fase === "misure" &&
      (forma.latoA != null || forma.latoB != null) &&
      forma.opposto
    ) {
      p.push(forma.opposto, ...verticiRettangoloDaAngoli(forma.vertici[0]!, forma.opposto, griglia));
    }
    if (previewForma && forma?.tipo !== "rettangolo") {
      p.push(previewForma.from, previewForma.to, ...previewForma.ghost);
    }
    for (const a of aree) {
      p.push({ x: a.x, y: a.y }, { x: a.x + a.width, y: a.y + a.height });
    }
    if (pendingArea) {
      p.push(
        { x: pendingArea.x, y: pendingArea.y },
        { x: pendingArea.x + pendingArea.width, y: pendingArea.y + pendingArea.height }
      );
    }
    for (const g of riferimenti) {
      p.push(
        { x: g.destX, y: g.destY },
        { x: g.destX + g.destWidth, y: g.destY + g.destHeight }
      );
    }
    return p;
  }, [forma, previewForma, griglia, aree, pendingArea, riferimenti]);

  const latoPianificatoPx = (() => {
    if (!canDraw) return 0;
    if (forma?.tipo === "rettangolo" && forma.fase === "misure") {
      return Math.max(forma.latoA ?? 0, forma.latoB ?? 0) * griglia;
    }
    if (tool === "poligono" || forma?.tipo === "poligono") {
      return quadratiCorrenti * griglia;
    }
    return 0;
  })();

  const foglio = useMemo(
    () =>
      calcolaFoglioMappa(linee, [], extraPunti, griglia, latoPianificatoPx),
    [linee, extraPunti, griglia, latoPianificatoPx]
  );

  const foglioQuadrati = Math.max(
    1,
    Math.round(foglio.width / Math.max(griglia, 1))
  );

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
      return;
    }
    if (e.button !== 0) return;
    const w = worldFromEvent(e);
    if (!w) return;
    const { punto: snap } = risolviPuntoDisegno(w);
    if (!canDraw) {
      const rid = hitRif(w.x, w.y);
      if (rid) {
        setSelectedRifId(rid);
        setSelectedAreaId(null);
        setAreaEditOpen(false);
        setSelectedId(null);
        return;
      }
      const aid = hitArea(w.x, w.y);
      if (aid) {
        selezionaArea(aid);
        return;
      }
      setSelectedAreaId(null);
      setSelectedRifId(null);
      setSelectedId(hitLine(w.x, w.y));
      return;
    }
    if (!forma && !pendingArea && tool === "seleziona") {
      const rid = hitRif(w.x, w.y);
      if (rid) {
        const g = riferimenti.find((x) => x.id === rid);
        setSelectedRifId(rid);
        setSelectedAreaId(null);
        setAreaEditOpen(false);
        setSelectedId(null);
        if (g) setDragRif({ id: rid, sx: w.x, sy: w.y, ax: g.destX, ay: g.destY });
        return;
      }
    }
    if (!forma && !pendingArea) {
      const aid = hitArea(w.x, w.y);
      if (aid && (tool === "seleziona" || tool === "area")) {
        const a = aree.find((x) => x.id === aid);
        setSelectedAreaId(aid);
        setAreaEditOpen(false);
        setSelectedId(null);
        setSelectedRifId(null);
        if (a) {
          setDragArea({ id: aid, sx: w.x, sy: w.y, ax: a.x, ay: a.y });
        }
        if (tool === "seleziona") return;
        return;
      }
    }
    if (tool === "seleziona") {
      setSelectedAreaId(null);
      const id = hitLine(w.x, w.y);
      setSelectedId(id);
      const sel = linee.find((l) => l.id === id);
      if (sel) {
        setSpessore(sel.spessore);
        setColore(sel.colore);
      }
      setDraftStart(null);
      return;
    }
    if (tool === "rettangolo" || tool === "poligono" || tool === "area") {
      if (!forma) {
        setForma({
          tipo: tool === "poligono" ? "poligono" : "rettangolo",
          vertici: [snap],
          lati: [],
          senso: 1,
          heading: 0,
          opposto: null,
          fase: "senso",
          sx: 1,
          sy: 1,
          latoA: null,
          latoB: null,
        });
        setSelectedId(null);
        setDraftStart(null);
        return;
      }
      if (forma.tipo === "rettangolo") {
        const origine = forma.vertici[0];
        if (!origine) return;
        if (forma.fase === "senso") {
          const p = clampPuntoNelFoglio(snap, foglio, griglia);
          const { sx, sy } = segniRettangolo(origine, p);
          setForma({
            ...forma,
            fase: "misure",
            sx,
            sy,
            heading: headingCardinale(origine, p),
            latoA: null,
            latoB: null,
          });
          return;
        }
        const misura = {
          x: snapToGrid(snap.x, griglia),
          y: snapToGrid(snap.y, griglia),
        };
        if (forma.latoA == null) {
          const wQ = Math.max(1, Math.round(Math.abs(misura.x - origine.x) / griglia));
          const hQ =
            forma.latoB ??
            Math.max(1, Math.round(Math.abs(misura.y - origine.y) / griglia));
          const opposto = puntoOppostoRettangolo(
            origine,
            forma.sx,
            forma.sy,
            wQ,
            hQ,
            griglia
          );
          setForma({ ...forma, latoA: wQ, opposto });
          return;
        }
        if (forma.latoB == null) {
          const hQ = Math.max(1, Math.round(Math.abs(misura.y - origine.y) / griglia));
          const opposto = puntoOppostoRettangolo(
            origine,
            forma.sx,
            forma.sy,
            forma.latoA,
            hQ,
            griglia
          );
          confermaRettangolo(origine, opposto);
          return;
        }
        confermaRettangolo(origine, forma.opposto ?? misura);
      }
      return;
    }
    if (!draftStart) {
      setDraftStart(snap);
      setSelectedId(null);
      return;
    }
    if (draftStart.x === snap.x && draftStart.y === snap.y) return;
    addLinea(draftStart, snap);
    setDraftStart(null);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (panning) {
      setPan({
        x: panning.px + (e.clientX - panning.sx),
        y: panning.py + (e.clientY - panning.sy),
      });
      return;
    }
    const w = worldFromEvent(e);
    setCursor(w);
    if (dragRif && w && canDraw) {
      const dx = snapToGrid(w.x - dragRif.sx, griglia);
      const dy = snapToGrid(w.y - dragRif.sy, griglia);
      setRiferimenti((prev) =>
        prev.map((g) =>
          g.id === dragRif.id
            ? { ...g, destX: dragRif.ax + dx, destY: dragRif.ay + dy }
            : g
        )
      );
      return;
    }
    if (dragArea && w && canDraw) {
      const dx = snapToGrid(w.x - dragArea.sx, griglia);
      const dy = snapToGrid(w.y - dragArea.sy, griglia);
      setAree((prev) =>
        prev.map((a) =>
          a.id === dragArea.id
            ? { ...a, x: dragArea.ax + dx, y: dragArea.ay + dy }
            : a
        )
      );
      return;
    }
    if (!forma || !w) return;
    const from = forma.vertici[forma.vertici.length - 1];
    if (!from) return;
    if (forma.tipo === "rettangolo") {
      const origine = forma.vertici[0];
      if (!origine) return;
      const raw = risolviPuntoDisegno(w).punto;
      if (forma.fase === "misure" && forma.latoA != null && forma.latoB != null) {
        return;
      }
      const p =
        forma.fase === "senso"
          ? clampPuntoNelFoglio(raw, foglio, griglia)
          : { x: snapToGrid(raw.x, griglia), y: snapToGrid(raw.y, griglia) };
      setForma((prev) => {
        if (!prev || prev.tipo !== "rettangolo") return prev;
        if (prev.fase === "misure" && prev.latoA != null && prev.latoB != null) {
          return prev;
        }
        const segni =
          prev.fase === "senso" ? segniRettangolo(origine, p) : { sx: prev.sx, sy: prev.sy };
        const wQ =
          prev.fase === "misure" && prev.latoA != null
            ? prev.latoA
            : Math.max(1, Math.round(Math.abs(p.x - origine.x) / griglia));
        const hQ =
          prev.fase === "misure" && prev.latoB != null
            ? prev.latoB
            : Math.max(1, Math.round(Math.abs(p.y - origine.y) / griglia));
        const opposto =
          prev.fase === "senso"
            ? clampPuntoNelFoglio(
                puntoOppostoRettangolo(origine, segni.sx, segni.sy, wQ, hQ, griglia),
                foglio,
                griglia
              )
            : puntoOppostoRettangolo(origine, segni.sx, segni.sy, wQ, hQ, griglia);
        if (
          prev.opposto &&
          prev.opposto.x === opposto.x &&
          prev.opposto.y === opposto.y &&
          prev.sx === segni.sx &&
          prev.sy === segni.sy
        ) {
          return prev;
        }
        return {
          ...prev,
          sx: segni.sx,
          sy: segni.sy,
          opposto,
          heading: headingCardinale(origine, opposto),
        };
      });
      return;
    }
    if (Math.abs(w.x - from.x) < 0.0001 && Math.abs(w.y - from.y) < 0.0001) return;
    const h = headingCardinale(from, w);
    if (h !== forma.heading) {
      setForma((prev) => (prev ? { ...prev, heading: h } : prev));
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const w = worldFromEvent(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const next = Math.min(MAPPA_ZOOM_MAX, Math.max(MAPPA_ZOOM_MIN, zoom * factor));
    if (w) {
      setPan({
        x: e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0) - w.x * next,
        y: e.clientY - (svgRef.current?.getBoundingClientRect().top ?? 0) - w.y * next,
      });
    }
    setZoom(next);
  }

  function resetDisegno() {
    setDraftStart(null);
    setForma(null);
    setSelectedId(null);
    setPendingArea(null);
    setDragArea(null);
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        if (ev.key === "Enter" && forma && canDraw) {
          ev.preventDefault();
          avantiLato();
        }
        if (ev.key === "Delete") {
          ev.preventDefault();
          eliminaLineaSelezionata();
          eliminaAreaSelezionata();
        }
        return;
      }
      if (ev.key === "Escape") {
        resetDisegno();
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        eliminaLineaSelezionata();
        eliminaAreaSelezionata();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function confermaRettangolo(a: MappaPunto, b: MappaPunto) {
    if (!canDraw || !rettangoloHaArea(a, b, griglia)) return;
    const v = verticiRettangoloDaAngoli(a, b, griglia);
    if (tool === "area") {
      const xs = v.map((p) => p.x);
      const ys = v.map((p) => p.y);
      setPendingArea({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
      setForma(null);
      setAreaCodice("");
      setAreaNome("");
      setAreaParentId("");
      setOk("Imposta codice e nome del posto, poi Salva area.");
      return;
    }
    const nuovi: MappaLinea[] = [];
    for (let i = 0; i < 4; i += 1) {
      const p = v[i]!;
      const q = v[(i + 1) % 4]!;
      nuovi.push({
        id: newLocalId(),
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        spessore,
        colore,
        sortOrder: 0,
      });
    }
    setLinee((prev) => [
      ...prev,
      ...nuovi.map((l, i) => ({ ...l, sortOrder: prev.length + i })),
    ]);
    setSelectedId(nuovi[0]?.id ?? null);
    setForma(null);
    setOk("Rettangolo disegnato.");
  }

  function setRettangoloQuadrati(wQ: number, hQ: number) {
    if (!forma || forma.tipo !== "rettangolo" || forma.fase !== "misure") return;
    const o = forma.vertici[0];
    if (!o) return;
    const w = Math.max(1, Math.round(wQ));
    const h = Math.max(1, Math.round(hQ));
    const next = puntoOppostoRettangolo(o, forma.sx, forma.sy, w, h, griglia);
    setForma({
      ...forma,
      latoA: w,
      latoB: h,
      opposto: next,
      heading: headingCardinale(o, next),
    });
  }

  function avantiLato() {
    if (!forma || !canDraw) return;
    if (forma.tipo === "rettangolo") {
      const origine = forma.vertici[0];
      if (forma.fase !== "misure" || !origine || !forma.opposto) return;
      confermaRettangolo(origine, forma.opposto);
      return;
    }
    const from = forma.vertici[forma.vertici.length - 1];
    if (!from) return;
    const n = quadratiCorrenti;
    if (n < 1) return;
    const heading = headingForma(forma, snappedCursor);
    const to = puntoDopoQuadrati(from, heading, n, griglia);
    if (to.x === from.x && to.y === from.y) return;
    addLinea(from, to);
    setForma({
      ...forma,
      vertici: [...forma.vertici, to],
      lati: [...forma.lati, n],
    });
  }

  function chiudiPoligono() {
    if (!forma || forma.tipo !== "poligono" || forma.vertici.length < 3) return;
    const last = forma.vertici[forma.vertici.length - 1]!;
    const first = forma.vertici[0]!;
    if (last.x !== first.x || last.y !== first.y) {
      addLinea(last, first);
    }
    setForma(null);
    setOk("Poligono chiuso.");
  }

  function eliminaLineaSelezionata() {
    if (!canDraw || !selectedId || forma) return;
    setLinee((prev) => prev.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  }

  function eliminaAreaSelezionata() {
    if (!canDraw || !selectedAreaId || forma || pendingArea) return;
    setAree((prev) => prev.filter((a) => a.id !== selectedAreaId));
    setSelectedAreaId(null);
    setAreaEditOpen(false);
  }

  function salvaAreaPendente() {
    if (!pendingArea || !canDraw) return;
    const codice = areaCodice.trim();
    const nome = areaNome.trim();
    if (!codice || !nome) {
      setError("Codice e nome dell'area sono obbligatori.");
      return;
    }
    const parentArea = aree.find(
      (a) => a.id === areaParentId || a.ubicazioneId === areaParentId
    );
    const parentUb = (mappa?.ubicazioni ?? []).find((u) => u.id === areaParentId);
    const parentCodice = parentArea?.codice ?? parentUb?.codice ?? "";
    const codiceFinale = parentCodice ? codicePostoFiglio(parentCodice, codice) : codice;
    const nuova: MappaAreaDisegnata = {
      id: newLocalId(),
      ubicazioneId: "",
      codice: codiceFinale,
      nome,
      parentId: areaParentId || null,
      x: pendingArea.x,
      y: pendingArea.y,
      width: pendingArea.width,
      height: pendingArea.height,
    };
    setAree((prev) => [...prev, nuova]);
    setSelectedAreaId(nuova.id);
    setPendingArea(null);
    setError(null);
    setOk("Area creata. Salva la bozza per registrarla nel gestionale.");
  }

  const selectedArea = selectedAreaId
    ? aree.find((a) => a.id === selectedAreaId) ?? null
    : null;

  const selectedRif = selectedRifId
    ? riferimenti.find((g) => g.id === selectedRifId) ?? null
    : null;

  const parentOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const a of aree) {
      opts.push({
        id: a.ubicazioneId || a.id,
        label: `${a.codice} — ${a.nome}`,
      });
    }
    for (const u of mappa?.ubicazioni ?? []) {
      if (opts.some((o) => o.id === u.id)) continue;
      opts.push({ id: u.id, label: u.etichetta });
    }
    return opts;
  }, [aree, mappa?.ubicazioni]);

  function parentLabelOf(parentId: string | null): string {
    if (!parentId) return "—";
    const a = aree.find((x) => x.id === parentId || x.ubicazioneId === parentId);
    if (a) return `${a.codice} — ${a.nome}`;
    const u = (mappa?.ubicazioni ?? []).find((x) => x.id === parentId);
    return u?.etichetta ?? "—";
  }

  function selezionaArea(id: string | null, edit = false) {
    setSelectedAreaId(id);
    setSelectedId(null);
    setSelectedRifId(null);
    setAreaEditOpen(edit);
    if (!id) return;
    const a = aree.find((x) => x.id === id);
    const box = svgWrapRef.current?.getBoundingClientRect();
    if (!a || !box || box.width < 40 || box.height < 40) return;
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    setPan({
      x: box.width / 2 - cx * zoom,
      y: box.height / 2 - cy * zoom,
    });
  }

  function applicaCopiaArea(r: {
    codice: string;
    nome: string;
    parentId: string | null;
    width: number;
    height: number;
    source: MappaAreaDisegnata;
  }) {
    const gap = Math.max(griglia, 1) * 2;
    const nuova: MappaAreaDisegnata = {
      id: newLocalId(),
      ubicazioneId: "",
      codice: r.codice,
      nome: r.nome,
      parentId: r.parentId,
      x: r.source.x + r.source.width + gap,
      y: r.source.y,
      width: r.width,
      height: r.height,
    };
    setAree((prev) => [...prev, nuova]);
    setSelectedAreaId(nuova.id);
    setAreaEditOpen(false);
    setSelectedId(null);
    setOk("Copia creata accanto all'originale. Trascinala e salva la bozza.");
  }

  function apriCopia(fromId?: string) {
    setCopiaSourceId(fromId ?? selectedAreaId);
    setCopiaOpen(true);
  }

  function figliSenzaForma(parent: MappaAreaDisegnata) {
    const parentKey = parent.ubicazioneId || parent.id;
    const disegnati = new Set(
      aree.map((a) => a.ubicazioneId || a.id).filter(Boolean)
    );
    return (mappa?.ubicazioni ?? []).filter(
      (u) =>
        (u.parentId === parentKey || u.parentId === parent.ubicazioneId) &&
        !disegnati.has(u.id)
    );
  }

  function applySpessore(v: number) {
    const next = Number.isFinite(v) && v > 0 ? v : 0.01;
    setSpessore(next);
    if (selectedId && canDraw) {
      setLinee((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, spessore: next } : l))
      );
    }
  }

  const selectedLine = selectedId
    ? linee.find((l) => l.id === selectedId) ?? null
    : null;

  const disegnoCursor = useMemo(() => {
    if (!cursor) return null;
    return risolviPuntoDisegno(cursor);
  }, [cursor, linee, griglia, zoom]);

  const accavallamentiVisibili = useMemo(() => {
    const out: { kind: "inizio" | "fine"; acc: AccavallamentoLinea }[] = [];
    const startP =
      draftStart ??
      previewForma?.from ??
      (forma ? forma.vertici[forma.vertici.length - 1] : null);
    const endP = previewForma?.to ?? (draftStart ? disegnoCursor?.punto : null);
    if (startP) {
      const acc = accavallamentoPuntoSuLinee(
        startP,
        linee,
        griglia,
        tolleranzaLinea(),
        null
      );
      if (acc) out.push({ kind: "inizio", acc });
    }
    if (endP) {
      const acc = accavallamentoPuntoSuLinee(
        endP,
        linee,
        griglia,
        tolleranzaLinea(),
        null
      );
      if (acc) out.push({ kind: "fine", acc });
    }
    return out;
  }, [
    draftStart,
    previewForma,
    forma,
    disegnoCursor,
    linee,
    griglia,
    zoom,
  ]);

  function applyColore(v: string) {
    const next = normalizzaColoreLinea(v);
    setColore(next);
    if (selectedId && canDraw) {
      setLinee((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, colore: next } : l))
      );
    }
  }

  async function persist(): Promise<boolean> {
    if (!mappa) return false;
    setSaving(true);
    setError(null);
    setOk(null);
    const persisted = new Set(mappa.linee.map((l) => l.id));
    const persistedAree = new Set((mappa.aree ?? []).map((a) => a.id));
    const persistedUbi = new Set((mappa.aree ?? []).map((a) => a.ubicazioneId));
    const res = await salvaMappaMagazzinoAction({
      mappaId: mappa.id,
      nome: nomePianta.trim() || mappa.nome,
      vistaEtichetta: vistaEtichetta.trim(),
      scalaValore,
      scalaUnita,
      viewX: pan.x,
      viewY: pan.y,
      viewZoom: zoom,
      grigliaPx: griglia,
      linee: linee.map((l, i) => ({
        id: persisted.has(l.id) ? l.id : undefined,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        spessore: l.spessore,
        colore: l.colore,
        sortOrder: i,
      })),
      aree: aree.map((a) => ({
        id: persistedAree.has(a.id) ? a.id : undefined,
        ubicazioneId: persistedUbi.has(a.ubicazioneId) ? a.ubicazioneId : undefined,
        codice: a.codice,
        nome: a.nome,
        parentId: a.parentId || null,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      })),
      riferimenti: riferimenti.map((g) => ({
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
      })),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    setMappa(res.mappa);
    setLinee(res.mappa.linee);
    setAree(res.mappa.aree ?? []);
    setRiferimenti(res.mappa.riferimenti ?? []);
    setNomePianta(res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
    setOk("Bozza salvata. Le altre bozze restano in elenco.");
    return true;
  }

  async function salva() {
    await persist();
  }

  async function avviaCollega() {
    if (!mappa) return;
    const okSave = await persist();
    if (!okSave) return;
    setCollegaError(null);
    setCollegaOpen(true);
  }

  async function confermaCollega(payload: {
    areaSlug: string;
    rami: { nodoId?: string; etichetta: string; slug?: string }[];
    posto: { nodoId?: string; etichetta: string };
  }) {
    if (!mappa) return;
    setCollegaBusy(true);
    setError(null);
    setCollegaError(null);
    const res = await collegaMappaAdAreaAction({
      mappaId: mappa.id,
      vistaEtichetta: vistaEtichetta.trim(),
      areaSlug: payload.areaSlug,
      rami: payload.rami,
      posto: payload.posto,
    });
    setCollegaBusy(false);
    if (!res.success) {
      setCollegaError(res.error);
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setLuogoNome(res.mappa.luogoNome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setCollegaOpen(false);
    setOk(`Collegata a ${res.mappa.percorsoEtichetta}.`);
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
    window.dispatchEvent(new Event(MAPPA_MENU_NAV_EVENT));
  }

  async function riapri() {
    if (!mappa) return;
    const res = await riapriProgettazioneMappaAction(mappa.id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setOk(`Progettazione riaperta (v${res.mappa.versione}). La pianta esce dal menu Magazzino finché non la colleghi di nuovo.`);
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
  }

  const gridPatternId = "mappa-grid";
  const foglioKey = `${Math.round(foglio.width)}x${Math.round(foglio.height)}@${griglia}|${Math.round(canvasBox.w)}x${Math.round(canvasBox.h)}`;

  useEffect(() => {
    const el = svgWrapRef.current ?? canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width < 8 || cr.height < 8) return;
      setCanvasBox({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, mappa]);

  useEffect(() => {
    if (!ready || canvasBox.w < 80 || canvasBox.h < 80) return;
    if (foglioFitKey.current === foglioKey) return;
    foglioFitKey.current = foglioKey;
    requestAnimationFrame(() => fitToFoglio(foglio));
  }, [ready, foglioKey, foglio, canvasBox.w, canvasBox.h]);

  const misuraTesto = useMemo(() => {
    if (forma?.tipo === "rettangolo" && forma.vertici[0] && forma.opposto) {
      const wq = Math.abs(forma.opposto.x - forma.vertici[0].x) / griglia;
      const hq = Math.abs(forma.opposto.y - forma.vertici[0].y) / griglia;
      return `${formattaQuadrati(wq)} × ${formattaQuadrati(hq)} quadrati · ${formattaLunghezzaReale(wq, scalaValore, scalaUnita)} × ${formattaLunghezzaReale(hq, scalaValore, scalaUnita)}`;
    }
    if (previewForma) {
      return formattaMisuraSegmento(
        previewForma.from.x,
        previewForma.from.y,
        previewForma.to.x,
        previewForma.to.y,
        griglia,
        scalaValore,
        scalaUnita
      );
    }
    if (draftStart && snappedCursor) {
      return formattaMisuraSegmento(
        draftStart.x,
        draftStart.y,
        snappedCursor.x,
        snappedCursor.y,
        griglia,
        scalaValore,
        scalaUnita
      );
    }
    if (selectedId) {
      const l = linee.find((x) => x.id === selectedId);
      if (l) {
        return formattaMisuraSegmento(
          l.x1,
          l.y1,
          l.x2,
          l.y2,
          griglia,
          scalaValore,
          scalaUnita
        );
      }
    }
    return "";
  }, [
    forma,
    previewForma,
    draftStart,
    snappedCursor,
    selectedId,
    linee,
    griglia,
    scalaValore,
    scalaUnita,
  ]);

  const latoIndice = forma ? forma.lati.length + 1 : 0;
  const headingCorrente = forma ? headingForma(forma, snappedCursor) : 0;
  const versoLabel =
    headingCorrente === 180
      ? "sinistra"
      : headingCorrente === 90
        ? "basso"
        : headingCorrente === 270
          ? "alto"
          : "destra";

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento mappa…</p>;
  }
  if (!mappa) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {error ?? "Nessuna pianta disponibile."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {mode === "editor" ? (
              <Link
                href="/app/strumenti/editor-aree"
                className="mr-2 text-teal-800 hover:underline"
              >
                Elenco bozze
              </Link>
            ) : null}
            {mappa.nome} · v{mappa.versione} ·{" "}
            {MAPPA_STATO_LABEL[mappa.documentoStato]}
            {mappa.percorsoEtichetta
              ? ` · ${mappa.percorsoEtichetta}`
              : mappa.luogoNome && mappa.vistaEtichetta
                ? ` · ${mappa.luogoNome} [${mappa.vistaEtichetta}]`
                : ""}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {vistaOk ? (
              <span className="font-medium text-slate-700">
                Vista: {vistaEtichetta.trim()}
              </span>
            ) : editing ? (
              "Prima imposta il testo Vista, poi traccia le linee."
            ) : (
              "Vista non impostata."
            )}
            {" · "}
            1 quadrato = {scalaValore} {scalaUnita}
            {" · "}
            {editing
              ? "Il foglio racchiude il disegno con il 5% di margine su ogni lato. Lo zoom inquadra il foglio nell’area sotto le impostazioni; la rotella zoomma solo il contenuto."
              : canDesign
                ? "Pianta in sola lettura. Riapri la progettazione per disegnare."
                : "Pianta in sola lettura. Solo il Super Admin può disegnare gli scaffali."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "editor" && canDesign && mappa.documentoStato === "approvato" ? (
            <button
              type="button"
              onClick={() => void riapri()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Riapri progettazione
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void salva()}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva bozza"}
              </button>
              <button
                type="button"
                disabled={saving || collegaBusy || !vistaOk || !scalaOk}
                onClick={() => void avviaCollega()}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Collega ad area
              </button>
              <button
                type="button"
                disabled={!luogoNome.trim() && !mappa.luogoNome}
                onClick={() => setImportOpen(true)}
                className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50"
              >
                Importa da vista
              </button>
              <button
                type="button"
                disabled={aree.length === 0}
                onClick={() => apriCopia()}
                className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50"
              >
                Copia da area
              </button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="shrink-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              Nome bozza
              <input
                type="text"
                value={nomePianta}
                onChange={(e) => setNomePianta(e.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            {mappa.percorsoEtichetta ? (
              <div className="text-xs">
                <p className="font-medium">Percorso menu</p>
                <p className="mt-1 rounded border border-[var(--border)] bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
                  {mappa.percorsoEtichetta}
                </p>
              </div>
            ) : (
              <label className="block text-xs font-medium">
                Nome posto (per importare da un&apos;altra vista)
                <input
                  type="text"
                  value={luogoNome}
                  onChange={(e) => setLuogoNome(e.target.value)}
                  placeholder="Es. Magazzino 1"
                  maxLength={120}
                  className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium">
              Vista
              <input
                type="text"
                value={vistaEtichetta}
                onChange={(e) => setVistaEtichetta(e.target.value)}
                placeholder="Es. Dall’alto, Lato fronte, Lato Dx"
                maxLength={80}
                className="mt-1 w-full max-w-md rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MAPPA_VISTA_SUGGERITE.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVistaEtichetta(v)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    vistaEtichetta.trim() === v
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-[var(--border)] bg-white hover:bg-slate-50"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">
              1 quadrato =
              <input
                type="number"
                min={0.01}
                step="any"
                value={scalaValore}
                onChange={(e) =>
                  setScalaValore(Math.max(0.01, Number(e.target.value) || 10))
                }
                className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Unità
              <select
                value={scalaUnita}
                onChange={(e) => setScalaUnita(e.target.value as MappaScalaUnita)}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            <label className="text-xs">
              Strumento
              <select
                value={tool}
                onChange={(e) => {
                  setTool(e.target.value as Tool);
                  setDraftStart(null);
                  setForma(null);
                }}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="linea">Traccia linea</option>
                <option value="rettangolo">Rettangolo / quadrato</option>
                <option value="area">Crea area / posto</option>
                <option value="poligono">Poligono</option>
                <option value="seleziona">Seleziona e sposta</option>
              </select>
            </label>
            <label className="text-xs">
              Spessore
              <input
                type="number"
                min={0.01}
                step="any"
                value={spessore}
                onChange={(e) => applySpessore(Number(e.target.value))}
                className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <div className="min-w-[16rem] flex-1">
              <MagazzinoMappaPalette colore={colore} onChange={applyColore} />
            </div>
            <label className="text-xs">
              Griglia
              <input
                type="number"
                min={5}
                max={80}
                value={griglia}
                onChange={(e) => setGriglia(Math.max(5, Number(e.target.value) || 20))}
                className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <span className="text-xs text-[var(--muted)]">
              Linee: {linee.length} · foglio {foglioQuadrati}×{foglioQuadrati}{" "}
              quadrati (margine {Math.round(MAPPA_FOGLIO_MARGINE_PCT * 100)}%) ·
              zoom {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => fitToFoglio(foglio)}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Adatta al foglio
            </button>
          </div>

          {canDraw && (tool === "rettangolo" || tool === "poligono" || tool === "area") ? (
            <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2">
              {!forma ? (
                <p className="text-sm text-teal-950">
                  {tool === "area"
                    ? "Crea un rettangolo (primo click partenza, secondo click senso, poi misure). Poi assegna codice e nome: sarà un posto riponibile collegato a questa pianta."
                    : tool === "rettangolo"
                    ? "Primo click: punto di partenza. Secondo click: blocca il senso (destra/sinistra e alto/basso). Poi le misure, nei campi o con altri click sul foglio."
                    : "Clicca il primo angolo. Poi muovi il mouse per la direzione del lato, indica i quadrati e premi Avanti."}
                </p>
              ) : forma.tipo === "rettangolo" ? (
                <>
                  {forma.fase === "senso" ? (
                    <p className="text-sm font-medium text-teal-950">
                      Senso proposto: {etichettaSensoRettangolo(forma.sx, forma.sy)}.
                      Secondo click per bloccarlo.
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-teal-950">
                      Senso bloccato: {etichettaSensoRettangolo(forma.sx, forma.sy)}
                      {forma.opposto && forma.vertici[0]
                        ? ` · ${formattaQuadrati(Math.abs(forma.opposto.x - forma.vertici[0].x) / griglia)} × ${formattaQuadrati(Math.abs(forma.opposto.y - forma.vertici[0].y) / griglia)} quadrati · ${formattaLunghezzaReale(Math.abs(forma.opposto.x - forma.vertici[0].x) / griglia, scalaValore, scalaUnita)} × ${formattaLunghezzaReale(Math.abs(forma.opposto.y - forma.vertici[0].y) / griglia, scalaValore, scalaUnita)}`
                        : null}
                      {forma.latoA == null
                        ? " · click sul foglio = larghezza"
                        : forma.latoB == null
                          ? " · click sul foglio = altezza"
                          : null}
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      Quadrati larghezza
                      <input
                        type="number"
                        min={1}
                        max={MAPPA_QUADRATI_MAX}
                        disabled={forma.fase !== "misure"}
                        value={
                          forma.latoA ??
                          (forma.opposto && forma.vertici[0]
                            ? Math.max(
                                1,
                                Math.round(
                                  Math.abs(forma.opposto.x - forma.vertici[0].x) / griglia
                                )
                              )
                            : 1)
                        }
                        onChange={(e) => {
                          const wq = Math.max(1, Math.round(Number(e.target.value) || 1));
                          const hq =
                            forma.latoB ??
                            (forma.opposto && forma.vertici[0]
                              ? Math.max(
                                  1,
                                  Math.round(
                                    Math.abs(forma.opposto.y - forma.vertici[0].y) / griglia
                                  )
                                )
                              : 1);
                          setRettangoloQuadrati(wq, hq);
                        }}
                        className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm disabled:bg-slate-100"
                      />
                    </label>
                    <label className="text-xs">
                      Quadrati altezza
                      <input
                        type="number"
                        min={1}
                        max={MAPPA_QUADRATI_MAX}
                        disabled={forma.fase !== "misure"}
                        value={
                          forma.latoB ??
                          (forma.opposto && forma.vertici[0]
                            ? Math.max(
                                1,
                                Math.round(
                                  Math.abs(forma.opposto.y - forma.vertici[0].y) / griglia
                                )
                              )
                            : 1)
                        }
                        onChange={(e) => {
                          const hq = Math.max(1, Math.round(Number(e.target.value) || 1));
                          const wq =
                            forma.latoA ??
                            (forma.opposto && forma.vertici[0]
                              ? Math.max(
                                  1,
                                  Math.round(
                                    Math.abs(forma.opposto.x - forma.vertici[0].x) / griglia
                                  )
                                )
                              : 1);
                          setRettangoloQuadrati(wq, hq);
                        }}
                        className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm disabled:bg-slate-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => avantiLato()}
                      disabled={forma.fase !== "misure" || !forma.opposto}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {tool === "area" ? "Conferma area" : "Conferma rettangolo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForma(null)}
                      className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
                    >
                      Annulla forma
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-teal-950">
                    Lato {latoIndice}
                    {" · "}
                    verso {versoLabel}
                    {" · "}
                    {formattaQuadrati(quadratiCorrenti)} quadrati ·{" "}
                    {formattaLunghezzaReale(quadratiCorrenti, scalaValore, scalaUnita)}
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      Quadrati di questo lato
                      <input
                        type="number"
                        min={1}
                        max={MAPPA_QUADRATI_MAX}
                        disabled={latoBloccato != null}
                        value={quadratiCorrenti}
                        onChange={(e) =>
                          setQuadratiLato(Math.max(1, Math.round(Number(e.target.value) || 1)))
                        }
                        className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm disabled:bg-slate-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => avantiLato()}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Avanti
                    </button>
                    {forma.vertici.length >= 3 ? (
                      <button
                        type="button"
                        onClick={() => chiudiPoligono()}
                        className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-white"
                      >
                        Chiudi forma
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setForma(null)}
                      className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
                    >
                      Annulla forma
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingArea && canDraw ? (
        <div className="shrink-0 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2">
          <p className="text-sm font-semibold text-teal-950">Nuova area riponibile</p>
          <p className="text-xs text-teal-900">
            {formattaQuadrati(pendingArea.width / griglia)} ×{" "}
            {formattaQuadrati(pendingArea.height / griglia)} quadrati
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xs">
              Codice (es. A, A1, 1)
              <input
                value={areaCodice}
                onChange={(e) => setAreaCodice(e.target.value.toUpperCase())}
                className="ml-1 w-24 rounded border border-[var(--border)] px-2 py-1 text-sm uppercase"
              />
            </label>
            <label className="text-xs">
              Nome
              <input
                value={areaNome}
                onChange={(e) => setAreaNome(e.target.value)}
                className="ml-1 w-48 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Dentro (colonna / area madre)
              <select
                value={areaParentId}
                onChange={(e) => setAreaParentId(e.target.value)}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="">Nessuna (area principale)</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => salvaAreaPendente()}
              className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white"
            >
              Salva area
            </button>
            <button
              type="button"
              onClick={() => setPendingArea(null)}
              className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {selectedArea ? (
        <div className="shrink-0 rounded-xl border border-teal-400 bg-teal-50 px-3 py-2">
          <p className="text-sm font-semibold text-teal-950">
            Area {selectedArea.codice} — {selectedArea.nome}
          </p>
          <p className="mt-1 text-xs text-teal-900">
            Madre: {parentLabelOf(selectedArea.parentId)} ·{" "}
            {formattaQuadrati(selectedArea.width / Math.max(griglia, 1))} ×{" "}
            {formattaQuadrati(selectedArea.height / Math.max(griglia, 1))} quadrati ·{" "}
            {formattaLunghezzaReale(
              selectedArea.width / Math.max(griglia, 1),
              scalaValore,
              scalaUnita
            )}{" "}
            ×{" "}
            {formattaLunghezzaReale(
              selectedArea.height / Math.max(griglia, 1),
              scalaValore,
              scalaUnita
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canDraw ? (
              <>
                <button
                  type="button"
                  onClick={() => setAreaEditOpen((v) => !v)}
                  className="rounded-lg border border-teal-700 bg-white px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-100"
                >
                  {areaEditOpen ? "Chiudi modifica" : "Modifica"}
                </button>
                <button
                  type="button"
                  onClick={() => apriCopia(selectedArea.id)}
                  className="rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-100"
                >
                  Copia da quest&apos;area
                </button>
                <button
                  type="button"
                  onClick={() => eliminaAreaSelezionata()}
                  className="rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
                >
                  Elimina area
                </button>
              </>
            ) : (
              <p className="text-xs text-teal-900">
                Posto riponibile. I figli di altre viste compaiono come etichette
                all&apos;interno.
              </p>
            )}
          </div>
          {canDraw && areaEditOpen ? (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs">
                Codice
                <input
                  value={selectedArea.codice}
                  onChange={(e) =>
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id
                          ? { ...a, codice: e.target.value.toUpperCase() }
                          : a
                      )
                    )
                  }
                  className="ml-1 w-24 rounded border border-[var(--border)] px-2 py-1 text-sm uppercase"
                />
              </label>
              <label className="text-xs">
                Nome
                <input
                  value={selectedArea.nome}
                  onChange={(e) =>
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id ? { ...a, nome: e.target.value } : a
                      )
                    )
                  }
                  className="ml-1 w-48 rounded border border-[var(--border)] px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Dentro
                <select
                  value={selectedArea.parentId ?? ""}
                  onChange={(e) =>
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id
                          ? { ...a, parentId: e.target.value || null }
                          : a
                      )
                    )
                  }
                  className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
                >
                  <option value="">Nessuna</option>
                  {parentOptions
                    .filter((o) => o.id !== selectedArea.id && o.id !== selectedArea.ubicazioneId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs">
                Larghezza q
                <input
                  type="number"
                  min={1}
                  value={Math.max(1, Math.round(selectedArea.width / Math.max(griglia, 1)))}
                  onChange={(e) => {
                    const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id ? { ...a, width: q * griglia } : a
                      )
                    );
                  }}
                  className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Altezza q
                <input
                  type="number"
                  min={1}
                  value={Math.max(1, Math.round(selectedArea.height / Math.max(griglia, 1)))}
                  onChange={(e) => {
                    const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id ? { ...a, height: q * griglia } : a
                      )
                    );
                  }}
                  className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedRif ? (
        <div className="shrink-0 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-950">
            Guida da {selectedRif.mappaOrigineEtichetta}
          </p>
          <p className="text-xs text-amber-900">
            {etichettaAsseOrigine(selectedRif.asseOrigine)} copiata ·{" "}
            {formattaQuadrati(selectedRif.limiteWidthQ)} ×{" "}
            {formattaQuadrati(selectedRif.limiteHeightQ)} quadrati ·{" "}
            {selectedRif.punti.length} punti. Seleziona e trascina il rettangolo.
          </p>
          {canDraw ? (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs">
                Altezza (quadrati)
                <input
                  type="number"
                  min={1}
                  value={Math.max(1, Math.round(selectedRif.destHeight / griglia))}
                  onChange={(e) => {
                    const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                    setRiferimenti((prev) =>
                      prev.map((g) =>
                        g.id === selectedRif.id
                          ? {
                              ...g,
                              limiteHeightQ: q,
                              destHeight: q * griglia,
                            }
                          : g
                      )
                    );
                  }}
                  className="ml-1 w-20 rounded border border-amber-400 bg-white px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setRiferimenti((prev) => prev.filter((g) => g.id !== selectedRif.id));
                  setSelectedRifId(null);
                }}
                className="rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
              >
                Elimina importo
              </button>
            </div>
          ) : null}
          {selectedRif.punti.length ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-950">
              {selectedRif.punti.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  {canDraw ? (
                    <input
                      value={p.etichetta}
                      onChange={(e) =>
                        setRiferimenti((prev) =>
                          prev.map((g) =>
                            g.id === selectedRif.id
                              ? {
                                  ...g,
                                  punti: g.punti.map((x) =>
                                    x.id === p.id ? { ...x, etichetta: e.target.value } : x
                                  ),
                                }
                              : g
                          )
                        )
                      }
                      className="w-40 rounded border border-amber-300 bg-white px-1.5 py-0.5"
                    />
                  ) : (
                    <span>{p.etichetta}</span>
                  )}
                  <span>
                    {formattaQuadrati(p.offsetQuadrati)} q ·{" "}
                    {formattaLunghezzaReale(p.offsetQuadrati, scalaValore, scalaUnita)}
                  </span>
                  {canDraw ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRiferimenti((prev) =>
                          prev.map((g) =>
                            g.id === selectedRif.id
                              ? { ...g, punti: g.punti.filter((x) => x.id !== p.id) }
                              : g
                          )
                        )
                      }
                      className="text-rose-700 hover:underline"
                    >
                      togli
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {selectedLine ? (
        <div className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-950">Linea selezionata</p>
          <div className="mt-1 flex flex-wrap items-end gap-4">
            <p className="text-sm text-amber-950">
              <span className="font-medium">Lunghezza: </span>
              {formattaMisuraSegmento(
                selectedLine.x1,
                selectedLine.y1,
                selectedLine.x2,
                selectedLine.y2,
                griglia,
                scalaValore,
                scalaUnita
              ) || "—"}
            </p>
            <label className="text-xs font-medium text-amber-950">
              Spessore
              <input
                type="number"
                min={0.01}
                step="any"
                value={selectedLine.spessore}
                onChange={(e) => applySpessore(Number(e.target.value))}
                disabled={!canDraw}
                className="ml-1 w-24 rounded border border-amber-400 bg-white px-2 py-1 text-sm disabled:opacity-60"
              />
            </label>
            {canDraw ? (
              <button
                type="button"
                onClick={() => eliminaLineaSelezionata()}
                className="rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
              >
                Elimina linea
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}

      <div
        ref={canvasWrapRef}
        className="relative h-[70dvh] min-h-[28rem] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-slate-100"
      >
        <MagazzinoMappaRighelli
          foglio={foglio}
          pan={pan}
          zoom={zoom}
          griglia={griglia}
          scalaValore={scalaValore}
          scalaUnita={scalaUnita}
          cursore={disegnoCursor?.punto ?? snappedCursor}
        >
        <div ref={svgWrapRef} className="absolute inset-0">
        {vistaOk ? (
          <p className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm">
            Vista: {vistaEtichetta.trim()}
          </p>
        ) : editing ? (
          <p className="pointer-events-none absolute left-2 right-3 top-2 z-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Imposta prima il testo Vista (es. Dall’alto, Lato fronte, Lato Dx).
            Poi potrai tracciare le linee.
          </p>
        ) : null}
        {misuraTesto ? (
          <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm">
            {misuraTesto}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => fitToFoglio(foglio)}
          className="absolute bottom-3 right-3 z-10 rounded-lg border border-[var(--border)] bg-white/95 px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50"
        >
          Adatta al foglio
        </button>
        {disegnoCursor?.punto ?? snappedCursor ? (
          <>
            <div
              className="pointer-events-none absolute top-0 z-[5] h-full w-0 border-l-2 border-dashed border-rose-500/80"
              style={{
                left: (disegnoCursor?.punto ?? snappedCursor)!.x * zoom + pan.x,
              }}
            />
            <div
              className="pointer-events-none absolute left-0 z-[5] h-0 w-full border-t-2 border-dashed border-rose-500/80"
              style={{
                top: (disegnoCursor?.punto ?? snappedCursor)!.y * zoom + pan.y,
              }}
            />
          </>
        ) : null}
        <svg
          ref={svgRef}
          className={`h-full w-full touch-none bg-slate-200 ${
            canDraw ? "cursor-crosshair" : "cursor-default"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            setPanning(null);
            setDragArea(null);
            setDragRif(null);
          }}
          onPointerLeave={() => {
            setPanning(null);
            if (!forma && !draftStart && !dragArea) setCursor(null);
          }}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern
              id={gridPatternId}
              width={griglia}
              height={griglia}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${griglia} 0 L 0 0 0 ${griglia}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={0.6}
              />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <rect
              x={foglio.x}
              y={foglio.y}
              width={foglio.width}
              height={foglio.height}
              fill="#ffffff"
            />
            <rect
              x={foglio.x}
              y={foglio.y}
              width={foglio.width}
              height={foglio.height}
              fill={`url(#${gridPatternId})`}
              stroke="#334155"
              strokeWidth={Math.max(1, 2 / zoom)}
            />
            {aree.map((a) => {
              const kids = figliSenzaForma(a);
              const sel = a.id === selectedAreaId;
              return (
                <g key={a.id}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width={a.width}
                    height={a.height}
                    fill={sel ? "rgba(13,148,136,0.22)" : "rgba(13,148,136,0.10)"}
                    stroke={sel ? "#0f766e" : "#0d9488"}
                    strokeWidth={Math.max(1.2, 2 / zoom)}
                  />
                  <text
                    x={a.x + 6}
                    y={a.y + 16}
                    fill="#134e4a"
                    fontSize={Math.max(11, 12 / zoom)}
                    fontWeight={600}
                  >
                    {a.codice}
                  </text>
                  {kids.length ? (
                    <text
                      x={a.x + 6}
                      y={a.y + 32}
                      fill="#0f766e"
                      fontSize={Math.max(9, 10 / zoom)}
                    >
                      {kids.map((k) => k.codice).join(" · ")}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {riferimenti.map((g) => {
              const sel = g.id === selectedRifId;
              return (
                <g key={g.id}>
                  <rect
                    x={g.destX}
                    y={g.destY}
                    width={g.destWidth}
                    height={g.destHeight}
                    fill={sel ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.07)"}
                    stroke="#d97706"
                    strokeDasharray={`${8 / zoom} ${5 / zoom}`}
                    strokeWidth={Math.max(1.4, 2.4 / zoom)}
                  />
                  <text
                    x={g.destX + 6}
                    y={g.destY - 6}
                    fill="#92400e"
                    fontSize={Math.max(10, 11 / zoom)}
                    fontWeight={600}
                  >
                    Limite da {g.mappaOrigineEtichetta}
                  </text>
                  {g.punti.map((p) => {
                    const x = xGuidaDest(g, p.offsetQuadrati, griglia);
                    return (
                      <g key={p.id}>
                        <line
                          x1={x}
                          y1={g.destY}
                          x2={x}
                          y2={g.destY + g.destHeight}
                          stroke="#b45309"
                          strokeWidth={Math.max(1.2, 2 / zoom)}
                        />
                        <circle
                          cx={x}
                          cy={g.destY}
                          r={Math.max(3, 4 / zoom)}
                          fill="#b45309"
                        />
                        <text
                          x={x + 4}
                          y={g.destY + 14}
                          fill="#78350f"
                          fontSize={Math.max(9, 10 / zoom)}
                        >
                          {p.etichetta}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {pendingArea ? (
              <rect
                x={pendingArea.x}
                y={pendingArea.y}
                width={pendingArea.width}
                height={pendingArea.height}
                fill="rgba(245,158,11,0.16)"
                stroke="#d97706"
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                strokeWidth={Math.max(1.2, 2 / zoom)}
              />
            ) : null}
            {linee.map((l) => (
              <g key={l.id}>
                {l.id === selectedId ? (
                  <line
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="#f59e0b"
                    strokeWidth={l.spessore + Math.max(4, 8 / zoom)}
                    strokeLinecap="square"
                  />
                ) : null}
                <line
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={l.colore || MAPPA_LINEA_COLORE_DEFAULT}
                  strokeWidth={l.spessore}
                  strokeLinecap="square"
                />
                {puntiRiferimentoLinea(l).map((r) => (
                  <circle
                    key={`${l.id}-${r.t}`}
                    cx={r.punto.x}
                    cy={r.punto.y}
                    r={Math.max(2.2, (r.t === 0.5 ? 5 : 3.4) / zoom)}
                    fill={r.t === 0.5 ? "#be123c" : "#1d4ed8"}
                    stroke="#ffffff"
                    strokeWidth={Math.max(0.6, 1.2 / zoom)}
                  />
                ))}
              </g>
            ))}
            {previewForma && previewForma.ghost.length === 4 ? (
              <polygon
                points={previewForma.ghost
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="rgba(15,118,110,0.10)"
                stroke={colore}
                strokeWidth={spessore}
                strokeLinecap="square"
                strokeDasharray={
                  forma?.tipo === "rettangolo" && forma.fase === "senso"
                    ? `${10 / zoom} ${8 / zoom}`
                    : undefined
                }
              />
            ) : null}
            {forma?.tipo === "rettangolo" && forma.vertici[0] && forma.opposto ? (
              <>
                <line
                  x1={forma.vertici[0].x}
                  y1={forma.vertici[0].y}
                  x2={forma.opposto.x}
                  y2={forma.vertici[0].y}
                  stroke="#0f766e"
                  strokeWidth={Math.max(2, 4 / zoom)}
                  strokeLinecap="square"
                />
                <line
                  x1={forma.vertici[0].x}
                  y1={forma.vertici[0].y}
                  x2={forma.vertici[0].x}
                  y2={forma.opposto.y}
                  stroke="#0f766e"
                  strokeWidth={Math.max(2, 4 / zoom)}
                  strokeLinecap="square"
                />
              </>
            ) : null}
            {previewForma && previewForma.ghost.length !== 4 ? (
              <line
                x1={previewForma.from.x}
                y1={previewForma.from.y}
                x2={previewForma.to.x}
                y2={previewForma.to.y}
                stroke="#f59e0b"
                strokeWidth={spessore + Math.max(3, 6 / zoom)}
                strokeLinecap="square"
              />
            ) : null}
            {canDraw && !forma && draftStart && (disegnoCursor?.punto ?? snappedCursor) ? (
              <line
                x1={draftStart.x}
                y1={draftStart.y}
                x2={(disegnoCursor?.punto ?? snappedCursor)!.x}
                y2={(disegnoCursor?.punto ?? snappedCursor)!.y}
                stroke={colore}
                strokeWidth={spessore}
                strokeDasharray="8 6"
                strokeLinecap="square"
              />
            ) : null}
            {canDraw && (disegnoCursor?.punto ?? snappedCursor) ? (
              <circle
                cx={(disegnoCursor?.punto ?? snappedCursor)!.x}
                cy={(disegnoCursor?.punto ?? snappedCursor)!.y}
                r={Math.max(3, 6 / zoom)}
                fill={disegnoCursor?.acc ? "#e11d48" : colore}
              />
            ) : null}
            {accavallamentiVisibili.map(({ kind, acc }) => (
              <circle
                key={`${kind}-${acc.lineaId}`}
                cx={acc.hit.x}
                cy={acc.hit.y}
                r={Math.max(5, 9 / zoom)}
                fill="none"
                stroke="#e11d48"
                strokeWidth={Math.max(2, 3 / zoom)}
              />
            ))}
            {forma
              ? forma.vertici.map((p, i) => (
                  <circle
                    key={`${p.x}-${p.y}-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(3, 5 / zoom)}
                    fill="#0f766e"
                  />
                ))
              : null}
          </g>
        </svg>
        {accavallamentiVisibili.map(({ kind, acc }) => {
          const host = linee.find((l) => l.id === acc.lineaId);
          if (!host) return null;
          const midA = {
            x: (host.x1 + acc.hit.x) / 2,
            y: (host.y1 + acc.hit.y) / 2,
          };
          const midB = {
            x: (host.x2 + acc.hit.x) / 2,
            y: (host.y2 + acc.hit.y) / 2,
          };
          const labelA = `${formattaQuadrati(acc.qA)} q · ${formattaLunghezzaReale(acc.qA, scalaValore, scalaUnita)}`;
          const labelB = `${formattaQuadrati(acc.qB)} q · ${formattaLunghezzaReale(acc.qB, scalaValore, scalaUnita)}`;
          return (
            <div key={`acc-${kind}-${acc.lineaId}`}>
              {[
                { p: midA, text: labelA },
                { p: midB, text: labelB },
              ].map((item, i) => (
                <div
                  key={`${kind}-${i}`}
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-rose-600 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-950 shadow-md"
                  style={{
                    left: item.p.x * zoom + pan.x,
                    top: item.p.y * zoom + pan.y,
                  }}
                >
                  {item.text}
                </div>
              ))}
            </div>
          );
        })}
        </div>
        </MagazzinoMappaRighelli>
      </div>
      <ElencoAreeMappa
        aree={aree}
        selectedId={selectedAreaId}
        griglia={griglia}
        scalaValore={scalaValore}
        scalaUnita={scalaUnita}
        canEdit={canDraw}
        parentLabel={parentLabelOf}
        onSelect={(id) => selezionaArea(id)}
        onModifica={(id) => {
          if (canDraw) selezionaArea(id, true);
          else selezionaArea(id);
        }}
        onCopia={(id) => apriCopia(id)}
      />
      {editing ? (
        <CopiaAreaGuidata
          open={copiaOpen}
          aree={aree}
          parentOptions={parentOptions}
          sourceId={copiaSourceId}
          griglia={griglia}
          onClose={() => setCopiaOpen(false)}
          onCompleta={(r) => applicaCopiaArea(r)}
        />
      ) : null}
      {editing ? (
        <>
        <CollegaMappaPercorsoModal
          open={collegaOpen}
          busy={collegaBusy}
          error={collegaError}
          vistaEtichetta={vistaEtichetta.trim()}
          luogoBozza={luogoNome.trim() || mappa.luogoNome}
          onClose={() => {
            setCollegaOpen(false);
            setCollegaError(null);
          }}
          onConferma={(p) => void confermaCollega(p)}
        />
        <ImportaRiferimentiVista
          open={importOpen}
          destMappaId={mappa.id}
          luogoNome={luogoNome || mappa.luogoNome}
          destGriglia={griglia}
          destScalaValore={scalaValore}
          destScalaUnita={scalaUnita}
          onClose={() => setImportOpen(false)}
          onApplied={(next) => {
            setMappa(next);
            setLinee(next.linee);
            setAree(next.aree ?? []);
            setRiferimenti(next.riferimenti ?? []);
            setOk("Riferimenti importati. Trascina il quadrato limite e salva la bozza.");
          }}
        />
        </>
      ) : null}
    </div>
  );
}
