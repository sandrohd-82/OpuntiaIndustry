"use client";

import { useEffect, useState } from "react";
import { listAreeOperativeMappaAction } from "@/app/actions/magazzino-mappa";
import type { AreaOperativaMappa } from "@/lib/magazzino/mappa";

export function CollegaAdAreaModal({
  open,
  busy,
  error,
  vistaEtichetta,
  nomeProposto,
  onClose,
  onConferma,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  vistaEtichetta: string;
  nomeProposto: string;
  onClose: () => void;
  onConferma: (input: {
    modo: "esistente" | "nuova";
    nodoId?: string;
    nomeNuova?: string;
  }) => void;
}) {
  const [modo, setModo] = useState<"esistente" | "nuova">("esistente");
  const [nodoId, setNodoId] = useState("");
  const [nomeNuova, setNomeNuova] = useState(nomeProposto);
  const [aree, setAree] = useState<AreaOperativaMappa[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setModo("esistente");
    setNodoId("");
    setNomeNuova(nomeProposto);
    setLoadError(null);
    void listAreeOperativeMappaAction().then((res) => {
      if (!res.success) {
        setLoadError(res.error);
        return;
      }
      const items = res.items.filter((a) => a.nodoId);
      setAree(items);
      if (items.length === 0) setModo("nuova");
    });
  }, [open, nomeProposto]);

  if (!open) return null;
  const scelta = aree.find((a) => a.nodoId === nodoId) ?? null;
  const canOk =
    modo === "nuova" ? Boolean(nomeNuova.trim()) : Boolean(nodoId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-teal-300 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-teal-950">
              Collega ad area
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              L&apos;area è la cartella operativa (root) di questo magazzino.
              Questo foglio ({vistaEtichetta || "vista"}) si unisce agli altri
              fogli già dentro: da quel momento i posti si condividono e in
              Dentro compariranno le aree degli altri fogli. Il percorso URL si
              crea a parte, con «Crea percorso».
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

        {error || loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error || loadError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={modo === "esistente"}
              onChange={() => setModo("esistente")}
              disabled={aree.length === 0}
            />
            Area già presente
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={modo === "nuova"}
              onChange={() => setModo("nuova")}
            />
            Prima area (primo foglio)
          </label>
        </div>

        {modo === "esistente" ? (
          <label className="mt-3 block text-xs font-medium">
            Area
            <select
              value={nodoId}
              onChange={(e) => setNodoId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Scegli l&apos;area…</option>
              {aree.map((a) => (
                <option key={a.nodoId} value={a.nodoId}>
                  {a.nome}
                  {a.fogli.length
                    ? ` · ${a.fogli.length} fogl${a.fogli.length === 1 ? "io" : "i"}`
                    : " · vuota"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="mt-3 block text-xs font-medium">
            Nome della nuova area
            <input
              value={nomeNuova}
              onChange={(e) => setNomeNuova(e.target.value)}
              placeholder="Es. Magazzino 1"
              maxLength={120}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        )}

        {scelta ? (
          <div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-950">
            <p className="font-medium">Fogli già in «{scelta.nome}»</p>
            {scelta.fogli.length === 0 ? (
              <p className="mt-1 text-xs">Nessun foglio ancora. Questo sarà il primo.</p>
            ) : (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {scelta.fogli.map((f) => (
                  <li key={f.mappaId}>
                    {f.vista} · {f.stato}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

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
            disabled={busy || !canOk}
            onClick={() =>
              onConferma(
                modo === "esistente"
                  ? { modo: "esistente", nodoId }
                  : { modo: "nuova", nomeNuova: nomeNuova.trim() }
              )
            }
            className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Collegamento…" : "Collega questo foglio"}
          </button>
        </div>
      </div>
    </div>
  );
}
