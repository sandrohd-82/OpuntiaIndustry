"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  aggiornaApprovvigionamentoAction,
  aggiornaComposizionePianoAction,
  fornitoriCompatibiliApprovvigionamentoAction,
  listaMaterieApprovvigionamentoAction,
  listaOrdiniApprovvigionamentoAction,
  listaPianiApprovvigionamentoAction,
  salvaApprovvigionamentiAction,
  type MateriaCalendario,
  type OrdineCalendario,
  type PianoCalendario,
} from "@/app/actions/approvvigionamento";
import {
  aggiungiGiorni,
  classificaProgrammazione,
  giorniMese,
  giorniSettimana,
  lunediSettimana,
} from "@/lib/produzione/approvvigionamento";

type Vista = "mese" | "settimana" | "giorno";
type RigaForm = { materiaPrimaId: string; quantita: string; note: string };

const FERIE = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function oggiLocale() {
  const data = new Date();
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

function spostaMese(iso: string, delta: number) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  const destinazione = new Date(Date.UTC(anno, mese - 1 + delta, 1));
  const ultimo = new Date(
    Date.UTC(destinazione.getUTCFullYear(), destinazione.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const giornoUtile = Math.min(giorno, ultimo);
  return `${destinazione.getUTCFullYear()}-${pad(destinazione.getUTCMonth() + 1)}-${pad(giornoUtile)}`;
}

function etichettaGiorno(iso: string) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return new Date(anno, mese - 1, giorno).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function celleMese(ancora: string): string[] {
  const primo = `${ancora.slice(0, 7)}-01`;
  const inizio = lunediSettimana(primo);
  const giorni = giorniMese(ancora.slice(0, 7));
  const fine = giorni[giorni.length - 1] ?? primo;
  const ultimo = aggiungiGiorni(lunediSettimana(fine), 6);
  const celle: string[] = [];
  for (let giorno = inizio; giorno <= ultimo; giorno = aggiungiGiorni(giorno, 1)) {
    celle.push(giorno);
    if (celle.length > 42) break;
  }
  return celle;
}

function vuotaRiga(): RigaForm {
  return { materiaPrimaId: "", quantita: "", note: "" };
}

function testoPiani(piani: { codice: string }[]) {
  if (!piani.length) return "Nessun piano creato.";
  return `Piani: ${piani.map((piano) => piano.codice).join(", ")}.`;
}

export function CalendarioApprovvigionamento() {
  const oggi = oggiLocale();
  const [vista, setVista] = useState<Vista>("mese");
  const [ancora, setAncora] = useState(oggi);
  const [giorno, setGiorno] = useState(oggi);
  const [ordini, setOrdini] = useState<OrdineCalendario[]>([]);
  const [piani, setPiani] = useState<PianoCalendario[]>([]);
  const [pianoAperto, setPianoAperto] = useState<string | null>(null);
  const [ordiniPiano, setOrdiniPiano] = useState<OrdineCalendario[]>([]);
  const [composizione, setComposizione] = useState<string[]>([]);
  const [revisione, setRevisione] = useState(1);
  const [materie, setMaterie] = useState<MateriaCalendario[]>([]);
  const [fornitori, setFornitori] = useState<{ id: string; nome: string; targa: string }[]>([]);
  const [ordineId, setOrdineId] = useState<string | null>(null);
  const [fornitoreId, setFornitoreId] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<RigaForm[]>([vuotaRiga()]);
  const [dataCopia, setDataCopia] = useState(oggi);
  const [settimanaDestinazione, setSettimanaDestinazione] = useState(oggi);
  const [piano, setPiano] = useState<string[]>([oggi]);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chiaveRef = useRef<string | null>(null);

  const periodo = useMemo(() => {
    if (vista === "giorno") return { da: ancora, a: ancora };
    if (vista === "settimana") {
      const inizio = lunediSettimana(ancora);
      return { da: inizio, a: aggiungiGiorni(inizio, 6) };
    }
    const celle = celleMese(ancora);
    return { da: celle[0] ?? ancora, a: celle[celle.length - 1] ?? ancora };
  }, [vista, ancora]);

  function ricarica() {
    startTransition(async () => {
      const [res, pianiRes] = await Promise.all([
        listaOrdiniApprovvigionamentoAction(periodo),
        listaPianiApprovvigionamentoAction(periodo),
      ]);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      if (!pianiRes.success) {
        setErrore(pianiRes.error);
        return;
      }
      setOrdini(res.ordini);
      setPiani(pianiRes.piani);
    });
  }

  useEffect(() => {
    ricarica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.da, periodo.a]);

  useEffect(() => {
    let attivo = true;
    void listaMaterieApprovvigionamentoAction().then((res) => {
      if (attivo && res.success) setMaterie(res.materie);
    });
    return () => {
      attivo = false;
    };
  }, []);

  const materieScelte = righe.map((riga) => riga.materiaPrimaId).filter(Boolean);
  const chiaveMaterie = materieScelte.join(",");

  useEffect(() => {
    let attivo = true;
    void fornitoriCompatibiliApprovvigionamentoAction(materieScelte).then((res) => {
      if (!attivo) return;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setFornitori(res.fornitori);
      setFornitoreId((corrente) =>
        res.fornitori.some((fornitore) => fornitore.id === corrente) ? corrente : ""
      );
    });
    return () => {
      attivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveMaterie]);

  function chiaveStabile() {
    if (!chiaveRef.current) chiaveRef.current = crypto.randomUUID();
    return chiaveRef.current;
  }

  function chiudiOperazione() {
    chiaveRef.current = null;
  }

  function apriGiorno(iso: string) {
    setGiorno(iso);
    setAncora(iso);
    setVista("giorno");
    setOrdineId(null);
    setRevisione(1);
    setNote("");
    setRighe([vuotaRiga()]);
    setFornitoreId("");
    chiudiOperazione();
  }

  function compila(ordine: OrdineCalendario) {
    setOrdineId(ordine.id);
    setRevisione(ordine.revisione);
    setGiorno(ordine.dataConsegna);
    setFornitoreId(ordine.fornitoreId);
    setNote(ordine.note);
    setRighe(
      ordine.righe.map((riga) => ({
        materiaPrimaId: riga.materiaPrimaId,
        quantita: String(riga.quantita),
        note: riga.note,
      }))
    );
    chiudiOperazione();
  }

  function payloadRighe() {
    return righe
      .filter((riga) => riga.materiaPrimaId)
      .map((riga) => {
        const materia = materie.find((voce) => voce.id === riga.materiaPrimaId);
        return {
          materiaPrimaId: riga.materiaPrimaId,
          quantita: Number(riga.quantita.replace(",", ".")),
          unitaMisura: materia?.unitaMisura ?? "",
          note: riga.note,
        };
      });
  }

  function mancaUnita() {
    return payloadRighe().some((riga) => !riga.unitaMisura);
  }

  function salva() {
    setErrore(null);
    setMessaggio(null);
    const corpo = {
      fornitoreId,
      dataConsegna: giorno,
      note,
      righe: payloadRighe(),
    };
    startTransition(async () => {
      const res = ordineId
        ? await aggiornaApprovvigionamentoAction({
            chiave: chiaveStabile(),
            ordineId,
            revisione,
            ordine: corpo,
          })
        : await salvaApprovvigionamentiAction({
            chiave: chiaveStabile(),
            tipo: "crea",
            ordini: [corpo],
          });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(res.riusata ? "Operazione già registrata." : "Bozza registrata.");
      setOrdineId(null);
      setRevisione(1);
      ricarica();
    });
  }

  function copiaOrdine(ordine: OrdineCalendario) {
    setErrore(null);
    startTransition(async () => {
      const res = await salvaApprovvigionamentiAction({
        chiave: chiaveStabile(),
        tipo: "copia",
        ordini: [
          {
            fornitoreId: ordine.fornitoreId,
            dataConsegna: dataCopia,
            note: ordine.note,
            origineOrdineId: ordine.id,
            righe: ordine.righe.map((riga) => ({
              materiaPrimaId: riga.materiaPrimaId,
              quantita: riga.quantita,
              unitaMisura: riga.unitaMisura,
              note: riga.note,
            })),
          },
        ],
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        res.riusata ? "Copia già registrata." : "Nuova bozza copiata. La copia non entra in un piano."
      );
      ricarica();
    });
  }

  function copiaSettimanaCorrente() {
    const inizio = lunediSettimana(ancora);
    const destinazione = lunediSettimana(settimanaDestinazione);
    const spostamento =
      (Date.parse(`${destinazione}T00:00:00Z`) - Date.parse(`${inizio}T00:00:00Z`)) / 86_400_000;
    setErrore(null);
    startTransition(async () => {
      const caricati = await listaOrdiniApprovvigionamentoAction({
        da: inizio,
        a: aggiungiGiorni(inizio, 6),
      });
      if (!caricati.success) {
        setErrore(caricati.error);
        return;
      }
      const origine = caricati.ordini;
      if (!origine.length) {
        setErrore("Nella settimana di origine non ci sono ordini.");
        return;
      }
      const res = await salvaApprovvigionamentiAction({
        chiave: chiaveStabile(),
        tipo: "settimana",
        ordini: origine.map((ordine) => ({
          fornitoreId: ordine.fornitoreId,
          dataConsegna: aggiungiGiorni(ordine.dataConsegna, spostamento),
          note: ordine.note,
          origineOrdineId: ordine.id,
          righe: ordine.righe.map((riga) => ({
            materiaPrimaId: riga.materiaPrimaId,
            quantita: riga.quantita,
            unitaMisura: riga.unitaMisura,
            note: riga.note,
          })),
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        res.riusata
          ? "Settimana già copiata."
          : `Settimana copiata. ${testoPiani(res.piani)}`
      );
      ricarica();
    });
  }

  function programmaMese() {
    const date = [...new Set(piano)].sort();
    const classe = classificaProgrammazione(date);
    const righePayload = payloadRighe();
    if (classe.tipo === "errore") {
      setErrore(classe.motivo);
      return;
    }
    if (date.length > 31) {
      setErrore("Il piano deve contenere da 1 a 31 giorni.");
      return;
    }
    setErrore(null);
    startTransition(async () => {
      const res = await salvaApprovvigionamentiAction({
        chiave: chiaveStabile(),
        tipo: classe.tipo,
        ordini: date.map((dataConsegna) => ({
          fornitoreId,
          dataConsegna,
          note,
          righe: righePayload,
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        res.riusata
          ? "Piano già registrato."
          : `Create ${res.ordini.length} bozze. ${testoPiani(res.piani)}`
      );
      ricarica();
    });
  }

  function apriPiano(scelto: PianoCalendario) {
    setPianoAperto(scelto.id);
    setComposizione(scelto.ordini);
    chiudiOperazione();
    startTransition(async () => {
      const res = await listaOrdiniApprovvigionamentoAction({
        da: scelto.periodoInizio,
        a: scelto.periodoFine,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setOrdiniPiano(res.ordini);
    });
  }

  function salvaComposizione() {
    const scelto = piani.find((voce) => voce.id === pianoAperto);
    if (!scelto || composizione.length === 0) {
      setErrore("Il piano deve contenere almeno un ordine.");
      return;
    }
    setErrore(null);
    startTransition(async () => {
      const res = await aggiornaComposizionePianoAction({
        chiave: chiaveStabile(),
        pianoId: scelto.id,
        revisione: scelto.revisione,
        ordineIds: composizione,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(res.riusata ? "Composizione già registrata." : "Composizione aggiornata.");
      ricarica();
    });
  }

  const celle = vista === "mese" ? celleMese(ancora) : giorniSettimana(ancora);
  const delGiorno = ordini.filter((ordine) => ordine.dataConsegna === giorno);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(["mese", "settimana", "giorno"] as const).map((voce) => (
              <button
                key={voce}
                type="button"
                onClick={() => setVista(voce)}
                className={`rounded-md px-3 py-1.5 text-sm ${vista === voce ? "bg-slate-900 text-white" : "text-slate-700"}`}
              >
                {voce === "mese" ? "Mese" : (voce === "settimana" ? "Settimana" : "Giorno")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setAncora((corrente) =>
                vista === "mese"
                  ? spostaMese(corrente, -1)
                  : aggiungiGiorni(corrente, vista === "settimana" ? -7 : -1)
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Precedente
          </button>
          <button
            type="button"
            onClick={() => setAncora(oggi)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() =>
              setAncora((corrente) =>
                vista === "mese"
                  ? spostaMese(corrente, 1)
                  : aggiungiGiorni(corrente, vista === "settimana" ? 7 : 1)
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Successivo
          </button>
          <p className="text-sm text-slate-600">{etichettaGiorno(ancora)}</p>
        </div>
        {vista !== "giorno" ? (
          <div className="grid grid-cols-7 gap-1">
            {FERIE.map((nome) => (
              <div key={nome} className="px-1 text-center text-xs font-medium text-slate-500">
                {nome}
              </div>
            ))}
            {(vista === "mese" ? celle : giorniSettimana(ancora)).map((iso) => {
              const voci = ordini.filter((ordine) => ordine.dataConsegna === iso);
              const fuoriMese = vista === "mese" && iso.slice(0, 7) !== ancora.slice(0, 7);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => apriGiorno(iso)}
                  className={`min-h-24 rounded-lg border p-1 text-left ${iso === giorno ? "border-slate-900" : "border-slate-200"} ${fuoriMese ? "bg-slate-50 text-slate-400" : "bg-white"}`}
                >
                  <span className="text-xs font-medium">{Number(iso.slice(8))}</span>
                  <ul className="mt-1 space-y-1">
                    {voci.slice(0, 3).map((ordine) => (
                      <li
                        key={ordine.id}
                        className="truncate rounded bg-amber-50 px-1 text-[11px] text-amber-950"
                      >
                        {ordine.codice} · {ordine.fornitore}
                      </li>
                    ))}
                    {voci.length > 3 ? (
                      <li className="text-[11px] text-slate-500">+{voci.length - 3}</li>
                    ) : null}
                  </ul>
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-2">
            {delGiorno.length === 0 ? (
              <li className="text-sm text-slate-500">Nessuna bozza in questo giorno.</li>
            ) : (
              delGiorno.map((ordine) => (
                <li key={ordine.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <button type="button" onClick={() => compila(ordine)} className="font-medium text-slate-900">
                    {ordine.codice} · {ordine.fornitore}
                  </button>
                  <p className="text-slate-600">
                    Bozza {ordine.revisione}
                    {ordine.pianoCodice ? ` · ${ordine.pianoCodice}` : ""}
                    {" · "}
                    {ordine.righe.map((riga) => `${riga.nome} ${riga.quantita} ${riga.unitaMisura}`).join(", ")}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </section>
      <Scheda
        giorno={giorno}
        ordini={delGiorno}
        materie={materie}
        fornitori={fornitori}
        ordineId={ordineId}
        fornitoreId={fornitoreId}
        note={note}
        righe={righe}
        dataCopia={dataCopia}
        settimanaDestinazione={settimanaDestinazione}
        piano={piano}
        pending={pending}
        errore={errore}
        messaggio={messaggio}
        mancaUnita={mancaUnita()}
        onGiorno={setGiorno}
        onFornitore={setFornitoreId}
        onNote={setNote}
        onRighe={setRighe}
        onDataCopia={setDataCopia}
        onSettimana={setSettimanaDestinazione}
        onPiano={setPiano}
        onSalva={salva}
        onCopia={copiaOrdine}
        onCopiaSettimana={copiaSettimanaCorrente}
        onMese={programmaMese}
        onCompila={compila}
        onNuova={() => {
          setOrdineId(null);
          setRevisione(1);
          setNote("");
          setRighe([vuotaRiga()]);
          chiudiOperazione();
        }}
      />
      <section className="rounded-xl border border-[var(--border)] bg-white p-3 xl:col-span-2">
        <h2 className="text-sm font-semibold text-slate-800">Piani del periodo</h2>
        {piani.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Un piano nasce dalla copia di una settimana o da una programmazione, ed è di un solo fornitore.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {piani.map((voce) => (
              <li key={voce.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                <button type="button" onClick={() => apriPiano(voce)} className="font-medium text-slate-900">
                  {voce.codice} · {voce.fornitore}
                </button>
                <p className="text-slate-600">
                  {voce.tipologia === "mensile" ? "Mensile" : "Settimanale"} · Bozza {voce.revisione} ·{" "}
                  {voce.periodoInizio} – {voce.periodoFine} · {voce.ordini.length} ordini
                </p>
              </li>
            ))}
          </ul>
        )}
        {pianoAperto ? (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="mb-2 text-sm text-slate-700">Composizione prima della pubblicazione</p>
            <ul className="space-y-1">
              {ordiniPiano
                .filter((ordine) => {
                  const scelto = piani.find((voce) => voce.id === pianoAperto);
                  if (!scelto || ordine.fornitoreId !== scelto.fornitoreId) return false;
                  return !ordine.pianoId || ordine.pianoId === pianoAperto;
                })
                .map((ordine) => (
                  <li key={ordine.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={composizione.includes(ordine.id)}
                        onChange={(event) =>
                          setComposizione((corrente) =>
                            event.target.checked
                              ? [...corrente, ordine.id]
                              : corrente.filter((id) => id !== ordine.id)
                          )
                        }
                      />
                      <span>
                        {ordine.codice} · {ordine.dataConsegna}
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              disabled={pending || composizione.length === 0}
              onClick={salvaComposizione}
              className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Salva composizione
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Scheda(props: {
  giorno: string;
  ordini: OrdineCalendario[];
  materie: MateriaCalendario[];
  fornitori: { id: string; nome: string; targa: string }[];
  ordineId: string | null;
  fornitoreId: string;
  note: string;
  righe: RigaForm[];
  dataCopia: string;
  settimanaDestinazione: string;
  piano: string[];
  pending: boolean;
  errore: string | null;
  messaggio: string | null;
  mancaUnita: boolean;
  onGiorno: (valore: string) => void;
  onFornitore: (valore: string) => void;
  onNote: (valore: string) => void;
  onRighe: (valore: RigaForm[]) => void;
  onDataCopia: (valore: string) => void;
  onSettimana: (valore: string) => void;
  onPiano: (valore: string[]) => void;
  onSalva: () => void;
  onCopia: (ordine: OrdineCalendario) => void;
  onCopiaSettimana: () => void;
  onMese: () => void;
  onCompila: (ordine: OrdineCalendario) => void;
  onNuova: () => void;
}) {
  return (
    <aside className="rounded-xl border border-[var(--border)] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Scheda del {etichettaGiorno(props.giorno)}</h2>
        <button type="button" onClick={props.onNuova} className="text-sm text-sky-800">
          Nuova bozza
        </button>
      </div>
      {props.messaggio ? <p className="mb-2 text-sm text-emerald-800">{props.messaggio}</p> : null}
      {props.errore ? <p className="mb-2 text-sm text-red-700">{props.errore}</p> : null}
      <label className="mb-2 block text-sm">
        Data di consegna
        <input
          type="date"
          value={props.giorno}
          onChange={(event) => props.onGiorno(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="space-y-2">
        {props.righe.map((riga, indice) => {
          const materia = props.materie.find((voce) => voce.id === riga.materiaPrimaId);
          return (
            <div key={`${indice}-${riga.materiaPrimaId}`} className="rounded-lg border border-slate-200 p-2">
              <select
                value={riga.materiaPrimaId}
                onChange={(event) => {
                  const copia = [...props.righe];
                  copia[indice] = { ...riga, materiaPrimaId: event.target.value };
                  props.onRighe(copia);
                }}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">Materia prima</option>
                {props.materie.map((voce) => (
                  <option key={voce.id} value={voce.id}>
                    {voce.codice} · {voce.nome}
                    {voce.unitaMisura ? ` · ${voce.unitaMisura}` : " · unità da impostare"}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <input
                  value={riga.quantita}
                  onChange={(event) => {
                    const copia = [...props.righe];
                    copia[indice] = { ...riga, quantita: event.target.value };
                    props.onRighe(copia);
                  }}
                  inputMode="decimal"
                  placeholder="Quantità"
                  className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <span className="self-center text-sm text-slate-600">
                  {materia?.unitaMisura ?? "senza unità"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => props.onRighe([...props.righe, vuotaRiga()])}
        className="mt-2 text-sm text-sky-800"
      >
        Aggiungi riga
      </button>
      {props.mancaUnita ? (
        <p className="mt-2 text-sm text-amber-900">
          Una materia non ha unità nel catalogo. Impostala in Amministrazione, scheda materia prima.
        </p>
      ) : null}
      <label className="mt-3 block text-sm">
        Fornitore abilitato
        <select
          value={props.fornitoreId}
          onChange={(event) => props.onFornitore(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">Seleziona</option>
          {props.fornitori.map((fornitore) => (
            <option key={fornitore.id} value={fornitore.id}>
              {fornitore.targa} · {fornitore.nome}
            </option>
          ))}
        </select>
      </label>
      {props.fornitori.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Nessun fornitore compatibile e abilitato per queste materie.
        </p>
      ) : null}
      <label className="mt-3 block text-sm">
        Note
        <textarea
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
          className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={props.pending || props.mancaUnita || !props.fornitoreId}
        onClick={props.onSalva}
        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {props.ordineId ? "Salva modifica" : "Crea bozza"}
      </button>
      <div className="mt-3 rounded-lg border border-slate-200 p-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Piano su più giorni
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              props.onPiano(
                props.piano.includes(props.giorno)
                  ? props.piano
                  : [...props.piano, props.giorno].sort()
              )
            }
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            Aggiungi questo giorno
          </button>
          <button
            type="button"
            onClick={() => props.onPiano(giorniMese(props.giorno.slice(0, 7)))}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            Tutto il mese
          </button>
          <button
            type="button"
            onClick={() => props.onPiano([])}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            Svuota
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">{props.piano.length} giorni selezionati</p>
        <button
          type="button"
          disabled={props.pending || props.mancaUnita || !props.fornitoreId || props.piano.length === 0}
          onClick={props.onMese}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
        >
          Crea le bozze del piano
        </button>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Copie</p>
        <label className="block text-sm">
          Copia un ordine su
          <input
            type="date"
            value={props.dataCopia}
            onChange={(event) => props.onDataCopia(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <ul className="mt-2 space-y-1">
          {props.ordini.map((ordine) => (
            <li key={ordine.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => props.onCompila(ordine)} className="truncate text-left">
                {ordine.codice}
              </button>
              <button
                type="button"
                disabled={props.pending}
                onClick={() => props.onCopia(ordine)}
                className="text-sky-800 disabled:opacity-60"
              >
                Copia
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 block text-sm">
          Copia la settimana su
          <input
            type="date"
            value={props.settimanaDestinazione}
            onChange={(event) => props.onSettimana(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={props.pending}
          onClick={props.onCopiaSettimana}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
        >
          Copia settimana
        </button>
      </div>
    </aside>
  );
}
