"use client";

import { useEffect, useState } from "react";
import { listMappaMenuFigliAction } from "@/app/actions/magazzino-mappa";
import {
  areePrimoLivelloMappa,
  sezioniStaticheArea,
  slugMenuVoce,
  type MappaMenuOpzione,
} from "@/lib/magazzino/menu-mappa";
import type { AreaSlug } from "@/types/database";

type Livello = {
  mode: "select" | "crea";
  nodoId: string;
  etichetta: string;
  slug: string;
};

type FigliCache = Record<string, MappaMenuOpzione[]>;

export function CollegaMappaPercorsoModal({
  open,
  vistaEtichetta,
  luogoBozza,
  onClose,
  onConferma,
  busy,
  error,
}: {
  open: boolean;
  vistaEtichetta: string;
  luogoBozza: string;
  onClose: () => void;
  onConferma: (payload: {
    areaSlug: string;
    rami: { nodoId?: string; etichetta: string; slug?: string }[];
    posto: { nodoId?: string; etichetta: string };
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const aree = areePrimoLivelloMappa();
  const [areaSlug, setAreaSlug] = useState<AreaSlug | "">("magazzino");
  const [livelli, setLivelli] = useState<Livello[]>([
    { mode: "select", nodoId: "", etichetta: "", slug: "" },
  ]);
  const [postoMode, setPostoMode] = useState<"select" | "crea">("crea");
  const [postoNodoId, setPostoNodoId] = useState("");
  const [postoNome, setPostoNome] = useState(luogoBozza);
  const [figli, setFigli] = useState<FigliCache>({});

  useEffect(() => {
    if (!open) return;
    setAreaSlug("magazzino");
    setLivelli([{ mode: "select", nodoId: "", etichetta: "", slug: "" }]);
    setPostoMode("crea");
    setPostoNodoId("");
    setPostoNome(luogoBozza);
    setFigli({});
  }, [open, luogoBozza]);

  useEffect(() => {
    if (!open || !areaSlug) return;
    void caricaFigli(areaSlug, null);
  }, [open, areaSlug]);

  async function caricaFigli(area: string, parentId: string | null) {
    const key = `${area}|${parentId ?? "root"}`;
    const res = await listMappaMenuFigliAction(area, parentId);
    if (!res.success) return;
    let items = res.items;
    if (!parentId) {
      const existing = new Set(items.map((i) => i.slug));
      const extra = sezioniStaticheArea(area)
        .filter((s) => !existing.has(s.slug))
        .map((s) => ({
          id: `static:${s.slug}`,
          etichetta: s.label,
          slug: s.slug,
          tipo: "statico" as const,
          virtuale: true,
        }));
      items = [...items, ...extra];
    }
    setFigli((prev) => ({ ...prev, [key]: items }));
  }

  function parentIdDi(index: number): string | null {
    if (index <= 0) return null;
    const prev = livelli[index - 1];
    if (!prev || prev.mode === "crea" || prev.nodoId.startsWith("static:")) {
      return prev?.nodoId.startsWith("static:") ? null : prev?.nodoId || null;
    }
    return prev.nodoId || null;
  }

  function opzioniLivello(index: number): MappaMenuOpzione[] {
    if (!areaSlug) return [];
    const parent = parentIdDi(index);
    if (index > 0 && livelli[index - 1]?.mode === "crea") return [];
    if (index > 0 && livelli[index - 1]?.nodoId.startsWith("static:")) return [];
    const key = `${areaSlug}|${parent ?? "root"}`;
    const all = figli[key] ?? [];
    return index === 0
      ? all.filter((i) => i.tipo !== "luogo")
      : all.filter((i) => i.tipo === "ramo" || i.tipo === "statico");
  }

  function opzioniPosto(): MappaMenuOpzione[] {
    if (!areaSlug) return [];
    const last = livelli[livelli.length - 1];
    if (!last || last.mode === "crea" || last.nodoId.startsWith("static:")) {
      return [];
    }
    const key = `${areaSlug}|${last.nodoId}`;
    return (figli[key] ?? []).filter((i) => i.tipo === "luogo");
  }

  function setLivello(index: number, next: Livello) {
    setLivelli((prev) => {
      const copy = prev.slice(0, index + 1);
      copy[index] = next;
      return copy;
    });
    setPostoNodoId("");
    if (next.mode === "select" && next.nodoId && !next.nodoId.startsWith("static:") && areaSlug) {
      void caricaFigli(areaSlug, next.nodoId);
    }
  }

  function ramiPayload() {
    return livelli
      .filter((l) => l.etichetta.trim())
      .map((l) => ({
        nodoId: l.nodoId && !l.nodoId.startsWith("static:") ? l.nodoId : undefined,
        etichetta: l.etichetta.trim(),
        slug: l.slug || slugMenuVoce(l.etichetta),
      }));
  }

  function conferma() {
    if (!areaSlug) return;
    const rami = ramiPayload();
    if (!rami.length) return;
    const postoEtichetta =
      postoMode === "select"
        ? opzioniPosto().find((o) => o.id === postoNodoId)?.etichetta ?? postoNome
        : postoNome.trim();
    if (!postoEtichetta) return;
    onConferma({
      areaSlug,
      rami,
      posto: {
        nodoId: postoMode === "select" && postoNodoId ? postoNodoId : undefined,
        etichetta: postoEtichetta,
      },
    });
  }

  if (!open) return null;
  const preview = [
    aree.find((a) => a.slug === areaSlug)?.label ?? "…",
    ...livelli.map((l) => l.etichetta || (l.mode === "crea" ? "(nuova voce)" : "…")),
    postoMode === "select"
      ? opzioniPosto().find((o) => o.id === postoNodoId)?.etichetta ?? "…"
      : postoNome.trim() || "[Nome area]",
    vistaEtichetta ? `[${vistaEtichetta}]` : "",
  ]
    .filter(Boolean)
    .join(" > ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-teal-300 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-teal-950">
              Collega al percorso di menu
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Scegli o crea ogni livello. L&apos;ultimo è il posto: se esiste già,
              questa pianta diventa un&apos;altra vista.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-950">
          {preview}
        </p>

        <div className="mt-4 space-y-4">
          <label className="block text-xs font-medium">
            1° livello — Area
            <select
              value={areaSlug}
              onChange={(e) => {
                setAreaSlug(e.target.value as AreaSlug);
                setLivelli([{ mode: "select", nodoId: "", etichetta: "", slug: "" }]);
                setPostoNodoId("");
              }}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {aree.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          {livelli.map((liv, i) => (
            <div key={i} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-xs font-medium text-slate-700">
                {i + 2}° livello — {i === 0 ? "Cartella" : "Sottocartella"}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={liv.mode === "select"}
                    onChange={() =>
                      setLivello(i, { ...liv, mode: "select", nodoId: "", etichetta: "", slug: "" })
                    }
                  />
                  Seleziona
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={liv.mode === "crea"}
                    onChange={() =>
                      setLivello(i, { ...liv, mode: "crea", nodoId: "", etichetta: "", slug: "" })
                    }
                  />
                  Crea
                </label>
              </div>
              {liv.mode === "select" ? (
                <select
                  value={liv.nodoId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const opt = opzioniLivello(i).find((o) => o.id === id);
                    setLivello(i, {
                      mode: "select",
                      nodoId: id,
                      etichetta: opt?.etichetta ?? "",
                      slug: opt?.slug ?? "",
                    });
                  }}
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Scegli voce…</option>
                  {opzioniLivello(i).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etichetta}
                      {o.virtuale ? " (menu esistente)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={liv.etichetta}
                  onChange={(e) =>
                    setLivello(i, {
                      ...liv,
                      etichetta: e.target.value,
                      slug: slugMenuVoce(e.target.value),
                    })
                  }
                  placeholder="Es. Mappa Produzione"
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setLivelli((prev) => [
                ...prev,
                { mode: "crea", nodoId: "", etichetta: "", slug: "" },
              ])
            }
            className="text-sm font-medium text-teal-800 hover:underline"
          >
            + Aggiungi un livello
          </button>

          <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2">
            <p className="text-xs font-medium text-teal-900">Ultimo livello — Posto / area</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={postoMode === "select"}
                  onChange={() => setPostoMode("select")}
                  disabled={opzioniPosto().length === 0}
                />
                Seleziona posto esistente
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={postoMode === "crea"}
                  onChange={() => setPostoMode("crea")}
                />
                Inserisci nome nuovo
              </label>
            </div>
            {postoMode === "select" ? (
              <select
                value={postoNodoId}
                onChange={(e) => setPostoNodoId(e.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Scegli posto…</option>
                {opzioniPosto().map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etichetta}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={postoNome}
                onChange={(e) => setPostoNome(e.target.value)}
                placeholder="Es. Magazzino 1"
                className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={
              busy ||
              !areaSlug ||
              ramiPayload().length === 0 ||
              (postoMode === "crea" ? !postoNome.trim() : !postoNodoId)
            }
            onClick={() => conferma()}
            className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Collegamento…" : "Collega a questo percorso"}
          </button>
        </div>
      </div>
    </div>
  );
}
