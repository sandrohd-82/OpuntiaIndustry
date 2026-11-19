"use client";

import { useEffect, useState } from "react";
import { misuraContestoAction } from "@/app/actions/diagnostica-prestazioni";
import { preparaRegistroRisorse, risorseRaccolte } from "@/components/diagnostica/osservatorio-risorse";
import {
  CHIAVE_NAVIGAZIONI,
  FINESTRA_RICHIESTE_MS,
  fasiChiamataClient,
  interpretaAzione,
  raggruppaRichieste,
  type GruppoRichieste,
  type ResocontoNavigazione,
  type RisorsaOsservata,
} from "@/lib/diagnostica/prestazioni";

const ETICHETTE: Record<GruppoRichieste["categoria"], string> = {
  navigazione: "Navigazione",
  script: "Script",
  autenticazione: "Autenticazione",
  notifiche: "Notifiche",
  dati: "Dati delle pagine",
  altro: "Altri servizi",
};

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
  return valore == null ? "non esposto" : `${valore} ms`;
}

function rigaTempi(valori: number[]): string {
  return valori.length === 0 ? "non esposti" : valori.map((voce) => `${voce} ms`).join(", ");
}

function tempiMiddleware(nome: string): number[] {
  const durate: number[] = [];
  for (const voce of performance.getEntries()) {
    const timing = (voce as PerformanceResourceTiming).serverTiming;
    if (!timing) continue;
    for (const parte of timing) {
      if (parte.name === nome) durate.push(Math.round(parte.duration));
    }
  }
  return durate.slice(-12);
}

function testoRete(voce: ResocontoNavigazione): string {
  if (voce.motivoRete === "misurata") return "Richiesta RSC osservata dopo il clic.";
  if (voce.motivoRete === "prefetch-in-corso") {
    return "La richiesta RSC era già partita prima del clic ed era ancora aperta. I tempi sotto sono di quella richiesta.";
  }
  if (voce.motivoRete === "prefetch-conclusa") {
    const durata = voce.prefetchMs == null ? "" : ` Durata della prefetch: ${voce.prefetchMs} ms.`;
    return `Nessuna richiesta nuova dopo il clic. Una prefetch della stessa area era già conclusa.${durata} Quel tempo non è l'attesa del clic.`;
  }
  if (voce.motivoRete === "registro-pieno") {
    return "Il registro risorse del browser era pieno e la richiesta non è stata esposta. Nessun tempo di rete è stato stimato.";
  }
  return "Il browser non ha esposto una richiesta RSC per questo clic. Può aver usato la cache del router. Nessun tempo di rete è stato stimato.";
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
  const [middleware, setMiddleware] = useState({
    totale: [] as number[],
    utente: [] as number[],
    stato: [] as number[],
    dopo: [] as number[],
  });
  const [gruppi, setGruppi] = useState<GruppoRichieste[]>([]);
  const [registro, setRegistro] = useState(0);
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
    preparaRegistroRisorse();
    const raccolte = risorseRaccolte();
    setPassaggi(leggiPassaggi());
    setMiddleware({
      totale: tempiMiddleware("middleware"),
      utente: tempiMiddleware("middleware-utente"),
      stato: tempiMiddleware("middleware-stato"),
      dopo: tempiMiddleware("middleware-dopo"),
    });
    setGruppi(
      raggruppaRichieste({
        risorse: raccolte,
        ora: performance.now(),
        finestraMs: FINESTRA_RICHIESTE_MS,
      })
    );
    setRegistro(raccolte.length);
    setScript(javascriptTrasferito());
  }

  useEffect(() => {
    aggiorna();
  }, []);

  async function misuraAzione() {
    setInCorso(true);
    const inizio = performance.now();
    const fetchVisti: { inizio: number; fine: number }[] = [];
    const originale = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const inizioFetch = performance.now();
      return originale(input, init).finally(() => {
        fetchVisti.push({ inizio: inizioFetch, fine: performance.now() });
      });
    };
    let res: Awaited<ReturnType<typeof misuraContestoAction>>;
    try {
      res = await misuraContestoAction();
    } finally {
      window.fetch = originale;
    }
    const fine = performance.now();
    const andata = Math.round(fine - inizio);
    const fasi = fasiChiamataClient({ clic: inizio, fine, fetch: fetchVisti });
    setInCorso(false);
    if (!res.success) {
      setContesto("La misura non è disponibile per questo profilo.");
      return;
    }
    let richiesta: RisorsaOsservata | null = null;
    if (fasi.primaMs != null) {
      const atteso = inizio + fasi.primaMs;
      let distanzaMigliore = 81;
      for (const risorsa of risorseDa(inizio)) {
        const distanza = Math.abs(risorsa.start - atteso);
        if (distanza < distanzaMigliore) {
          distanzaMigliore = distanza;
          richiesta = risorsa;
        }
      }
    }
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
      invioMs: fasi.primaMs,
      ttfbMs: ttfb,
      downloadMs: download,
      middlewareMs: richiesta?.middlewareMs ?? null,
    });
    setContesto(
      `Attesa dal clic ${andata} ms. Prima dell'invio ${ms(fasi.primaMs)}. Durata del fetch ${ms(fasi.reteMs)}. Dopo la risposta ${ms(fasi.dopoMs)}. Fetch osservati ${fasi.fetchOsservati}. Risposta server ${ms(ttfb)}. Download ${ms(download)}. Middleware ${ms(richiesta?.middlewareMs ?? null)}. Funzione ${res.azioneMs} ms, di cui verifica autenticazione ${res.contestoMs} ms. Istanza accesa da ${Math.round(res.istanzaMs / 1000)} s. Origine: ${res.origine}. ${lettura}`
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
          Per ripetere la prova: apri Dashboard, Amministrazione, Commerciale, Produzione e
          Magazzino dal menu, attendi che il contenuto sia usabile, poi torna qui e premi Aggiorna.
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
                  {voce.area}
                  {voce.completata ? "" : ", percorso non completato entro 20 s"}
                  {voce.schedaNascosta ? ", scheda in background" : ""}
                  {voce.chiusa ? "" : ", misura ancora aperta"}
                </p>
                <p className="mt-1">
                  Clic, poi cambio percorso {voce.transizioneMs} ms. Contenuto principale{" "}
                  {ms(voce.contenutoMs)}. Dati necessari {ms(voce.datiMs)}.
                </p>
                <p className="mt-1">{testoRete(voce)}</p>
                <p className="mt-1">
                  Avvio richiesta {ms(voce.attesaPrimaRichiestaMs)}. Risposta server{" "}
                  {ms(voce.rispostaServerMs)}. Download {ms(voce.downloadMs)}. Rendering{" "}
                  {ms(voce.renderingMs)}. Middleware {ms(voce.middlewareMs)}.
                </p>
                <p className="mt-1">
                  Nella finestra del clic: {voce.richiesteFinestra} richieste, di cui {voce.bloccanti}{" "}
                  bloccano la navigazione. Secondarie ancora aperte al contenuto:{" "}
                  {voce.secondarieAperte}.
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
        <p className="mt-2">Totale: {rigaTempi(middleware.totale)}</p>
        <p className="mt-1">Verifica utente: {rigaTempi(middleware.utente)}</p>
        <p className="mt-1">Stato operativo: {rigaTempi(middleware.stato)}</p>
        <p className="mt-1">Dopo la sessione: {rigaTempi(middleware.dopo)}</p>
        <p className="mt-2 leading-relaxed">
          Il totale comprende i controlli già presenti. Le tre righe servono a vedere se un picco,
          per esempio 549 ms, sta nella verifica utente, nella lettura dello stato o nel resto del
          passaggio.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Richieste negli ultimi 60 secondi</h2>
        <p className="mt-2">
          Registro interno: {registro}. Risorse ancora nel browser: {script.richieste}, durata media{" "}
          {script.durataMedia} ms. Script: {script.file}. Trasferiti {kilobyte(script.trasferiti)},
          corpo codificato {kilobyte(script.codificati)}. Il browser conserva al massimo un numero
          limitato di risorse: il registro interno continua anche dopo quel tetto.
        </p>
        <p className="mt-2 leading-relaxed">
          Sidebar, avvisi e Trello chiamano azioni sulla pagina corrente: non hanno un indirizzo
          proprio e compaiono tra gli altri servizi. Se lo stesso percorso si ripete, l&apos;intervallo
          mediano indica il polling. Avvisi circa 20 s, ticket circa 30 s, Trello circa 60 s.
        </p>
        {gruppi.length === 0 ? (
          <p className="mt-2">Nessuna richiesta in questa finestra.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {gruppi.map((gruppo) => (
              <li key={`${gruppo.categoria}-${gruppo.percorso}`}>
                {ETICHETTE[gruppo.categoria]} {gruppo.percorso}: {gruppo.conteggio}, media{" "}
                {gruppo.durataMediaMs} ms, massimo {gruppo.durataMaxMs} ms
                {gruppo.intervalloMedianoMs == null
                  ? ""
                  : `, intervallo ${gruppo.intervalloMedianoMs} ms`}
              </li>
            ))}
          </ul>
        )}
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
