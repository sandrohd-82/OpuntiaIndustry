"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  collegaMappaAdAreaAction,
  collegaMappaAdAreaOperativaAction,
  getMappaByIdAction,
  getMappaMenuPercorsoAction,
  rinominaPercorsoMappaAction,
  riapriProgettazioneMappaAction,
  salvaMappaMagazzinoAction,
  salvaNomeAreaMappaAction,
  spostaMappaPercorsoAction,
} from "@/app/actions/magazzino-mappa";
import { ImportaRiferimentiVista } from "@/components/magazzino/ImportaRiferimentiVista";
import { CopiaAreaGuidata } from "@/components/magazzino/CopiaAreaGuidata";
import { ElencoAreeMappa } from "@/components/magazzino/ElencoAreeMappa";
import { ElencoImportiMappa } from "@/components/magazzino/ElencoImportiMappa";
import { MAGAZZINO_MAPPE_NAV_EVENT } from "@/lib/areas/magazzino";
import {
  MAPPA_MENU_NAV_EVENT,
  type MappaMenuPercorsoCaricato,
} from "@/lib/magazzino/menu-mappa";
import { CollegaAdAreaModal } from "@/components/magazzino/CollegaAdAreaModal";
import { CollegaMappaPercorsoModal } from "@/components/magazzino/CollegaMappaPercorsoModal";
import { MagazzinoMappaPalette } from "@/components/magazzino/MagazzinoMappaPalette";
import { MagazzinoMappaRighelli } from "@/components/magazzino/MagazzinoMappaRighelli";
import {
  accavallamentoPuntoSuLinee,
  aggiornaLineeRettangolo,
  boxDaCursoreLato,
  calcolaFoglioMappa,
  clampBoxNelFoglio,
  clampPuntoNelFoglio,
  distanzaPuntoSegmento,
  formattaLunghezzaReale,
  formattaMisuraSegmento,
  formattaQuadrati,
  handlePuntiRettangolo,
  headingCardinale,
  hitRettangoloLinee,
  LATO_RETTANGOLO_LABEL,
  quadratiTraPunti,
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
  rettangoloDaLinea,
  rettangoloHaArea,
  ridimensionaBoxDaLato,
  ruotaHeading,
  segniRettangolo,
  snapToGrid,
  verticiRettangoloDaAngoli,
  type AccavallamentoLinea,
  type FoglioMappa,
  type LatoRettangolo,
  type MappaBox,
  type MappaLinea,
  type MappaMagazzino,
  type MappaPunto,
  type MappaRettangoloAsse,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";
import {
  codiceLocaleDi,
  previewPosizioneOperativa,
  type MappaAreaDisegnata,
  type UbicazioneElenco,
} from "@/lib/magazzino/ubicazioni";
import {
  dettaglioAngoliImporto,
  dettaglioLatiImporto,
  estremiCalcoDest,
  hitGruppoRiferimento,
  lineeGuidaDaRiferimenti,
  puntiCalcoDest,
  segmentoGuidaDest,
  segmentiCalcoDest,
  snapPuntoSuCalco,
  type ImportaEsito,
  type MappaRiferimentoGruppo,
} from "@/lib/magazzino/riferimenti";

type Tool =
  | "linea"
  | "seleziona"
  | "trasforma"
  | "rettangolo"
  | "poligono"
  | "area";

type TrasformaEstremo = 1 | 2;

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

function fontTargaArea(width: number, height: number, testo: string): number {
  const lato = Math.min(width, height);
  const lettere = Math.max(1, testo.trim().length);
  const daLarghezza = (width * 0.78) / lettere;
  const daAltezza = lato * 0.48;
  return Math.max(10, Math.min(daLarghezza, daAltezza));
}

function newLocalId(): string {
  return crypto.randomUUID();
}

function areeConCodiceLocale(
  aree: MappaAreaDisegnata[],
  ubicazioni: UbicazioneElenco[]
): MappaAreaDisegnata[] {
  return aree.map((a) => {
    const parent =
      ubicazioni.find((u) => u.id === a.parentId) ??
      aree.find((x) => x.ubicazioneId === a.parentId || x.id === a.parentId);
    return {
      ...a,
      codice: codiceLocaleDi(a.codice, parent?.codice ?? ""),
    };
  });
}

function etichettaVersoHeading(heading: number): string {
  if (heading === 180) return "sinistra";
  if (heading === 90) return "basso";
  if (heading === 270) return "alto";
  return "destra";
}

function etichettaLatoLinea(
  fisso: MappaPunto,
  mobile: MappaPunto
): string {
  return etichettaVersoHeading(headingCardinale(fisso, mobile));
}

function proiettaEstremoSuAsse(
  fisso: MappaPunto,
  originaleMobile: MappaPunto,
  cursore: MappaPunto,
  griglia: number
): MappaPunto {
  const dx = originaleMobile.x - fisso.x;
  const dy = originaleMobile.y - fisso.y;
  const len = Math.hypot(dx, dy);
  const g = Math.max(1, griglia);
  if (len < 0.0001) {
    const heading = headingCardinale(fisso, cursore);
    const q = Math.max(
      1,
      Math.round(quadratiTraPunti(fisso.x, fisso.y, cursore.x, cursore.y, g))
    );
    return puntoDopoQuadrati(fisso, heading, q, g);
  }
  const ux = dx / len;
  const uy = dy / len;
  const t = (cursore.x - fisso.x) * ux + (cursore.y - fisso.y) * uy;
  const tSnap = snapToGrid(t, g);
  const tUse = Math.abs(tSnap) < g ? (tSnap >= 0 ? g : -g) : tSnap;
  return {
    x: snapToGrid(fisso.x + ux * tUse, g),
    y: snapToGrid(fisso.y + uy * tUse, g),
  };
}

function puntoALunghezzaQuadrati(
  fisso: MappaPunto,
  mobile: MappaPunto,
  quadrati: number,
  griglia: number
): MappaPunto {
  const q = Math.max(1, Math.min(MAPPA_QUADRATI_MAX, Math.round(quadrati)));
  const g = Math.max(1, griglia);
  const dx = mobile.x - fisso.x;
  const dy = mobile.y - fisso.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) {
    return puntoDopoQuadrati(fisso, 0, q, g);
  }
  const scale = (q * g) / len;
  return {
    x: snapToGrid(fisso.x + dx * scale, g),
    y: snapToGrid(fisso.y + dy * scale, g),
  };
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

type SpostaDir = "up" | "down" | "left" | "right";

function clampFreccePos(x: number, y: number) {
  const maxX = Math.max(8, window.innerWidth - 88);
  const maxY = Math.max(8, window.innerHeight - 88);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
}

let freccePadPosMem: { x: number; y: number } | null = null;

function MappaSpostaFreccePad({
  onNudge,
  onAnnulla,
  canAnnulla,
  passoEtichetta,
}: {
  onNudge: (dir: SpostaDir) => void;
  onAnnulla?: () => void;
  canAnnulla?: boolean;
  passoEtichetta?: string | null;
}) {
  const extra = passoEtichetta ? ` ${passoEtichetta}` : "";
  const [pos, setPos] = useState(
    () => freccePadPosMem ?? { x: 24, y: 160 }
  );
  const dragRef = useRef<{
    ox: number;
    oy: number;
    px: number;
    py: number;
  } | null>(null);

  function spostaPad(x: number, y: number) {
    const next = clampFreccePos(x, y);
    freccePadPosMem = next;
    setPos(next);
  }

  useEffect(() => {
    if (!freccePadPosMem) {
      freccePadPosMem = clampFreccePos(window.innerWidth - 268, 160);
    }
    setPos(clampFreccePos(freccePadPosMem.x, freccePadPosMem.y));
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      spostaPad(d.px + (e.clientX - d.ox), d.py + (e.clientY - d.oy));
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const btn =
    "min-w-[5.5rem] rounded-lg border border-indigo-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-950 shadow-sm hover:bg-indigo-50 active:bg-indigo-100";
  return (
    <div
      className="fixed z-[10050] w-[15.5rem] rounded-xl border border-indigo-400 bg-indigo-50/95 p-2 shadow-2xl backdrop-blur-sm"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Comandi sposta"
    >
      <div
        className="mb-1.5 flex cursor-grab select-none items-center justify-between gap-2 rounded-lg bg-indigo-700 px-2 py-1 text-white active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          dragRef.current = {
            ox: e.clientX,
            oy: e.clientY,
            px: pos.x,
            py: pos.y,
          };
        }}
      >
        <span className="text-[11px] font-semibold tracking-wide">
          ⋮⋮ Sposta · trascina
        </span>
        <span className="text-[10px] font-medium opacity-90">
          {passoEtichetta ? passoEtichetta : "1 q"}
        </span>
      </div>
      <div
        className="inline-grid w-full grid-cols-3 gap-1"
        role="group"
        aria-label="Sposta selezione"
      >
        <span />
        <button type="button" className={btn} onClick={() => onNudge("up")}>
          ▲ Sopra{extra}
        </button>
        <span />
        <button type="button" className={btn} onClick={() => onNudge("left")}>
          ◀ Sinistra{extra}
        </button>
        <span className="self-center text-center text-[10px] font-medium uppercase tracking-wide text-indigo-700">
          {passoEtichetta ? "Sposta di" : "Sposta"}
        </span>
        <button type="button" className={btn} onClick={() => onNudge("right")}>
          Destra{extra} ▶
        </button>
        <span />
        <button type="button" className={btn} onClick={() => onNudge("down")}>
          ▼ Sotto{extra}
        </button>
        <span />
      </div>
      {onAnnulla ? (
        <button
          type="button"
          disabled={!canAnnulla}
          onClick={() => onAnnulla()}
          className="mt-1.5 w-full rounded-lg border border-amber-500 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40"
        >
          Annulla
        </button>
      ) : null}
    </div>
  );
}

function codiceCopiaUnico(base: string, usati: Set<string>): string {
  const root = (base.trim().toUpperCase() || "COPIA").slice(0, 36);
  let n = 1;
  let candidate = `${root}-C`.slice(0, 40);
  while (usati.has(candidate)) {
    n += 1;
    const suffix = `-C${n}`;
    candidate = `${root.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
  }
  usati.add(candidate);
  return candidate;
}

function nomeCopiaOggetto(nome: string): string {
  const t = nome.trim();
  if (!t) return "Copia";
  if (/\(copia\)$/i.test(t)) return t.slice(0, 120);
  return `${t} (copia)`.slice(0, 120);
}

function deltaVincolato(
  origine: MappaPunto,
  cursore: MappaPunto,
  raggio: number
): { dx: number; dy: number } {
  const vx = cursore.x - origine.x;
  const vy = cursore.y - origine.y;
  const len = Math.hypot(vx, vy);
  if (len < 3) return { dx: 0, dy: 0 };
  return { dx: (vx / len) * raggio, dy: (vy / len) * raggio };
}

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
  const [areaOpen, setAreaOpen] = useState(false);
  const [collegaOpen, setCollegaOpen] = useState(false);
  const [collegaBusy, setCollegaBusy] = useState(false);
  const [collegaError, setCollegaError] = useState<string | null>(null);
  const [collegaVariant, setCollegaVariant] = useState<"collega" | "modifica">(
    "collega"
  );
  const [percorsoIniziale, setPercorsoIniziale] =
    useState<MappaMenuPercorsoCaricato | null>(null);
  const [selectedRifIds, setSelectedRifIds] = useState<string[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const selectedRifId = selectedRifIds.at(-1) ?? null;
  const selectedAreaId = selectedAreaIds.at(-1) ?? null;
  const selectedId = selectedLineIds.at(-1) ?? null;
  const [carry, setCarry] = useState<{
    sx: number;
    sy: number;
    vincoloPx: number | null;
    linee: { id: string; x1: number; y1: number; x2: number; y2: number }[];
    aree: { id: string; x: number; y: number; width: number; height: number }[];
    rif: { id: string; destX: number; destY: number }[];
  } | null>(null);
  const [spostaDiDraft, setSpostaDiDraft] = useState("");
  const [spostaDiPx, setSpostaDiPx] = useState<number | null>(null);
  const carryRef = useRef<typeof carry>(null);
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
  const [trasformaEnd, setTrasformaEnd] = useState<TrasformaEstremo | null>(
    null
  );
  const [dragTrasforma, setDragTrasforma] = useState<{
    id: string;
    end: TrasformaEstremo;
    fx: number;
    fy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const [trasformaRett, setTrasformaRett] = useState<
    | ({ kind: "linee" } & MappaRettangoloAsse)
    | ({ kind: "area"; areaId: string } & MappaBox)
    | null
  >(null);
  const [trasformaLatoRett, setTrasformaLatoRett] =
    useState<LatoRettangolo | null>(null);
  const [dragTrasformaRett, setDragTrasformaRett] = useState<{
    lato: LatoRettangolo;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [lunghezzaDraft, setLunghezzaDraft] = useState("");
  const [lunghezzaRealeDraft, setLunghezzaRealeDraft] = useState("");
  const [larghezzaDraft, setLarghezzaDraft] = useState("");
  const [altezzaDraft, setAltezzaDraft] = useState("");
  const [larghezzaRealeDraft, setLarghezzaRealeDraft] = useState("");
  const [altezzaRealeDraft, setAltezzaRealeDraft] = useState("");
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

  type MappaSnapshot = {
    linee: MappaLinea[];
    aree: MappaAreaDisegnata[];
    riferimenti: MappaRiferimentoGruppo[];
    pendingArea: { x: number; y: number; width: number; height: number } | null;
    selectedLineIds: string[];
    selectedAreaIds: string[];
    selectedRifIds: string[];
  };

  const disegnoRef = useRef({
    linee,
    aree,
    riferimenti,
    pendingArea,
    selectedLineIds,
    selectedAreaIds,
    selectedRifIds,
  });
  disegnoRef.current = {
    linee,
    aree,
    riferimenti,
    pendingArea,
    selectedLineIds,
    selectedAreaIds,
    selectedRifIds,
  };
  const historyRef = useRef<MappaSnapshot[]>([]);
  const historyKindRef = useRef<string | null>(null);
  const [historyLen, setHistoryLen] = useState(0);

  function cloneDisegno<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function takeSnapshot(): MappaSnapshot {
    const d = disegnoRef.current;
    return {
      linee: cloneDisegno(d.linee),
      aree: cloneDisegno(d.aree),
      riferimenti: cloneDisegno(d.riferimenti),
      pendingArea: d.pendingArea ? { ...d.pendingArea } : null,
      selectedLineIds: [...d.selectedLineIds],
      selectedAreaIds: [...d.selectedAreaIds],
      selectedRifIds: [...d.selectedRifIds],
    };
  }

  function clearHistory() {
    historyRef.current = [];
    historyKindRef.current = null;
    setHistoryLen(0);
  }

  function pushHistory(kind = "edit") {
    if (!canDraw) return;
    const coalesce =
      kind === historyKindRef.current &&
      (kind === "area-edit" || kind === "spessore" || kind === "colore");
    if (coalesce) return;
    historyRef.current = [...historyRef.current, takeSnapshot()].slice(-80);
    historyKindRef.current = kind;
    setHistoryLen(historyRef.current.length);
  }

  function applicaSnapshot(snap: MappaSnapshot) {
    setLinee(snap.linee);
    setAree(snap.aree);
    setRiferimenti(snap.riferimenti);
    setPendingArea(snap.pendingArea);
    setSelectedLineIds(snap.selectedLineIds);
    setSelectedAreaIds(snap.selectedAreaIds);
    setSelectedRifIds(snap.selectedRifIds);
    setCarry(null);
    carryRef.current = null;
    setDragArea(null);
    setDragTrasforma(null);
    setDragTrasformaRett(null);
    setTrasformaRett(null);
    setTrasformaLatoRett(null);
    setDraftStart(null);
    setForma(null);
  }

  function annullaUltimaModifica() {
    if (!canDraw || historyRef.current.length === 0) return;
    const snap = historyRef.current[historyRef.current.length - 1];
    if (!snap) return;
    historyRef.current = historyRef.current.slice(0, -1);
    historyKindRef.current = null;
    setHistoryLen(historyRef.current.length);
    applicaSnapshot(snap);
    setError(null);
    setOk("Modifica annullata.");
  }

  function scegliSoloLinea(id: string | null) {
    setSelectedLineIds(id ? [id] : []);
  }
  function scegliSoloArea(id: string | null) {
    setSelectedAreaIds(id ? [id] : []);
  }
  function scegliSoloRif(id: string | null) {
    setSelectedRifIds(id ? [id] : []);
  }
  function svuotaSelezione() {
    setSelectedLineIds([]);
    setSelectedAreaIds([]);
    setSelectedRifIds([]);
    setAreaEditOpen(false);
    setCarry(null);
    resetTrasformaRett();
  }

  function resetTrasformaRett() {
    setTrasformaRett(null);
    setTrasformaLatoRett(null);
    setDragTrasformaRett(null);
  }

  function epsRettangolo(): number {
    return Math.max(1, griglia * 0.35);
  }

  function syncMisureRett(box: MappaBox) {
    const wq = Math.max(1, Math.round(box.width / Math.max(1, griglia)));
    const hq = Math.max(1, Math.round(box.height / Math.max(1, griglia)));
    setLarghezzaDraft(String(wq));
    setAltezzaDraft(String(hq));
    setLarghezzaRealeDraft(String(Math.round(wq * scalaValore * 100) / 100));
    setAltezzaRealeDraft(String(Math.round(hq * scalaValore * 100) / 100));
  }

  function avviaTrasformaRettLinee(rect: MappaRettangoloAsse) {
    setTrasformaRett({ kind: "linee", ...rect });
    setTrasformaLatoRett(null);
    setDragTrasformaRett(null);
    setTrasformaEnd(null);
    setDragTrasforma(null);
    setSelectedLineIds(rect.lineIds);
    scegliSoloArea(null);
    scegliSoloRif(null);
    syncMisureRett(rect);
  }

  function avviaTrasformaRettArea(area: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const box = {
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    };
    setTrasformaRett({ kind: "area", areaId: area.id, ...box });
    setTrasformaLatoRett(null);
    setDragTrasformaRett(null);
    setTrasformaEnd(null);
    setDragTrasforma(null);
    scegliSoloLinea(null);
    scegliSoloArea(area.id);
    scegliSoloRif(null);
    syncMisureRett(box);
  }

  function applicaBoxRettangolo(box: MappaBox) {
    if (!trasformaRett) return;
    const clamped = clampBoxNelFoglio(box, foglio, griglia);
    if (trasformaRett.kind === "linee") {
      setLinee((prev) => aggiornaLineeRettangolo(prev, trasformaRett, clamped));
      setTrasformaRett({ ...trasformaRett, ...clamped });
    } else {
      setAree((prev) =>
        prev.map((a) =>
          a.id === trasformaRett.areaId
            ? { ...a, x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height }
            : a
        )
      );
      setTrasformaRett({ ...trasformaRett, ...clamped });
    }
    syncMisureRett(clamped);
  }

  function hitLatoRettangolo(
    box: MappaBox,
    wx: number,
    wy: number
  ): LatoRettangolo | null {
    const tol = Math.max(tolleranzaLinea(), 14 / zoom);
    let best: { lato: LatoRettangolo; d: number } | null = null;
    for (const h of handlePuntiRettangolo(box)) {
      const d = Math.hypot(wx - h.x, wy - h.y);
      if (d <= tol && (!best || d < best.d)) best = { lato: h.lato, d };
    }
    if (best) return best.lato;
    const lati: { lato: LatoRettangolo; x1: number; y1: number; x2: number; y2: number }[] =
      [
        { lato: "up", x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y },
        {
          lato: "down",
          x1: box.x,
          y1: box.y + box.height,
          x2: box.x + box.width,
          y2: box.y + box.height,
        },
        { lato: "left", x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.height },
        {
          lato: "right",
          x1: box.x + box.width,
          y1: box.y,
          x2: box.x + box.width,
          y2: box.y + box.height,
        },
      ];
    for (const lato of lati) {
      const d = distanzaPuntoSegmento(wx, wy, lato.x1, lato.y1, lato.x2, lato.y2);
      if (d <= tol && (!best || d < best.d)) best = { lato: lato.lato, d };
    }
    return best?.lato ?? null;
  }

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
    setAree(
      areeConCodiceLocale(res.mappa.aree ?? [], res.mappa.ubicazioni ?? [])
    );
    setRiferimenti(res.mappa.riferimenti ?? []);
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
    setGriglia(res.mappa.grigliaPx);
    clearHistory();
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
    return hitGruppoRiferimento(wx, wy, riferimenti, tolleranzaLinea());
  }

  function hitEstremoLinea(
    line: MappaLinea,
    wx: number,
    wy: number
  ): TrasformaEstremo | null {
    const tol = Math.max(tolleranzaLinea(), 14 / zoom);
    const d1 = Math.hypot(wx - line.x1, wy - line.y1);
    const d2 = Math.hypot(wx - line.x2, wy - line.y2);
    if (d1 <= tol && d1 <= d2) return 1;
    if (d2 <= tol) return 2;
    return null;
  }

  function syncLunghezzaDraft(line: MappaLinea) {
    const q = Math.max(
      1,
      Math.round(quadratiTraPunti(line.x1, line.y1, line.x2, line.y2, griglia))
    );
    setLunghezzaDraft(String(q));
    const reale = Math.round(q * scalaValore * 100) / 100;
    setLunghezzaRealeDraft(String(reale));
  }

  function applicaEstremoLinea(
    lineId: string,
    end: TrasformaEstremo,
    next: MappaPunto
  ) {
    const clamped = clampPuntoNelFoglio(next, foglio, griglia);
    setLinee((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const fisso =
          end === 1 ? { x: l.x2, y: l.y2 } : { x: l.x1, y: l.y1 };
        if (
          Math.abs(clamped.x - fisso.x) < 0.0001 &&
          Math.abs(clamped.y - fisso.y) < 0.0001
        ) {
          return l;
        }
        return end === 1
          ? { ...l, x1: clamped.x, y1: clamped.y }
          : { ...l, x2: clamped.x, y2: clamped.y };
      })
    );
  }

  type HitOggetto = { kind: "linea" | "area" | "rif"; id: string };

  function hitOggetto(wx: number, wy: number): HitOggetto | null {
    const rid = hitRif(wx, wy);
    if (rid) return { kind: "rif", id: rid };
    const aid = hitArea(wx, wy);
    if (aid) return { kind: "area", id: aid };
    const lid = hitLine(wx, wy);
    if (lid) return { kind: "linea", id: lid };
    return null;
  }

  function oggettoGiaSelezionato(hit: HitOggetto): boolean {
    if (hit.kind === "linea") return selectedLineIds.includes(hit.id);
    if (hit.kind === "area") return selectedAreaIds.includes(hit.id);
    return selectedRifIds.includes(hit.id);
  }

  function aggiungiAllaSelezione(hit: HitOggetto) {
    if (hit.kind === "linea") {
      setSelectedLineIds((prev) =>
        prev.includes(hit.id) ? prev : [...prev, hit.id]
      );
      const sel = linee.find((l) => l.id === hit.id);
      if (sel) {
        setSpessore(sel.spessore);
        setColore(sel.colore);
      }
      return;
    }
    if (hit.kind === "area") {
      setSelectedAreaIds((prev) =>
        prev.includes(hit.id) ? prev : [...prev, hit.id]
      );
      setAreaEditOpen(false);
      return;
    }
    setSelectedRifIds((prev) =>
      prev.includes(hit.id) ? prev : [...prev, hit.id]
    );
  }

  function avviaCarry(w: MappaPunto, vincoloPx: number | null = null) {
    pushHistory("sposta");
    const next = {
      sx: w.x,
      sy: w.y,
      vincoloPx: vincoloPx && vincoloPx > 0 ? vincoloPx : null,
      linee: linee
        .filter((l) => selectedLineIds.includes(l.id))
        .map((l) => ({
          id: l.id,
          x1: l.x1,
          y1: l.y1,
          x2: l.x2,
          y2: l.y2,
        })),
      aree: aree
        .filter((a) => selectedAreaIds.includes(a.id))
        .map((a) => ({
          id: a.id,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
        })),
      rif: riferimenti
        .filter((g) => selectedRifIds.includes(g.id))
        .map((g) => ({ id: g.id, destX: g.destX, destY: g.destY })),
    };
    carryRef.current = next;
    setCarry(next);
  }

  function boundsDiCarry(c: NonNullable<typeof carry>): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const l of c.linee) {
      found = true;
      minX = Math.min(minX, l.x1, l.x2);
      minY = Math.min(minY, l.y1, l.y2);
      maxX = Math.max(maxX, l.x1, l.x2);
      maxY = Math.max(maxY, l.y1, l.y2);
    }
    for (const a of c.aree) {
      found = true;
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.width);
      maxY = Math.max(maxY, a.y + a.height);
    }
    for (const g of c.rif) {
      found = true;
      const full = riferimenti.find((x) => x.id === g.id);
      const w = full?.destWidth ?? 0;
      const h = full?.destHeight ?? 0;
      minX = Math.min(minX, g.destX);
      minY = Math.min(minY, g.destY);
      maxX = Math.max(maxX, g.destX + w);
      maxY = Math.max(maxY, g.destY + h);
    }
    return found ? { minX, minY, maxX, maxY } : null;
  }

  function applicaCarryPunto(w: MappaPunto) {
    const c = carryRef.current;
    if (!c) return;
    const vincolato =
      c.vincoloPx && c.vincoloPx > 0
        ? deltaVincolato({ x: c.sx, y: c.sy }, w, c.vincoloPx)
        : null;
    const rawDx = vincolato
      ? vincolato.dx
      : snapToGrid(w.x - c.sx, griglia);
    const rawDy = vincolato
      ? vincolato.dy
      : snapToGrid(w.y - c.sy, griglia);
    const box = boundsDiCarry(c);
    const safe = box
      ? clampDeltaNelFoglio(box.minX, box.minY, box.maxX, box.maxY, rawDx, rawDy)
      : { dx: rawDx, dy: rawDy };
    if (c.linee.length) {
      setLinee((prev) =>
        prev.map((l) => {
          const s = c.linee.find((x) => x.id === l.id);
          return s
            ? {
                ...l,
                x1: s.x1 + safe.dx,
                y1: s.y1 + safe.dy,
                x2: s.x2 + safe.dx,
                y2: s.y2 + safe.dy,
              }
            : l;
        })
      );
    }
    if (c.aree.length) {
      setAree((prev) =>
        prev.map((a) => {
          const s = c.aree.find((x) => x.id === a.id);
          return s ? { ...a, x: s.x + safe.dx, y: s.y + safe.dy } : a;
        })
      );
    }
    if (c.rif.length) {
      setRiferimenti((prev) =>
        prev.map((g) => {
          const s = c.rif.find((x) => x.id === g.id);
          return s
            ? { ...g, destX: s.destX + safe.dx, destY: s.destY + safe.dy }
            : g;
        })
      );
    }
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
    const guida = accavallamentoPuntoSuLinee(
      w,
      lineeGuidaDaRiferimenti(riferimenti, griglia),
      griglia,
      tolleranzaLinea(),
      null
    );
    if (guida) return { punto: guida.hit, acc: null };
    const calco = snapPuntoSuCalco(w, riferimenti, tolleranzaLinea());
    if (calco) return { punto: calco, acc: null };
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
    pushHistory("disegno");
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
    scegliSoloLinea(linea.id);
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
      p.push(...estremiCalcoDest(g));
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

  useEffect(() => {
    carryRef.current = carry;
  }, [carry]);

  useEffect(() => {
    if (!carry) return;
    function onMove(e: PointerEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const w = {
        x: (e.clientX - r.left - pan.x) / zoom,
        y: (e.clientY - r.top - pan.y) / zoom,
      };
      setCursor(w);
      applicaCarryPunto(w);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [carry, pan.x, pan.y, zoom, griglia, foglio]);

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
        scegliSoloRif(rid);
        scegliSoloArea(null);
        setAreaEditOpen(false);
        scegliSoloLinea(null);
        return;
      }
      const aid = hitArea(w.x, w.y);
      if (aid) {
        selezionaArea(aid);
        return;
      }
      scegliSoloArea(null);
      scegliSoloRif(null);
      scegliSoloLinea(hitLine(w.x, w.y));
      return;
    }
    if (!forma && !pendingArea && tool === "seleziona") {
      if (carry) {
        setCarry(null);
        carryRef.current = null;
        return;
      }
      const hit = hitOggetto(w.x, w.y);
      if (!hit) {
        svuotaSelezione();
        setDraftStart(null);
        return;
      }
      if (oggettoGiaSelezionato(hit)) {
        avviaCarry(w, spostaDiPx);
        setDraftStart(null);
        return;
      }
      aggiungiAllaSelezione(hit);
      setDraftStart(null);
      return;
    }
    if (!forma && !pendingArea && tool === "trasforma") {
      if (trasformaRett) {
        const latoHit = hitLatoRettangolo(trasformaRett, w.x, w.y);
        if (latoHit) {
          setTrasformaLatoRett(latoHit);
          pushHistory("trasforma");
          setDragTrasformaRett({
            lato: latoHit,
            x: trasformaRett.x,
            y: trasformaRett.y,
            width: trasformaRett.width,
            height: trasformaRett.height,
          });
          setDraftStart(null);
          return;
        }
      }
      const current =
        selectedId && selectedLineIds.length === 1 && !trasformaRett
          ? linee.find((l) => l.id === selectedId) ?? null
          : null;
      if (current) {
        const estremo = hitEstremoLinea(current, w.x, w.y);
        if (estremo) {
          const fisso =
            estremo === 1
              ? { x: current.x2, y: current.y2 }
              : { x: current.x1, y: current.y1 };
          const orig =
            estremo === 1
              ? { x: current.x1, y: current.y1 }
              : { x: current.x2, y: current.y2 };
          setTrasformaEnd(estremo);
          pushHistory("trasforma");
          setDragTrasforma({
            id: current.id,
            end: estremo,
            fx: fisso.x,
            fy: fisso.y,
            ox: orig.x,
            oy: orig.y,
          });
          syncLunghezzaDraft(current);
          setDraftStart(null);
          return;
        }
      }
      const id = hitLine(w.x, w.y);
      if (id) {
        const rect = rettangoloDaLinea(linee, id, epsRettangolo());
        if (rect) {
          avviaTrasformaRettLinee(rect);
          const line = linee.find((l) => l.id === id);
          if (line) {
            setSpessore(line.spessore);
            setColore(line.colore);
          }
          setDraftStart(null);
          return;
        }
        const line = linee.find((l) => l.id === id);
        scegliSoloLinea(id);
        scegliSoloArea(null);
        scegliSoloRif(null);
        resetTrasformaRett();
        setTrasformaEnd(null);
        setDragTrasforma(null);
        if (line) {
          setSpessore(line.spessore);
          setColore(line.colore);
          syncLunghezzaDraft(line);
        }
        setDraftStart(null);
        return;
      }
      const aid = hitArea(w.x, w.y);
      if (aid) {
        const area = aree.find((a) => a.id === aid);
        if (area) {
          avviaTrasformaRettArea(area);
          setDraftStart(null);
          return;
        }
      }
      const rectIn = hitRettangoloLinee(
        w.x,
        w.y,
        linee,
        epsRettangolo(),
        tolleranzaLinea()
      );
      if (rectIn) {
        avviaTrasformaRettLinee(rectIn);
        setDraftStart(null);
        return;
      }
      scegliSoloLinea(null);
      scegliSoloArea(null);
      resetTrasformaRett();
      setTrasformaEnd(null);
      setDragTrasforma(null);
      setDraftStart(null);
      return;
    }
    if (!forma && !pendingArea) {
      const aid = hitArea(w.x, w.y);
      if (aid && tool === "area") {
        const a = aree.find((x) => x.id === aid);
        scegliSoloArea(aid);
        setAreaEditOpen(false);
        scegliSoloLinea(null);
        scegliSoloRif(null);
        if (a) {
          pushHistory("sposta");
          setDragArea({ id: aid, sx: w.x, sy: w.y, ax: a.x, ay: a.y });
        }
        return;
      }
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
        scegliSoloLinea(null);
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
      scegliSoloLinea(null);
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
    if (carry && w && canDraw) {
      applicaCarryPunto(w);
      return;
    }
    if (dragTrasformaRett && w && canDraw) {
      applicaBoxRettangolo(
        boxDaCursoreLato(dragTrasformaRett, dragTrasformaRett.lato, w, griglia)
      );
      return;
    }
    if (dragTrasforma && w && canDraw) {
      const next = proiettaEstremoSuAsse(
        { x: dragTrasforma.fx, y: dragTrasforma.fy },
        { x: dragTrasforma.ox, y: dragTrasforma.oy },
        w,
        griglia
      );
      applicaEstremoLinea(dragTrasforma.id, dragTrasforma.end, next);
      const q = Math.max(
        1,
        Math.round(
          quadratiTraPunti(
            dragTrasforma.fx,
            dragTrasforma.fy,
            next.x,
            next.y,
            griglia
          )
        )
      );
      setLunghezzaDraft(String(q));
      setLunghezzaRealeDraft(String(Math.round(q * scalaValore * 100) / 100));
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
    scegliSoloLinea(null);
    setPendingArea(null);
    setDragArea(null);
    setCarry(null);
    carryRef.current = null;
    setTrasformaEnd(null);
    setDragTrasforma(null);
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
      if (
        canDraw &&
        (ev.key === "z" || ev.key === "Z") &&
        (ev.ctrlKey || ev.metaKey) &&
        !ev.altKey &&
        !ev.shiftKey
      ) {
        ev.preventDefault();
        annullaUltimaModifica();
        return;
      }
      if (ev.key === "Escape") {
        if (carry) {
          ev.preventDefault();
          annullaUltimaModifica();
          return;
        }
        resetDisegno();
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        eliminaLineaSelezionata();
        eliminaAreaSelezionata();
      }
      if (
        canDraw &&
        (ev.key === "c" || ev.key === "C" || ev.key === "d" || ev.key === "D") &&
        (ev.ctrlKey || ev.metaKey) &&
        !ev.altKey &&
        !ev.shiftKey
      ) {
        ev.preventDefault();
        copiaSelezione();
        return;
      }
      if (canDraw && selezioneCount > 0 && !carry) {
        if (ev.key === "ArrowUp") {
          ev.preventDefault();
          nudgeSelected("up");
        } else if (ev.key === "ArrowDown") {
          ev.preventDefault();
          nudgeSelected("down");
        } else if (ev.key === "ArrowLeft") {
          ev.preventDefault();
          nudgeSelected("left");
        } else if (ev.key === "ArrowRight") {
          ev.preventDefault();
          nudgeSelected("right");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function confermaRettangolo(a: MappaPunto, b: MappaPunto) {
    if (!canDraw || !rettangoloHaArea(a, b, griglia)) return;
    pushHistory("disegno");
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
    scegliSoloLinea(nuovi[0]?.id ?? null);
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
    if (!canDraw || selectedLineIds.length === 0 || forma) return;
    pushHistory("elimina");
    const ids = new Set(selectedLineIds);
    setLinee((prev) => prev.filter((l) => !ids.has(l.id)));
    setSelectedLineIds([]);
    setCarry(null);
    carryRef.current = null;
  }

  function eliminaAreaSelezionata() {
    if (!canDraw || selectedAreaIds.length === 0 || forma || pendingArea) return;
    pushHistory("elimina");
    const ids = new Set(selectedAreaIds);
    setAree((prev) => prev.filter((a) => !ids.has(a.id)));
    setSelectedAreaIds([]);
    setAreaEditOpen(false);
    setCarry(null);
    carryRef.current = null;
  }

  function salvaAreaPendente() {
    if (!pendingArea || !canDraw) return;
    const codice = areaCodice.trim();
    const nome = areaNome.trim();
    if (!codice || !nome) {
      setError("Codice e nome dell'area sono obbligatori.");
      return;
    }
    pushHistory("disegno");
    const nuova: MappaAreaDisegnata = {
      id: newLocalId(),
      ubicazioneId: "",
      codice,
      nome,
      parentId: areaParentId || null,
      x: pendingArea.x,
      y: pendingArea.y,
      width: pendingArea.width,
      height: pendingArea.height,
    };
    setAree((prev) => [...prev, nuova]);
    scegliSoloArea(nuova.id);
    setPendingArea(null);
    setError(null);
    setOk("Area creata. Salva la bozza per registrarla nel gestionale.");
  }

  const selectedArea = selectedAreaId
    ? aree.find((a) => a.id === selectedAreaId) ?? null
    : null;

  const parentOptions = useMemo(() => {
    const collegate: { id: string; label: string; codice: string }[] = [];
    const seen = new Set<string>();
    const currentMapId = mappa?.id ?? "";
    const luogo = (luogoNome || mappa?.luogoNome || "").trim().toLowerCase();
    for (const u of mappa?.ubicazioni ?? []) {
      if (!u.id || seen.has(u.id)) continue;
      if (u.mappaOrigineId && u.mappaOrigineId === currentMapId) continue;
      const ul = (u.luogoNome || "").trim().toLowerCase();
      if (luogo && ul && ul !== luogo) continue;
      seen.add(u.id);
      const vista = (u.vistaOrigine || "").trim();
      collegate.push({
        id: u.id,
        codice: u.codice,
        label: `${u.nome} — ${u.codice}${vista ? ` · ${vista}` : ""}`,
      });
    }
    return { collegate };
  }, [luogoNome, mappa?.id, mappa?.luogoNome, mappa?.ubicazioni]);

  function parentRecord(parentId: string | null) {
    if (!parentId) return null;
    return (
      (mappa?.ubicazioni ?? []).find((x) => x.id === parentId) ??
      aree.find((x) => x.ubicazioneId === parentId || x.id === parentId) ??
      null
    );
  }

  function posizioneDi(a: MappaAreaDisegnata): string {
    const parent = parentRecord(a.parentId);
    const pc = parent && "codice" in parent ? parent.codice : "";
    return previewPosizioneOperativa(pc, a.codice);
  }

  const posizionePreview = useMemo(() => {
    if (!areaCodice.trim()) return "";
    const parent =
      aree.find((a) => a.id === areaParentId || a.ubicazioneId === areaParentId) ??
      (mappa?.ubicazioni ?? []).find((u) => u.id === areaParentId);
    const parentCodice = parent && "codice" in parent ? parent.codice : "";
    return previewPosizioneOperativa(parentCodice, areaCodice);
  }, [areaCodice, areaParentId, aree, mappa?.ubicazioni]);

  function parentLabelOf(parentId: string | null): string {
    if (!parentId) return "—";
    const u = (mappa?.ubicazioni ?? []).find((x) => x.id === parentId);
    if (u) {
      const vista = (u.vistaOrigine || "").trim();
      return `${u.nome} — ${u.codice}${vista ? ` · ${vista}` : ""}`;
    }
    const a = aree.find((x) => x.id === parentId || x.ubicazioneId === parentId);
    if (a) return `${a.nome} — ${a.codice} (questa vista)`;
    return "—";
  }

  function selezionaArea(id: string | null, edit = false) {
    scegliSoloArea(id);
    scegliSoloLinea(null);
    scegliSoloRif(null);
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

  function selezionaImporto(id: string | null) {
    scegliSoloRif(id);
    scegliSoloArea(null);
    setAreaEditOpen(false);
    scegliSoloLinea(null);
    if (!id) return;
    const g = riferimenti.find((x) => x.id === id);
    const box = svgWrapRef.current?.getBoundingClientRect();
    if (!g || !box || box.width < 40 || box.height < 40) return;
    const cx = g.destX + g.destWidth / 2;
    const cy = g.destY + g.destHeight / 2;
    setPan({
      x: box.width / 2 - cx * zoom,
      y: box.height / 2 - cy * zoom,
    });
  }

  function cambiaDestImporto(
    id: string,
    patch: { xQ?: number; yQ?: number; wQ?: number; hQ?: number }
  ) {
    pushHistory("sposta");
    const cell = Math.max(griglia, 1);
    setRiferimenti((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const xQ = patch.xQ ?? g.destX / cell;
        const yQ = patch.yQ ?? g.destY / cell;
        const wQ = Math.max(1, patch.wQ ?? g.destWidth / cell);
        const hQ = Math.max(1, patch.hQ ?? g.destHeight / cell);
        return {
          ...g,
          destX: xQ * cell,
          destY: yQ * cell,
          destWidth: wQ * cell,
          destHeight: hQ * cell,
          limiteWidthQ: wQ,
          limiteHeightQ: hQ,
        };
      })
    );
  }

  function applicaCopiaArea(r: {
    codice: string;
    nome: string;
    parentId: string | null;
    width: number;
    height: number;
    source: MappaAreaDisegnata;
  }) {
    pushHistory("copia");
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
    scegliSoloArea(nuova.id);
    setAreaEditOpen(false);
    scegliSoloLinea(null);
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
    if (selectedLineIds.length && canDraw) {
      pushHistory("spessore");
      const ids = new Set(selectedLineIds);
      setLinee((prev) =>
        prev.map((l) => (ids.has(l.id) ? { ...l, spessore: next } : l))
      );
    }
  }

  const selectedLine = selectedId
    ? linee.find((l) => l.id === selectedId) ?? null
    : null;
  const selectedRif = selectedRifId
    ? riferimenti.find((g) => g.id === selectedRifId) ?? null
    : null;

  useEffect(() => {
    if (tool !== "trasforma" || !selectedId) return;
    const line = linee.find((l) => l.id === selectedId);
    if (line && selectedLineIds.length === 1) syncLunghezzaDraft(line);
    // Solo al cambio linea/strumento, non durante il trascinamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId]);

  function puntiTrasforma(line: MappaLinea, end: TrasformaEstremo) {
    return end === 1
      ? {
          fisso: { x: line.x2, y: line.y2 },
          mobile: { x: line.x1, y: line.y1 },
        }
      : {
          fisso: { x: line.x1, y: line.y1 },
          mobile: { x: line.x2, y: line.y2 },
        };
  }

  function scegliLatoTrasforma(end: TrasformaEstremo) {
    if (!selectedLine) return;
    setTrasformaEnd(end);
    syncLunghezzaDraft(selectedLine);
  }

  function applicaLunghezzaTrasforma(quadrati: number) {
    if (!canDraw || !selectedLine || !trasformaEnd) return;
    pushHistory("trasforma");
    const { fisso, mobile } = puntiTrasforma(selectedLine, trasformaEnd);
    const next = puntoALunghezzaQuadrati(fisso, mobile, quadrati, griglia);
    applicaEstremoLinea(selectedLine.id, trasformaEnd, next);
    const q = Math.max(
      1,
      Math.round(quadratiTraPunti(fisso.x, fisso.y, next.x, next.y, griglia))
    );
    setLunghezzaDraft(String(q));
    setLunghezzaRealeDraft(String(Math.round(q * scalaValore * 100) / 100));
  }

  function confermaLunghezzaDaInput() {
    const qRaw = Number(String(lunghezzaDraft).replace(",", "."));
    if (Number.isFinite(qRaw) && qRaw > 0) {
      applicaLunghezzaTrasforma(qRaw);
      return;
    }
    const reale = Number(String(lunghezzaRealeDraft).replace(",", "."));
    if (Number.isFinite(reale) && reale > 0 && scalaValore > 0) {
      applicaLunghezzaTrasforma(reale / scalaValore);
    }
  }

  function parseMisuraDraft(draft: string, realeDraft: string, fallbackQ: number) {
    const qRaw = Number(String(draft).replace(",", "."));
    if (Number.isFinite(qRaw) && qRaw > 0) return qRaw;
    const reale = Number(String(realeDraft).replace(",", "."));
    if (Number.isFinite(reale) && reale > 0 && scalaValore > 0) {
      return reale / scalaValore;
    }
    return fallbackQ;
  }

  function scegliLatoRettangolo(lato: LatoRettangolo) {
    if (!trasformaRett) return;
    setTrasformaLatoRett(lato);
  }

  function confermaMisureRettangolo() {
    if (!canDraw || !trasformaRett) return;
    if (!trasformaLatoRett) {
      setOk("Scegli in quale direzione allungare o accorciare.");
      return;
    }
    const curWq = Math.max(1, trasformaRett.width / Math.max(1, griglia));
    const curHq = Math.max(1, trasformaRett.height / Math.max(1, griglia));
    const wq = parseMisuraDraft(larghezzaDraft, larghezzaRealeDraft, curWq);
    const hq = parseMisuraDraft(altezzaDraft, altezzaRealeDraft, curHq);
    const misuraQ =
      trasformaLatoRett === "left" || trasformaLatoRett === "right" ? wq : hq;
    pushHistory("trasforma");
    applicaBoxRettangolo(
      ridimensionaBoxDaLato(
        trasformaRett,
        trasformaLatoRett,
        misuraQ * Math.max(1, griglia)
      )
    );
  }

  function misuraRealeToPx(reale: number): number | null {
    if (!Number.isFinite(reale) || reale <= 0 || !(scalaValore > 0)) return null;
    return (reale / scalaValore) * Math.max(1, griglia);
  }

  function armaSpostaDi(raw = spostaDiDraft) {
    const n = Number(String(raw).replace(",", "."));
    const px = misuraRealeToPx(n);
    if (px == null) {
      setSpostaDiPx(null);
      return false;
    }
    setSpostaDiPx(px);
    setTool("seleziona");
    setCarry(null);
    carryRef.current = null;
    return true;
  }

  function disarmaSpostaDi() {
    setSpostaDiPx(null);
    setSpostaDiDraft("");
    if (carry?.vincoloPx) {
      setCarry(null);
      carryRef.current = null;
    }
  }

  function deltaSposta(dir: SpostaDir): { dx: number; dy: number } {
    const step =
      spostaDiPx && spostaDiPx > 0 ? spostaDiPx : Math.max(1, griglia);
    if (dir === "up") return { dx: 0, dy: -step };
    if (dir === "down") return { dx: 0, dy: step };
    if (dir === "left") return { dx: -step, dy: 0 };
    return { dx: step, dy: 0 };
  }

  function clampDeltaNelFoglio(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    dx: number,
    dy: number
  ): { dx: number; dy: number } {
    let ndx = dx;
    let ndy = dy;
    if (minX + ndx < foglio.x) ndx = foglio.x - minX;
    if (maxX + ndx > foglio.x + foglio.width) ndx = foglio.x + foglio.width - maxX;
    if (minY + ndy < foglio.y) ndy = foglio.y - minY;
    if (maxY + ndy > foglio.y + foglio.height) ndy = foglio.y + foglio.height - maxY;
    return { dx: ndx, dy: ndy };
  }

  function nudgeSelected(dir: SpostaDir) {
    if (!canDraw || carry) return;
    if (tool !== "seleziona") setTool("seleziona");
    const { dx, dy } = deltaSposta(dir);
    if (dx === 0 && dy === 0) return;
    const box = selezioneBounds;
    if (!box) return;
    const safe = clampDeltaNelFoglio(
      box.x,
      box.y,
      box.x + box.w,
      box.y + box.h,
      dx,
      dy
    );
    if (safe.dx === 0 && safe.dy === 0) return;
    pushHistory("sposta");
    const lineIds = new Set(selectedLineIds);
    const areaIds = new Set(selectedAreaIds);
    const rifIds = new Set(selectedRifIds);
    if (lineIds.size) {
      setLinee((prev) =>
        prev.map((l) =>
          lineIds.has(l.id)
            ? {
                ...l,
                x1: l.x1 + safe.dx,
                y1: l.y1 + safe.dy,
                x2: l.x2 + safe.dx,
                y2: l.y2 + safe.dy,
              }
            : l
        )
      );
    }
    if (areaIds.size) {
      setAree((prev) =>
        prev.map((a) =>
          areaIds.has(a.id)
            ? { ...a, x: a.x + safe.dx, y: a.y + safe.dy }
            : a
        )
      );
    }
    if (rifIds.size) {
      setRiferimenti((prev) =>
        prev.map((g) =>
          rifIds.has(g.id)
            ? { ...g, destX: g.destX + safe.dx, destY: g.destY + safe.dy }
            : g
        )
      );
    }
  }

  function copiaSelezione() {
    if (!canDraw || selezioneCount === 0 || carry) return;
    pushHistory("copia");
    const offset = Math.max(1, griglia);
    const box = selezioneBounds;
    const safe = box
      ? clampDeltaNelFoglio(
          box.x,
          box.y,
          box.x + box.w,
          box.y + box.h,
          offset,
          offset
        )
      : { dx: offset, dy: offset };
    const dx = safe.dx === 0 && safe.dy === 0 ? 0 : safe.dx;
    const dy = safe.dx === 0 && safe.dy === 0 ? 0 : safe.dy;
    const usati = new Set(aree.map((a) => a.codice.trim().toUpperCase()));
    const newLineIds: string[] = [];
    const newAreaIds: string[] = [];
    const newRifIds: string[] = [];
    const copieLinee = linee
      .filter((l) => selectedLineIds.includes(l.id))
      .map((l) => {
        const id = newLocalId();
        newLineIds.push(id);
        return {
          ...l,
          id,
          x1: l.x1 + dx,
          y1: l.y1 + dy,
          x2: l.x2 + dx,
          y2: l.y2 + dy,
        };
      });
    const copieAree = aree
      .filter((a) => selectedAreaIds.includes(a.id))
      .map((a) => {
        const id = newLocalId();
        newAreaIds.push(id);
        return {
          ...a,
          id,
          ubicazioneId: "",
          codice: codiceCopiaUnico(a.codice, usati),
          nome: nomeCopiaOggetto(a.nome),
          x: a.x + dx,
          y: a.y + dy,
        };
      });
    const copieRif = riferimenti
      .filter((g) => selectedRifIds.includes(g.id))
      .map((g) => {
        const id = newLocalId();
        newRifIds.push(id);
        return {
          ...g,
          id,
          asseId: newLocalId(),
          destX: g.destX + dx,
          destY: g.destY + dy,
          punti: g.punti.map((p) => ({ ...p, id: newLocalId() })),
          calchi: (g.calchi ?? []).map((c) => ({
            ...c,
            id: newLocalId(),
          })),
        };
      });
    if (!copieLinee.length && !copieAree.length && !copieRif.length) return;
    if (copieLinee.length) {
      setLinee((prev) => [
        ...prev,
        ...copieLinee.map((l, i) => ({ ...l, sortOrder: prev.length + i })),
      ]);
    }
    if (copieAree.length) {
      setAree((prev) => [...prev, ...copieAree]);
    }
    if (copieRif.length) {
      setRiferimenti((prev) => [...prev, ...copieRif]);
    }
    setSelectedLineIds(newLineIds);
    setSelectedAreaIds(newAreaIds);
    setSelectedRifIds(newRifIds);
    setTool("seleziona");
    setDraftStart(null);
    setForma(null);
    setCarry(null);
    carryRef.current = null;
    setOk(
      `Copia di ${newLineIds.length + newAreaIds.length + newRifIds.length} oggett${
        newLineIds.length + newAreaIds.length + newRifIds.length === 1 ? "o" : "i"
      } accanto all'originale. Salva la bozza per confermare.`
    );
  }

  const selezioneCount =
    selectedLineIds.length + selectedAreaIds.length + selectedRifIds.length;

  const showSpostaFrecce = Boolean(
    canDraw && tool === "seleziona" && selezioneCount > 0 && !carry
  );

  const selezioneBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const l of linee) {
      if (!selectedLineIds.includes(l.id)) continue;
      found = true;
      minX = Math.min(minX, l.x1, l.x2);
      minY = Math.min(minY, l.y1, l.y2);
      maxX = Math.max(maxX, l.x1, l.x2);
      maxY = Math.max(maxY, l.y1, l.y2);
    }
    for (const a of aree) {
      if (!selectedAreaIds.includes(a.id)) continue;
      found = true;
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.width);
      maxY = Math.max(maxY, a.y + a.height);
    }
    for (const g of riferimenti) {
      if (!selectedRifIds.includes(g.id)) continue;
      found = true;
      const pts = estremiCalcoDest(g);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      minX = Math.min(minX, ...xs, g.destX);
      minY = Math.min(minY, ...ys, g.destY);
      maxX = Math.max(maxX, ...xs, g.destX + g.destWidth);
      maxY = Math.max(maxY, ...ys, g.destY + g.destHeight);
    }
    if (!found) return null;
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
    };
  }, [
    linee,
    aree,
    riferimenti,
    selectedLineIds,
    selectedAreaIds,
    selectedRifIds,
  ]);

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
    if (selectedLineIds.length && canDraw) {
      pushHistory("colore");
      const ids = new Set(selectedLineIds);
      setLinee((prev) =>
        prev.map((l) => (ids.has(l.id) ? { ...l, colore: next } : l))
      );
    }
  }

  async function persist(nextRif?: MappaRiferimentoGruppo[]): Promise<boolean> {
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
      riferimenti: (nextRif ?? riferimenti).map((g) => ({
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
        haLimite: g.haLimite,
        calchi: g.calchi,
      })),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    setMappa(res.mappa);
    setLinee(res.mappa.linee);
    setAree(
      areeConCodiceLocale(res.mappa.aree ?? [], res.mappa.ubicazioni ?? [])
    );
    setRiferimenti(res.mappa.riferimenti ?? []);
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
    clearHistory();
    setOk("Bozza salvata. Le altre bozze restano in elenco.");
    return true;
  }

  async function salva() {
    await persist();
  }

  async function applicaNomeAreaCampo() {
    if (!mappa || !canDesign) return;
    const next = nomePianta.trim();
    if (!next) return;
    const attuale = (mappa.luogoNome || mappa.nome).trim();
    if (next === attuale) return;
    if (editing) return;
    setSaving(true);
    setError(null);
    const res = await salvaNomeAreaMappaAction({
      mappaId: mappa.id,
      nomeArea: next,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setOk(`Nome area aggiornato: ${res.mappa.luogoNome || res.mappa.nome}.`);
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
    window.dispatchEvent(new Event(MAPPA_MENU_NAV_EVENT));
  }

  async function caricaPercorsoAperto(mappaId: string) {
    const res = await getMappaMenuPercorsoAction(mappaId);
    if (!res.success) {
      setPercorsoIniziale(null);
      return res;
    }
    setPercorsoIniziale(res.percorso);
    return res;
  }

  async function avviaCollega() {
    if (!mappa) return;
    const okSave = await persist();
    if (!okSave) return;
    setCollegaError(null);
    setAreaOpen(true);
  }

  async function avviaCreaPercorso() {
    if (!mappa) return;
    const okSave = await persist();
    if (!okSave) return;
    setCollegaError(null);
    setCollegaVariant("collega");
    if (mappa.menuNodoId) {
      const res = await caricaPercorsoAperto(mappa.id);
      if (!res.success) {
        setCollegaError(res.error);
      }
    } else {
      setPercorsoIniziale(null);
    }
    setCollegaOpen(true);
  }

  async function confermaAreaOperativa(input: {
    modo: "esistente" | "nuova";
    nodoId?: string;
    nomeNuova?: string;
  }) {
    if (!mappa) return;
    setCollegaBusy(true);
    setError(null);
    setCollegaError(null);
    const res = await collegaMappaAdAreaOperativaAction({
      mappaId: mappa.id,
      vistaEtichetta: vistaEtichetta.trim() || mappa.vistaEtichetta,
      modo: input.modo,
      nodoId: input.nodoId,
      nomeNuova: input.nomeNuova,
    });
    setCollegaBusy(false);
    if (!res.success) {
      setCollegaError(res.error);
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setAree(areeConCodiceLocale(res.mappa.aree ?? [], res.mappa.ubicazioni ?? []));
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setAreaOpen(false);
    setOk(
      `Foglio collegato all'area «${res.mappa.luogoNome}». I posti degli altri fogli sono in Dentro.`
    );
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
  }

  async function avviaModificaPercorso() {
    if (!mappa) return;
    if (editing) {
      const okSave = await persist();
      if (!okSave) return;
    }
    setCollegaError(null);
    const res = await caricaPercorsoAperto(mappa.id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setCollegaVariant("modifica");
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
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setCollegaOpen(false);
    setPercorsoIniziale(null);
    setOk(`Collegata a ${res.mappa.percorsoEtichetta}.`);
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
    window.dispatchEvent(new Event(MAPPA_MENU_NAV_EVENT));
  }

  async function confermaRinomina(nodi: { nodoId: string; etichetta: string }[]) {
    if (!mappa) return;
    setCollegaBusy(true);
    setError(null);
    setCollegaError(null);
    const res = await rinominaPercorsoMappaAction({
      mappaId: mappa.id,
      nodi,
    });
    setCollegaBusy(false);
    if (!res.success) {
      setCollegaError(res.error);
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setCollegaOpen(false);
    setPercorsoIniziale(null);
    setOk(`Nomi aggiornati: ${res.mappa.percorsoEtichetta}.`);
    window.dispatchEvent(new Event(MAGAZZINO_MAPPE_NAV_EVENT));
    window.dispatchEvent(new Event(MAPPA_MENU_NAV_EVENT));
  }

  async function confermaSposta(payload: {
    areaSlug: string;
    rami: { nodoId?: string; etichetta: string; slug?: string }[];
    posto: { nodoId?: string; etichetta: string };
  }) {
    if (!mappa) return;
    setCollegaBusy(true);
    setError(null);
    setCollegaError(null);
    const res = await spostaMappaPercorsoAction({
      mappaId: mappa.id,
      vistaEtichetta: vistaEtichetta.trim() || mappa.vistaEtichetta,
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
    setNomePianta(res.mappa.luogoNome || res.mappa.nome);
    setLuogoNome(res.mappa.luogoNome || res.mappa.nome);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setCollegaOpen(false);
    setPercorsoIniziale(null);
    setOk(`Percorso aggiornato: ${res.mappa.percorsoEtichetta}.`);
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
            {mappa.luogoNome || mappa.nome} · v{mappa.versione} ·{" "}
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
          {mode === "editor" && canDesign && mappa.menuNodoId ? (
            <button
              type="button"
              disabled={saving || collegaBusy}
              onClick={() => void avviaModificaPercorso()}
              className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50"
            >
              Modifica percorso
            </button>
          ) : null}
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
                disabled={saving || historyLen === 0}
                onClick={() => annullaUltimaModifica()}
                title="Annulla l'ultima modifica (Ctrl+Z)"
                className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40"
              >
                Annulla
              </button>
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
              {mappa.documentoStato === "bozza" ? (
              <button
                type="button"
                disabled={saving || collegaBusy || !vistaOk || !scalaOk}
                onClick={() => void avviaCreaPercorso()}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Crea percorso
              </button>
              ) : null}
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
              <button
                type="button"
                disabled={selezioneCount === 0 || Boolean(carry)}
                onClick={() => copiaSelezione()}
                className="rounded-lg border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-950 hover:bg-indigo-50 disabled:opacity-50"
              >
                Copia selezione
              </button>
            </>
          ) : null}
        </div>
      </div>

      {mode === "editor" && canDesign ? (
        <div className="shrink-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              Nome Area
              <input
                type="text"
                value={nomePianta}
                onChange={(e) => {
                  setNomePianta(e.target.value);
                  setLuogoNome(e.target.value);
                }}
                onBlur={() => void applicaNomeAreaCampo()}
                placeholder="Es. Magazzino 1"
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
              <p className="self-end text-xs text-[var(--muted)]">
                Nome cartella operativa. Si conferma con «Collega ad area». Il
                percorso URL si crea con «Crea percorso».
              </p>
            )}
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="shrink-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3">
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
                  setCarry(null);
                  carryRef.current = null;
                  setTrasformaEnd(null);
                  setDragTrasforma(null);
                  resetTrasformaRett();
                }}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="linea">Traccia linea</option>
                <option value="rettangolo">Rettangolo / quadrato</option>
                <option value="area">Crea area / posto</option>
                <option value="poligono">Poligono</option>
                <option value="seleziona">Seleziona e sposta</option>
                <option value="trasforma">Modifica / trasforma</option>
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

          {canDraw && tool === "seleziona" ? (
            <p className="text-xs text-indigo-900">
              {carry?.vincoloPx
                ? "Spostamento vincolato: muovi il mouse per la direzione (orizzontale/verticale o libera). Clic per posare."
                : carry
                ? "Oggetti attaccati al mouse. Clic sul foglio per posarli."
                : "Primo click: seleziona. Copia crea un duplicato. Sposta di + Invio, poi frecce (solo verticale/orizzontale) oppure secondo click sull'oggetto per la direzione libera a misura fissa."}
            </p>
          ) : null}

          {canDraw && tool === "trasforma" ? (
            <p className="text-xs text-amber-950">
              Seleziona una linea, un quadrato o un rettangolo. Per il
              rettangolo si aprono le misure; poi scegli in quale direzione
              allungarlo o accorciarlo. Trascina il lato o conferma con Invio.
            </p>
          ) : null}

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
              Codice (colonna o ripiano, es. A oppure 1)
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
                placeholder="es. Nome Ripiano 1"
                className="ml-1 w-48 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Dentro (solo aree di altre viste collegate)
              <select
                value={areaParentId}
                onChange={(e) => setAreaParentId(e.target.value)}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="">Nessuna (area principale)</option>
                {parentOptions.collegate.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {parentOptions.collegate.length === 0 ? (
                <span className="mt-1 block text-[11px] text-amber-800">
                  Nessun posto da altri fogli. Collega questo foglio alla stessa
                  area (cartella) con «Collega ad area».
                </span>
              ) : null}
            </label>
            {posizionePreview ? (
              <p className="w-full text-xs font-medium text-teal-950">
                Posizione operativa:{" "}
                <span className="rounded bg-white px-1.5 py-0.5 font-mono">
                  {posizionePreview}
                </span>
                {areaNome.trim() ? ` — ${areaNome.trim()}` : ""}
                . Qui si riporranno pallet e sacchetti (es. 1 pallet, Sacchetto A
                24 kg).
              </p>
            ) : null}
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
            Area {posizioneDi(selectedArea)} — {selectedArea.nome}
          </p>
          <p className="mt-1 text-xs text-teal-900">
            Codice {selectedArea.codice} · Riferimento:{" "}
            {parentLabelOf(selectedArea.parentId)} ·{" "}
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
                  onClick={() => copiaSelezione()}
                  className="rounded-lg border border-indigo-500 bg-white px-3 py-1.5 text-sm font-medium text-indigo-950 hover:bg-indigo-50"
                >
                  Copia oggetto
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
                  onChange={(e) => {
                    pushHistory("area-edit");
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id
                          ? { ...a, codice: e.target.value.toUpperCase() }
                          : a
                      )
                    );
                  }}
                  className="ml-1 w-24 rounded border border-[var(--border)] px-2 py-1 text-sm uppercase"
                />
              </label>
              <label className="text-xs">
                Nome
                <input
                  value={selectedArea.nome}
                  onChange={(e) => {
                    pushHistory("area-edit");
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id ? { ...a, nome: e.target.value } : a
                      )
                    );
                  }}
                  className="ml-1 w-48 rounded border border-[var(--border)] px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Dentro (solo altre viste collegate)
                <select
                  value={selectedArea.parentId ?? ""}
                  onChange={(e) => {
                    pushHistory("area-edit");
                    setAree((prev) =>
                      prev.map((a) =>
                        a.id === selectedArea.id
                          ? { ...a, parentId: e.target.value || null }
                          : a
                      )
                    );
                  }}
                  className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
                >
                  <option value="">Nessuna</option>
                  {selectedArea.parentId &&
                  !parentOptions.collegate.some(
                    (o) => o.id === selectedArea.parentId
                  ) ? (
                    <option value={selectedArea.parentId}>
                      {parentLabelOf(selectedArea.parentId)} — posto di questo
                      foglio; scegli un posto di un altro foglio della stessa
                      area
                    </option>
                  ) : null}
                  {parentOptions.collegate
                    .filter(
                      (o) =>
                        o.id !== selectedArea.id &&
                        o.id !== selectedArea.ubicazioneId
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
              <p className="w-full text-xs font-medium text-teal-950">
                Posizione operativa:{" "}
                <span className="rounded bg-white px-1.5 py-0.5 font-mono">
                  {posizioneDi(selectedArea)}
                </span>
                {selectedArea.nome.trim()
                  ? ` — ${selectedArea.nome.trim()}`
                  : ""}
              </p>
              <label className="text-xs">
                Larghezza q
                <input
                  type="number"
                  min={1}
                  value={Math.max(1, Math.round(selectedArea.width / Math.max(griglia, 1)))}
                  onChange={(e) => {
                    const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                    pushHistory("area-edit");
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
                    pushHistory("area-edit");
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

      {canDraw && tool === "seleziona" && carry ? (
        <div className="shrink-0 rounded-xl border border-indigo-400 bg-indigo-100 px-3 py-2">
          <p className="text-sm font-semibold text-indigo-950">
            {selezioneCount}{" "}
            {selezioneCount === 1 ? "oggetto attaccato" : "oggetti attaccati"} al
            mouse
            {carry.vincoloPx
              ? ` · misura ${formattaLunghezzaReale(
                  carry.vincoloPx / Math.max(griglia, 1),
                  scalaValore,
                  scalaUnita
                )}`
              : ""}
          </p>
          <p className="mt-0.5 text-xs text-indigo-900">
            {carry.vincoloPx
              ? "La distanza è bloccata. Scegli la direzione col mouse, poi clic per posare. Esc annulla."
              : "Clic sul foglio per posare. Esc annulla l'aggancio."}
          </p>
        </div>
      ) : null}

      {showSpostaFrecce ? (
        <div className="shrink-0 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2">
          <p className="text-sm font-semibold text-indigo-950">
            {selezioneCount === 1
              ? selectedLine
                ? "Sposta / copia linea"
                : selectedArea
                  ? `Sposta / copia area ${selectedArea.codice}`
                  : "Sposta / copia elemento"
              : `Sposta / copia ${selezioneCount} oggetti`}
          </p>
          <p className="mt-0.5 text-xs text-indigo-900">
            {spostaDiPx
              ? "Misura armata. Frecce = solo verticale o orizzontale. Click sull'oggetto = direzione libera alla stessa misura."
              : "Copia duplica la selezione. Inserisci Sposta di (es. 200 cm) e Invio, poi scegli la direzione."}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => copiaSelezione()}
              className="rounded-lg border border-indigo-600 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-950 hover:bg-indigo-100"
            >
              Copia
            </button>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!armaSpostaDi()) {
                  setError(`Inserisci una misura maggiore di 0 in ${scalaUnita}.`);
                } else {
                  setError(null);
                }
              }}
            >
              <label className="text-xs font-medium text-indigo-950">
                Sposta di ({scalaUnita})
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={spostaDiDraft}
                  onChange={(e) => setSpostaDiDraft(e.target.value)}
                  placeholder="200"
                  className="ml-1 w-24 rounded border border-indigo-400 bg-white px-2 py-1 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800"
              >
                Invio
              </button>
              {spostaDiPx ? (
                <button
                  type="button"
                  onClick={() => disarmaSpostaDi()}
                  className="rounded-lg px-2 py-1 text-xs text-indigo-800 hover:bg-white"
                >
                  Annulla misura
                </button>
              ) : null}
            </form>
          </div>
          {spostaDiPx ? (
            <p className="mt-1 text-xs font-medium text-indigo-950">
              Misura pronta:{" "}
              {formattaLunghezzaReale(
                spostaDiPx / Math.max(griglia, 1),
                scalaValore,
                scalaUnita
              )}{" "}
              · {formattaQuadrati(spostaDiPx / Math.max(griglia, 1))} quadrati
            </p>
          ) : null}
          <p className="mt-2 text-xs text-indigo-900">
            Le frecce sono nel riquadro fluttuante: prendilo dalla barra blu e
            spostalo dove non copre il disegno.
          </p>
        </div>
      ) : null}
      {showSpostaFrecce ? (
        <MappaSpostaFreccePad
          onNudge={nudgeSelected}
          onAnnulla={annullaUltimaModifica}
          canAnnulla={historyLen > 0}
          passoEtichetta={
            spostaDiPx
              ? formattaLunghezzaReale(
                  spostaDiPx / Math.max(griglia, 1),
                  scalaValore,
                  scalaUnita
                )
              : null
          }
        />
      ) : null}

      {canDraw && tool === "trasforma" && trasformaRett ? (
        <div className="shrink-0 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2">
          <p className="text-sm font-semibold text-teal-950">
            Modifica / trasforma{" "}
            {Math.abs(trasformaRett.width - trasformaRett.height) < griglia * 0.5
              ? "quadrato"
              : "rettangolo"}
          </p>
          <p className="mt-0.5 text-sm text-teal-950">
            Misure attuali:{" "}
            <strong>
              {formattaQuadrati(trasformaRett.width / Math.max(1, griglia))} ×{" "}
              {formattaQuadrati(trasformaRett.height / Math.max(1, griglia))}{" "}
              quadrati ·{" "}
              {formattaLunghezzaReale(
                trasformaRett.width / Math.max(1, griglia),
                scalaValore,
                scalaUnita
              )}{" "}
              ×{" "}
              {formattaLunghezzaReale(
                trasformaRett.height / Math.max(1, griglia),
                scalaValore,
                scalaUnita
              )}
            </strong>
          </p>
          <form
            className="mt-2 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              confermaMisureRettangolo();
            }}
          >
            <label className="text-xs font-medium text-teal-950">
              Larghezza quadrati
              <input
                type="number"
                min={1}
                max={MAPPA_QUADRATI_MAX}
                step={1}
                value={larghezzaDraft}
                onChange={(e) => {
                  setLarghezzaDraft(e.target.value);
                  const q = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(q) && q > 0) {
                    setLarghezzaRealeDraft(
                      String(Math.round(q * scalaValore * 100) / 100)
                    );
                  }
                }}
                className="ml-1 w-24 rounded border border-teal-400 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-teal-950">
              Larghezza ({scalaUnita})
              <input
                type="number"
                min={0.01}
                step="any"
                value={larghezzaRealeDraft}
                onChange={(e) => {
                  setLarghezzaRealeDraft(e.target.value);
                  const reale = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(reale) && reale > 0 && scalaValore > 0) {
                    setLarghezzaDraft(
                      String(Math.max(1, Math.round(reale / scalaValore)))
                    );
                  }
                }}
                className="ml-1 w-28 rounded border border-teal-400 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-teal-950">
              Altezza quadrati
              <input
                type="number"
                min={1}
                max={MAPPA_QUADRATI_MAX}
                step={1}
                value={altezzaDraft}
                onChange={(e) => {
                  setAltezzaDraft(e.target.value);
                  const q = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(q) && q > 0) {
                    setAltezzaRealeDraft(
                      String(Math.round(q * scalaValore * 100) / 100)
                    );
                  }
                }}
                className="ml-1 w-24 rounded border border-teal-400 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-teal-950">
              Altezza ({scalaUnita})
              <input
                type="number"
                min={0.01}
                step="any"
                value={altezzaRealeDraft}
                onChange={(e) => {
                  setAltezzaRealeDraft(e.target.value);
                  const reale = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(reale) && reale > 0 && scalaValore > 0) {
                    setAltezzaDraft(
                      String(Math.max(1, Math.round(reale / scalaValore)))
                    );
                  }
                }}
                className="ml-1 w-28 rounded border border-teal-400 bg-white px-2 py-1 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              Invio
            </button>
          </form>
          {!trasformaLatoRett ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-teal-950">
                In quale direzione vuoi allungarlo o accorciarlo?
              </p>
              <div className="flex flex-wrap gap-2">
                {(["up", "down", "left", "right"] as LatoRettangolo[]).map(
                  (lato) => (
                    <button
                      key={lato}
                      type="button"
                      onClick={() => scegliLatoRettangolo(lato)}
                      className="rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-semibold text-teal-950 hover:bg-teal-100"
                    >
                      {LATO_RETTANGOLO_LABEL[lato]}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-teal-950">
                Direzione: {LATO_RETTANGOLO_LABEL[trasformaLatoRett]}. Trascina
                il pallino su quel lato oppure conferma la misura con Invio.
              </p>
              <button
                type="button"
                onClick={() => setTrasformaLatoRett(null)}
                className="rounded-lg px-2 py-1 text-xs text-teal-800 hover:bg-white"
              >
                Cambia direzione
              </button>
            </div>
          )}
        </div>
      ) : null}

      {canDraw && tool === "trasforma" && selectedLine && selectedLineIds.length === 1 && !trasformaRett ? (
        <div className="shrink-0 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2">
          <p className="text-sm font-semibold text-violet-950">
            Modifica / trasforma linea
          </p>
          <p className="mt-0.5 text-sm text-violet-950">
            Lunghezza attuale:{" "}
            <strong>
              {formattaMisuraSegmento(
                selectedLine.x1,
                selectedLine.y1,
                selectedLine.x2,
                selectedLine.y2,
                griglia,
                scalaValore,
                scalaUnita
              ) || "—"}
            </strong>
          </p>
          {!trasformaEnd ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-violet-950">
                Da quale lato allungare o diminuire?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => scegliLatoTrasforma(1)}
                  className="rounded-lg border border-violet-500 bg-white px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100"
                >
                  Lato{" "}
                  {etichettaLatoLinea(
                    { x: selectedLine.x2, y: selectedLine.y2 },
                    { x: selectedLine.x1, y: selectedLine.y1 }
                  )}{" "}
                  (estremo A)
                </button>
                <button
                  type="button"
                  onClick={() => scegliLatoTrasforma(2)}
                  className="rounded-lg border border-violet-500 bg-white px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100"
                >
                  Lato{" "}
                  {etichettaLatoLinea(
                    { x: selectedLine.x1, y: selectedLine.y1 },
                    { x: selectedLine.x2, y: selectedLine.y2 }
                  )}{" "}
                  (estremo B)
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-violet-950">
                Lato scelto:{" "}
                {etichettaLatoLinea(
                  puntiTrasforma(selectedLine, trasformaEnd).fisso,
                  puntiTrasforma(selectedLine, trasformaEnd).mobile
                )}{" "}
                (estremo {trasformaEnd === 1 ? "A" : "B"}). Trascina il pallino
                sul foglio oppure inserisci la lunghezza.
              </p>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confermaLunghezzaDaInput();
                }}
              >
                <label className="text-xs font-medium text-violet-950">
                  Quadrati
                  <input
                    type="number"
                    min={1}
                    max={MAPPA_QUADRATI_MAX}
                    step={1}
                    value={lunghezzaDraft}
                    onChange={(e) => {
                      setLunghezzaDraft(e.target.value);
                      const q = Number(e.target.value.replace(",", "."));
                      if (Number.isFinite(q) && q > 0) {
                        setLunghezzaRealeDraft(
                          String(Math.round(q * scalaValore * 100) / 100)
                        );
                      }
                    }}
                    className="ml-1 w-24 rounded border border-violet-400 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-violet-950">
                  Lunghezza ({scalaUnita})
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={lunghezzaRealeDraft}
                    onChange={(e) => {
                      setLunghezzaRealeDraft(e.target.value);
                      const reale = Number(e.target.value.replace(",", "."));
                      if (Number.isFinite(reale) && reale > 0 && scalaValore > 0) {
                        setLunghezzaDraft(
                          String(Math.max(1, Math.round(reale / scalaValore)))
                        );
                      }
                    }}
                    className="ml-1 w-28 rounded border border-violet-400 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800"
                >
                  Invio
                </button>
                <button
                  type="button"
                  onClick={() => setTrasformaEnd(null)}
                  className="rounded-lg px-2 py-1 text-xs text-violet-800 hover:bg-white"
                >
                  Cambia lato
                </button>
              </form>
            </div>
          )}
        </div>
      ) : null}

      {selectedLine ? (
        <div className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-950">
            {selectedLineIds.length > 1
              ? `${selectedLineIds.length} linee selezionate`
              : "Linea selezionata"}
          </p>
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
              <>
                <button
                  type="button"
                  onClick={() => copiaSelezione()}
                  className="rounded-lg border border-indigo-500 bg-white px-3 py-1.5 text-sm font-medium text-indigo-950 hover:bg-indigo-50"
                >
                  Copia
                </button>
                <button
                  type="button"
                  onClick={() => eliminaLineaSelezionata()}
                  className="rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
                >
                  Elimina linea
                </button>
              </>
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
            canDraw && tool === "trasforma"
              ? dragTrasforma || dragTrasformaRett
                ? "cursor-grabbing"
                : "cursor-pointer"
              : canDraw && tool === "seleziona"
              ? carry
                ? "cursor-grabbing"
                : "cursor-pointer"
              : canDraw
                ? "cursor-crosshair"
                : "cursor-default"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            setPanning(null);
            setDragArea(null);
            setDragTrasforma(null);
            setDragTrasformaRett(null);
          }}
          onPointerLeave={() => {
            setPanning(null);
            if (!forma && !draftStart && !dragArea && !carry) setCursor(null);
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
              const sel = selectedAreaIds.includes(a.id);
              const cx = a.x + a.width / 2;
              const cy = a.y + a.height / 2;
              const targa = posizioneDi(a) || a.codice.trim() || a.nome.trim();
              const fontSize = fontTargaArea(a.width, a.height, targa);
              return (
                <g key={a.id}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width={a.width}
                    height={a.height}
                    fill={sel ? "rgba(234,88,12,0.42)" : "rgba(13,148,136,0.10)"}
                    stroke={sel ? "#c2410c" : "#0d9488"}
                    strokeWidth={sel ? Math.max(3.5, 5 / zoom) : Math.max(1.2, 2 / zoom)}
                  />
                  {sel ? (
                    <rect
                      x={a.x + 3 / zoom}
                      y={a.y + 3 / zoom}
                      width={Math.max(0, a.width - 6 / zoom)}
                      height={Math.max(0, a.height - 6 / zoom)}
                      fill="none"
                      stroke="#fff7ed"
                      strokeWidth={Math.max(1.4, 2.2 / zoom)}
                    />
                  ) : null}
                  <g pointerEvents="none">
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={sel ? "#7c2d12" : "#134e4a"}
                      fontSize={fontSize}
                      fontWeight={700}
                    >
                      {targa}
                    </text>
                    {kids.length ? (
                      <text
                        x={cx}
                        y={cy + fontSize * 0.7}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fill={sel ? "#9a3412" : "#0f766e"}
                        fontSize={Math.min(fontSize * 0.35, 14)}
                      >
                        {kids.map((k) => k.codice).join(" · ")}
                      </text>
                    ) : null}
                  </g>
                </g>
              );
            })}
            {riferimenti.map((g) => {
              const sel = selectedRifIds.includes(g.id);
              const angoli = g.haLimite !== false ? dettaglioAngoliImporto(g) : [];
              const lati = g.haLimite !== false ? dettaglioLatiImporto(g) : [];
              const calcoSeg = segmentiCalcoDest(g);
              const calcoPts = puntiCalcoDest(g);
              const labelPt = calcoPts[0] ?? estremiCalcoDest(g)[0];
              return (
                <g key={g.id}>
                  {g.haLimite !== false ? (
                    <>
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
                    </>
                  ) : labelPt ? (
                    <text
                      x={labelPt.x + 6}
                      y={labelPt.y - 6}
                      fill="#92400e"
                      fontSize={Math.max(10, 11 / zoom)}
                      fontWeight={600}
                    >
                      Calco da {g.mappaOrigineEtichetta}
                    </text>
                  ) : null}
                  {calcoSeg.map((s) => (
                    <line
                      key={s.id}
                      x1={s.x1}
                      y1={s.y1}
                      x2={s.x2}
                      y2={s.y2}
                      stroke={sel ? "#ea580c" : "#d97706"}
                      strokeDasharray={`${7 / zoom} ${4 / zoom}`}
                      strokeWidth={Math.max(1.4, 2.2 / zoom)}
                    />
                  ))}
                  {calcoPts.map((p) => (
                    <g key={`${g.id}-pt-${p.id}`}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={Math.max(3.4, 5 / zoom)}
                        fill="#b45309"
                        stroke="#fff7ed"
                        strokeWidth={Math.max(0.8, 1.2 / zoom)}
                      />
                      <text
                        x={p.x + 6 / zoom}
                        y={p.y - 6 / zoom}
                        fill="#78350f"
                        fontSize={Math.max(8, 9 / zoom)}
                        fontWeight={600}
                      >
                        {p.etichetta}
                      </text>
                    </g>
                  ))}
                  {angoli.map((a) => (
                    <g key={`${g.id}-ang-${a.n}`}>
                      <circle
                        cx={a.destX}
                        cy={a.destY}
                        r={Math.max(3.2, 5 / zoom)}
                        fill="#b45309"
                        stroke="#fff7ed"
                        strokeWidth={Math.max(0.8, 1.2 / zoom)}
                      />
                      <text
                        x={a.destX + (a.n === 2 || a.n === 4 ? -6 : 6) / zoom}
                        y={a.destY + (a.n === 3 || a.n === 4 ? 14 : -8) / zoom}
                        textAnchor={a.n === 2 || a.n === 4 ? "end" : "start"}
                        fill="#78350f"
                        fontSize={Math.max(8, 9 / zoom)}
                        fontWeight={600}
                      >
                        {a.testo}
                      </text>
                    </g>
                  ))}
                  {lati.map((l) => {
                    const p = angoli[l.da - 1]!;
                    const q = angoli[l.a - 1]!;
                    return (
                      <text
                        key={`${g.id}-lato-${l.da}-${l.a}`}
                        x={(p.destX + q.destX) / 2}
                        y={(p.destY + q.destY) / 2}
                        textAnchor="middle"
                        fill="#92400e"
                        fontSize={Math.max(8, 9 / zoom)}
                      >
                        {l.testo}
                      </text>
                    );
                  })}
                  {g.punti.map((p) => {
                    const s = segmentoGuidaDest(g, p.offsetQuadrati, griglia);
                    const cx = (s.x1 + s.x2) / 2;
                    const cy = (s.y1 + s.y2) / 2;
                    return (
                      <g key={p.id}>
                        <line
                          x1={s.x1}
                          y1={s.y1}
                          x2={s.x2}
                          y2={s.y2}
                          stroke="#b45309"
                          strokeWidth={Math.max(1.2, 2 / zoom)}
                        />
                        <circle
                          cx={s.x1}
                          cy={s.y1}
                          r={Math.max(3, 4 / zoom)}
                          fill="#b45309"
                        />
                        <text
                          x={cx + 4}
                          y={cy + 4}
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
                {selectedLineIds.includes(l.id) ? (
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
            {carry?.vincoloPx ? (
              <g pointerEvents="none">
                <circle
                  cx={carry.sx}
                  cy={carry.sy}
                  r={carry.vincoloPx}
                  fill="none"
                  stroke="#4f46e5"
                  strokeDasharray={`${8 / zoom} ${5 / zoom}`}
                  strokeWidth={Math.max(1, 1.6 / zoom)}
                />
                <line
                  x1={carry.sx}
                  y1={carry.sy - carry.vincoloPx}
                  x2={carry.sx}
                  y2={carry.sy + carry.vincoloPx}
                  stroke="#6366f1"
                  strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                  strokeWidth={Math.max(0.8, 1.2 / zoom)}
                />
                <line
                  x1={carry.sx - carry.vincoloPx}
                  y1={carry.sy}
                  x2={carry.sx + carry.vincoloPx}
                  y2={carry.sy}
                  stroke="#6366f1"
                  strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                  strokeWidth={Math.max(0.8, 1.2 / zoom)}
                />
                {cursor
                  ? (() => {
                      const d = deltaVincolato(
                        { x: carry.sx, y: carry.sy },
                        cursor,
                        carry.vincoloPx
                      );
                      if (d.dx === 0 && d.dy === 0) return null;
                      return (
                        <line
                          x1={carry.sx}
                          y1={carry.sy}
                          x2={carry.sx + d.dx}
                          y2={carry.sy + d.dy}
                          stroke="#312e81"
                          strokeWidth={Math.max(1.4, 2.2 / zoom)}
                        />
                      );
                    })()
                  : null}
              </g>
            ) : null}
            {canDraw && tool === "trasforma" && trasformaRett ? (
              <g>
                <rect
                  x={trasformaRett.x}
                  y={trasformaRett.y}
                  width={trasformaRett.width}
                  height={trasformaRett.height}
                  fill="rgba(13,148,136,0.08)"
                  stroke="#0f766e"
                  strokeWidth={Math.max(1.6, 2.4 / zoom)}
                  strokeDasharray={`${8 / zoom} ${6 / zoom}`}
                />
                {handlePuntiRettangolo(trasformaRett).map((h) => {
                  const attivo = trasformaLatoRett === h.lato;
                  return (
                    <g key={`trasforma-rett-${h.lato}`}>
                      <circle
                        cx={h.x}
                        cy={h.y}
                        r={Math.max(7, 12 / zoom)}
                        fill={attivo ? "#0f766e" : "#f0fdfa"}
                        stroke={attivo ? "#115e59" : "#0d9488"}
                        strokeWidth={Math.max(2, 3 / zoom)}
                      />
                      <text
                        x={h.x + 14 / zoom}
                        y={h.y - 12 / zoom}
                        fill="#115e59"
                        fontSize={Math.max(11, 13 / zoom)}
                        fontWeight={700}
                      >
                        {LATO_RETTANGOLO_LABEL[h.lato]}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}
            {canDraw &&
            tool === "trasforma" &&
            selectedLine &&
            selectedLineIds.length === 1 &&
            !trasformaRett
              ? ([1, 2] as TrasformaEstremo[]).map((end) => {
                  const p =
                    end === 1
                      ? { x: selectedLine.x1, y: selectedLine.y1 }
                      : { x: selectedLine.x2, y: selectedLine.y2 };
                  const fisso =
                    end === 1
                      ? { x: selectedLine.x2, y: selectedLine.y2 }
                      : { x: selectedLine.x1, y: selectedLine.y1 };
                  const attivo = trasformaEnd === end;
                  const lato = etichettaLatoLinea(fisso, p);
                  return (
                    <g key={`trasforma-${selectedLine.id}-${end}`}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={Math.max(7, 12 / zoom)}
                        fill={attivo ? "#6d28d1" : "#faf5ff"}
                        stroke={attivo ? "#4c1d95" : "#7c3aed"}
                        strokeWidth={Math.max(2, 3 / zoom)}
                      />
                      <text
                        x={p.x + 14 / zoom}
                        y={p.y - 12 / zoom}
                        fill="#4c1d95"
                        fontSize={Math.max(11, 13 / zoom)}
                        fontWeight={700}
                      >
                        {lato} ({end === 1 ? "A" : "B"})
                      </text>
                    </g>
                  );
                })
              : null}
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
      {mode === "editor" || riferimenti.length > 0 ? (
      <ElencoImportiMappa
        importi={riferimenti}
        selectedId={selectedRifId}
        griglia={griglia}
        scalaValore={scalaValore}
        scalaUnita={scalaUnita}
        canEdit={canDraw}
        onSelect={(id) => selezionaImporto(id)}
        onModifica={(id) => {
          if (selectedRifId === id) scegliSoloRif(null);
          else selezionaImporto(id);
        }}
        onElimina={(id) => {
          pushHistory("elimina");
          const next = riferimenti.filter((g) => g.id !== id);
          setRiferimenti(next);
          if (selectedRifId === id) scegliSoloRif(null);
          if (canDraw) void persist(next);
        }}
        onCambiaDest={(id, patch) => cambiaDestImporto(id, patch)}
        onCambiaPunto={(gruppoId, puntoId, patch) => {
          pushHistory("area-edit");
          setRiferimenti((prev) =>
            prev.map((g) =>
              g.id === gruppoId
                ? {
                    ...g,
                    punti: g.punti.map((p) =>
                      p.id === puntoId
                        ? {
                            ...p,
                            etichetta: patch.etichetta ?? p.etichetta,
                            offsetQuadrati:
                              patch.offsetQuadrati ?? p.offsetQuadrati,
                          }
                        : p
                    ),
                  }
                : g
            )
          );
        }}
        onEliminaPunto={(gruppoId, puntoId) => {
          pushHistory("elimina");
          const next = riferimenti.map((g) =>
            g.id === gruppoId
              ? { ...g, punti: g.punti.filter((p) => p.id !== puntoId) }
              : g
          );
          setRiferimenti(next);
          if (canDraw) void persist(next);
        }}
      />
      ) : null}
      <ElencoAreeMappa
        aree={aree}
        selectedId={selectedAreaId}
        griglia={griglia}
        scalaValore={scalaValore}
        scalaUnita={scalaUnita}
        canEdit={canDraw}
        parentLabel={parentLabelOf}
        posizione={posizioneDi}
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
          parentOptions={parentOptions.collegate}
          sourceId={copiaSourceId}
          griglia={griglia}
          onClose={() => setCopiaOpen(false)}
          onCompleta={(r) => applicaCopiaArea(r)}
        />
      ) : null}
      {mode === "editor" && canDesign ? (
        <CollegaAdAreaModal
          open={areaOpen}
          busy={collegaBusy}
          error={collegaError}
          vistaEtichetta={vistaEtichetta.trim() || mappa.vistaEtichetta}
          nomeProposto={luogoNome.trim() || mappa.luogoNome || nomePianta}
          onClose={() => {
            setAreaOpen(false);
            setCollegaError(null);
          }}
          onConferma={(p) => void confermaAreaOperativa(p)}
        />
      ) : null}
      {mode === "editor" && canDesign ? (
        <CollegaMappaPercorsoModal
          open={collegaOpen}
          variant={collegaVariant}
          percorsoIniziale={percorsoIniziale}
          busy={collegaBusy}
          error={collegaError}
          vistaEtichetta={vistaEtichetta.trim()}
          luogoBozza={luogoNome.trim() || mappa.luogoNome}
          onClose={() => {
            setCollegaOpen(false);
            setCollegaError(null);
            setPercorsoIniziale(null);
          }}
          onConferma={(p) => void confermaCollega(p)}
          onRinomina={(n) => void confermaRinomina(n)}
          onSposta={(p) => void confermaSposta(p)}
        />
      ) : null}
      {editing ? (
        <ImportaRiferimentiVista
          open={importOpen}
          destMappaId={mappa.id}
          luogoNome={luogoNome || mappa.luogoNome}
          destGriglia={griglia}
          destScalaValore={scalaValore}
          destScalaUnita={scalaUnita}
          onClose={() => setImportOpen(false)}
          onApplied={(next, esito: ImportaEsito) => {
            pushHistory("importa");
            setMappa(next);
            setLinee(next.linee);
            setAree(areeConCodiceLocale(next.aree ?? [], next.ubicazioni ?? []));
            setRiferimenti(next.riferimenti ?? []);
            if (esito.modalita === "riferimento") {
              const ultimo = (next.riferimenti ?? []).at(-1);
              if (ultimo) scegliSoloRif(ultimo.id);
              setOk(
                "Calco in elenco. Disegna sopra come su un lucido: i punti si agganciano alle guide. Poi salva la bozza."
              );
            } else {
              scegliSoloRif(null);
              setOk(
                `Importati ${esito.linee} oggett${esito.linee === 1 ? "o" : "i"} lineari e ${esito.aree} are${esito.aree === 1 ? "a" : "e"} reali. Salva la bozza per confermare.`
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
