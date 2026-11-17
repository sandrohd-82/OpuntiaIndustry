"use client";

import { useEffect, useState, useTransition } from "react";
import {
  associaMacchinaProvaAction,
  collegaImpegnoFoglioAction,
  listaCicloProduzioneAction,
  scollegaMacchinaProvaAction,
  type CoefficienteResa,
  type FoglioCiclo,
  type ImpegnoCiclo,
  type MacchinaCiclo,
  type AssociazioneProva,
  type OperatoreRegistrato,
} from "@/app/actions/produzione-ciclo";
import { meseNelCoefficiente } from "@/lib/produzione/effetto-magazzino";

function somma(foglio: FoglioCiclo) {
  return foglio.prelievi.reduce((totale, riga) => totale + riga.quantita, 0);
}

export function CicloProduzioneBoard() {
  const [fogli, setFogli] = useState<FoglioCiclo[]>([]);
  const [macchine, setMacchine] = useState<MacchinaCiclo[]>([]);
  const [associazioni, setAssociazioni] = useState<AssociazioneProva[]>([]);
  const [impegni, setImpegni] = useState<ImpegnoCiclo[]>([]);
  const [operatori, setOperatori] = useState<OperatoreRegistrato[]>([]);
  const [coefficienti, setCoefficienti] = useState<CoefficienteResa[]>([]);
  const [mese, setMese] = useState(1);
  const [scelto, setScelto] = useState<string>("");
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ricarica() {
    void listaCicloProduzioneAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setFogli(res.fogli);
      setMacchine(res.macchine);
      setAssociazioni(res.associazioni);
      setImpegni(res.impegni);
      setOperatori(res.operatori);
      setCoefficienti(res.coefficienti);
      setMese(res.mese);
      setScelto((attuale) => attuale || res.fogli[0]?.id || "");
    });
  }

  useEffect(() => {
    ricarica();
  }, [messaggio]);

  const foglio = fogli.find((voce) => voce.id === scelto) ?? null;
  const macchineFoglio = associazioni.filter((voce) => voce.foglioId === scelto);
  const iniziale = foglio ? somma(foglio) : 0;

  function associa(form: FormData) {
    if (!foglio) return;
    setErrore(null);
    startTransition(async () => {
      const res = await associaMacchinaProvaAction({
        foglioId: foglio.id,
        macchinarioId: String(form.get("macchina") ?? ""),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio("Macchina associata in prova. Nessun comando è stato inviato.");
    });
  }

  function collega(impegnoId: string) {
    if (!foglio) return;
    setErrore(null);
    startTransition(async () => {
      const res = await collegaImpegnoFoglioAction({ impegnoId, foglioId: foglio.id });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio("Impegno collegato al foglio aperto.");
    });
  }

  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Ciclo della lavorazione</h2>
      <p className="text-sm text-slate-600">
        Dal lotto LM- prelevato al foglio, alla macchina in prova e al lotto di uscita già
        esistente. La quantità ottenuta del bilancio di massa resta quella già registrata.
        Non esiste una sospensione: il processo è in corso, completato o annullato.
      </p>
      {messaggio ? <p className="text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      {fogli.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun foglio di lavorazione aperto.</p>
      ) : (
        <>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={scelto}
            onChange={(event) => setScelto(event.target.value)}
          >
            {fogli.map((voce) => (
              <option key={voce.id} value={voce.id}>
                {voce.codice} {voce.prodotto}
              </option>
            ))}
          </select>
          {foglio ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">Consuntivo</p>
                <p>Inizio {new Date(foglio.startedAt).toLocaleString("it-IT")}</p>
                <p>Fine prevista {new Date(foglio.expectedEndAt).toLocaleString("it-IT")}</p>
                <p>
                  Quantità prelevata {iniziale}
                  {foglio.prelievi[0] ? ` ${foglio.prelievi[0].unita}` : ""}
                </p>
                {foglio.bilancio ? (
                  <p>
                    Bilancio registrato: versati {foglio.bilancio.versati} kg, ottenuti{" "}
                    {foglio.bilancio.ottenuti} kg, non conformi {foglio.bilancio.nonConformi} kg (
                    {foglio.bilancio.esito}).
                  </p>
                ) : (
                  <p>Quantità ottenuta non ancora registrata nel bilancio di massa.</p>
                )}
                <p>
                  Lotto di uscita: {foglio.lottoUscita ?? "non ancora generato sul foglio"}.
                </p>
                <p className="text-slate-500">
                  La resa percentuale non viene calcolata: la formula aziendale non è definita.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">Prelievi LM-</p>
                {foglio.prelievi.length === 0 ? (
                  <p className="text-slate-500">Nessun prelievo collegato a questo foglio.</p>
                ) : (
                  <ul className="space-y-1">
                    {foglio.prelievi.map((riga) => (
                      <li key={riga.movimentoId}>
                        {riga.lottoMp} · {riga.quantita} {riga.unita}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">Impegni di scaletta</p>
                <p className="text-slate-500">
                  I processi descrivono le attività, non una distinta quantitativa. Il fabbisogno
                  reale è l&apos;elenco dei prelievi. Il coefficiente di resa, se presente, non viene
                  moltiplicato per una quantità.
                </p>
                <ul className="mt-2 space-y-2">
                  {impegni.map((impegno) => (
                    <li key={impegno.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        {impegno.giorno} · {impegno.etichetta || "Senza etichetta"}
                        {impegno.linea ? ` · ${impegno.linea}` : ""}
                        {impegno.foglioId === foglio.id ? " · collegato" : ""}
                      </span>
                      {coefficienti
                        .filter(
                          (voce) =>
                            voce.linea === impegno.linea &&
                            meseNelCoefficiente(mese, voce.meseDa, voce.meseA)
                        )
                        .map((voce) => (
                          <span key={`${impegno.id}-${voce.stagione}`} className="text-slate-600">
                            Coefficiente {voce.stagione}: media {voce.media}% (da {voce.minimo} a{" "}
                            {voce.massimo}). Non applicato a una quantità.
                          </span>
                        ))}
                      {impegno.foglioId !== foglio.id ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded-lg border border-slate-300 px-2 py-1"
                          onClick={() => collega(impegno.id)}
                        >
                          Assegna a questo foglio
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">Macchine in prova</p>
                <p className="text-slate-500">
                  Si legge lo stato, la telemetria e la conferma già registrata. I comandi POWER_ON e
                  POWER_OFF restano solo indicati. L&apos;invio reale resta spento finché non sono
                  definiti autorizzazioni, condizioni di sicurezza, conferme e comportamento senza
                  connessione.
                </p>
                <ul className="mt-2 space-y-2">
                  {macchineFoglio.map((voce) => {
                    const macchina = macchine.find((item) => item.id === voce.macchinarioId);
                    if (!macchina) return null;
                    return (
                      <li key={voce.id}>
                        <p>
                          {macchina.codice} {macchina.nome} · stato {macchina.stato}
                          {macchina.deviceCode ? ` · ${macchina.deviceCode} ${macchina.deviceStato}` : ""}
                        </p>
                        {macchina.stato === "arresto" ? (
                          <p className="text-amber-900">Allarme: {macchina.nota || "arresto"}</p>
                        ) : null}
                        {voce.protocollo ? <p>Protocollo previsto: {voce.protocollo}</p> : null}
                        {macchina.telemetria ? <p>Telemetria: {macchina.telemetria}</p> : null}
                        {macchina.conferma ? <p>Conferma già eseguita: {macchina.conferma}</p> : null}
                        <button
                          type="button"
                          className="text-sky-800"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const res = await scollegaMacchinaProvaAction(voce.id);
                              if (!res.success) setErrore(res.error);
                              else setMessaggio("Associazione chiusa.");
                            });
                          }}
                        >
                          Chiudi associazione
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <form
                  className="mt-2 flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    associa(new FormData(event.currentTarget));
                  }}
                >
                  <select name="macchina" required className="rounded-lg border border-slate-300 px-3 py-2">
                    <option value="">Macchina</option>
                    {macchine.map((macchina) => (
                      <option key={macchina.id} value={macchina.id}>
                        {macchina.codice} {macchina.nome}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
                  >
                    Associa in prova
                  </button>
                </form>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">Operatori già registrati</p>
                {operatori.length === 0 ? (
                  <p className="text-slate-500">
                    Nessun operatore risulta sulle attività macchina di questi fogli.
                  </p>
                ) : (
                  <ul>
                    {operatori.map((voce) => (
                      <li key={`${voce.nome}-${voce.quando}`}>
                        {voce.nome} · {voce.azione}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
