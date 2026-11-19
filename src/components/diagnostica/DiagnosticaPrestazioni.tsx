"use client";

import { useEffect, useState } from "react";
import { misuraContestoAction } from "@/app/actions/diagnostica-prestazioni";
import {
  CHIAVE_NAVIGAZIONI,
  interpretaAzione,
  type ResocontoNavigazione,
  type RisorsaOsservata,
} from "@/lib/diagnostica/prestazioni";

function leggiPassaggi(): ResocontoNavigazione[] {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_NAVIGAZIONI);
    const valore = grezzo ? (JSON.parse(grezzo) as ResocontoNavigazione[]) : [];
    return Array.isArray(valore) ? valore.slice(-20) : [];
  } catch {
    return [];
  }
}

function kilobyte(byte: number): string {
  return `${Math.round(byte / 1024)} KB`;
}

function ms(valore: number | null): string {
  return valore == null ? "non esposta" : `${valore} ms`;
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

function risorseDa(inizio: number): RisorsaOsservata[] {
  return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((risorsa) => risorsa.startTime >= inizio - 5)
    .map((risorsa) => {
      let middlewareMs: number | null = null;
      for (const parte of risorsa.serverTiming ?? []) {
        if (parte.name === "middleware") middlewareMs = Math.round(parte.duration);
      }
      return {
        nome: risorsa.name,
        start: risorsa.startTime,
        requestStart: risorsa.requestStart,
        responseStart: risorsa.responseStart,
        responseEnd: risorsa.responseEnd,
        duration: risorsa.duration,
        middlewareMs,
      };
    });
}

export function DiagnosticaPrestazioni({ origine }: { origine: "locale" | "produzione" }) {
  const [passaggi, setPassaggi] = useState<ResocontoNavigazione[]>([]);
  const [documento, setDocumento] = useState("");
  const [middleware, setMiddleware] = useState<number[]>([]);
  const [script, setScript] = useState({
    file: 0,
    trasferiti: 0,
    codificati: 0,
    richieste: 0,
    durataMedia: 0,
  });
  const [contesto, setContesto] = useState("");
  const [inCorso, setInCorso] = useState(false);

  function aggiorna() {
    const navigazione = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
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
    const candidate = risorseDa(inizio).filter(
      (risorsa) => risorsa.duration > 0 && risorsa.responseStart > 0
    );
    const richiesta = candidate.reduce<RisorsaOsservata | null>((scelta, risorsa) => {
      if (!scelta || risorsa.duration > scelta.duration) return risorsa;
      return scelta;
    }, null);
    const invio =
      richiesta == null
        ? null
        : Math.max(0, Math.round((richiesta.requestStart || richiesta.start) - inizio));
    const ttfb =
      richiesta == null || richiesta.responseStart <= 0
        ? null
        : Math.max(
            0,
            Math.round(richiesta.responseStart - (richiesta.requestStart || richiesta.start))
          );
    const download =
      richiesta == null || richiesta.responseEnd <= 0 || richiesta.responseStart <= 0
        ? null
        : Math.max(0, Math.round(richiesta.responseEnd - richiesta.responseStart));
    const lettura = interpretaAzione({
      andataMs: andata,
      azioneMs: res.azioneMs,
      contestoMs: res.contestoMs,
      istanzaMs: res.istanzaMs,
      invioMs: invio,
      ttfbMs: ttfb,
      downloadMs: download,
      middlewareMs: richiesta?.middlewareMs ?? null,
    });
    setContesto(
      `Richiesta completa ${andata} ms. Invio ${ms(invio)}. Risposta server ${ms(ttfb)}. Download ${ms(download)}. Middleware ${ms(richiesta?.middlewareMs ?? null)}. Funzione ${res.azioneMs} ms, di cui verifica autenticazione ${res.contestoMs} ms. Istanza accesa da ${Math.round(res.istanzaMs / 1000)} s. Origine: ${res.origine}. ${lettura}`
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
        <p className="mt-2 leading-relaxed">
          La misura precedente del cambio area partiva dal caricamento della pagina già aperta e
          includeva l&apos;inattività, la scheda in background e le richieste già concluse. Quel numero
          non è più mostrato. Per ripetere la prova: clicca un&apos;area del menu, attendi la pagina,
          poi torna qui e aggiorna.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Caricamento del documento</h2>
        <p className="mt-2">{documento}</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Navigazione dal clic</h2>
          <button
            type="button"
            onClick={aggiorna}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          >
            Aggiorna
          </button>
        </div>
        {passaggi.length === 0 ? (
          <p className="mt-2">Ancora nessun clic di navigazione in questa sessione.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {passaggi.map((voce, indice) => (
              <li key={`${voce.area}-${indice}`} className="border-t border-slate-100 pt-2">
                <p className="font-medium">
                  {voce.area}: transizione {voce.transizioneMs} ms
                  {voce.completata ? "" : ", non completata entro 20 s"}
                  {voce.schedaNascosta ? ", scheda in background" : ""}
                </p>
                <p className="mt-1">
                  Avvio richiesta {ms(voce.attesaPrimaRichiestaMs)}. Risposta server{" "}
                  {ms(voce.rispostaServerMs)}. Download {ms(voce.downloadMs)}. Rendering{" "}
                  {ms(voce.renderingMs)}. Middleware {ms(voce.middlewareMs)}.
                </p>
                <p className="mt-1">
                  Nella finestra del clic: {voce.richiesteFinestra} richieste, di cui {voce.bloccanti}{" "}
                  bloccano la navigazione.
                </p>
                {voce.lente.length === 0 ? null : (
                  <ul className="mt-1 space-y-1">
                    {voce.lente.map((lenta, lentaIndice) => (
                      <li key={`${lenta.percorso}-${lentaIndice}`}>
                        {lenta.blocca ? "Blocca" : "Secondaria"} {lenta.percorso}: {lenta.ms} ms
                      </li>
                    ))}
                  </ul>
                )}
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
            : middleware.map((voce) => `${voce} ms`).join(", ")}
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Richieste dall&apos;apertura del documento</h2>
        <p className="mt-2">
          {script.richieste} richieste, durata media {script.durataMedia} ms. Script: {script.file}.
          Trasferiti {kilobyte(script.trasferiti)}, corpo codificato {kilobyte(script.codificati)}.
          Questa media comprende anche polling e richieste concluse prima del clic: non è il tempo
          della navigazione.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Server Action di prova</h2>
        <button
          type="button"
          onClick={() => void misuraAzione()}
          disabled={inCorso}
          className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40"
        >
          Misura la Server Action
        </button>
        {contesto ? <p className="mt-2 leading-relaxed">{contesto}</p> : null}
      </section>
    </div>
  );
}
