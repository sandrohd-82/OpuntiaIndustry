"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  aggiornaSchedaAction,
  aggiornaVoceAction,
  aggiungiVoceAction,
  apriAllegatoAction,
  archiviaSchedaAction,
  caricaAllegatoAction,
  caricaCopertinaAction,
  commentaAction,
  creaChecklistAction,
  dettaglioSchedaAction,
  reagisciAction,
  salvaEtichettaAction,
  togliAllegatoAction,
  toggleEtichettaSchedaAction,
  toggleMembroAction,
  toggleSeguiAction,
} from "@/app/actions/kanban";
import { syncSchedaTrelloAction } from "@/app/actions/trello-utente";
import {
  KB_ANTICIPI,
  KB_COLORI,
  KB_REAZIONI,
  classeScadenza,
  coloreHex,
  formatQuando,
  iniziali,
  statoScadenza,
  type KbBachecaPayload,
  type KbCommento,
  type KbStoricoRiga,
} from "@/lib/kanban/types";

function daLocale(value: string): string | null {
  if (!value) return null;
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString();
}

function aLocale(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

function testoRicco(testo: string) {
  const righe = testo.split("\n");
  return righe.map((riga, index) => {
    const pezzi = riga.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
    return (
      <p key={`${index}-${riga}`} className="min-h-5 whitespace-pre-wrap">
        {pezzi.map((pezzo, i) => {
          if (pezzo.startsWith("**") && pezzo.endsWith("**")) {
            return <strong key={i}>{pezzo.slice(2, -2)}</strong>;
          }
          if (pezzo.startsWith("`") && pezzo.endsWith("`")) {
            return (
              <code key={i} className="rounded bg-slate-100 px-1">
                {pezzo.slice(1, -1)}
              </code>
            );
          }
          const link = pezzo.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
          if (link) {
            return (
              <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-[var(--primary)] underline">
                {link[1]}
              </a>
            );
          }
          return <span key={i}>{pezzo}</span>;
        })}
      </p>
    );
  });
}

export function SchedaModal({
  payload,
  schedaId,
  onClose,
  onChanged,
}: {
  payload: KbBachecaPayload;
  schedaId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const scheda = payload.schede.find((row) => row.id === schedaId);
  const [commenti, setCommenti] = useState<KbCommento[]>([]);
  const [storico, setStorico] = useState<KbStoricoRiga[]>([]);
  const [commento, setCommento] = useState("");
  const [menzioni, setMenzioni] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [notaTrello, setNotaTrello] = useState<string | null>(null);
  const [invioTrello, setInvioTrello] = useState(false);
  const [nuovaEtichetta, setNuovaEtichetta] = useState("");
  const [colore, setColore] = useState("rosso");

  useEffect(() => {
    void dettaglioSchedaAction(schedaId).then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setCommenti(res.commenti);
      setStorico(res.storico);
    });
  }, [schedaId, payload.schede]);

  if (!scheda || typeof document === "undefined") return null;
  const listeAperte = payload.liste.filter((lista) => !lista.archivedAt);
  const check = payload.checklist.filter((lista) => lista.schedaId === scheda.id);
  const allegati = payload.allegati[scheda.id] ?? [];
  const badge = statoScadenza(scheda.scadenzaAt, scheda.scadenzaCompletata);
  const badgeClass = classeScadenza(badge);

  async function dopo(ok: boolean, error?: string) {
    if (!ok) {
      setErrore(error ?? "Operazione non riuscita.");
      return;
    }
    setErrore(null);
    await onChanged();
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8" role="presentation">
      <article
        role="dialog"
        aria-modal="true"
        aria-label={scheda.titolo}
        className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-xl"
      >
        {scheda.copertinaUrl ? (
          <img src={scheda.copertinaUrl} alt="" className="h-36 w-full rounded-t-xl object-cover" />
        ) : scheda.copertinaColore ? (
          <div className="h-16 rounded-t-xl" style={{ background: coloreHex(scheda.copertinaColore) }} />
        ) : null}
        <div className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <input
              defaultValue={scheda.titolo}
              key={scheda.titolo}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value.trim() !== scheda.titolo) {
                  void aggiornaSchedaAction({ id: scheda.id, titolo: e.target.value }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }
              }}
              className="w-full text-xl font-semibold outline-none"
            />
            <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1 text-sm">
              Chiudi
            </button>
          </div>
          {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
          {notaTrello ? <p className="text-sm text-emerald-700">{notaTrello}</p> : null}
          <div className="flex flex-wrap gap-2 text-sm">
            <label>
              Lista
              <select
                value={scheda.listaId}
                onChange={(e) => {
                  void aggiornaSchedaAction({ id: scheda.id, listaId: e.target.value }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }}
                className="ml-2 rounded border border-slate-300 px-2 py-1"
              >
                {listeAperte.map((lista) => (
                  <option key={lista.id} value={lista.id}>
                    {lista.titolo}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1"
              onClick={() => {
                void aggiornaSchedaAction({ id: scheda.id, isTemplate: !scheda.isTemplate }).then((res) =>
                  dopo(res.success, res.success ? undefined : res.error)
                );
              }}
            >
              {scheda.isTemplate ? "Modello attivo" : "Rendi modello"}
            </button>
            <button
              type="button"
              disabled={invioTrello}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
              onClick={() => {
                setInvioTrello(true);
                setNotaTrello(null);
                void syncSchedaTrelloAction(scheda.id).then((res) => {
                  setInvioTrello(false);
                  if (!res.success) {
                    setErrore(res.error);
                    return;
                  }
                  setErrore(null);
                  setNotaTrello(res.creata ? "Scheda creata su Trello." : "Scheda aggiornata su Trello.");
                });
              }}
            >
              {invioTrello ? "Invio a Trello…" : "Aggiorna su Trello"}
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1"
              onClick={() => {
                void toggleSeguiAction(scheda.id).then((res) => dopo(res.success, res.success ? undefined : res.error));
              }}
            >
              {scheda.seguito ? "Smetti di seguire" : "Segui"}
            </button>
            <button
              type="button"
              className="rounded border border-red-200 px-2 py-1 text-red-700"
              onClick={() => {
                void archiviaSchedaAction(scheda.id).then((res) => {
                  if (!res.success) {
                    setErrore(res.error);
                    return;
                  }
                  onClose();
                  void onChanged();
                });
              }}
            >
              Archivia
            </button>
          </div>
          {badge ? (
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
              {badge === "completata" && "Scadenza completata"}
              {badge === "scaduta" && "Scaduta"}
              {badge === "imminente" && "In scadenza"}
              {badge === "aperta" && formatQuando(scheda.scadenzaAt)}
            </span>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold">Etichette</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {payload.etichette.map((etichetta) => {
                const attiva = scheda.etichettaIds.includes(etichetta.id);
                return (
                  <button
                    key={etichetta.id}
                    type="button"
                    onClick={() => {
                      void toggleEtichettaSchedaAction(scheda.id, etichetta.id).then((res) =>
                        dopo(res.success, res.success ? undefined : res.error)
                      );
                    }}
                    className="rounded px-2 py-0.5 text-xs text-white"
                    style={{ background: coloreHex(etichetta.colore), opacity: attiva ? 1 : 0.4 }}
                  >
                    {etichetta.nome}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={nuovaEtichetta}
                onChange={(e) => setNuovaEtichetta(e.target.value)}
                placeholder="Nuova etichetta"
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <select value={colore} onChange={(e) => setColore(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
                {KB_COLORI.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded bg-slate-800 px-2 py-1 text-sm text-white"
                onClick={() => {
                  void salvaEtichettaAction({
                    bachecaId: payload.bacheca.id,
                    nome: nuovaEtichetta,
                    colore,
                  }).then((res) => {
                    setNuovaEtichetta("");
                    void dopo(res.success, res.success ? undefined : res.error);
                  });
                }}
              >
                Aggiungi
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Membri</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {payload.operatori.map((persona) => {
                const attivo = scheda.membroIds.includes(persona.id);
                return (
                  <button
                    key={persona.id}
                    type="button"
                    title={persona.nome}
                    onClick={() => {
                      void toggleMembroAction(scheda.id, persona.id).then((res) =>
                        dopo(res.success, res.success ? undefined : res.error)
                      );
                    }}
                    className={`rounded-full px-2 py-1 text-xs ${attivo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                  >
                    {iniziali(persona.nome)} {persona.nome}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Inizio
              <input
                type="datetime-local"
                defaultValue={aLocale(scheda.inizioAt)}
                key={`i-${scheda.inizioAt ?? ""}`}
                onBlur={(e) => {
                  void aggiornaSchedaAction({ id: scheda.id, inizioAt: daLocale(e.target.value) }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Scadenza
              <input
                type="datetime-local"
                defaultValue={aLocale(scheda.scadenzaAt)}
                key={`s-${scheda.scadenzaAt ?? ""}`}
                onBlur={(e) => {
                  void aggiornaSchedaAction({ id: scheda.id, scadenzaAt: daLocale(e.target.value) }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheda.scadenzaCompletata}
                onChange={(e) => {
                  void aggiornaSchedaAction({ id: scheda.id, scadenzaCompletata: e.target.checked }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }}
              />
              Scadenza completata
            </label>
            <label className="text-sm">
              Promemoria
              <select
                value={scheda.anticipo}
                onChange={(e) => {
                  void aggiornaSchedaAction({ id: scheda.id, anticipo: e.target.value }).then((res) =>
                    dopo(res.success, res.success ? undefined : res.error)
                  );
                }}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
              >
                {KB_ANTICIPI.map((item) => (
                  <option key={item.id || "none"} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Copertina</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {KB_COLORI.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.nome}
                  onClick={() => {
                    void aggiornaSchedaAction({ id: scheda.id, copertinaColore: item.id }).then((res) =>
                      dopo(res.success, res.success ? undefined : res.error)
                    );
                  }}
                  className="h-6 w-6 rounded"
                  style={{ background: item.hex }}
                />
              ))}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const body = new FormData();
                body.set("schedaId", scheda.id);
                body.set("file", file);
                void caricaCopertinaAction(body).then((res) => dopo(res.success, res.success ? undefined : res.error));
              }}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold">Descrizione</h3>
            <p className="text-xs text-slate-500">Grassetto con **testo**, codice con `testo`, link con [testo](https://...).</p>
            <textarea
              defaultValue={scheda.descrizione}
              key={scheda.descrizione}
              rows={5}
              onBlur={(e) => {
                if (e.target.value !== scheda.descrizione) {
                  void aggiornaSchedaAction({
                    id: scheda.id,
                    descrizione: e.target.value,
                    mentionIds: menzioni,
                  }).then((res) => dopo(res.success, res.success ? undefined : res.error));
                }
              }}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-sm">{testoRicco(scheda.descrizione)}</div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Checklist</h3>
            {check.map((lista) => {
              const tot = lista.voci.length;
              const fatte = lista.voci.filter((voce) => voce.fatto).length;
              const pct = tot ? Math.round((fatte / tot) * 100) : 0;
              return (
                <div key={lista.id} className="rounded border border-slate-200 p-2">
                  <p className="text-sm font-medium">{lista.titolo}</p>
                  <div className="mt-1 h-1.5 rounded bg-slate-100">
                    <div className="h-1.5 rounded bg-emerald-600" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-slate-500">{pct}%</p>
                  <ul className="mt-2 space-y-2">
                    {lista.voci.map((voce) => (
                      <li key={voce.id} className="text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={voce.fatto}
                            onChange={(e) => {
                              void aggiornaVoceAction({ id: voce.id, fatto: e.target.checked }).then((res) =>
                                dopo(res.success, res.success ? undefined : res.error)
                              );
                            }}
                          />
                          <span className={voce.fatto ? "line-through" : ""}>{voce.testo}</span>
                        </label>
                        <div className="ml-6 mt-1 flex flex-wrap gap-2">
                          <input
                            type="datetime-local"
                            defaultValue={aLocale(voce.scadenzaAt)}
                            onBlur={(e) => {
                              void aggiornaVoceAction({ id: voce.id, scadenzaAt: daLocale(e.target.value) }).then((res) =>
                                dopo(res.success, res.success ? undefined : res.error)
                              );
                            }}
                            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                          />
                          <select
                            value={voce.assegnatoId ?? ""}
                            onChange={(e) => {
                              void aggiornaVoceAction({ id: voce.id, assegnatoId: e.target.value || null }).then((res) =>
                                dopo(res.success, res.success ? undefined : res.error)
                              );
                            }}
                            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                          >
                            <option value="">Nessuno</option>
                            {payload.operatori.map((persona) => (
                              <option key={persona.id} value={persona.id}>
                                {persona.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      const testo = String(data.get("voce") ?? "");
                      e.currentTarget.reset();
                      void aggiungiVoceAction(lista.id, testo).then((res) =>
                        dopo(res.success, res.success ? undefined : res.error)
                      );
                    }}
                  >
                    <input name="voce" placeholder="Aggiungi voce" className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm" />
                    <button type="submit" className="text-sm underline">
                      Aggiungi
                    </button>
                  </form>
                </div>
              );
            })}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                e.currentTarget.reset();
                void creaChecklistAction(scheda.id, String(data.get("titolo") ?? "")).then((res) =>
                  dopo(res.success, res.success ? undefined : res.error)
                );
              }}
            >
              <input name="titolo" placeholder="Nuova checklist" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
              <button type="submit" className="rounded bg-slate-800 px-2 py-1 text-sm text-white">
                Crea
              </button>
            </form>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Allegati</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {allegati.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-left underline"
                    onClick={() => {
                      void apriAllegatoAction(file.id).then((res) => {
                        if (!res.success) {
                          setErrore(res.error);
                          return;
                        }
                        window.open(res.url, "_blank", "noopener,noreferrer");
                      });
                    }}
                  >
                    {file.fileName}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-700"
                    onClick={() => {
                      void togliAllegatoAction(file.id).then((res) => dopo(res.success, res.success ? undefined : res.error));
                    }}
                  >
                    Togli
                  </button>
                </li>
              ))}
            </ul>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-2 text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const body = new FormData();
                body.set("schedaId", scheda.id);
                body.set("file", file);
                void caricaAllegatoAction(body).then((res) => dopo(res.success, res.success ? undefined : res.error));
              }}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold">Commenti</h3>
            <ul className="mt-2 space-y-2">
              {commenti.map((nota) => (
                <li key={nota.id} className="rounded bg-slate-50 px-2 py-2 text-sm">
                  <p className="text-xs text-slate-500">
                    {nota.autore} · {formatQuando(nota.createdAt)}
                  </p>
                  <div>{testoRicco(nota.testo)}</div>
                  <div className="mt-1 flex gap-1">
                    {KB_REAZIONI.map((emoji) => {
                      const n = nota.reazioni.filter((r) => r.emoji === emoji).length;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className="rounded border border-slate-200 px-1 text-xs"
                          onClick={() => {
                            void reagisciAction(nota.id, emoji).then((res) =>
                              dopo(res.success, res.success ? undefined : res.error)
                            );
                          }}
                        >
                          {emoji} {n || ""}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-2 block text-xs text-slate-500">
              Menziona
              <select
                className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  const persona = payload.operatori.find((row) => row.id === id);
                  if (!persona) return;
                  setCommento((prev) => `${prev}@${persona.nome} `);
                  setMenzioni((prev) => (prev.includes(id) ? prev : [...prev, id]));
                }}
              >
                <option value="">Scegli un operatore</option>
                {payload.operatori.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.nome}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              value={commento}
              onChange={(e) => setCommento(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Commento"
            />
            <button
              type="button"
              className="mt-2 rounded bg-[var(--primary)] px-3 py-1.5 text-sm text-white"
              onClick={() => {
                void commentaAction({ schedaId: scheda.id, testo: commento, mentionIds: menzioni }).then((res) => {
                  if (!res.success) {
                    setErrore(res.error);
                    return;
                  }
                  setCommento("");
                  setMenzioni([]);
                  void dopo(true);
                });
              }}
            >
              Pubblica
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Attività</h3>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {storico.map((riga) => (
                <li key={riga.id}>
                  {formatQuando(riga.createdAt)} — {riga.summary}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>,
    document.body
  );
}
