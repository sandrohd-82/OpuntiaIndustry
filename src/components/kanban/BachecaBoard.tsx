"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  archiviaListaAction,
  archiviaSchedaAction,
  archiviaTutteSchedeAction,
  creaDaModelloAction,
  creaListaAction,
  creaSchedaAction,
  creaSchedeBulkAction,
  duplicaListaAction,
  getBachecaAction,
  ordinaSchedeListaAction,
  purgaSchedaAction,
  rinominaListaAction,
  salvaOrdineAction,
  spostaTutteSchedeAction,
  toggleEtichetteEsteseAction,
} from "@/app/actions/kanban";
import { SchedaModal } from "@/components/kanban/SchedaModal";
import {
  classeScadenza,
  coloreHex,
  formatQuando,
  iniziali,
  statoScadenza,
  type KbBachecaPayload,
  type KbScheda,
} from "@/lib/kanban/types";

type Drag =
  | { kind: "card"; id: string; from: string }
  | { kind: "list"; id: string }
  | null;

export function BachecaBoard({
  boardId,
  schedaIniziale,
}: {
  boardId: string;
  schedaIniziale: string | null;
}) {
  const [payload, setPayload] = useState<KbBachecaPayload | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [aperta, setAperta] = useState<string | null>(schedaIniziale);
  const [archivio, setArchivio] = useState(false);
  const [nuovaLista, setNuovaLista] = useState("");
  const [bulkLista, setBulkLista] = useState<string | null>(null);
  const [bulkTesto, setBulkTesto] = useState("");
  const [modelloLista, setModelloLista] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    const res = await getBachecaAction(boardId);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setPayload(res.payload);
    setErrore(null);
  }, [boardId]);

  useEffect(() => {
    void ricarica();
  }, [ricarica]);

  if (!payload) {
    return <p className="p-6 text-sm text-slate-500">{errore ?? "Caricamento bacheca…"}</p>;
  }

  const liste = payload.liste
    .filter((lista) => !lista.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const modelli = payload.schede.filter((scheda) => scheda.isTemplate && !scheda.archivedAt);

  function schedeDi(listaId: string) {
    return payload!.schede
      .filter((scheda) => scheda.listaId === listaId && !scheda.archivedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function persisti(nextListe: string[], nextSchede: { id: string; listaId: string }[], spostata?: Drag & { kind: "card" }) {
    const prima = payload!.schede.find((scheda) => scheda.id === spostata?.id);
    let spostataPayload: { id: string; daLista: string; aLista: string } | undefined;
    if (spostata && prima && prima.listaId === spostata.from) {
      spostataPayload = {
        id: spostata.id,
        daLista: spostata.from,
        aLista: nextSchede.find((row) => row.id === spostata.id)?.listaId ?? spostata.from,
      };
    }
    const res = await salvaOrdineAction({
      bachecaId: payload!.bacheca.id,
      liste: nextListe,
      schede: nextSchede,
      spostata: spostataPayload,
    });
    if (!res.success) setErrore(res.error);
    await ricarica();
  }

  function spostaScheda(cardId: string, listaId: string, primaDi?: string) {
    if (!payload) return;
    const schede = payload.schede.map((scheda) => ({ ...scheda }));
    const card = schede.find((scheda) => scheda.id === cardId);
    if (!card) return;
    const from = card.listaId;
    card.listaId = listaId;
    const colonne = liste.map((lista) =>
      schede
        .filter((scheda) => scheda.listaId === lista.id && !scheda.archivedAt && scheda.id !== cardId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
    const indiceLista = liste.findIndex((lista) => lista.id === listaId);
    const colonna = colonne[indiceLista] ?? [];
    const pos = primaDi ? colonna.findIndex((scheda) => scheda.id === primaDi) : colonna.length;
    colonna.splice(pos < 0 ? colonna.length : pos, 0, card);
    colonne[indiceLista] = colonna;
    const flat: { id: string; listaId: string }[] = [];
    liste.forEach((lista, index) => {
      for (const scheda of colonne[index] ?? []) flat.push({ id: scheda.id, listaId: lista.id });
    });
    for (const scheda of schede) {
      if (scheda.archivedAt) flat.push({ id: scheda.id, listaId: scheda.listaId });
    }
    setPayload({
      ...payload,
      schede: schede.map((scheda) => {
        const index = flat.findIndex((row) => row.id === scheda.id);
        return index < 0 ? scheda : { ...scheda, sortOrder: index, listaId: flat[index].listaId };
      }),
    });
    void persisti(liste.map((lista) => lista.id), flat, { kind: "card", id: cardId, from });
  }

  function spostaLista(listaId: string, primaDi: string) {
    const ordine = liste.map((lista) => lista.id).filter((id) => id !== listaId);
    const pos = ordine.indexOf(primaDi);
    ordine.splice(pos < 0 ? ordine.length : pos, 0, listaId);
    const tutte = [
      ...ordine,
      ...payload!.liste.filter((lista) => lista.archivedAt).map((lista) => lista.id),
    ];
    setPayload({
      ...payload!,
      liste: payload!.liste.map((lista) => ({
        ...lista,
        sortOrder: tutte.indexOf(lista.id),
      })),
    });
    const schede = payload!.schede.map((scheda) => ({ id: scheda.id, listaId: scheda.listaId }));
    void persisti(tutte, schede);
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Link href="/app/promemorie-e-note/bacheche" className="text-sm text-slate-500 underline">
          Bacheche
        </Link>
        <h2 className="text-lg font-semibold">{payload.bacheca.titolo}</h2>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          onClick={() => {
            void toggleEtichetteEsteseAction(payload.bacheca.id, !payload.bacheca.etichetteEstese).then(() => ricarica());
          }}
        >
          Etichette {payload.bacheca.etichetteEstese ? "estese" : "compatte"}
        </button>
        <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => setArchivio(true)}>
          Elementi archiviati
        </button>
      </div>
      {errore ? <p className="px-4 py-2 text-sm text-red-700">{errore}</p> : null}
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {liste.map((lista) => {
          const cards = schedeDi(lista.id);
          return (
            <section
              key={lista.id}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag?.kind === "card") spostaScheda(drag.id, lista.id);
                if (drag?.kind === "list") spostaLista(drag.id, lista.id);
                setDrag(null);
              }}
            >
              <header
                className="flex items-center gap-1 p-2"
                draggable
                onDragStart={() => setDrag({ kind: "list", id: lista.id })}
              >
                <input
                  defaultValue={lista.titolo}
                  key={lista.titolo}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== lista.titolo) {
                      void rinominaListaAction(lista.id, e.target.value).then(() => ricarica());
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded px-2 text-lg leading-none">⋯</summary>
                  <div className="absolute right-0 z-10 w-52 rounded border border-slate-200 bg-white p-1 text-xs shadow">
                    <button type="button" className="block w-full px-2 py-1 text-left hover:bg-slate-50" onClick={() => void ordinaSchedeListaAction(lista.id, "scadenza").then(() => ricarica())}>
                      Ordina per scadenza
                    </button>
                    <button type="button" className="block w-full px-2 py-1 text-left hover:bg-slate-50" onClick={() => void ordinaSchedeListaAction(lista.id, "nome").then(() => ricarica())}>
                      Ordina per nome
                    </button>
                    <label className="block px-2 py-1">
                      Sposta tutte in
                      <select
                        className="mt-1 w-full rounded border border-slate-200"
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          void spostaTutteSchedeAction(lista.id, e.target.value).then(() => ricarica());
                        }}
                      >
                        <option value="">Scegli lista</option>
                        {liste
                          .filter((altra) => altra.id !== lista.id)
                          .map((altra) => (
                            <option key={altra.id} value={altra.id}>
                              {altra.titolo}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="button" className="block w-full px-2 py-1 text-left hover:bg-slate-50" onClick={() => void archiviaTutteSchedeAction(lista.id).then(() => ricarica())}>
                      Archivia tutte le schede
                    </button>
                    <button type="button" className="block w-full px-2 py-1 text-left hover:bg-slate-50" onClick={() => void duplicaListaAction(lista.id).then(() => ricarica())}>
                      Duplica lista
                    </button>
                    <button type="button" className="block w-full px-2 py-1 text-left text-red-700 hover:bg-slate-50" onClick={() => void archiviaListaAction(lista.id).then(() => ricarica())}>
                      Archivia lista
                    </button>
                  </div>
                </details>
              </header>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {cards.map((scheda) => (
                  <Card
                    key={scheda.id}
                    scheda={scheda}
                    payload={payload}
                    onOpen={() => setAperta(scheda.id)}
                    onDragStart={() => setDrag({ kind: "card", id: scheda.id, from: lista.id })}
                    onDropBefore={() => {
                      if (drag?.kind === "card") spostaScheda(drag.id, lista.id, scheda.id);
                      setDrag(null);
                    }}
                  />
                ))}
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    e.currentTarget.reset();
                    void creaSchedaAction(lista.id, String(data.get("titolo") ?? "")).then((res) => {
                      if (!res.success) setErrore(res.error);
                      else void ricarica();
                    });
                  }}
                >
                  <input name="titolo" placeholder="Aggiungi scheda" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm" />
                </form>
                <button type="button" className="text-left text-xs text-slate-600 underline" onClick={() => setBulkLista(lista.id)}>
                  Più schede
                </button>
                <button type="button" className="text-left text-xs text-slate-600 underline" onClick={() => setModelloLista(lista.id)}>
                  Crea da modello
                </button>
              </div>
            </section>
          );
        })}
        <form
          className="w-72 shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            void creaListaAction(payload.bacheca.id, nuovaLista).then((res) => {
              if (!res.success) setErrore(res.error);
              else {
                setNuovaLista("");
                void ricarica();
              }
            });
          }}
        >
          <input
            value={nuovaLista}
            onChange={(e) => setNuovaLista(e.target.value)}
            placeholder="Aggiungi lista"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </form>
      </div>

      {aperta ? (
        <SchedaModal
          payload={payload}
          schedaId={aperta}
          onClose={() => setAperta(null)}
          onChanged={ricarica}
        />
      ) : null}

      {bulkLista ? (
        <Pannello titolo="Più schede" onClose={() => setBulkLista(null)}>
          <p className="text-sm text-slate-600">Un titolo per riga.</p>
          <textarea value={bulkTesto} onChange={(e) => setBulkTesto(e.target.value)} rows={8} className="mt-2 w-full rounded border border-slate-300 p-2 text-sm" />
          <button
            type="button"
            className="mt-2 rounded bg-[var(--primary)] px-3 py-1.5 text-sm text-white"
            onClick={() => {
              void creaSchedeBulkAction(bulkLista, bulkTesto).then((res) => {
                if (!res.success) setErrore(res.error);
                else {
                  setBulkTesto("");
                  setBulkLista(null);
                  void ricarica();
                }
              });
            }}
          >
            Crea
          </button>
        </Pannello>
      ) : null}

      {modelloLista ? (
        <Pannello titolo="Crea da modello" onClose={() => setModelloLista(null)}>
          {modelli.length === 0 ? <p className="text-sm">Nessun modello. Apri una scheda e scegli «Rendi modello».</p> : null}
          <ul className="space-y-1">
            {modelli.map((modello) => (
              <li key={modello.id}>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => {
                    void creaDaModelloAction(modello.id, modelloLista).then((res) => {
                      if (!res.success) setErrore(res.error);
                      else {
                        setModelloLista(null);
                        setAperta(res.id);
                        void ricarica();
                      }
                    });
                  }}
                >
                  {modello.titolo}
                </button>
              </li>
            ))}
          </ul>
        </Pannello>
      ) : null}

      {archivio ? (
        <Pannello titolo="Elementi archiviati" onClose={() => setArchivio(false)}>
          <h3 className="text-sm font-semibold">Liste</h3>
          <ul className="mb-3 space-y-1 text-sm">
            {payload.liste
              .filter((lista) => lista.archivedAt)
              .map((lista) => (
                <li key={lista.id} className="flex justify-between gap-2">
                  <span>{lista.titolo}</span>
                  <button type="button" className="underline" onClick={() => void archiviaListaAction(lista.id, true).then(() => ricarica())}>
                    Ripristina
                  </button>
                </li>
              ))}
          </ul>
          <h3 className="text-sm font-semibold">Schede</h3>
          <ul className="space-y-1 text-sm">
            {payload.schede
              .filter((scheda) => scheda.archivedAt)
              .map((scheda) => (
                <li key={scheda.id} className="flex justify-between gap-2">
                  <span>{scheda.titolo}</span>
                  <span className="flex gap-2">
                    <button type="button" className="underline" onClick={() => void archiviaSchedaAction(scheda.id, true).then(() => ricarica())}>
                      Ripristina
                    </button>
                    <button type="button" className="text-red-700 underline" onClick={() => void purgaSchedaAction(scheda.id).then(() => ricarica())}>
                      Elimina definitivamente
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </Pannello>
      ) : null}
    </div>
  );
}

function Card({
  scheda,
  payload,
  onOpen,
  onDragStart,
  onDropBefore,
}: {
  scheda: KbScheda;
  payload: KbBachecaPayload;
  onOpen: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
}) {
  const badge = statoScadenza(scheda.scadenzaAt, scheda.scadenzaCompletata);
  const badgeClass = classeScadenza(badge);
  const pct = scheda.checkTotali ? Math.round((scheda.checkFatte / scheda.checkTotali) * 100) : 0;
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
      className="cursor-grab rounded-lg bg-white shadow-sm"
    >
      {scheda.copertinaUrl ? (
        <img src={scheda.copertinaUrl} alt="" className="h-16 w-full rounded-t-lg object-cover" />
      ) : scheda.copertinaColore ? (
        <div className="h-2 rounded-t-lg" style={{ background: coloreHex(scheda.copertinaColore) }} />
      ) : null}
      <button type="button" onClick={onOpen} className="block w-full p-2 text-left">
        <span className="flex flex-wrap gap-1">
          {scheda.etichettaIds.map((id) => {
            const etichetta = payload.etichette.find((row) => row.id === id);
            if (!etichetta) return null;
            return (
              <span
                key={id}
                className="rounded px-1.5 py-0.5 text-[10px] text-white"
                style={{ background: coloreHex(etichetta.colore) }}
              >
                {payload.bacheca.etichetteEstese ? etichetta.nome : ""}
              </span>
            );
          })}
        </span>
        <span className="mt-1 block text-sm font-medium text-slate-900">
          {scheda.isTemplate ? "Modello · " : ""}
          {scheda.titolo}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2">
          {badge ? (
            <span className={`rounded px-1 py-0.5 text-[10px] ${badgeClass}`}>{formatQuando(scheda.scadenzaAt)}</span>
          ) : (
            <span />
          )}
          <span className="flex -space-x-1">
            {scheda.membroIds.slice(0, 3).map((id) => {
              const persona = payload.operatori.find((row) => row.id === id);
              return (
                <span key={id} title={persona?.nome} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[9px] text-white">
                  {iniziali(persona?.nome ?? "?")}
                </span>
              );
            })}
          </span>
        </span>
        {scheda.checkTotali ? (
          <span className="mt-1 block">
            <span className="block h-1 rounded bg-slate-100">
              <span className="block h-1 rounded bg-emerald-600" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[10px] text-slate-500">{pct}%</span>
          </span>
        ) : null}
      </button>
    </article>
  );
}

function Pannello({
  titolo,
  onClose,
  children,
}: {
  titolo: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{titolo}</h3>
          <button type="button" onClick={onClose} className="text-sm underline">
            Chiudi
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
