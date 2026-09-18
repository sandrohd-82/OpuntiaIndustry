"use client";

import { useEffect, useState } from "react";
import {
  listMappaMenuFigliAction,
  listMappaMenuLuoghiAction,
} from "@/app/actions/magazzino-mappa";
import {
  areePrimoLivelloMappa,
  sezioniStaticheArea,
  slugMenuVoce,
  type MappaMenuOpzione,
  type MappaMenuPercorsoCaricato,
} from "@/lib/magazzino/menu-mappa";
import type { AreaSlug } from "@/types/database";

type Livello = {
  mode: "select" | "crea";
  nodoId: string;
  etichetta: string;
  slug: string;
};

type FigliCache = Record<string, MappaMenuOpzione[]>;

type PercorsoPayload = {
  areaSlug: string;
  rami: { nodoId?: string; etichetta: string; slug?: string }[];
  posto: { nodoId?: string; etichetta: string };
};

export function CollegaMappaPercorsoModal({
  open,
  variant,
  percorsoIniziale,
  vistaEtichetta,
  luogoBozza,
  onClose,
  onConferma,
  onRinomina,
  onSposta,
  busy,
  error,
}: {
  open: boolean;
  variant: "collega" | "modifica";
  percorsoIniziale: MappaMenuPercorsoCaricato | null;
  vistaEtichetta: string;
  luogoBozza: string;
  onClose: () => void;
  onConferma: (payload: PercorsoPayload) => void;
  onRinomina: (nodi: { nodoId: string; etichetta: string }[]) => void;
  onSposta: (payload: PercorsoPayload) => void;
  busy: boolean;
  error: string | null;
}) {
  const aree = areePrimoLivelloMappa();
  const [intenzione, setIntenzione] = useState<"nomi" | "percorso">("nomi");
  const [areaSlug, setAreaSlug] = useState<AreaSlug | "">("magazzino");
  const [livelli, setLivelli] = useState<Livello[]>([
    { mode: "select", nodoId: "", etichetta: "", slug: "" },
  ]);
  const [postoMode, setPostoMode] = useState<"select" | "crea">("crea");
  const [postoNodoId, setPostoNodoId] = useState("");
  const [postoNome, setPostoNome] = useState(luogoBozza);
  const [nomiEdit, setNomiEdit] = useState<{ id: string; etichetta: string }[]>([]);
  const [figli, setFigli] = useState<FigliCache>({});
  const [luoghiCreati, setLuoghiCreati] = useState<MappaMenuOpzione[]>([]);

  function applicaIniziale() {
    const p = percorsoIniziale;
    if (!p) {
      setAreaSlug("magazzino");
      setLivelli([{ mode: "select", nodoId: "", etichetta: "", slug: "" }]);
      setPostoMode("crea");
      setPostoNodoId("");
      setPostoNome(luogoBozza);
      setNomiEdit([]);
      return;
    }
    setAreaSlug((p.areaSlug as AreaSlug) || "magazzino");
    const rami = p.nodi.filter((n) => n.tipo === "ramo");
    const posto = p.nodi.find((n) => n.tipo === "luogo");
    setLivelli(
      rami.length
        ? rami.map((n) => ({
            mode: "select" as const,
            nodoId: n.id,
            etichetta: n.etichetta,
            slug: n.slug,
          }))
        : [{ mode: "select", nodoId: "", etichetta: "", slug: "" }]
    );
    if (posto) {
      setPostoMode("select");
      setPostoNodoId(posto.id);
      setPostoNome(posto.etichetta);
    } else {
      setPostoMode("crea");
      setPostoNodoId("");
      setPostoNome(luogoBozza);
    }
    setNomiEdit(p.nodi.map((n) => ({ id: n.id, etichetta: n.etichetta })));
  }

  useEffect(() => {
    if (!open) return;
    setIntenzione(variant === "modifica" ? "percorso" : "nomi");
    setFigli({});
    setLuoghiCreati([]);
    applicaIniziale();
  }, [open, luogoBozza, percorsoIniziale, variant]);

  useEffect(() => {
    if (!open || !areaSlug) return;
    void caricaFigli(areaSlug, null);
    void listMappaMenuLuoghiAction(areaSlug).then((res) => {
      if (res.success) setLuoghiCreati(res.items);
    });
  }, [open, areaSlug]);

  useEffect(() => {
    if (!open || !areaSlug || !percorsoIniziale) return;
    for (const n of percorsoIniziale.nodi.filter((x) => x.tipo === "ramo")) {
      void caricaFigli(areaSlug, n.id);
    }
  }, [open, areaSlug, percorsoIniziale]);

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
    const byId = new Map<string, MappaMenuOpzione>();
    const last = livelli[livelli.length - 1];
    if (
      areaSlug &&
      last &&
      last.mode === "select" &&
      last.nodoId &&
      !last.nodoId.startsWith("static:")
    ) {
      const key = `${areaSlug}|${last.nodoId}`;
      for (const i of (figli[key] ?? []).filter((x) => x.tipo === "luogo")) {
        byId.set(i.id, i);
      }
    }
    for (const i of luoghiCreati) byId.set(i.id, i);
    const iniziale = percorsoIniziale?.nodi.find((n) => n.tipo === "luogo");
    if (iniziale && !byId.has(iniziale.id)) {
      byId.set(iniziale.id, {
        id: iniziale.id,
        etichetta: iniziale.etichetta,
        slug: iniziale.slug,
        tipo: "luogo",
      });
    }
    return [...byId.values()].sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it"));
  }

  function setLivello(index: number, next: Livello) {
    setLivelli((prev) => {
      const copy = prev.slice(0, index + 1);
      copy[index] = next;
      return copy;
    });
    if (next.mode === "select" && next.nodoId && !next.nodoId.startsWith("static:") && areaSlug) {
      void caricaFigli(areaSlug, next.nodoId);
    }
  }

  function aggiungiSottoLivello() {
    setIntenzione("percorso");
    setLivelli((prev) => [
      ...prev,
      { mode: "crea", nodoId: "", etichetta: "", slug: "" },
    ]);
    if (percorsoIniziale) {
      const posto = percorsoIniziale.nodi.find((n) => n.tipo === "luogo");
      if (posto) {
        setPostoMode("select");
        setPostoNodoId(posto.id);
        setPostoNome(posto.etichetta);
      }
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

  function payloadPercorso(): PercorsoPayload | null {
    if (!areaSlug) return null;
    const rami = ramiPayload();
    if (!rami.length) return null;
    const postoEtichetta =
      postoMode === "select"
        ? opzioniPosto().find((o) => o.id === postoNodoId)?.etichetta ?? postoNome
        : postoNome.trim();
    if (!postoEtichetta) return null;
    return {
      areaSlug,
      rami,
      posto: {
        nodoId: postoMode === "select" && postoNodoId ? postoNodoId : undefined,
        etichetta: postoEtichetta,
      },
    };
  }

  function confermaCollegaOSposta() {
    const payload = payloadPercorso();
    if (!payload) return;
    if (variant === "modifica") onSposta(payload);
    else onConferma(payload);
  }

  function confermaNomi() {
    if (!percorsoIniziale) return;
    onRinomina(
      nomiEdit
        .filter((n) => n.etichetta.trim())
        .map((n) => ({ nodoId: n.id, etichetta: n.etichetta.trim() }))
    );
  }

  if (!open) return null;
  const mostraNomi = variant === "modifica" && intenzione === "nomi";
  const previewNomi = [
    aree.find((a) => a.slug === (percorsoIniziale?.areaSlug ?? areaSlug))?.label ?? "…",
    ...nomiEdit.map((n) => n.etichetta.trim() || "…"),
    vistaEtichetta ? `[${vistaEtichetta}]` : "",
  ]
    .filter(Boolean)
    .join(" > ");
  const previewPercorso = [
    aree.find((a) => a.slug === areaSlug)?.label ?? "…",
    ...livelli.map((l) => l.etichetta || (l.mode === "crea" ? "(nuova voce)" : "…")),
    postoMode === "select"
      ? opzioniPosto().find((o) => o.id === postoNodoId)?.etichetta ?? "…"
      : postoNome.trim() || "[voce URL]",
    vistaEtichetta ? `[${vistaEtichetta}]` : "",
  ]
    .filter(Boolean)
    .join(" > ");
  const avvisiCondivisi = (percorsoIniziale?.nodi ?? [])
    .map((n) => {
      const edit = nomiEdit.find((e) => e.id === n.id);
      if (!edit || n.altreMappe <= 0) return null;
      if (edit.etichetta.trim() === n.etichetta) return null;
      return `«${n.etichetta}» è usata da ${n.altreMappe} ${
        n.altreMappe === 1 ? "altra pianta" : "altre piante"
      }: il nuovo nome vale per tutte.`;
    })
    .filter((x): x is string => Boolean(x));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-teal-300 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-teal-950">
              {variant === "modifica"
                ? "Modifica percorso URL di menu"
                : "Crea percorso URL di menu"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {variant === "modifica"
                ? "Questo è solo il percorso di navigazione (URL). L’area operativa (cartella dei fogli) si sceglie con «Collega ad area»."
                : "Costruisci l’indirizzo nel menu. L’ultimo livello è il nome della voce URL, non l’area operativa. Per unire i fogli alla stessa cartella usa «Collega ad area»."}
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

        {variant === "modifica" ? (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={intenzione === "nomi"}
                onChange={() => setIntenzione("nomi")}
              />
              Solo nomi
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={intenzione === "percorso"}
                onChange={() => setIntenzione("percorso")}
              />
              Sotto-livelli e percorso
            </label>
          </div>
        ) : null}

        <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-950">
          {mostraNomi ? previewNomi : previewPercorso}
        </p>

        {mostraNomi ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-600">
              1° livello —{" "}
              {aree.find((a) => a.slug === percorsoIniziale?.areaSlug)?.label ?? "Area"}{" "}
              (fisso)
            </p>
            {nomiEdit.map((n, i) => {
              const meta = percorsoIniziale?.nodi.find((x) => x.id === n.id);
              return (
                <label key={n.id} className="block text-xs font-medium">
                  {i + 2}° livello — {meta?.tipo === "luogo" ? "Posto" : "Cartella"}
                  <input
                    value={n.etichetta}
                    onChange={(e) =>
                      setNomiEdit((prev) =>
                        prev.map((x) =>
                          x.id === n.id ? { ...x, etichetta: e.target.value } : x
                        )
                      )
                    }
                    maxLength={120}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-normal"
                  />
                </label>
              );
            })}
            {avvisiCondivisi.map((a) => (
              <p
                key={a}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                {a}
              </p>
            ))}
            <button
              type="button"
              onClick={() => aggiungiSottoLivello()}
              className="text-sm font-medium text-teal-800 hover:underline"
            >
              + Aggiungi sotto-livello
            </button>
          </div>
        ) : (
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
                        setLivello(i, {
                          ...liv,
                          mode: "select",
                          nodoId: "",
                          etichetta: "",
                          slug: "",
                        })
                      }
                    />
                    Sotto-livello esistente
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={liv.mode === "crea"}
                      onChange={() =>
                        setLivello(i, {
                          ...liv,
                          mode: "crea",
                          nodoId: "",
                          etichetta: "",
                          slug: "",
                        })
                      }
                    />
                    Nuovo sotto-livello
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => aggiungiSottoLivello()}
                className="text-sm font-medium text-teal-800 hover:underline"
              >
                + Aggiungi sotto-livello
              </button>
              {livelli.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setLivelli((prev) => prev.slice(0, -1))}
                  className="text-sm text-slate-600 hover:underline"
                >
                  Rimuovi ultimo sotto-livello
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-600">
              Puoi accodare più sotto-livelli. In fondo il nome della voce URL
              (slug), non la cartella operativa dei fogli.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-800">
                Ultimo livello — Nome voce URL
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={postoMode === "select"}
                    onChange={() => setPostoMode("select")}
                    disabled={opzioniPosto().length === 0}
                  />
                  Voce URL già creata
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={postoMode === "crea"}
                    onChange={() => setPostoMode("crea")}
                  />
                  Nuova voce URL
                </label>
              </div>
              {postoMode === "select" &&
              livelli.some((l) => l.mode === "crea" && l.etichetta.trim()) ? (
                <p className="mt-2 text-xs text-teal-900">
                  L&apos;area creata verrà spostata sotto il nuovo sotto-livello.
                </p>
              ) : null}
              {postoMode === "select" ? (
                <select
                  value={postoNodoId}
                  onChange={(e) => setPostoNodoId(e.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Scegli area creata…</option>
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
                  placeholder="Es. magazzino-1 (voce URL)"
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          {mostraNomi ? (
            <button
              type="button"
              disabled={busy || nomiEdit.some((n) => !n.etichetta.trim())}
              onClick={() => confermaNomi()}
              className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Salvataggio…" : "Salva nomi"}
            </button>
          ) : (
            <button
              type="button"
              disabled={
                busy ||
                !areaSlug ||
                ramiPayload().length === 0 ||
                (postoMode === "crea" ? !postoNome.trim() : !postoNodoId)
              }
              onClick={() => confermaCollegaOSposta()}
              className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy
                ? variant === "modifica"
                  ? "Spostamento…"
                  : "Collegamento…"
                : variant === "modifica"
                  ? "Sposta su questo URL"
                  : "Pubblica su questo URL"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
