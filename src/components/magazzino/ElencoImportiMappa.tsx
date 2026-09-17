"use client";

import {
  formattaLunghezzaReale,
  formattaQuadrati,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";
import {
  dettaglioAngoliImporto,
  dettaglioLatiImporto,
  etichettaAsseOrigine,
  type MappaRiferimentoGruppo,
} from "@/lib/magazzino/riferimenti";

export function ElencoImportiMappa({
  importi,
  selectedId,
  griglia,
  scalaValore,
  scalaUnita,
  canEdit,
  onSelect,
  onModifica,
  onElimina,
  onCambiaDest,
  onCambiaPunto,
  onEliminaPunto,
}: {
  importi: MappaRiferimentoGruppo[];
  selectedId: string | null;
  griglia: number;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onModifica: (id: string) => void;
  onElimina: (id: string) => void;
  onCambiaDest: (
    id: string,
    patch: { xQ?: number; yQ?: number; wQ?: number; hQ?: number }
  ) => void;
  onCambiaPunto: (
    gruppoId: string,
    puntoId: string,
    patch: { etichetta?: string; offsetQuadrati?: number }
  ) => void;
  onEliminaPunto: (gruppoId: string, puntoId: string) => void;
}) {
  const g = Math.max(griglia, 1);

  if (importi.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-3 py-3 text-sm text-amber-950">
        Nessun importo da altre viste. Usa «Importa da vista»: resta qui in elenco
        provvisorio finché non salvi la bozza. Ogni riga si può modificare o
        togliere.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-3 py-2">
        <p className="text-sm font-semibold text-amber-950">
          Importi provvisori
        </p>
        <p className="text-xs text-amber-900">
          {importi.length} importazione{importi.length === 1 ? "" : "i"} · clic
          sulla riga per vederla sul disegno. Le modifiche restano in bozza
          finché non salvi.
        </p>
      </div>
      <ul>
        {importi.map((imp, i) => {
          const sel = imp.id === selectedId;
          const wq = imp.destWidth / g;
          const hq = imp.destHeight / g;
          const xq = imp.destX / g;
          const yq = imp.destY / g;
          const angoli = dettaglioAngoliImporto(imp);
          const lati = dettaglioLatiImporto(imp);
          return (
            <li
              key={imp.id}
              className={`border-t border-amber-200 ${
                sel ? "bg-orange-100" : "bg-white"
              }`}
            >
              <div
                className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2"
                onClick={() => onSelect(imp.id)}
              >
                <span className="text-xs font-semibold text-amber-900">
                  #{i + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                  {imp.mappaOrigineEtichetta || "Vista origine"}
                </span>
                <span className="text-xs text-slate-600">
                  {etichettaAsseOrigine(imp.asseOrigine)} ·{" "}
                  {formattaQuadrati(wq)} × {formattaQuadrati(hq)} q ·{" "}
                  {imp.punti.length} porzioni
                </span>
                <span
                  className="flex shrink-0 gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onModifica(imp.id)}
                    className="text-sm font-medium text-teal-800 hover:underline"
                  >
                    {sel ? "Chiudi" : "Modifica"}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onElimina(imp.id)}
                      className="text-sm font-medium text-rose-800 hover:underline"
                    >
                      Elimina
                    </button>
                  ) : null}
                </span>
              </div>

              {sel ? (
                <div className="space-y-3 border-t border-amber-200 bg-amber-50/80 px-3 py-3">
                  {canEdit ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs">
                        X (q)
                        <input
                          type="number"
                          step="0.1"
                          value={Number(xq.toFixed(1))}
                          onChange={(e) =>
                            onCambiaDest(imp.id, {
                              xQ: Number(e.target.value),
                            })
                          }
                          className="ml-1 w-20 rounded border border-amber-400 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Y (q)
                        <input
                          type="number"
                          step="0.1"
                          value={Number(yq.toFixed(1))}
                          onChange={(e) =>
                            onCambiaDest(imp.id, {
                              yQ: Number(e.target.value),
                            })
                          }
                          className="ml-1 w-20 rounded border border-amber-400 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Larghezza (q)
                        <input
                          type="number"
                          min={1}
                          step="0.1"
                          value={Number(Math.max(1, wq).toFixed(1))}
                          onChange={(e) =>
                            onCambiaDest(imp.id, {
                              wQ: Number(e.target.value),
                            })
                          }
                          className="ml-1 w-20 rounded border border-amber-400 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Altezza (q)
                        <input
                          type="number"
                          min={1}
                          step="0.1"
                          value={Number(Math.max(1, hq).toFixed(1))}
                          onChange={(e) =>
                            onCambiaDest(imp.id, {
                              hQ: Number(e.target.value),
                            })
                          }
                          className="ml-1 w-20 rounded border border-amber-400 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold text-amber-950">
                      Angoli e lati
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-950">
                      {angoli.map((a) => (
                        <li key={`${imp.id}-ang-${a.n}`}>{a.testo}</li>
                      ))}
                      {lati.map((l) => (
                        <li key={`${imp.id}-lato-${l.da}-${l.a}`}>{l.testo}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-amber-950">
                      Porzioni sull&apos;asse
                    </p>
                    {imp.punti.length === 0 ? (
                      <p className="mt-1 text-xs text-amber-900">
                        Nessun estremo o punto extra su questa importazione.
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {imp.punti.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            {canEdit ? (
                              <>
                                <input
                                  value={p.etichetta}
                                  onChange={(e) =>
                                    onCambiaPunto(imp.id, p.id, {
                                      etichetta: e.target.value,
                                    })
                                  }
                                  className="min-w-[12rem] flex-1 rounded border border-amber-300 bg-white px-1.5 py-0.5"
                                />
                                <label className="flex items-center gap-1">
                                  offset
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    value={p.offsetQuadrati}
                                    onChange={(e) =>
                                      onCambiaPunto(imp.id, p.id, {
                                        offsetQuadrati: Number(e.target.value),
                                      })
                                    }
                                    className="w-16 rounded border border-amber-300 bg-white px-1.5 py-0.5"
                                  />
                                  q
                                </label>
                                <button
                                  type="button"
                                  onClick={() => onEliminaPunto(imp.id, p.id)}
                                  className="text-rose-800 hover:underline"
                                >
                                  Elimina porzione
                                </button>
                              </>
                            ) : (
                              <span>
                                {p.etichetta} · {formattaQuadrati(p.offsetQuadrati)}{" "}
                                q ·{" "}
                                {formattaLunghezzaReale(
                                  p.offsetQuadrati,
                                  scalaValore,
                                  scalaUnita
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
