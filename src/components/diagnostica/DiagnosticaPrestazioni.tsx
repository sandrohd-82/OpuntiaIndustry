"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { misuraContestoAction } from "@/app/actions/diagnostica-prestazioni";
import { areaMisurabile } from "@/lib/diagnostica/prestazioni";

const CHIAVE = "prestazioni-aree";

type Passaggio = { area: string; ms: number };

function leggiPassaggi(): Passaggio[] {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE);
    const valore = grezzo ? (JSON.parse(grezzo) as Passaggio[]) : [];
    return Array.isArray(valore) ? valore.slice(-30) : [];
  } catch {
    return [];
  }
}

function salvaPassaggio(voce: Passaggio) {
  const tutte = [...leggiPassaggi(), voce].slice(-30);
  sessionStorage.setItem(CHIAVE, JSON.stringify(tutte));
}

export function RegistratoreNavigazione() {
  const pathname = usePathname();
  const precedente = useRef(0);

  useEffect(() => {
    const ora = performance.now();
    if (precedente.current > 0) {
      salvaPassaggio({
        area: areaMisurabile(pathname),
        ms: Math.round(ora - precedente.current),
      });
    }
    precedente.current = ora;
  }, [pathname]);

  return null;
}

function tempiMiddleware(): number[] {
  const durate: number[] = [];
  for (const voce of performance.getEntries()) {
    const timing = (voce as PerformanceResourceTiming).serverTiming;
    if (!timing) continue;
    for (const parte of timing) {
      if (parte.name === "middleware") durate.push(Math.round(parte.duration));
    }
  }
  return durate.slice(-12);
}

function javascriptTrasferito() {
  const risorse = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  let file = 0;
  let trasferiti = 0;
  let codificati = 0;
  let richieste = 0;
  let durata = 0;
  for (const risorsa of risorse) {
    richieste += 1;
    durata += risorsa.duration || 0;
    const script =
      risorsa.initiatorType === "script" || risorsa.name.includes("/_next/static/chunks/");
    if (!script) continue;
    file += 1;
    trasferiti += risorsa.transferSize || 0;
    codificati += risorsa.encodedBodySize || 0;
  }
  return {
    file,
    trasferiti,
    codificati,
    richieste,
    durataMedia: richieste === 0 ? 0 : Math.round(durata / richieste),
  };
}

function kilobyte(byte: number): string {
  return `${Math.round(byte / 1024)} KB`;
}

export function DiagnosticaPrestazioni({ origine }: { origine: "locale" | "produzione" }) {
  const [passaggi, setPassaggi] = useState<Passaggio[]>([]);
  const [documento, setDocumento] = useState("");
  const [middleware, setMiddleware] = useState<number[]>([]);
  const [script, setScript] = useState({ file: 0, trasferiti: 0, codificati: 0, richieste: 0, durataMedia: 0 });
  const [contesto, setContesto] = useState<string>("");
  const [inCorso, setInCorso] = useState(false);

  function aggiorna() {
    const navigazione = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigazione) {
      const pronto = Math.round(navigazione.domContentLoadedEventEnd);
      const completo = Math.round(navigazione.loadEventEnd || navigazione.duration);
      setDocumento(`Documento pronto in ${pronto} ms, caricamento ${completo} ms.`);
    } else {
      setDocumento("Il browser non ha esposto il tempo del documento.");
    }
    setPassaggi(leggiPassaggi());
    setMiddleware(tempiMiddleware());
    setScript(javascriptTrasferito());
  }

  useEffect(() => {
    aggiorna();
  }, []);

  async function misuraAzione() {
    setInCorso(true);
    const inizio = performance.now();
    const res = await misuraContestoAction();
    const andata = Math.round(performance.now() - inizio);
    setInCorso(false);
    if (!res.success) {
      setContesto("La misura non è disponibile per questo profilo.");
      return;
    }
    setContesto(
      `Server Action ${andata} ms, di cui verifica autenticazione ${res.contestoMs} ms. Origine misurata: ${res.origine}.`
    );
    aggiorna();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-sm text-slate-800">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Diagnostica prestazioni</h1>
        <p className="mt-2 leading-relaxed">
          Pagina temporanea, visibile solo al Super Admin sul proprio profilo. I numeri restano in
          questo browser e non contengono nomi, mail, token o percorsi completi.
        </p>
        <p className="mt-2 font-medium">
          Origine di questa pagina: {origine === "produzione" ? "produzione" : "ambiente locale"}.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Caricamento del documento</h2>
        <p className="mt-2">{documento}</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Cambio area</h2>
        {passaggi.length === 0 ? (
          <p className="mt-2">Ancora nessun cambio area in questa sessione.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {passaggi.map((voce, indice) => (
              <li key={`${voce.area}-${indice}`}>
                {voce.area}: {voce.ms} ms
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Middleware</h2>
        <p className="mt-2">
          {middleware.length === 0
            ? "Nessun Server-Timing middleware letto dal browser."
            : middleware.map((ms) => `${ms} ms`).join(", ")}
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Richieste e JavaScript</h2>
        <p className="mt-2">
          {script.richieste} richieste, durata media {script.durataMedia} ms. Script: {script.file}.
          Trasferiti {kilobyte(script.trasferiti)}, corpo codificato {kilobyte(script.codificati)}.
          I trasferiti a zero indicano file già in cache.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Autenticazione di questa richiesta</h2>
        <button
          type="button"
          onClick={() => void misuraAzione()}
          disabled={inCorso}
          className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40"
        >
          Misura la Server Action
        </button>
        {contesto ? <p className="mt-2">{contesto}</p> : null}
      </section>
    </div>
  );
}
