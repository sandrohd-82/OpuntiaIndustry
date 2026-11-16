"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  creaEInviaRichiestaIngressoAction,
  listaRichiesteIngressoFornitoreAction,
  riprovaNotificaRichiestaIngressoAction,
  type RichiestaIngressoRiga,
} from "@/app/actions/richiesta-ingresso";
import {
  etichettaNotificaRichiesta,
  notificaRichiedeConfermaRecupero,
} from "@/lib/produzione/richiesta-ingresso";

const STATO: Record<string, string> = {
  aperto: "Aperto",
  in_compilazione: "In compilazione",
  in_attesa: "In attesa",
  partito: "Partito",
  arrivato: "Arrivato",
  chiuso: "Chiuso",
};

function dataIt(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function hrefProduzione(foglioId: string): string {
  return `/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso?foglio=${foglioId}`;
}

export function FornitoreDocumentiProcedure({
  fornitoreId,
  puoInviare,
}: {
  fornitoreId: string;
  puoInviare: boolean;
}) {
  const [righe, setRighe] = useState<RichiestaIngressoRiga[]>([]);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [confermaId, setConfermaId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chiaveRef = useRef<string | null>(null);
  const bloccoRef = useRef(false);
  const oraMs = Date.now();

  function ricarica() {
    startTransition(async () => {
      const res = await listaRichiesteIngressoFornitoreAction(fornitoreId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setRighe(res.righe);
    });
  }

  useEffect(() => {
    ricarica();
    // Il pannello si monta sul dettaglio di questo fornitore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornitoreId]);

  function invia() {
    if (bloccoRef.current) return;
    bloccoRef.current = true;
    if (!chiaveRef.current) chiaveRef.current = crypto.randomUUID();
    const chiave = chiaveRef.current;
    setErrore(null);
    setMessaggio(null);
    setConfermaId(null);
    startTransition(async () => {
      const res = await creaEInviaRichiestaIngressoAction({ fornitoreId, chiave });
      bloccoRef.current = false;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiaveRef.current = null;
      setMessaggio(
        res.creata
          ? `Richiesta creata. Foglio ${res.codice} disponibile nel portale. ${res.notificaEtichetta}.`
          : `Richiesta già registrata sul foglio ${res.codice}. ${res.notificaEtichetta}.`
      );
      ricarica();
    });
  }

  function riprova(richiestaId: string, confermaIncerta: boolean) {
    if (bloccoRef.current) return;
    bloccoRef.current = true;
    setErrore(null);
    setMessaggio(null);
    startTransition(async () => {
      const res = await riprovaNotificaRichiestaIngressoAction({
        richiestaId,
        confermaIncerta,
      });
      bloccoRef.current = false;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setConfermaId(null);
      setMessaggio(`${res.notificaEtichetta}. Il foglio non è stato ricreato.`);
      ricarica();
    });
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-white p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Documenti e procedure
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Da qui si assegna Materiale in ingresso. Il fornitore vede il foglio nel
        portale e compila le voci già operative. La mail avvisa soltanto: non
        risulta letta solo perché è partita. Un esito incerto non parte di nuovo
        da solo.
      </p>
      {puoInviare ? (
        <button
          type="button"
          disabled={pending}
          onClick={invia}
          className="mb-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Crea e invia Materiale in ingresso
        </button>
      ) : null}
      {messaggio ? <p className="mb-3 text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="mb-3 text-sm text-red-700">{errore}</p> : null}
      {righe.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nessuna richiesta assegnata.</p>
      ) : (
        <ul className="space-y-3">
          {righe.map((riga) => {
            const richiestaId = riga.richiestaId;
            const etichetta = riga.notificaStato
              ? etichettaNotificaRichiesta(riga.notificaStato, {
                  lockAt: riga.notificaLockAt,
                  oraMs,
                })
              : null;
            const recupero =
              Boolean(richiestaId) &&
              riga.notificaStato != null &&
              notificaRichiedeConfermaRecupero({
                stato: riga.notificaStato,
                lockAt: riga.notificaLockAt,
                oraMs,
              });
            const riprovaCerta =
              richiestaId != null &&
              (riga.notificaStato === "fallita" || riga.notificaStato === "non_inviata");
            return (
              <li key={richiestaId ?? riga.foglioId} className="text-sm">
                <a
                  href={hrefProduzione(riga.foglioId)}
                  className="font-medium text-sky-800 hover:underline"
                >
                  {riga.codice}
                </a>
                <span className="text-slate-600">
                  {" "}
                  · {STATO[riga.statoFoglio] ?? riga.statoFoglio}
                </span>
                {riga.legacy ? (
                  <p className="text-slate-500">
                    Foglio già presente, senza invio da questa scheda. Creato il{" "}
                    {dataIt(riga.createdAt)}.
                  </p>
                ) : (
                  <p className="text-slate-600">
                    Richiesta creata il {dataIt(riga.createdAt)}.
                    {riga.disponibileAt
                      ? ` Disponibile nel portale dal ${dataIt(riga.disponibileAt)}.`
                      : " Non ancora disponibile nel portale."}{" "}
                    {etichetta ? `${etichetta}.` : ""}
                    {riga.notificaAt ? ` Inviata il ${dataIt(riga.notificaAt)}.` : ""}
                    {riga.notificaTentativi > 0
                      ? ` Tentativo ${riga.notificaTentativi}.`
                      : ""}
                  </p>
                )}
                {riga.notificaErrore ? (
                  <p className="text-amber-800">{riga.notificaErrore}</p>
                ) : null}
                {riprovaCerta ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (richiestaId) riprova(richiestaId, false);
                    }}
                    className="mt-1 text-sm font-medium text-sky-800 hover:underline disabled:opacity-60"
                  >
                    {riga.notificaStato === "non_inviata" ? "Invia notifica" : "Riprova notifica"}
                  </button>
                ) : null}
                {recupero && richiestaId && confermaId !== richiestaId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfermaId(richiestaId)}
                    className="mt-1 block text-sm font-medium text-amber-800 hover:underline disabled:opacity-60"
                  >
                    Recupera esito incerto
                  </button>
                ) : null}
                {recupero && richiestaId && confermaId === richiestaId ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                    <p className="text-amber-950">
                      Il reinvio potrebbe produrre una seconda email. La conferma
                      non garantisce un invio singolo.
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                      if (richiestaId) riprova(richiestaId, true);
                    }}
                      className="mt-2 rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Confermo il reinvio
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
