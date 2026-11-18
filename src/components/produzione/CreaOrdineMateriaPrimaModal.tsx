"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  emailFornitoreApprovvigionamentoAction,
  fornitoriCompatibiliApprovvigionamentoAction,
  type MateriaCalendario,
} from "@/app/actions/approvvigionamento";
import { SelettoreUnita } from "@/components/produzione/SelettoreUnita";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  aggiungiGiorni,
  anteprimaConsegne,
  giorniMese,
  indiceGiornoSettimana,
  lunediSettimana,
  NOMI_GIORNO_SETTIMANA,
  primoGiornoUtile,
  resocontoConAnteprima,
  type ConsegnaAnteprima,
  type FrequenzaProcedura,
  type TipoQuantitaApprovvigionamento,
} from "@/lib/produzione/approvvigionamento";
import {
  pdfPianificazione,
  xlsxPianificazione,
} from "@/lib/produzione/documento-pianificazione";
import {
  DESTINATARIO_PROVA,
  bozzaInvioConferma,
  validaDestinatarioSingolo,
} from "@/lib/produzione/invio-conferma";
import { etichettaUnita } from "@/lib/produzione/unita-approvvigionamento";

export type InvioBozzaOrdine = {
  invia: boolean;
  destinatario: string;
  oggetto: string;
  testo: string;
  pdf: boolean;
  xlsx: boolean;
  confermaIncerta: boolean;
};

export type BozzaOrdineMateria = {
  operazione: "singolo" | "pianificazione";
  fornitoreId: string;
  note: string;
  materiaId: string;
  unitaSigla: string;
  unitaNome: string;
  personalizzata: boolean;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  inizio: string;
  fine: string;
  tipologia: "regolare" | "personalizzata" | "giorni_fissi";
  ogniGiorni: number | null;
  consegne: ConsegnaAnteprima[];
  invio?: InvioBozzaOrdine;
};

const PASSI = [
  "Tipo",
  "Dati",
  "Frequenza",
  "Anteprima",
  "Riepilogo",
] as const;

const GIORNI_UI = [
  { indice: 1, nome: "Lunedì" },
  { indice: 2, nome: "Martedì" },
  { indice: 3, nome: "Mercoledì" },
  { indice: 4, nome: "Giovedì" },
  { indice: 5, nome: "Venerdì" },
  { indice: 6, nome: "Sabato" },
  { indice: 0, nome: "Domenica" },
];

function oggiIso() {
  const adesso = new Date();
  const mese = String(adesso.getMonth() + 1).padStart(2, "0");
  const giorno = String(adesso.getDate()).padStart(2, "0");
  return `${adesso.getFullYear()}-${mese}-${giorno}`;
}

function numeroTesto(testo: string) {
  const valore = Number(testo.replace(",", "."));
  return Number.isFinite(valore) ? valore : Number.NaN;
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

function nomeGiorno(iso: string) {
  const nome = NOMI_GIORNO_SETTIMANA[indiceGiornoSettimana(iso)] ?? "";
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function CreaOrdineMateriaPrimaModal(props: {
  materie: MateriaCalendario[];
  fornitori: { id: string; nome: string; targa: string }[];
  pending: boolean;
  prova: boolean;
  errore: string | null;
  onClose: () => void;
  onSalva: (bozza: BozzaOrdineMateria) => void;
}) {
  const titoloId = useId();
  const dialogo = useRef<HTMLDivElement>(null);
  const oggi = oggiIso();
  const [passo, setPasso] = useState(1);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  const [operazione, setOperazione] = useState<"" | "singolo" | "pianificazione">("");
  const [fornitoreId, setFornitoreId] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [unitaSigla, setUnitaSigla] = useState("");
  const [unitaNome, setUnitaNome] = useState("");
  const [personalizzata, setPersonalizzata] = useState(false);
  const [tipoQuantita, setTipoQuantita] = useState<TipoQuantitaApprovvigionamento>("precisa");
  const [quantita, setQuantita] = useState("");
  const [inizio, setInizio] = useState(oggi);
  const [fine, setFine] = useState(aggiungiGiorni(oggi, 14));
  const [note, setNote] = useState("");
  const [frequenza, setFrequenza] = useState<FrequenzaProcedura>("ogni_n");
  const [ogniGiorni, setOgniGiorni] = useState("3");
  const [primaConsegna, setPrimaConsegna] = useState(oggi);
  const [giorniConsentiti, setGiorniConsentiti] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dateScelte, setDateScelte] = useState<string[]>([]);
  const [mese, setMese] = useState(oggi);
  const [fornitoriElenco, setFornitoriElenco] = useState<
    { id: string; nome: string; targa: string }[]
  >([]);
  const [fornitoriMessaggio, setFornitoriMessaggio] = useState<string | null>(
    "Seleziona la materia prima per vedere i fornitori abilitati."
  );
  const [consegne, setConsegne] = useState<ConsegnaAnteprima[]>([]);
  const [escluse, setEscluse] = useState<string[]>([]);
  const [nuovaData, setNuovaData] = useState(oggi);

  useEffect(() => {
    dialogo.current?.focus();
  }, []);

  useEffect(() => {
    if (!materiaId) {
      setFornitoriElenco([]);
      setFornitoriMessaggio("Seleziona la materia prima per vedere i fornitori abilitati.");
      setFornitoreId("");
      return;
    }
    let attivo = true;
    setFornitoriMessaggio("Caricamento fornitori…");
    void fornitoriCompatibiliApprovvigionamentoAction([materiaId]).then((res) => {
      if (!attivo) return;
      if (!res.success) {
        setFornitoriElenco([]);
        setFornitoriMessaggio(res.error);
        return;
      }
      setFornitoriElenco(res.fornitori);
      setFornitoriMessaggio(
        res.fornitori.length === 0
          ? "Nessun fornitore abilitato per questa materia prima."
          : null
      );
      setFornitoreId((corrente) =>
        res.fornitori.some((voce) => voce.id === corrente) ? corrente : ""
      );
    });
    return () => {
      attivo = false;
    };
  }, [materiaId]);

  useEffect(() => {
    if (passo === 3 && inizio) setMese(inizio);
  }, [passo, inizio]);

  useEffect(() => {
    const utile = primoGiornoUtile(inizio, fine, giorniConsentiti);
    if (!utile) return;
    setPrimaConsegna((corrente) => {
      const nelPeriodo = corrente >= inizio && corrente <= fine;
      const consentito = giorniConsentiti.includes(indiceGiornoSettimana(corrente));
      if (nelPeriodo && consentito) return corrente;
      return utile;
    });
  }, [inizio, fine, giorniConsentiti]);

  function tocca<T>(aggiorna: (valore: T) => void) {
    return (valore: T) => {
      setErroreLocale(null);
      aggiorna(valore);
    };
  }

  function calcola() {
    return anteprimaConsegne({
      operazione: operazione === "singolo" ? "singolo" : "pianificazione",
      data: inizio,
      inizio,
      fine,
      frequenza: operazione === "singolo" ? undefined : frequenza,
      primaConsegna,
      giorniConsentiti,
      ogniGiorni: Number(ogniGiorni),
      dateScelte,
      quantita: numeroTesto(quantita),
      copiaQuantita: true,
      tipoQuantita,
      unitaMisura: unitaSigla,
    });
  }

  function valida(corrente: number): string | null {
    if (corrente === 1 && operazione === "") return "Scegli ordine singolo o pianificazione.";
    if (corrente === 2) {
      if (!fornitoreId) return "Seleziona il fornitore.";
      if (!materiaId) return "Seleziona la materia prima.";
      if (!unitaSigla.trim()) return "Indica l'unità di misura.";
      if (!(numeroTesto(quantita) > 0)) return "Indica una quantità maggiore di zero.";
      if (!inizio) return "Indica la data iniziale.";
      if (operazione === "pianificazione" && fine < inizio) {
        return "La data fine precede la data inizio.";
      }
    }
    if (corrente === 3 && operazione === "pianificazione") {
      if (
        frequenza === "ogni_n" &&
        !giorniConsentiti.includes(indiceGiornoSettimana(primaConsegna))
      ) {
        return "Il primo giorno deve essere uno dei giorni consentiti.";
      }
      const gen = calcola();
      if (!gen.ok) return gen.motivo;
    }
    if (corrente === 4) {
      if (consegne.length === 0) return "Non ci sono consegne da registrare.";
      const viste = new Set<string>();
      for (const consegna of consegne) {
        if (viste.has(consegna.data)) return `La data ${consegna.data} è ripetuta.`;
        viste.add(consegna.data);
        if (!(consegna.quantita > 0)) return `Indica la quantità del ${consegna.data}.`;
        if (operazione === "pianificazione" && (consegna.data < inizio || consegna.data > fine)) {
          return `La consegna del ${consegna.data} è fuori dal periodo.`;
        }
      }
    }
    return null;
  }

  function avanti() {
    const motivo = valida(passo);
    if (motivo) {
      setErroreLocale(motivo);
      return;
    }
    if (passo === 3) {
      const gen = calcola();
      if (!gen.ok) {
        setErroreLocale(gen.motivo);
        return;
      }
      setConsegne(gen.consegne);
      setEscluse(gen.escluse);
    }
    setErroreLocale(null);
    setPasso((corrente) => Math.min(5, corrente + 1));
  }

  function bozza(): BozzaOrdineMateria {
    let tipologia: BozzaOrdineMateria["tipologia"] = "regolare";
    if (frequenza === "giorni_fissi") tipologia = "giorni_fissi";
    else if (frequenza === "manuale") tipologia = "personalizzata";
    return {
      operazione: operazione === "singolo" ? "singolo" : "pianificazione",
      fornitoreId,
      note,
      materiaId,
      unitaSigla,
      unitaNome,
      personalizzata,
      tipoQuantita,
      inizio,
      fine: operazione === "singolo" ? inizio : fine,
      tipologia,
      ogniGiorni: tipologia === "regolare" ? Number(ogniGiorni) : null,
      consegne,
    };
  }

  const [invioAperto, setInvioAperto] = useState(false);
  const [inviaEmail, setInviaEmail] = useState(true);
  const [destinatario, setDestinatario] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [testo, setTesto] = useState("");
  const [allegaPdf, setAllegaPdf] = useState(true);
  const [allegaXlsx, setAllegaXlsx] = useState(false);
  const [confermaIncerta, setConfermaIncerta] = useState(false);

  function salva() {
    const motivo = valida(4);
    if (motivo) {
      setErroreLocale(motivo);
      return;
    }
    props.onSalva(bozza());
  }

  function apriConferma() {
    const motivo = valida(4);
    if (motivo) {
      setErroreLocale(motivo);
      return;
    }
    const bozzaMail = bozzaInvioConferma(props.prova);
    setInviaEmail(true);
    setDestinatario(props.prova ? DESTINATARIO_PROVA : "");
    setOggetto(bozzaMail.oggetto);
    setTesto(bozzaMail.testo);
    setAllegaPdf(true);
    setAllegaXlsx(false);
    setConfermaIncerta(false);
    setErroreLocale(null);
    setInvioAperto(true);
    if (!props.prova && fornitoreId) {
      void emailFornitoreApprovvigionamentoAction(fornitoreId).then((res) => {
        if (res.success && res.email) {
          setDestinatario((corrente) => corrente || res.email);
        }
      });
    }
  }

  function confermaESalva() {
    if (inviaEmail) {
      const esito = validaDestinatarioSingolo(destinatario);
      if (!esito.ok) {
        setErroreLocale(esito.motivo);
        return;
      }
      if (oggetto.trim().length < 3 || testo.trim().length < 3) {
        setErroreLocale("Oggetto e testo sono obbligatori.");
        return;
      }
    }
    props.onSalva({
      ...bozza(),
      invio: {
        invia: inviaEmail,
        destinatario,
        oggetto,
        testo,
        pdf: allegaPdf,
        xlsx: allegaXlsx,
        confermaIncerta,
      },
    });
  }

  function chiudi() {
    props.onClose();
  }

  const materia = props.materie.find((voce) => voce.id === materiaId);
  const fornitore = fornitoriElenco.find((voce) => voce.id === fornitoreId);
  const unita = etichettaUnita(unitaSigla, personalizzata ? unitaNome : "");
  const generazione = passo === 3 ? calcola() : null;
  const escluseVisibili = generazione && generazione.ok ? generazione.escluse : escluse;
  const resoconto = resocontoConAnteprima({
    salvate: [],
    anteprima: consegne.map((consegna) => ({
      data: consegna.data,
      materiaId: materiaId || "anteprima",
      materia: materia ? `${materia.codice} ${materia.nome}` : "Materia",
      unita: consegna.unitaMisura,
      tipoQuantita: consegna.tipoQuantita,
      quantita: consegna.quantita,
    })),
  });
  const giorniConsentitiTesto = GIORNI_UI.filter((giorno) =>
    giorniConsentiti.includes(giorno.indice)
  )
    .map((giorno) => giorno.nome)
    .join(", ");
  let regola = "Ordine singolo, una sola consegna.";
  if (operazione === "pianificazione" && frequenza === "ogni_n") {
    regola = `Ogni ${ogniGiorni} giorni di calendario, prima consegna ${primaConsegna}. Giorni consentiti: ${giorniConsentitiTesto}. Un giorno non consentito si salta e non si sposta.`;
  } else if (operazione === "pianificazione" && frequenza === "giorni_fissi") {
    regola = `Giorni fissi della settimana: ${giorniConsentitiTesto}.`;
  } else if (operazione === "pianificazione") {
    regola = "Date scelte direttamente sul calendario.";
  }
  const precise = consegne
    .filter((consegna) => consegna.tipoQuantita === "precisa")
    .reduce((totale, consegna) => totale + consegna.quantita, 0);
  const stimate = consegne
    .filter((consegna) => consegna.tipoQuantita === "stimata")
    .reduce((totale, consegna) => totale + consegna.quantita, 0);

  function alternaGiorno(indice: number) {
    setGiorniConsentiti((correnti) =>
      correnti.includes(indice)
        ? correnti.filter((giorno) => giorno !== indice)
        : [...correnti, indice]
    );
  }

  function alternaData(iso: string) {
    if (operazione !== "pianificazione" || frequenza !== "manuale") return;
    if (iso < inizio || iso > fine) return;
    setDateScelte((correnti) =>
      correnti.includes(iso) ? correnti.filter((data) => data !== iso) : [...correnti, iso].sort()
    );
  }

  function aggiornaConsegna(indice: number, patch: Partial<ConsegnaAnteprima>) {
    setConsegne((correnti) =>
      correnti.map((consegna, posizione) =>
        posizione === indice ? { ...consegna, ...patch } : consegna
      )
    );
  }

  function copiaQuantita() {
    const base = numeroTesto(quantita);
    if (!(base > 0)) {
      setErroreLocale("Indica prima la quantità da copiare.");
      return;
    }
    setConsegne((correnti) => correnti.map((consegna) => ({ ...consegna, quantita: base })));
  }

  function aggiungiConsegna() {
    if (!nuovaData) return;
    if (operazione === "pianificazione" && (nuovaData < inizio || nuovaData > fine)) {
      setErroreLocale("La nuova consegna è fuori dal periodo.");
      return;
    }
    if (consegne.some((consegna) => consegna.data === nuovaData)) {
      setErroreLocale("Questa data è già presente.");
      return;
    }
    const base = numeroTesto(quantita);
    setErroreLocale(null);
    setConsegne((correnti) =>
      [
        ...correnti,
        {
          data: nuovaData,
          quantita: base > 0 ? base : 0,
          tipoQuantita,
          unitaMisura: unitaSigla,
        },
      ].sort((a, b) => a.data.localeCompare(b.data))
    );
  }

  function esporta(tipo: "pdf" | "xlsx") {
    const documento = {
      codice: props.prova ? "Anteprima di prova" : "Anteprima",
      fornitore: fornitore?.nome ?? "Fornitore",
      materia: materia ? `${materia.codice} ${materia.nome}` : "Materia",
      unita,
      periodoInizio: inizio,
      periodoFine: operazione === "singolo" ? inizio : fine,
      note: note || "Anteprima non salvata. Nessuna mail al fornitore.",
      consegne: consegne.map((consegna) => ({
        data: consegna.data,
        quantita: consegna.quantita,
        tipoQuantita: consegna.tipoQuantita,
        stato: "prevista",
        unita: consegna.unitaMisura,
      })),
    };
    if (tipo === "pdf") {
      scarica("anteprima-pianificazione.pdf", pdfPianificazione(documento), "application/pdf");
      return;
    }
    void xlsxPianificazione(documento).then((bytes) =>
      scarica(
        "anteprima-pianificazione.xlsx",
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    );
  }

  const celle = celleMese(mese);
  const errore = erroreLocale || props.errore;
  const etichettaConferma = operazione === "singolo" ? "Conferma ordine" : "Conferma pianificazione";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) chiudi();
      }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titoloId}
        tabIndex={-1}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") {
            evento.preventDefault();
            if (invioAperto) {
              setInvioAperto(false);
              return;
            }
            chiudi();
          }
        }}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id={titoloId} className="text-lg font-semibold text-slate-900">
              Crea ordine materia prima
            </h2>
            <p className="text-sm text-slate-600">
              Passaggio {passo} di 5 · {PASSI[passo - 1]}. Salva bozza non invia email.
            </p>
          </div>
          <button type="button" onClick={chiudi} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            Chiudi
          </button>
        </div>
        <ol className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2 text-xs">
          {PASSI.map((nome, indice) => (
            <li
              key={nome}
              aria-current={passo === indice + 1 ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${passo === indice + 1 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {indice + 1}. {nome}
            </li>
          ))}
        </ol>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {props.prova ? (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Modalità test: il salvataggio resta nel database con codice TEST-. Non usa i progressivi AP- o PP-, non pubblica e non genera carichi. L&apos;email, se richiesta, non usa l&apos;indirizzo del fornitore.
            </p>
          ) : null}
          {passo === 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => tocca(setOperazione)("singolo")}
                className={`rounded-xl border px-4 py-6 text-left ${operazione === "singolo" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
              >
                <span className="block text-base font-semibold">Ordine singolo</span>
                <span className="mt-1 block text-sm opacity-80">Una sola consegna.</span>
              </button>
              <button
                type="button"
                onClick={() => tocca(setOperazione)("pianificazione")}
                className={`rounded-xl border px-4 py-6 text-left ${operazione === "pianificazione" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
              >
                <span className="block text-base font-semibold">Pianificazione di consegne multiple</span>
                <span className="mt-1 block text-sm opacity-80">Più date nello stesso periodo.</span>
              </button>
            </div>
          ) : null}
          {passo === 2 ? (
            <div className="space-y-3">
              <div className="flex flex-nowrap items-end gap-2 overflow-x-auto">
                <label className="block min-w-52 flex-1 text-sm">
                  Materia prima
                  <select
                    value={materiaId}
                    onChange={(evento) => {
                      const id = evento.target.value;
                      tocca(setMateriaId)(id);
                      const catalogo = props.materie.find((voce) => voce.id === id)?.unitaMisura ?? "";
                      setUnitaSigla(catalogo);
                      setUnitaNome("");
                      setPersonalizzata(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Seleziona</option>
                    {props.materie.map((voce) => (
                      <option key={voce.id} value={voce.id}>
                        {voce.codice} · {voce.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block w-28 shrink-0 text-sm">
                  <span className="inline-flex items-center gap-1">
                    Quantità
                    {operazione === "pianificazione" ? (
                      <InfoHint title="Quantità per consegna" overlayClassName="z-[120]">
                        La quantità è quella di ogni giorno di arrivo previsto, non il totale di tutta la pianificazione.
                      </InfoHint>
                    ) : null}
                  </span>
                  <input
                    value={quantita}
                    inputMode="decimal"
                    onChange={(evento) => tocca(setQuantita)(evento.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <SelettoreUnita
                  sigla={unitaSigla}
                  nome={unitaNome}
                  personalizzata={personalizzata}
                  onChange={(valore) => {
                    setUnitaSigla(valore.sigla);
                    setUnitaNome(valore.nome);
                    setPersonalizzata(valore.personalizzata);
                  }}
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => tocca(setTipoQuantita)("precisa")}
                    className={`rounded-lg border px-3 py-2 text-sm ${tipoQuantita === "precisa" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
                  >
                    Precisa
                  </button>
                  <button
                    type="button"
                    onClick={() => tocca(setTipoQuantita)("stimata")}
                    className={`rounded-lg border px-3 py-2 text-sm ${tipoQuantita === "stimata" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
                  >
                    Stimata
                  </button>
                </div>
              </div>
              <label className="block text-sm">
                Fornitore
                <select
                  value={fornitoreId}
                  disabled={!materiaId || fornitoriElenco.length === 0}
                  onChange={(evento) => tocca(setFornitoreId)(evento.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                >
                  <option value="">
                    {fornitoriElenco.length === 0 ? "Nessun fornitore" : "Seleziona"}
                  </option>
                  {fornitoriElenco.map((voce) => (
                    <option key={voce.id} value={voce.id}>
                      {voce.nome}
                    </option>
                  ))}
                </select>
                {fornitoriMessaggio ? (
                  <span className="mt-1 block text-xs text-slate-500">{fornitoriMessaggio}</span>
                ) : null}
              </label>
              <div className="flex flex-nowrap items-end gap-3">
                <label className="block min-w-40 flex-1 text-sm">
                  Data iniziale
                  <input
                    type="date"
                    value={inizio}
                    onChange={(evento) => tocca(setInizio)(evento.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block min-w-40 flex-1 text-sm">
                  Data finale
                  <input
                    type="date"
                    value={fine}
                    disabled={operazione !== "pianificazione"}
                    onChange={(evento) => tocca(setFine)(evento.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                  />
                </label>
              </div>
              <label className="block text-sm">
                Note
                <textarea
                  value={note}
                  onChange={(evento) => tocca(setNote)(evento.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
          ) : null}
          {passo === 3 ? (
            <div className="space-y-3">
              {operazione === "singolo" ? (
                <p className="text-sm text-slate-700">
                  L&apos;ordine singolo ha una sola consegna, il {inizio}. Non serve una frequenza.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["ogni_n", "Ogni N giorni"],
                        ["giorni_fissi", "Giorni fissi della settimana"],
                        ["manuale", "Date manuali"],
                      ] as const
                    ).map(([valore, etichetta]) => (
                      <button
                        key={valore}
                        type="button"
                        onClick={() => tocca(setFrequenza)(valore)}
                        className={`rounded-lg border px-3 py-2 text-sm ${frequenza === valore ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
                      >
                        {etichetta}
                      </button>
                    ))}
                  </div>
                  {frequenza === "ogni_n" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-sm">
                        Intervallo N
                        <input
                          value={ogniGiorni}
                          inputMode="numeric"
                          onChange={(evento) => tocca(setOgniGiorni)(evento.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm">
                        Primo giorno
                        <input
                          type="date"
                          min={inizio}
                          max={fine}
                          value={primaConsegna}
                          onChange={(evento) => tocca(setPrimaConsegna)(evento.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <p className="text-sm text-slate-600 md:col-span-2">
                        N sono giorni di calendario, a partire da quel giorno. Se una ricorrenza
                        cade in un giorno non consentito, viene saltata e la successiva resta
                        sulla sequenza originale.
                      </p>
                    </div>
                  ) : null}
                  {frequenza !== "manuale" ? (
                    <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <legend className="mb-1 text-sm font-medium">
                        {frequenza === "ogni_n" ? "Giorni consentiti" : "Giorni della settimana"}
                      </legend>
                      {GIORNI_UI.map((giorno) => (
                        <label key={giorno.indice} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={giorniConsentiti.includes(giorno.indice)}
                            onChange={() => alternaGiorno(giorno.indice)}
                          />
                          {giorno.nome}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="text-sm text-slate-600">
                      Seleziona le date nel calendario. Restano modificabili nel passaggio successivo.
                    </p>
                  )}
                  <CalendarioScelta
                    mese={mese}
                    celle={celle}
                    inizio={inizio}
                    fine={fine}
                    scelte={dateScelte}
                    previste={generazione && generazione.ok ? generazione.consegne.map((voce) => voce.data) : []}
                    escluse={escluseVisibili}
                    manuale={frequenza === "manuale"}
                    onMese={setMese}
                    onGiorno={alternaData}
                  />
                  {escluseVisibili.length > 0 ? (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      Date escluse, non spostate: {escluseVisibili.join(", ")}.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {passo === 4 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copiaQuantita} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  Copia quantità su tutte le date
                </button>
                <label className="flex items-center gap-2 text-sm">
                  Aggiungi consegna
                  <input
                    type="date"
                    value={nuovaData}
                    onChange={(evento) => setNuovaData(evento.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1"
                  />
                </label>
                <button type="button" onClick={aggiungiConsegna} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  Aggiungi
                </button>
              </div>
              <CalendarioScelta
                mese={mese}
                celle={celle}
                inizio={operazione === "singolo" ? inizio : inizio}
                fine={operazione === "singolo" ? inizio : fine}
                scelte={[]}
                previste={consegne.map((voce) => voce.data)}
                escluse={escluse}
                manuale={false}
                onMese={setMese}
                onGiorno={() => undefined}
              />
              <ul className="space-y-2">
                {consegne.map((consegna, indice) => (
                  <li key={`${consegna.data}-${indice}`} className="grid items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[9rem_8rem_1fr_7rem_7rem_auto]">
                    <label className="text-xs">
                      Data
                      <input
                        type="date"
                        value={consegna.data}
                        onChange={(evento) => aggiornaConsegna(indice, { data: evento.target.value })}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <span className="text-sm">{nomeGiorno(consegna.data)}</span>
                    <span className="text-sm">{materia ? materia.nome : "Materia"}</span>
                    <label className="text-xs">
                      Quantità
                      <input
                        value={String(consegna.quantita)}
                        inputMode="decimal"
                        onChange={(evento) =>
                          aggiornaConsegna(indice, { quantita: numeroTesto(evento.target.value) })
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <span className="text-sm">
                      {unita} · {consegna.tipoQuantita}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConsegne((correnti) => correnti.filter((_, posizione) => posizione !== indice));
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      Rimuovi
                    </button>
                  </li>
                ))}
              </ul>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium">Resoconto non salvato</p>
                {resoconto.gruppi.length === 0 ? (
                  <p className="mt-1 text-slate-600">Nessuna consegna in anteprima.</p>
                ) : (
                  resoconto.gruppi.map((gruppo) => (
                    <p key={`${gruppo.materiaId}|${gruppo.unita}`} className="mt-1">
                      {gruppo.materia} · {gruppo.consegneAnteprima} consegne · precisa {gruppo.precisaAnteprima} {gruppo.unita} · stimata {gruppo.stimataAnteprima} {gruppo.unita}. Non è un ordine ufficiale.
                    </p>
                  ))
                )}
              </div>
            </div>
          ) : null}
          {passo === 5 ? (
            <div className="space-y-3 text-sm">
              <p><span className="font-medium">Fornitore.</span> {fornitore?.nome ?? "—"}</p>
              <p><span className="font-medium">Materia prima.</span> {materia ? `${materia.codice} ${materia.nome}` : "—"}</p>
              <p>
                <span className="font-medium">Periodo.</span> {inizio}
                {operazione === "pianificazione" ? ` → ${fine}` : ""}
              </p>
              <p><span className="font-medium">Frequenza.</span> {regola}</p>
              <p><span className="font-medium">Giorni consentiti.</span> {operazione === "singolo" ? "Non applicabile" : giorniConsentitiTesto || "—"}</p>
              <p><span className="font-medium">Consegne.</span> {consegne.length}</p>
              <p>
                <span className="font-medium">Quantità precise.</span> {precise} {unita}
              </p>
              <p>
                <span className="font-medium">Quantità stimate.</span> {stimate} {unita}
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {consegne.map((consegna) => (
                  <li key={consegna.data}>
                    {consegna.data} · {nomeGiorno(consegna.data)} · {consegna.quantita} {unita} · {consegna.tipoQuantita}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => esporta("pdf")} className="rounded-lg border border-slate-300 px-3 py-2">
                  Esporta PDF
                </button>
                <button type="button" onClick={() => esporta("xlsx")} className="rounded-lg border border-slate-300 px-3 py-2">
                  Esporta Excel
                </button>
              </div>
              <p className="text-slate-600">
                Salva bozza registra senza email e senza pubblicazione. Conferma apre la bozza della mail: l&apos;invio parte solo dopo il salvataggio riuscito.
              </p>
            </div>
          ) : null}
          {errore ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={passo === 1 || props.pending}
            onClick={() => setPasso((corrente) => Math.max(1, corrente - 1))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Indietro
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={chiudi} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Annulla
            </button>
            {passo < 5 ? (
              <button type="button" onClick={avanti} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Avanti
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={props.pending}
                  onClick={salva}
                  className="rounded-lg border border-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  Salva bozza
                </button>
                <button
                  type="button"
                  disabled={props.pending}
                  onClick={apriConferma}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {props.pending ? "Salvo…" : etichettaConferma}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {invioAperto ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">Conferma e invio</h3>
            <p className="mt-1 text-sm text-slate-600">
              Conferma e salva registra l&apos;ordine e lo mostra in elenco. L&apos;email parte solo dopo il salvataggio. Non pubblica nel portale fornitore.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inviaEmail} onChange={(evento) => setInviaEmail(evento.target.checked)} />
              Invia email
            </label>
            <label className="mt-3 block text-sm">
              Destinatario
              <input
                value={destinatario}
                onChange={(evento) => setDestinatario(evento.target.value)}
                disabled={!inviaEmail}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
              />
            </label>
            <label className="mt-3 block text-sm">
              Oggetto
              <input
                value={oggetto}
                onChange={(evento) => setOggetto(evento.target.value)}
                disabled={!inviaEmail}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
              />
            </label>
            <label className="mt-3 block text-sm">
              Testo
              <textarea
                value={testo}
                onChange={(evento) => setTesto(evento.target.value)}
                disabled={!inviaEmail}
                rows={8}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allegaPdf} disabled={!inviaEmail} onChange={(evento) => setAllegaPdf(evento.target.checked)} />
                PDF
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allegaXlsx} disabled={!inviaEmail} onChange={(evento) => setAllegaXlsx(evento.target.checked)} />
                Excel
              </label>
            </div>
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Anteprima allegati: {allegaPdf ? "PDF" : "senza PDF"}
              {allegaXlsx ? " e Excel" : ""}. I file sono generati dalla versione salvata, non da questa anteprima a video.
              {props.prova ? " Destinatario di prova predefinito: sandrohd@gmail.com." : ""}
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confermaIncerta}
                onChange={(evento) => setConfermaIncerta(evento.target.checked)}
              />
              <span>
                Se un invio precedente ha esito incerto, confermo il reinvio sapendo che potrebbe produrre una seconda email.
              </span>
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setInvioAperto(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Torna al riepilogo
              </button>
              <button
                type="button"
                disabled={props.pending}
                onClick={confermaESalva}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {props.pending ? "Salvo…" : "Conferma e salva"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function scarica(nome: string, bytes: Uint8Array, mime: string) {
  const binary = bytes.reduce((testo, byte) => testo + String.fromCharCode(byte), "");
  const href = `data:${mime};base64,${btoa(binary)}`;
  const link = document.createElement("a");
  link.href = href;
  link.download = nome;
  link.click();
}

const NOMI_MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

function nomeMeseIso(iso: string, delta = 0) {
  const [anno, mese] = iso.slice(0, 10).split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1 + delta, 1));
  return NOMI_MESI[data.getUTCMonth()] ?? "";
}

function CalendarioScelta(props: {
  mese: string;
  celle: string[];
  inizio: string;
  fine: string;
  scelte: string[];
  previste: string[];
  escluse: string[];
  manuale: boolean;
  onMese: (iso: string) => void;
  onGiorno: (iso: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-center gap-2">
        <button
          type="button"
          aria-label={`Vai a ${nomeMeseIso(props.mese, -1)}`}
          onClick={() => props.onMese(aggiungiGiorni(`${props.mese.slice(0, 7)}-01`, -1))}
          className="flex flex-col items-center px-1 text-slate-800"
        >
          <span className="text-xl leading-none">←</span>
          <span className="text-[10px] text-slate-500">{nomeMeseIso(props.mese, -1)}</span>
        </button>
        <p className="min-w-28 px-1 pb-1 text-center text-lg font-semibold text-slate-900">
          {nomeMeseIso(props.mese)}
        </p>
        <button
          type="button"
          aria-label={`Vai a ${nomeMeseIso(props.mese, 1)}`}
          onClick={() => props.onMese(aggiungiGiorni(`${props.mese.slice(0, 7)}-15`, 20))}
          className="flex flex-col items-center px-1 text-slate-800"
        >
          <span className="text-xl leading-none">→</span>
          <span className="text-[10px] text-slate-500">{nomeMeseIso(props.mese, 1)}</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((nome) => (
          <span key={nome}>{nome}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {props.celle.map((iso) => {
          const nelPeriodo = iso >= props.inizio && iso <= props.fine;
          const prevista = props.previste.includes(iso) || props.scelte.includes(iso);
          const esclusa = props.escluse.includes(iso) && !prevista;
          let classe = "border-slate-200 bg-white text-slate-700";
          if (nelPeriodo) classe = "border-sky-200 bg-sky-50 text-slate-800";
          if (esclusa) classe = "border-amber-300 bg-amber-50 text-amber-900 line-through";
          if (prevista) classe = "border-violet-800 bg-violet-700 font-semibold text-white";
          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                if (props.manuale) props.onGiorno(iso);
              }}
              className={`min-h-10 rounded border text-xs ${classe} ${iso.slice(0, 7) === props.mese.slice(0, 7) ? "" : "opacity-40"}`}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        <li className="rounded bg-sky-50 px-2 py-1 text-sky-950">Periodo</li>
        <li className="rounded bg-violet-700 px-2 py-1 text-white">Consegna</li>
        <li className="rounded bg-amber-50 px-2 py-1 text-amber-900 line-through">Esclusa</li>
      </ul>
    </div>
  );
}
