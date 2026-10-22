"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  heartbeatNumeroFatturaAction,
  prenotaNumeroFatturaAction,
  rilasciaNumeroFatturaAction,
} from "@/app/actions/fattura-prenotazione-numero";
import {
  messaggioAvvisoNumero,
  type PrenotazioneNumero,
} from "@/lib/amministrazione/numero-fattura-prenotazione";
import { todayIsoDate } from "@/lib/amministrazione/fatture";

export function usePrenotazioneNumero(opts: {
  contesto: "ordine" | "fattura";
  sessioneId: string;
  attivo: boolean;
  dataDocumento?: string;
}) {
  const [pren, setPren] = useState<PrenotazioneNumero | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const chiusaRef = useRef(false);
  const firmaRef = useRef("");
  const numeroRef = useRef<string | null>(null);
  const dataRef = useRef(opts.dataDocumento);
  dataRef.current = opts.dataDocumento;
  const annoDocumento = (opts.dataDocumento || todayIsoDate()).slice(0, 4);

  const bloccaRilascio = useCallback(() => {
    chiusaRef.current = true;
  }, []);

  const consentiRilascio = useCallback(() => {
    chiusaRef.current = false;
  }, []);

  const applica = useCallback((next: PrenotazioneNumero) => {
    if (next.stato === "aggiudicata" || next.stato === "emessa") {
      chiusaRef.current = true;
    }
    numeroRef.current = next.numeroFattura;
    idRef.current = next.id;
    setPren(next);
  }, []);

  useEffect(() => {
    if (!opts.attivo) {
      setPren(null);
      return;
    }
    let stop = false;
    const sessioneId = opts.sessioneId;
    const contesto = opts.contesto;

    function registra(next: PrenotazioneNumero) {
      const msg = messaggioAvvisoNumero(next, numeroRef.current);
      const firma = `${next.numeroFattura}|${next.incerto}|${next.numeroMin}|${next.numeroMax}|${next.stato}`;
      if (msg && firma !== firmaRef.current) {
        firmaRef.current = firma;
        setAvviso(msg);
      }
      if (!msg) firmaRef.current = firma;
      numeroRef.current = next.numeroFattura;
      if (next.stato === "aggiudicata" || next.stato === "emessa") {
        chiusaRef.current = true;
      }
      idRef.current = next.id;
      setPren(next);
      setErrore(null);
    }

    async function ciclo(primo: boolean) {
      const dataDocumento = dataRef.current || todayIsoDate();
      let res =
        primo || !idRef.current
          ? await prenotaNumeroFatturaAction({
              sessioneId,
              dataDocumento,
              contesto,
            })
          : await heartbeatNumeroFatturaAction(idRef.current);
      if (!res.success && !primo) {
        res = await prenotaNumeroFatturaAction({
          sessioneId,
          dataDocumento,
          contesto,
        });
      }
      if (stop) return;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      registra(res.prenotazione);
    }

    void ciclo(true);
    const timer = setInterval(() => {
      void ciclo(false);
    }, 15000);
    return () => {
      stop = true;
      clearInterval(timer);
      const id = idRef.current;
      idRef.current = null;
      numeroRef.current = null;
      firmaRef.current = "";
      if (!chiusaRef.current && id) {
        void rilasciaNumeroFatturaAction(id);
      }
    };
  }, [annoDocumento, opts.attivo, opts.contesto, opts.sessioneId]);

  return {
    pren,
    avviso,
    setAvviso,
    errore,
    applica,
    bloccaRilascio,
    consentiRilascio,
  };
}

export function FatturaNumeroAvvisoDialog({
  messaggio,
  onClose,
}: {
  messaggio: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <div
        role="alertdialog"
        aria-labelledby="avviso-numero-fattura"
        className="max-w-lg rounded-xl bg-white p-5 text-slate-900 shadow-xl"
      >
        <h2 id="avviso-numero-fattura" className="text-lg font-semibold">
          Numero fattura
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{messaggio}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Ho capito
        </button>
      </div>
    </div>
  );
}
