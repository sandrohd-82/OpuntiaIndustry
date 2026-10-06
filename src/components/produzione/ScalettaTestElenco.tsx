"use client";

import { useEffect, useMemo, useState } from "react";
import {
  composizioniScalettaTestAction,
  operatoreScalettaTestAction,
  type ScalettaComposizione,
} from "@/app/actions/scaletta-produzione";
import {
  SCALETTA_TIPO_LABEL,
  type ScalettaImpegno,
  type ScalettaTipoImpegno,
} from "@/lib/amministrazione/scaletta-produzione";
import {
  buildScalettaTestGruppi,
  dichiaraCompleta,
  giorniToccati,
  gruppoVisibile,
  madreCompletabile,
  prendiInCarico,
  SCALETTA_TEST_STATO_LABEL,
  statoInizialeNodo,
  type ScalettaTestGruppo,
  type ScalettaTestNodo,
  type ScalettaTestStato,
} from "@/lib/amministrazione/scaletta-test";

type Presa = {
  gruppoKey: string;
  nodoId: string;
  codice: string;
  etichettaTipo: string;
};

function classeStato(stato: ScalettaTestStato): string {
  if (stato === "in_esecuzione") return "bg-teal-50 text-teal-900";
  if (stato === "completata") return "bg-emerald-50 text-emerald-900";
  if (stato === "attesa") return "bg-amber-50 text-amber-950";
  if (stato === "da_prendere") return "bg-sky-50 text-sky-900";
  return "bg-slate-100 text-slate-600";
}

function classeTipo(tipo: ScalettaTipoImpegno): string {
  if (tipo === "lavorazione") return "bg-emerald-100 text-emerald-900";
  if (tipo === "confezionamento") return "bg-sky-100 text-sky-900";
  if (tipo === "trasformazione") return "bg-violet-100 text-violet-900";
  return "bg-slate-100 text-slate-700";
}

function Composizione({
  codice,
  voci,
}: {
  codice: string;
  voci: Record<string, ScalettaComposizione>;
}) {
  if (!codice) {
    return (
      <p className="text-xs text-slate-500">
        Nessun processo collegato: la composizione non è disponibile.
      </p>
    );
  }
  const voce = voci[codice];
  if (!voce) {
    return (
      <p className="text-xs text-slate-500">Composizione di {codice}…</p>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold text-slate-800">
        Composizione {voce.codice}
        {voce.nome ? ` · ${voce.nome}` : ""}
      </p>
      {voce.passi.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Il processo non ha attività interne.
        </p>
      ) : (
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-700">
          {voce.passi.map((passo, index) => (
            <li key={`${passo.codice}-${index}`}>
              {passo.nome}
              {passo.codice ? ` (${passo.codice})` : ""}
              {passo.obbligatorio ? "" : " · facoltativa"}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ScalettaTestElenco({
  impegni,
  needle,
  tipo,
  loading,
  giorno,
}: {
  impegni: ScalettaImpegno[];
  needle: string;
  tipo: ScalettaTipoImpegno | "tutte";
  loading: boolean;
  giorno: string | null;
}) {
  const gruppi = useMemo(() => buildScalettaTestGruppi(impegni), [impegni]);
  const visibili = useMemo(
    () =>
      gruppi.filter(
        (gruppo) =>
          (!giorno || giorniToccati(gruppo).includes(giorno)) &&
          gruppoVisibile(gruppo, needle, tipo)
      ),
    [gruppi, needle, tipo, giorno]
  );
  const [stati, setStati] = useState<Record<string, ScalettaTestStato>>({});
  const [presa, setPresa] = useState<Presa | null>(null);
  const [operatore, setOperatore] = useState({
    nome: "Operatore",
    ruolo: "Collaboratore",
  });
  const [voci, setVoci] = useState<Record<string, ScalettaComposizione>>({});

  useEffect(() => {
    void operatoreScalettaTestAction().then((res) => {
      if (res.success) setOperatore({ nome: res.nome, ruolo: res.ruolo });
    });
  }, []);

  useEffect(() => {
    const codici = [
      ...new Set(
        gruppi.flatMap((gruppo) =>
          [gruppo.madre, ...gruppo.figli]
            .map((nodo) => nodo.processoCodice)
            .filter(Boolean)
        )
      ),
    ];
    if (!codici.length) return;
    void composizioniScalettaTestAction(codici).then((res) => {
      if (!res.success) return;
      setVoci((prev) => {
        const next = { ...prev };
        for (const voce of res.voci) next[voce.codice] = voce;
        return next;
      });
    });
  }, [gruppi]);

  function statoDi(nodo: ScalettaTestNodo): ScalettaTestStato {
    return stati[nodo.id] ?? statoInizialeNodo(nodo);
  }

  function gruppoDi(key: string): ScalettaTestGruppo | undefined {
    return gruppi.find((gruppo) => gruppo.key === key);
  }

  const giorni = useMemo(() => {
    if (giorno) {
      return visibili.length
        ? ([[giorno, visibili]] as Array<[string, ScalettaTestGruppo[]]>)
        : [];
    }
    const map = new Map<string, ScalettaTestGruppo[]>();
    for (const gruppo of visibili) {
      const list = map.get(gruppo.dataGiorno) ?? [];
      list.push(gruppo);
      map.set(gruppo.dataGiorno, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibili, giorno]);

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Fase di test. Presa in carico, esecuzione e completamento restano in
        questa schermata e sono immediati. Aggiornando la pagina la sessione
        si azzera e si riparte da zero: niente viene scritto in archivio.
      </p>
      <h3 className="text-sm font-semibold">
        Lavorazioni
        {loading ? " · caricamento…" : ` · ${visibili.length}`}
      </h3>
      {giorni.length === 0 && !loading ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
          Nessuna lavorazione in questo periodo.
        </p>
      ) : null}
      {giorni.map(([day, lista]) => (
        <section
          key={day}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-white"
        >
          <header className="flex items-center justify-between bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold capitalize">
              {new Date(`${day}T12:00:00`).toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
              {lista.length}{" "}
              {lista.length === 1 ? "lavorazione" : "lavorazioni"}
            </span>
          </header>
          <ul className="divide-y divide-slate-100">
            {lista.map((gruppo) => {
              const madreStato = statoDi(gruppo.madre);
              const puoChiudereMadre =
                madreStato === "in_esecuzione" &&
                madreCompletabile(stati, gruppo);
              return (
                <li key={gruppo.key} className="px-3 py-3">
                  <NodoRiga
                    nodo={gruppo.madre}
                    stato={madreStato}
                    voci={voci}
                    puoCompletare={puoChiudereMadre}
                    onPrendi={() =>
                      setPresa({
                        gruppoKey: gruppo.key,
                        nodoId: gruppo.madre.id,
                        codice: gruppo.madre.codice,
                        etichettaTipo: "lavorazione",
                      })
                    }
                    onCompleta={() => {
                      const next = dichiaraCompleta(
                        stati,
                        gruppo,
                        gruppo.madre.id
                      );
                      if (next) setStati(next);
                    }}
                  />
                  {gruppo.figli.length ? (
                    <ul className="mt-2 space-y-2 border-l-2 border-emerald-200 pl-3">
                      {gruppo.figli.map((figlio) => {
                        const stato = statoDi(figlio);
                        return (
                          <li key={figlio.id}>
                            <NodoRiga
                              nodo={figlio}
                              stato={stato}
                              voci={voci}
                              puoCompletare={stato === "in_esecuzione"}
                              onPrendi={() =>
                                setPresa({
                                  gruppoKey: gruppo.key,
                                  nodoId: figlio.id,
                                  codice: figlio.codice,
                                  etichettaTipo:
                                    SCALETTA_TIPO_LABEL[figlio.tipo].toLowerCase(),
                                })
                              }
                              onCompleta={() => {
                                const next = dichiaraCompleta(
                                  stati,
                                  gruppo,
                                  figlio.id
                                );
                                if (next) setStati(next);
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Nessuna trasformazione né confezionamento collegati.
                    </p>
                  )}
                  {madreStato === "in_esecuzione" && !puoChiudereMadre ? (
                    <p className="mt-2 text-xs text-slate-500">
                      La lavorazione si chiude quando trasformazione, se
                      presente, e confezionamento sono completati.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {presa ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4"
          role="presentation"
          onClick={() => setPresa(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Presa in carico"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Presa in carico</h2>
            <p className="mt-3 text-sm text-slate-800">
              La {presa.etichettaTipo} n.{" "}
              <span className="font-mono font-semibold">{presa.codice}</span> è
              stata presa in carico da {operatore.nome}, {operatore.ruolo}.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPresa(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  const gruppo = gruppoDi(presa.gruppoKey);
                  if (gruppo) {
                    setStati((prev) => prendiInCarico(prev, gruppo, presa.nodoId));
                  }
                  setPresa(null);
                }}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
              >
                Sì
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NodoRiga({
  nodo,
  stato,
  voci,
  puoCompletare,
  onPrendi,
  onCompleta,
}: {
  nodo: ScalettaTestNodo;
  stato: ScalettaTestStato;
  voci: Record<string, ScalettaComposizione>;
  puoCompletare: boolean;
  onPrendi: () => void;
  onCompleta: () => void;
}) {
  const aprePresa = stato === "da_prendere" || stato === "attesa";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-xs font-semibold text-slate-700">
          {nodo.codice}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${classeTipo(nodo.tipo)}`}
        >
          {SCALETTA_TIPO_LABEL[nodo.tipo]}
        </span>
        <span className="font-mono font-medium">{nodo.numeroInterno}</span>
        {nodo.prodotto ? (
          <span className="text-slate-700">{nodo.prodotto}</span>
        ) : null}
        {nodo.cliente ? (
          <span className="text-[var(--muted)]">{nodo.cliente}</span>
        ) : null}
        {nodo.processoCodice ? (
          <span className="text-xs text-slate-500">{nodo.processoCodice}</span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${classeStato(stato)}`}
        >
          {SCALETTA_TEST_STATO_LABEL[stato]}
        </span>
        {aprePresa ? (
          <button
            type="button"
            onClick={onPrendi}
            className="ml-auto rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Prendi in carico
          </button>
        ) : null}
        {puoCompletare ? (
          <button
            type="button"
            onClick={onCompleta}
            className="ml-auto rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white"
          >
            Dichiara completa
          </button>
        ) : null}
      </div>
      <Composizione codice={nodo.processoCodice} voci={voci} />
    </div>
  );
}
