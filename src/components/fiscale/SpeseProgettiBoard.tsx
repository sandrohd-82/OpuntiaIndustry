"use client";

import { useEffect, useState, useTransition } from "react";
import {
  aggiungiPartecipanteProgettoAction,
  approvaProgettoSpesaAction,
  collegaSpeseProgettoAction,
  contabilizzaProgettoSpesaAction,
  scollegaFatturaProgettoAction,
  creaProgettoSpesaAction,
  dettaglioProgettoSpesaAction,
  elencoSoggettiPartecipantiSpesaAction,
  listProgettiSpesaAction,
  rimuoviPartecipanteProgettoAction,
  urlAllegatoSpesaAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import { CollegaFattureProgetto } from "@/components/fiscale/CollegaFattureProgetto";
import {
  PartecipantiProgettoCampo,
  type VocePartecipante,
} from "@/components/fiscale/PartecipantiProgettoCampo";
import {
  LABEL_CATEGORIA_SPESA,
  LABEL_STATO_PROGETTO,
  LABEL_TIPO_PROGETTO,
  errorePeriodoPartecipante,
  type SoggettoPartecipanteOption,
  type FatturaProgettoView,
  type SpesaDocumentoView,
  type SpesaProgettoView,
  type TipoProgettoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function fileImmagine(name: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function SpesaVoceProgetto({
  spesa,
  selezionabile,
  selezionata,
  onToggle,
}: {
  spesa: SpesaDocumentoView;
  selezionabile: boolean;
  selezionata: boolean;
  onToggle: () => void;
}) {
  const [pannello, setPannello] = useState<null | "dettagli" | "documento">(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fileErrore, setFileErrore] = useState<string | null>(null);
  const [caricaFile, setCaricaFile] = useState(false);

  function apriDettagli() {
    setPannello((cur) => (cur === "dettagli" ? null : "dettagli"));
  }

  function apriDocumento() {
    if (pannello === "documento") {
      setPannello(null);
      return;
    }
    setPannello("documento");
    if (url || caricaFile) return;
    setCaricaFile(true);
    setFileErrore(null);
    void urlAllegatoSpesaAction(spesa.id).then((res) => {
      setCaricaFile(false);
      if (!res.success) {
        setFileErrore(res.error);
        return;
      }
      setUrl(res.url);
    });
  }

  const immagine = fileImmagine(spesa.fileName);

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {selezionabile ? (
          <input type="checkbox" checked={selezionata} onChange={onToggle} />
        ) : (
          <span className="w-4" />
        )}
        <span className="min-w-0 flex-1">
          {formatDateIt(spesa.dataDocumento)} · {spesa.esercente}
          <span className="block text-xs text-[var(--muted)]">
            {LABEL_CATEGORIA_SPESA[spesa.categoria]} · {spesa.stato}
          </span>
        </span>
        <span className="tabular-nums">{formatEuro(spesa.totale)}</span>
        <button
          type="button"
          onClick={apriDettagli}
          className={`rounded border px-2 py-1 text-xs ${
            pannello === "dettagli" ? "border-slate-800 bg-slate-100" : "border-slate-300"
          }`}
        >
          Dettagli
        </button>
        <button
          type="button"
          onClick={apriDocumento}
          className={`rounded border px-2 py-1 text-xs ${
            pannello === "documento" ? "border-slate-800 bg-slate-100" : "border-slate-300"
          }`}
        >
          Documento
        </button>
      </div>
      {pannello === "dettagli" ? (
        <div className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2">
          {spesa.prezziIvaCompresa ? (
            <p className="mb-1 text-xs text-slate-600">
              Prezzi inseriti IVA compresa. Imponibile e IVA sono scorporati dal totale.
            </p>
          ) : null}
          {spesa.righe.length === 0 ? (
            <p className="text-xs text-slate-500">Questo documento non ha righe.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1 text-left font-medium">Descrizione</th>
                  <th className="py-1 text-right font-medium">Numero</th>
                  <th className="py-1 text-right font-medium">Prezzo</th>
                  <th className="py-1 text-right font-medium">Imponibile</th>
                  <th className="py-1 text-right font-medium">% IVA</th>
                  <th className="py-1 text-right font-medium">IVA</th>
                  <th className="py-1 text-right font-medium">Totale</th>
                </tr>
              </thead>
              <tbody>
                {spesa.righe.map((riga, index) => (
                  <tr key={`${spesa.id}-${index}`}>
                    <td className="py-1 pr-3">{riga.descrizione}</td>
                    <td className="py-1 text-right tabular-nums">
                      {riga.quantita.toLocaleString("it-IT")}
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatEuro(riga.prezzoUnitario)}</td>
                    <td className="py-1 text-right tabular-nums">{formatEuro(riga.imponibile)}</td>
                    <td className="py-1 text-right tabular-nums">{riga.aliquotaIva}</td>
                    <td className="py-1 text-right tabular-nums">{formatEuro(riga.imposta)}</td>
                    <td className="py-1 text-right tabular-nums">{formatEuro(riga.totale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      {pannello === "documento" ? (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          {caricaFile ? <p className="text-xs text-slate-500">Apertura del documento…</p> : null}
          {fileErrore ? <p className="text-xs text-red-700">{fileErrore}</p> : null}
          {url && immagine ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={spesa.fileName || spesa.esercente}
              className="max-h-80 w-full rounded object-contain"
            />
          ) : null}
          {url && !immagine ? (
            <iframe title={spesa.fileName || "Documento"} src={url} className="h-80 w-full rounded bg-white" />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function SpeseProgettiBoard() {
  const [progetti, setProgetti] = useState<SpesaProgettoView[]>([]);
  const [scelto, setScelto] = useState<string>("");
  const [collegate, setCollegate] = useState<SpesaDocumentoView[]>([]);
  const [libere, setLibere] = useState<SpesaDocumentoView[]>([]);
  const [totali, setTotali] = useState<{ categoria: string; totale: number }[]>([]);
  const [partecipanti, setPartecipanti] = useState<VocePartecipante[]>([]);
  const [fatture, setFatture] = useState<FatturaProgettoView[]>([]);
  const [fattureAperte, setFattureAperte] = useState(false);
  const [bozzaPartecipanti, setBozzaPartecipanti] = useState<VocePartecipante[]>([]);
  const [soggetti, setSoggetti] = useState<SoggettoPartecipanteOption[]>([]);
  const [selezionate, setSelezionate] = useState<string[]>([]);
  const [tipo, setTipo] = useState<TipoProgettoSpesa>("trasferta");
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function caricaElenco(seleziona?: string) {
    start(async () => {
      const soggettiRes = await elencoSoggettiPartecipantiSpesaAction();
      if (soggettiRes.success) setSoggetti(soggettiRes.soggetti);
      const res = await listProgettiSpesaAction();
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setProgetti(res.progetti);
      const id = seleziona || scelto || res.progetti[0]?.id || "";
      setScelto(id);
      if (id) await caricaDettaglio(id);
    });
  }

  async function caricaDettaglio(id: string) {
    const res = await dettaglioProgettoSpesaAction(id);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setCollegate(res.collegate);
    setLibere(res.libere);
    setTotali(res.totaliCategoria);
    setFatture(res.fatture);
    setPartecipanti(
      res.partecipanti.map((persona) => ({
        chiave: persona.id,
        soggettoTipo: persona.soggettoTipo,
        soggettoId: persona.soggettoId,
        etichetta: persona.etichetta,
        dataInizio: persona.dataInizio,
        dataFine: persona.dataFine,
      }))
    );
    setSelezionate([]);
  }

  useEffect(() => {
    caricaElenco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progetto = progetti.find((p) => p.id === scelto) ?? null;

  function crea() {
    setErrore(null);
    setMsg(null);
    for (const persona of bozzaPartecipanti) {
      const msgPeriodo = errorePeriodoPartecipante(
        dataInizio,
        dataFine || null,
        persona.dataInizio,
        persona.dataFine
      );
      if (msgPeriodo) {
        setErrore(`${persona.etichetta}: ${msgPeriodo}`);
        return;
      }
    }
    start(async () => {
      const res = await creaProgettoSpesaAction({
        tipo,
        titolo,
        descrizione,
        dataInizio,
        dataFine: dataFine || null,
        partecipanti: bozzaPartecipanti.map((persona) => ({
          soggettoTipo: persona.soggettoTipo,
          soggettoId: persona.soggettoId,
          dataInizio: persona.dataInizio,
          dataFine: persona.dataFine,
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setTitolo("");
      setDescrizione("");
      setDataFine("");
      setBozzaPartecipanti([]);
      setMsg("Progetto creato in bozza.");
      const elenco = await listProgettiSpesaAction();
      if (!elenco.success) return;
      setProgetti(elenco.progetti);
      setScelto(res.id);
      await caricaDettaglio(res.id);
    });
  }

  function aggancia(agganciaFlag: boolean, ids: string[]) {
    if (!scelto || ids.length === 0) return;
    setErrore(null);
    start(async () => {
      const res = await collegaSpeseProgettoAction({
        progettoId: scelto,
        spesaIds: ids,
        aggancia: agganciaFlag,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg(agganciaFlag ? "Spese agganciate." : "Spese sganciate.");
      await caricaDettaglio(scelto);
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
    });
  }

  function approva() {
    if (!scelto) return;
    start(async () => {
      const res = await approvaProgettoSpesaAction(scelto);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Progetto approvato.");
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
    });
  }

  function contabilizza() {
    if (!scelto) return;
    start(async () => {
      const res = await contabilizzaProgettoSpesaAction(scelto);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg(
        res.fattureLasciate > 0
          ? `Pacchetto contabilizzato: ${res.documenti} spese. ${res.fattureLasciate} fatture collegate restano nello stato SDI.`
          : `Pacchetto contabilizzato: ${res.documenti} documenti.`
      );
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
      await caricaDettaglio(scelto);
    });
  }

  function toggle(id: string) {
    setSelezionate((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium">Nuovo progetto o viaggio</h2>
        <select className={field} value={tipo} onChange={(e) => setTipo(e.target.value as TipoProgettoSpesa)}>
          <option value="trasferta">Viaggio di lavoro</option>
          <option value="progetto">Progetto</option>
        </select>
        <input
          className={field}
          placeholder="Titolo"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
        />
        <input
          className={field}
          type="date"
          value={dataInizio}
          onChange={(e) => setDataInizio(e.target.value)}
        />
        <input
          className={field}
          type="date"
          value={dataFine}
          onChange={(e) => setDataFine(e.target.value)}
        />
        <textarea
          className={field}
          rows={2}
          placeholder="Descrizione"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
        />
        <PartecipantiProgettoCampo
          progettoInizio={dataInizio}
          progettoFine={dataFine}
          soggetti={soggetti}
          voci={bozzaPartecipanti}
          solaLettura={false}
          pending={pending}
          onAggiungi={(input) => {
            const etichetta =
              soggetti.find(
                (soggetto) =>
                  soggetto.tipo === input.soggettoTipo && soggetto.id === input.soggettoId
              )?.etichetta ?? "Partecipante";
            setBozzaPartecipanti((prev) => [
              ...prev,
              {
                chiave: crypto.randomUUID(),
                etichetta,
                ...input,
              },
            ]);
          }}
          onRimuovi={(chiave) =>
            setBozzaPartecipanti((prev) => prev.filter((voce) => voce.chiave !== chiave))
          }
        />
        <button
          type="button"
          disabled={pending}
          onClick={crea}
          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Crea bozza
        </button>
        <ul className="space-y-1 border-t border-[var(--border)] pt-3">
          {progetti.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setScelto(p.id);
                  start(async () => {
                    await caricaDettaglio(p.id);
                  });
                }}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                  p.id === scelto ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
                }`}
              >
                {p.titolo}
                <span className="block text-xs text-[var(--muted)]">
                  {LABEL_TIPO_PROGETTO[p.tipo]} · {LABEL_STATO_PROGETTO[p.documentoStato]} · v
                  {p.versione}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {errore ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
        {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
        {!progetto ? (
          <p className="text-sm text-slate-600">Nessun progetto. Creane uno a sinistra.</p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {LABEL_TIPO_PROGETTO[progetto.tipo]} · {LABEL_STATO_PROGETTO[progetto.documentoStato]} · versione {progetto.versione}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{progetto.titolo}</h2>
              <p className="text-sm text-slate-600">
                {formatDateIt(progetto.dataInizio)}
                {progetto.dataFine ? ` – ${formatDateIt(progetto.dataFine)}` : ""}
                {" · "}
                {progetto.conteggioPartecipanti} partecipanti · {progetto.conteggioDocumenti} documenti · {formatEuro(progetto.totale)}
              </p>
              {progetto.descrizione ? (
                <p className="mt-2 text-sm">{progetto.descrizione}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {progetto.documentoStato === "bozza" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={approva}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    Approva
                  </button>
                ) : null}
                {progetto.documentoStato === "approvato" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={contabilizza}
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Invia pacchetto in contabilità
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <PartecipantiProgettoCampo
                progettoInizio={progetto.dataInizio}
                progettoFine={progetto.dataFine ?? ""}
                soggetti={soggetti}
                voci={partecipanti}
                solaLettura={progetto.documentoStato !== "bozza"}
                pending={pending}
                onAggiungi={(input) => {
                  if (!scelto) return;
                  setErrore(null);
                  start(async () => {
                    const res = await aggiungiPartecipanteProgettoAction({
                      progettoId: scelto,
                      ...input,
                    });
                    if (!res.success) {
                      setErrore(res.error);
                      return;
                    }
                    setMsg("Partecipante aggiunto.");
                    await caricaDettaglio(scelto);
                    const elenco = await listProgettiSpesaAction();
                    if (elenco.success) setProgetti(elenco.progetti);
                  });
                }}
                onRimuovi={(chiave) => {
                  if (!scelto) return;
                  setErrore(null);
                  start(async () => {
                    const res = await rimuoviPartecipanteProgettoAction({
                      progettoId: scelto,
                      partecipanteId: chiave,
                    });
                    if (!res.success) {
                      setErrore(res.error);
                      return;
                    }
                    setMsg("Partecipante tolto.");
                    await caricaDettaglio(scelto);
                    const elenco = await listProgettiSpesaAction();
                    if (elenco.success) setProgetti(elenco.progetti);
                  });
                }}
              />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <h3 className="text-sm font-medium">Totali per categoria</h3>
              {totali.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nessuna spesa collegata.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {totali.map((t) => (
                    <li key={t.categoria} className="flex justify-between gap-3">
                      <span>{LABEL_CATEGORIA_SPESA[t.categoria as keyof typeof LABEL_CATEGORIA_SPESA]}</span>
                      <span className="tabular-nums">{formatEuro(t.totale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Fatture collegate</h3>
                {progetto.documentoStato !== "chiuso" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setFattureAperte(true)}
                    className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-40"
                  >
                    Collega fatture
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Già registrate in area fiscale. L&apos;invio del pacchetto non le contabilizza.
              </p>
              {fatture.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nessuna fattura collegata.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {fatture.map((voce) => (
                    <li key={voce.id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        {voce.origine === "emessa" ? "Emessa" : "Ricevuta"} · {voce.numero}
                        <span className="block text-xs text-[var(--muted)]">
                          {voce.controparte || "—"}
                          {voce.dataDocumento ? ` · ${formatDateIt(voce.dataDocumento)}` : ""}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatEuro(voce.totale)}</span>
                      {progetto.documentoStato !== "chiuso" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!scelto) return;
                            setErrore(null);
                            start(async () => {
                              const res = await scollegaFatturaProgettoAction({
                                progettoId: scelto,
                                collegamentoId: voce.id,
                              });
                              if (!res.success) {
                                setErrore(res.error);
                                return;
                              }
                              setMsg("Fattura scollegata.");
                              await caricaDettaglio(scelto);
                            });
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                        >
                          Scollega
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Spese del progetto</h3>
                {progetto.documentoStato !== "chiuso" ? (
                  <button
                    type="button"
                    disabled={pending || selezionate.length === 0}
                    onClick={() =>
                      aggancia(
                        false,
                        selezionate.filter((id) => collegate.some((c) => c.id === id))
                      )
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Sgancia selezionate
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {collegate.map((s) => (
                  <SpesaVoceProgetto
                    key={s.id}
                    spesa={s}
                    selezionabile={s.stato === "registrato" && progetto.documentoStato !== "chiuso"}
                    selezionata={selezionate.includes(s.id)}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </ul>
            </div>

            {progetto.documentoStato !== "chiuso" ? (
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Spese libere da agganciare</h3>
                  <button
                    type="button"
                    disabled={pending || selezionate.length === 0}
                    onClick={() =>
                      aggancia(
                        true,
                        selezionate.filter((id) => libere.some((c) => c.id === id))
                      )
                    }
                    className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-40"
                  >
                    Aggancia selezionate
                  </button>
                </div>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {libere.length === 0 ? (
                    <li className="py-2 text-slate-500">Nessuna spesa registrata senza progetto.</li>
                  ) : (
                    libere.map((s) => (
                      <SpesaVoceProgetto
                        key={s.id}
                        spesa={s}
                        selezionabile
                        selezionata={selezionate.includes(s.id)}
                        onToggle={() => toggle(s.id)}
                      />
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
      {fattureAperte && scelto ? (
        <CollegaFattureProgetto
          progettoId={scelto}
          onClose={() => setFattureAperte(false)}
          onCollegate={() => {
            setMsg("Fatture collegate. Lo stato SDI non è stato modificato.");
            void caricaDettaglio(scelto);
          }}
        />
      ) : null}
    </div>
  );
}
