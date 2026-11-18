"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  aggiornaApprovvigionamentoAction,
  aggiungiConsegnaPianoAction,
  aggiornaComposizionePianoAction,
  annullaConsegnaApprovvigionamentoAction,
  estendiPeriodoPianoAction,
  fornitoriCompatibiliApprovvigionamentoAction,
  listaMaterieApprovvigionamentoAction,
  listaOrdiniApprovvigionamentoAction,
  listaPianiApprovvigionamentoAction,
  pubblicaOrdineApprovvigionamentoAction,
  pubblicaPianoApprovvigionamentoAction,
  recuperaNotificaApprovvigionamentoAction,
  resocontoApprovvigionamentoAction,
  inviaEmailProvaApprovvigionamentoAction,
  salvaApprovvigionamentiAction,
  type MateriaCalendario,
  type OrdineCalendario,
  type PianoCalendario,
} from "@/app/actions/approvvigionamento";
import {
  CreaOrdineMateriaPrimaModal,
  type BozzaOrdineMateria,
} from "@/components/produzione/CreaOrdineMateriaPrimaModal";
import { useRegistraAzioniTest } from "@/components/produzione/calendario-test-contesto";
import { SelettoreUnita } from "@/components/produzione/SelettoreUnita";
import {
  RevisionePianoPannello,
  ValutazioneRevisione,
} from "@/components/produzione/RevisionePianoPannello";
import {
  decidiVocePropostaPianoAction,
  listaPropostePianoAction,
} from "@/app/actions/approvvigionamento-portale";
import {
  aggiungiGiorni,
  anteprimaConsegne,
  anteprimaEsclusaDalFiltro,
  consegnaSelezionataValida,
  giorniMese,
  quadriApprovvigionamento,
  giorniSettimana,
  lunediSettimana,
  resocontoConAnteprima,
  riepilogoApprovvigionamento,
  type ConsegnaSalvataResoconto,
  type GruppoResocontoApprovvigionamento,
  type TipoQuantitaApprovvigionamento,
  type VoceRiepilogo,
} from "@/lib/produzione/approvvigionamento";
import { aspettoGiorno, classeCellaCalendario, LEGENDA_CALENDARIO } from "@/lib/produzione/aspetto-calendario";
import {
  pdfPianificazione,
  xlsxPianificazione,
  type DocumentoPianificazione,
} from "@/lib/produzione/documento-pianificazione";
import {
  annullaMemoriaTest,
  CHIAVE_MEMORIA_TEST,
  leggiMemoriaTest,
  serializzaMemoriaTest,
} from "@/lib/produzione/memoria-test-approvvigionamento";
import {
  etichettaUnita,
  normalizzaUnitaApprovvigionamento,
  unitaStandard,
} from "@/lib/produzione/unita-approvvigionamento";
import {
  costruisciRevisionePiano,
  decidiVoceRevisione,
  preparaEmailProva,
  scritturaAziendaleConsentita,
  type ConsegnaUfficiale,
  type PropostaRevisione,
} from "@/lib/produzione/revisione-piano";
import {
  aggiungiConsegnaInProva,
  annullaConsegnaInProva,
  modificaConsegnaInProva,
  ordineSingoloInProva,
  pianificaInProva,
  pubblicaInProva,
  sessioneTestVuota,
} from "@/lib/produzione/sessione-test-approvvigionamento";

type Vista = "mese" | "settimana" | "giorno";
type Operazione = "" | "singolo" | "pianificazione";
type RigaForm = {
  materiaPrimaId: string;
  quantita: string;
  unitaMisura: string;
  unitaNome: string;
  personalizzata: boolean;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  note: string;
};

const FERIE = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function anniNavigazione(ancora: string, inizio: string, fine: string): number[] {
  const valori = [Number(ancora.slice(0, 4)), Number(inizio.slice(0, 4)), Number(fine.slice(0, 4))];
  const minimo = Math.min(...valori.filter((anno) => Number.isFinite(anno))) - 1;
  const massimo = Math.max(...valori.filter((anno) => Number.isFinite(anno))) + 2;
  const anni: number[] = [];
  for (let anno = minimo; anno <= massimo; anno += 1) anni.push(anno);
  return anni;
}

function consegneUfficiali(ordini: readonly OrdineCalendario[]): ConsegnaUfficiale[] {
  return ordini.flatMap((ordine) => {
    const riga = ordine.righe[0];
    if (!riga || ordine.stato === "annullato") return [];
    return [
      {
        id: ordine.id,
        codice: ordine.codice,
        materiaId: riga.materiaPrimaId,
        materia: `${riga.codice} ${riga.nome}`,
        unita: riga.unitaMisura,
        unitaCatalogo: riga.unitaMisura,
        tipoQuantita: riga.tipoQuantita,
        data: ordine.dataConsegna,
        quantita: riga.quantita,
      },
    ];
  });
}

function documentoPianoSalvato(
  piano: PianoCalendario,
  ordini: readonly OrdineCalendario[]
): DocumentoPianificazione {
  const collegati = ordini.filter((ordine) => ordine.pianoId === piano.id);
  const prima = collegati[0]?.righe[0];
  return {
    codice: piano.codice,
    fornitore: piano.fornitore,
    materia: prima ? `${prima.codice} ${prima.nome}` : "Materie del piano",
    unita: etichettaUnita(prima?.unitaMisura ?? "", prima?.unitaNome),
    periodoInizio: piano.periodoInizio,
    periodoFine: piano.periodoFine,
    note: `${etichettaTipologia(piano.tipologia)} · revisione ${piano.revisione}`,
    consegne: collegati.flatMap((ordine) => {
      const unita = [...new Set(ordine.righe.map((riga) => riga.unitaMisura))];
      if (unita.length <= 1) {
        return [
          {
            data: ordine.dataConsegna,
            quantita: ordine.righe.reduce((totale, riga) => totale + riga.quantita, 0),
            tipoQuantita: ordine.righe.some((riga) => riga.tipoQuantita === "stimata")
              ? ("stimata" as const)
              : ("precisa" as const),
            stato: ordine.stato,
            unita: etichettaUnita(unita[0] ?? "", ordine.righe[0]?.unitaNome),
          },
        ];
      }
      return ordine.righe.map((riga) => ({
        data: ordine.dataConsegna,
        quantita: riga.quantita,
        tipoQuantita: riga.tipoQuantita,
        stato: ordine.stato,
        unita: etichettaUnita(riga.unitaMisura, riga.unitaNome),
      }));
    }),
  };
}

function scaricaFile(nome: string, bytes: Uint8Array, mime: string) {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const url = URL.createObjectURL(new Blob([copia], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

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

function nomeMese(iso: string, delta = 0) {
  const [anno, mese] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1 + delta, 1));
  return MESI[data.getUTCMonth()] ?? "";
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
  return {
    materiaPrimaId: "",
    quantita: "",
    unitaMisura: "",
    unitaNome: "",
    personalizzata: false,
    tipoQuantita: "precisa",
    note: "",
  };
}

function numeroTesto(testo: string): number {
  const valore = Number(testo.replace(",", "."));
  return Number.isFinite(valore) ? valore : Number.NaN;
}

function testoPiani(piani: { codice: string }[]) {
  if (!piani.length) return "Nessun piano creato.";
  return `Piani: ${piani.map((piano) => piano.codice).join(", ")}.`;
}

function testoMetrica(valore: number | null, unita: string, motivo: string | null): string {
  if (motivo) return `non disponibile. ${motivo}`;
  return `${valore ?? 0} ${unita}`;
}

function GruppoResoconto({ gruppo }: { gruppo: GruppoResocontoApprovvigionamento }) {
  const soloAnteprima = gruppo.consegneAnteprima > 0 && gruppo.consegneSalvate === 0;
  return (
    <li
      className={`rounded-lg border p-2 text-sm ${
        soloAnteprima ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="font-medium text-slate-900">
        {gruppo.materia} · {gruppo.unita}
      </p>
      {gruppo.consegneAnteprima > 0 ? (
        <p className="mt-1 text-amber-950">
          Anteprima non salvata · {gruppo.consegneAnteprima} consegne. Non è un ordine ufficiale.
        </p>
      ) : null}
      {gruppo.consegneSalvate > 0 ? (
        <p className="mt-1 text-slate-700">
          Pianificazione salvata · {gruppo.consegneSalvate} consegne
        </p>
      ) : null}
      <ul className="mt-1 grid gap-0.5 md:grid-cols-2">
        <li className="text-amber-950">
          Quantità pianificata precisa, anteprima: {gruppo.precisaAnteprima} {gruppo.unita}
        </li>
        <li className="text-amber-950">
          Quantità pianificata stimata, anteprima: {gruppo.stimataAnteprima} {gruppo.unita}
        </li>
        <li>
          Quantità pianificata precisa, salvata: {gruppo.precisaSalvata} {gruppo.unita}
        </li>
        <li>
          Quantità pianificata stimata, salvata: {gruppo.stimataSalvata} {gruppo.unita}
        </li>
        <li>Quantità ordinata/pubblicata: {gruppo.ordinata} {gruppo.unita}</li>
        <li>Quantità confermata: {gruppo.confermata} {gruppo.unita}</li>
        <li>
          Quantità arrivata: {testoMetrica(gruppo.arrivata, gruppo.unita, gruppo.motivoArrivo)}
        </li>
        <li>
          Quantità accettata: {testoMetrica(gruppo.accettata, gruppo.unita, gruppo.motivoLotti)}
        </li>
        <li>
          Quantità respinta: {testoMetrica(gruppo.respinta, gruppo.unita, gruppo.motivoLotti)}
        </li>
        <li>
          Quantità scaricata: {testoMetrica(gruppo.scaricata, gruppo.unita, gruppo.motivoLotti)}
        </li>
      </ul>
    </li>
  );
}

function GiacenzaResoconto({ voci }: { voci: VoceRiepilogo[] }) {
  const giacenza = voci.find((voce) => voce.chiave === "giacenza");
  if (!giacenza) return null;
  return (
    <p className="mt-2 text-sm text-slate-700">
      {giacenza.etichetta}:{" "}
      {giacenza.disponibile
        ? `${giacenza.valore ?? 0}${giacenza.unita ? ` ${giacenza.unita}` : ""}`
        : `non disponibile. ${giacenza.motivo ?? ""}`}
    </p>
  );
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
  const [operazione, setOperazione] = useState<Operazione>("");
  const [inizio, setInizio] = useState(oggi);
  const [fine, setFine] = useState(oggi);
  const [cadenza, setCadenza] = useState<"regolare" | "personalizzata">("regolare");
  const [ogniGiorni, setOgniGiorni] = useState("2");
  const [copiaQuantita, setCopiaQuantita] = useState(true);
  const [tipoQuantita, setTipoQuantita] = useState<TipoQuantitaApprovvigionamento>("precisa");
  const [quantitaBase, setQuantitaBase] = useState("");
  const [unitaSigla, setUnitaSigla] = useState("");
  const [unitaNome, setUnitaNome] = useState("");
  const [unitaPersonalizzata, setUnitaPersonalizzata] = useState(false);
  const [materiaId, setMateriaId] = useState("");
  const [dateScelte, setDateScelte] = useState<string[]>([]);
  const [quantitaPerData, setQuantitaPerData] = useState<Record<string, string>>({});
  const [filtroFornitore, setFiltroFornitore] = useState("");
  const [filtroMateria, setFiltroMateria] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroPiano, setFiltroPiano] = useState("");
  const [dataAggiunta, setDataAggiunta] = useState(oggi);
  const [qtyAggiunta, setQtyAggiunta] = useState("");
  const [unitaAggiunta, setUnitaAggiunta] = useState("");
  const [nomeAggiunta, setNomeAggiunta] = useState("");
  const [personalizzataAggiunta, setPersonalizzataAggiunta] = useState(false);
  const [materiaAggiunta, setMateriaAggiunta] = useState("");
  const [tipoAggiunta, setTipoAggiunta] = useState<TipoQuantitaApprovvigionamento>("precisa");
  const [test, setTest] = useState(false);
  const [sessione, setSessione] = useState(sessioneTestVuota());
  const [proposte, setProposte] = useState<PropostaRevisione[]>([]);
  const [proposteAzienda, setProposteAzienda] = useState<PropostaRevisione[]>([]);
  const [emailProva, setEmailProva] = useState("sandrohd@gmail.com");
  const [confermaEmail, setConfermaEmail] = useState(false);
  const [anteprimaEmail, setAnteprimaEmail] = useState<string | null>(null);
  const [memoriaPronta, setMemoriaPronta] = useState(false);
  const testRef = useRef(false);
  const saltaMemoria = useRef(false);
  testRef.current = test;
  const [vociRiepilogo, setVociRiepilogo] = useState<VoceRiepilogo[]>([]);
  const [righeUfficiali, setRigheUfficiali] = useState<ConsegnaSalvataResoconto[]>([]);
  const [creaAperta, setCreaAperta] = useState(false);
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
      if (vietatoInProva()) return;
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
    if (test) return;
    ricarica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.da, periodo.a, test]);

  useEffect(() => {
    if (!test) return;
    setOrdini(
      sessione.ordini.filter(
        (ordine) => ordine.dataConsegna >= periodo.da && ordine.dataConsegna <= periodo.a
      )
    );
    setPiani(
      sessione.piani.filter(
        (piano) => piano.periodoInizio <= periodo.a && piano.periodoFine >= periodo.da
      )
    );
  }, [test, sessione, periodo]);

  useEffect(() => {
    const letta = leggiMemoriaTest(window.sessionStorage.getItem(CHIAVE_MEMORIA_TEST));
    if (letta) {
      setSessione(letta.sessione);
      setProposte(letta.proposte);
      setEmailProva(letta.email || "sandrohd@gmail.com");
      setTest(letta.attiva);
    }
    setMemoriaPronta(true);
  }, []);

  useEffect(() => {
    if (!memoriaPronta) return;
    if (saltaMemoria.current) {
      saltaMemoria.current = false;
      return;
    }
    if (!test && sessione.ordini.length === 0 && proposte.length === 0) return;
    window.sessionStorage.setItem(
      CHIAVE_MEMORIA_TEST,
      serializzaMemoriaTest({ attiva: test, email: emailProva, sessione, proposte })
    );
  }, [memoriaPronta, test, emailProva, sessione, proposte]);

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

  function vietatoInProva() {
    if (scritturaAziendaleConsentita(testRef.current ? "test" : "reale")) return false;
    setErrore("Modalità test: nessuna scrittura sul database aziendale.");
    return true;
  }

  function annullaProva() {
    if (!window.confirm("Annullare la prova e distruggere tutte le modifiche simulate?")) return;
    annullaMemoriaTest();
    window.sessionStorage.removeItem(CHIAVE_MEMORIA_TEST);
    saltaMemoria.current = true;
    setSessione(sessioneTestVuota());
    setProposte([]);
    setEmailProva("");
    setConfermaEmail(false);
    setAnteprimaEmail(null);
    setTest(false);
    setOrdineId(null);
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
        unitaMisura: riga.unitaMisura,
        unitaNome: riga.unitaNome ?? "",
        personalizzata: !unitaStandard(riga.unitaMisura),
        tipoQuantita: riga.tipoQuantita,
        note: riga.note,
      }))
    );
    chiudiOperazione();
  }

  function payloadRighe() {
    return righe
      .filter((riga) => riga.materiaPrimaId)
      .map((riga) => {
        const scelta = normalizzaUnitaApprovvigionamento(riga.unitaMisura);
        return {
          materiaPrimaId: riga.materiaPrimaId,
          quantita: Number(riga.quantita.replace(",", ".")),
          unitaMisura: scelta.ok ? scelta.sigla : riga.unitaMisura,
          unitaNome: riga.personalizzata ? riga.unitaNome.trim() : "",
          tipoQuantita: riga.tipoQuantita,
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
    const corrente = ordini.find((ordine) => ordine.id === ordineId);
    if (corrente?.stato === "annullato") {
      setErrore("Una consegna annullata non si modifica.");
      return;
    }
    if (test && corrente) {
      const esito = modificaConsegnaInProva(sessione, {
        ordineId: corrente.id,
        data: giorno,
        note,
        quantita: Number(payloadRighe()[0]?.quantita ?? 0),
        tipoQuantita: payloadRighe()[0]?.tipoQuantita ?? "precisa",
      });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      return;
    }
    const pianoCorrente = piani.find((piano) => piano.id === corrente?.pianoId);
    startTransition(async () => {
      if (vietatoInProva()) return;
      if (
        pianoCorrente &&
        corrente &&
        (giorno < pianoCorrente.periodoInizio || giorno > pianoCorrente.periodoFine)
      ) {
        const esteso = await estendiPeriodoPianoAction({
          chiave: `${chiaveStabile()}-periodo`,
          pianoId: pianoCorrente.id,
          revisione: pianoCorrente.revisione,
          data: giorno,
        });
        if (!esteso.success) {
          setErrore(esteso.error);
          return;
        }
      }
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
    if (test) {
      setErrore("In modalità test la copia non è disponibile: non deve scrivere sul database.");
      return;
    }
    startTransition(async () => {
      if (vietatoInProva()) return;
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
              unitaNome: riga.unitaNome ?? "",
              tipoQuantita: riga.tipoQuantita,
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
    if (test) {
      setErrore("In modalità test la copia non è disponibile: non deve scrivere sul database.");
      return;
    }
    const inizio = lunediSettimana(ancora);
    const destinazione = lunediSettimana(settimanaDestinazione);
    const spostamento =
      (Date.parse(`${destinazione}T00:00:00Z`) - Date.parse(`${inizio}T00:00:00Z`)) / 86_400_000;
    setErrore(null);
    startTransition(async () => {
      if (vietatoInProva()) return;
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
            unitaNome: riga.unitaNome ?? "",
            tipoQuantita: riga.tipoQuantita,
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

  function salvaPianificazione() {
    if (!anteprima || !anteprima.ok) {
      setErrore(anteprima && !anteprima.ok ? anteprima.motivo : "Completa l'operazione.");
      return;
    }
    if (operazione === "") return;
    const materia = materie.find((voce) => voce.id === materiaId);
    const unitaScelta = normalizzaUnitaApprovvigionamento(unitaSigla);
    if (!materia || !unitaScelta.ok) {
      setErrore("Indica l'unità di misura.");
      return;
    }
    setErrore(null);
    setMessaggio(null);
    if (test) {
      const materiaScelta = {
        materiaPrimaId: materiaId,
        codice: materia.codice,
        nome: materia.nome,
        quantita: numeroTesto(quantitaBase),
        unitaMisura: unitaScelta.sigla,
        unitaCatalogo: materia.unitaMisura,
        tipoQuantita,
      };
      const esito =
        operazione === "singolo"
          ? ordineSingoloInProva(sessione, {
              fornitoreId,
              fornitore: fornitori.find((voce) => voce.id === fornitoreId)?.nome ?? "Fornitore",
              note,
              data: giorno,
              quantita: numeroTesto(quantitaBase),
              tipoQuantita,
              materia: materiaScelta,
            })
          : pianificaInProva(sessione, {
        fornitoreId,
        fornitore: fornitori.find((voce) => voce.id === fornitoreId)?.nome ?? "Fornitore",
        note,
        inizio,
        fine,
        cadenza,
        ogniGiorni: Number(ogniGiorni),
        dateScelte,
        quantita: numeroTesto(quantitaBase),
        copiaQuantita,
        quantitaPerData: quantitaOverride,
        tipoQuantita,
        materia: {
          materiaPrimaId: materiaId,
          codice: materia?.codice ?? "",
          nome: materia?.nome ?? "",
          quantita: numeroTesto(quantitaBase),
          unitaMisura: unitaScelta.sigla,
          unitaCatalogo: materia.unitaMisura,
          tipoQuantita,
        },
      });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      return;
    }
    const meta =
      operazione === "pianificazione"
        ? {
            tipologia: cadenza,
            cadenzaGiorni: cadenza === "regolare" ? Number(ogniGiorni) : null,
            tipoQuantita,
            periodoInizio: inizio,
            periodoFine: fine,
          }
        : undefined;
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await salvaApprovvigionamentiAction({
        chiave: chiaveStabile(),
        tipo: operazione === "pianificazione" ? "pianificazione" : "crea",
        ordini: anteprima.consegne.map((consegna) => ({
          fornitoreId,
          dataConsegna: consegna.data,
          note,
          pianificazione: meta,
          righe: [
            {
              materiaPrimaId: materiaId,
              quantita: consegna.quantita,
              unitaMisura: unitaScelta.sigla,
              unitaNome: unitaPersonalizzata ? unitaNome.trim() : "",
              tipoQuantita: consegna.tipoQuantita,
              note: "",
            },
          ],
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        res.riusata
          ? "Operazione già registrata. Nessun secondo ordine."
          : "Bozza salvata. Non è stata pubblicata e non è stata inviata al fornitore."
      );
      setQuantitaPerData({});
      ricarica();
    });
  }

  function salvaProcedura(bozza: BozzaOrdineMateria) {
    if (bozza.consegne.length === 0) {
      setErrore("Nessuna consegna da registrare.");
      return;
    }
    const materia = materie.find((voce) => voce.id === bozza.materiaId);
    const unitaScelta = normalizzaUnitaApprovvigionamento(bozza.unitaSigla);
    if (!materia || !unitaScelta.ok) {
      setErrore("Indica l'unità di misura.");
      return;
    }
    setErrore(null);
    setMessaggio(null);
    const fornitoreNome = fornitori.find((voce) => voce.id === bozza.fornitoreId)?.nome ?? "Fornitore";
    if (test) {
      const materiaScelta = {
        materiaPrimaId: bozza.materiaId,
        codice: materia.codice,
        nome: materia.nome,
        quantita: bozza.consegne[0]?.quantita ?? 0,
        unitaMisura: unitaScelta.sigla,
        unitaCatalogo: materia.unitaMisura,
        tipoQuantita: bozza.tipoQuantita,
      };
      const esito =
        bozza.operazione === "singolo"
          ? ordineSingoloInProva(sessione, {
              fornitoreId: bozza.fornitoreId,
              fornitore: fornitoreNome,
              note: bozza.note,
              data: bozza.consegne[0]?.data ?? bozza.inizio,
              quantita: bozza.consegne[0]?.quantita ?? 0,
              tipoQuantita: bozza.tipoQuantita,
              materia: materiaScelta,
            })
          : pianificaInProva(sessione, {
              fornitoreId: bozza.fornitoreId,
              fornitore: fornitoreNome,
              note: bozza.note,
              inizio: bozza.inizio,
              fine: bozza.fine,
              cadenza: bozza.tipologia,
              ogniGiorni: bozza.ogniGiorni ?? 1,
              dateScelte: bozza.consegne.map((consegna) => consegna.data),
              quantita: bozza.consegne[0]?.quantita ?? 0,
              copiaQuantita: true,
              quantitaPerData: {},
              tipoQuantita: bozza.tipoQuantita,
              consegne: bozza.consegne,
              materia: materiaScelta,
            });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      setCreaAperta(false);
      return;
    }
    const meta =
      bozza.operazione === "pianificazione"
        ? {
            tipologia: bozza.tipologia,
            cadenzaGiorni: bozza.tipologia === "regolare" ? bozza.ogniGiorni : null,
            tipoQuantita: bozza.tipoQuantita,
            periodoInizio: bozza.inizio,
            periodoFine: bozza.fine,
          }
        : undefined;
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await salvaApprovvigionamentiAction({
        chiave: chiaveStabile(),
        tipo: bozza.operazione === "pianificazione" ? "pianificazione" : "crea",
        ordini: bozza.consegne.map((consegna) => ({
          fornitoreId: bozza.fornitoreId,
          dataConsegna: consegna.data,
          note: bozza.note,
          pianificazione: meta,
          righe: [
            {
              materiaPrimaId: bozza.materiaId,
              quantita: consegna.quantita,
              unitaMisura: unitaScelta.sigla,
              unitaNome: bozza.personalizzata ? bozza.unitaNome.trim() : "",
              tipoQuantita: consegna.tipoQuantita,
              note: "",
            },
          ],
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setCreaAperta(false);
      setMessaggio(
        res.riusata
          ? "Operazione già registrata. Nessun secondo ordine."
          : "Bozza salvata. Non è stata pubblicata e non è stata inviata al fornitore."
      );
      ricarica();
    });
  }

  function apriPiano(scelto: PianoCalendario) {
    setPianoAperto(scelto.id);
    setComposizione(scelto.ordini);
    setAncora(scelto.periodoInizio);
    chiudiOperazione();
    if (test) {
      setOrdiniPiano(sessione.ordini.filter((ordine) => ordine.pianoId === scelto.id));
      return;
    }
    void listaPropostePianoAction(scelto.id).then((res) => {
      if (res.success) setProposteAzienda(res.proposte);
    });
    startTransition(async () => {
      if (vietatoInProva()) return;
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

  function pubblicaOrdine(ordine: OrdineCalendario) {
    setErrore(null);
    if (test) {
      const esito = pubblicaInProva(sessione, { ambito: "ordine", id: ordine.id });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      return;
    }
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await pubblicaOrdineApprovvigionamentoAction({
        chiave: chiaveStabile(),
        ordineId: ordine.id,
        revisione: ordine.revisione,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(`Versione ${res.numero} pubblicata. Notifica: ${res.notifica}.`);
      ricarica();
    });
  }

  function pubblicaPiano(scelto: PianoCalendario) {
    setErrore(null);
    if (test) {
      const esito = pubblicaInProva(sessione, { ambito: "piano", id: scelto.id });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      return;
    }
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await pubblicaPianoApprovvigionamentoAction({
        chiave: chiaveStabile(),
        pianoId: scelto.id,
        revisione: scelto.revisione,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(`Piano versione ${res.numero} pubblicato. Notifica: ${res.notifica}.`);
      ricarica();
    });
  }

  function recupera(notificaId: string, confermaIncerta = false) {
    setErrore(null);
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await recuperaNotificaApprovvigionamentoAction({ notificaId, confermaIncerta });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(`Notifica: ${res.notifica}.`);
      ricarica();
    });
  }

  function salvaComposizione() {
    if (test) {
      setErrore("In prova si aggiunge o si annulla la singola consegna.");
      return;
    }
    const scelto = piani.find((voce) => voce.id === pianoAperto);
    if (!scelto || composizione.length === 0) {
      setErrore("Il piano deve contenere almeno un ordine.");
      return;
    }
    setErrore(null);
    startTransition(async () => {
      if (vietatoInProva()) return;
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

  function annullaConsegna(ordine: OrdineCalendario) {
    setErrore(null);
    if (test) {
      const esito = annullaConsegnaInProva(sessione, ordine.id);
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      return;
    }
    startTransition(async () => {
      if (vietatoInProva()) return;
      const res = await annullaConsegnaApprovvigionamentoAction({
        chiave: `${chiaveStabile()}-annulla`,
        ordineId: ordine.id,
        revisione: ordine.revisione,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        res.riusata
          ? "Annullamento già registrato."
          : "Consegna annullata. Le versioni pubblicate non sono state cancellate."
      );
      ricarica();
    });
  }

  function aggiungiConsegnaAlPiano(piano: PianoCalendario) {
    const materia = materie.find((voce) => voce.id === materiaAggiunta);
    const quantita = numeroTesto(qtyAggiunta);
    const unitaScelta = normalizzaUnitaApprovvigionamento(unitaAggiunta);
    if (!unitaScelta.ok) {
      setErrore("Indica l'unità di misura.");
      return;
    }
    const controllo = consegnaSelezionataValida({
      materiaPrimaId: materiaAggiunta,
      quantita,
      unitaCatalogo: materia?.unitaMisura ?? null,
      unitaRichiesta: unitaScelta.sigla,
      tipoQuantita: tipoAggiunta,
      data: dataAggiunta,
    });
    if (!controllo.ok) {
      setErrore(controllo.motivo);
      return;
    }
    setErrore(null);
    if (test) {
      const esito = aggiungiConsegnaInProva(sessione, {
        pianoId: piano.id,
        data: dataAggiunta,
        quantita,
        materia: {
          materiaPrimaId: materiaAggiunta,
          codice: materia?.codice ?? "",
          nome: materia?.nome ?? "",
          quantita,
          unitaMisura: unitaScelta.sigla,
          unitaCatalogo: materia?.unitaMisura ?? null,
          tipoQuantita: controllo.tipoQuantita,
        },
      });
      if (!esito.ok) {
        setErrore(esito.motivo);
        return;
      }
      setSessione(esito.sessione);
      setMessaggio(esito.messaggio);
      const aggiornato = esito.sessione.piani.find((voce) => voce.id === piano.id);
      if (aggiornato) apriPiano(aggiornato);
      return;
    }
    startTransition(async () => {
      if (vietatoInProva()) return;
      const creato = await aggiungiConsegnaPianoAction({
        chiave: `${chiaveStabile()}-aggiunta`,
        pianoId: piano.id,
        revisione: piano.revisione,
        data: dataAggiunta,
        note: "",
        righe: [
          {
            materiaPrimaId: materiaAggiunta,
            quantita,
            unitaMisura: unitaScelta.sigla,
            unitaNome: personalizzataAggiunta ? nomeAggiunta.trim() : "",
            tipoQuantita: controllo.tipoQuantita,
            note: "",
          },
        ],
      });
      if (!creato.success) {
        setErrore(creato.error);
        return;
      }
      chiudiOperazione();
      setMessaggio(
        creato.riusata
          ? "Consegna già collegata a questa pianificazione."
          : "Consegna aggiunta alla pianificazione esistente. Non è stata pubblicata."
      );
      ricarica();
      apriPiano({
        ...piano,
        revisione: creato.revisione,
        periodoInizio: creato.periodoInizio || piano.periodoInizio,
        periodoFine: creato.periodoFine || piano.periodoFine,
        ordini: [...piano.ordini, creato.ordineId],
      });
    });
  }

  const quantitaOverride = useMemo(() => {
    const valori: Record<string, number> = {};
    for (const [data, testo] of Object.entries(quantitaPerData)) {
      const valore = numeroTesto(testo);
      if (testo.trim() !== "" && Number.isFinite(valore)) valori[data] = valore;
    }
    return valori;
  }, [quantitaPerData]);

  const anteprima = useMemo(() => {
    if (operazione === "") return null;
    return anteprimaConsegne({
      operazione,
      data: giorno,
      inizio,
      fine,
      cadenza,
      ogniGiorni: Number(ogniGiorni),
      dateScelte,
      quantita: numeroTesto(quantitaBase),
      copiaQuantita,
      quantitaPerData: quantitaOverride,
      tipoQuantita,
      unitaMisura: unitaSigla,
    });
  }, [
    operazione,
    giorno,
    inizio,
    fine,
    cadenza,
    ogniGiorni,
    dateScelte,
    quantitaBase,
    copiaQuantita,
    quantitaOverride,
    tipoQuantita,
    unitaSigla,
  ]);

  const dateAnteprima = new Set(anteprima && anteprima.ok ? anteprima.consegne.map((voce) => voce.data) : []);
  const ordiniFiltrati = ordini.filter((ordine) => {
    if (filtroFornitore && ordine.fornitoreId !== filtroFornitore) return false;
    if (filtroStato && ordine.stato !== filtroStato) return false;
    if (filtroPiano && ordine.pianoId !== filtroPiano) return false;
    if (filtroMateria && !ordine.righe.some((riga) => riga.materiaPrimaId === filtroMateria)) return false;
    return true;
  });
  const chiaveResoconto = `${ordiniFiltrati.map((ordine) => ordine.id).join(",")}|${filtroMateria}`;

  useEffect(() => {
    if (test) {
      const righe = ordiniFiltrati
        .filter((ordine) => ordine.stato !== "annullato")
        .flatMap((ordine) =>
          ordine.righe
            .filter((riga) => !filtroMateria || riga.materiaPrimaId === filtroMateria)
            .map((riga) => ({
              ordineId: ordine.id,
              materiaId: riga.materiaPrimaId,
              unita: riga.unitaMisura,
              tipoQuantita: riga.tipoQuantita,
              pianificata: riga.quantita,
              ordinata: ordine.versionePubblicata == null ? 0 : riga.quantita,
              confermata: 0,
              arrivata: null,
              arrivataMancante: false,
              accettata: null,
              respinta: null,
              scaricata: null,
              lottiCollegati: false,
              unitaLottoDiversa: false,
            }))
        );
      const res = riepilogoApprovvigionamento({
        righe,
        giacenza: null,
        motivoGiacenza: "In prova la giacenza aziendale non viene letta.",
      });
      setRigheUfficiali(
        ordiniFiltrati
          .filter((ordine) => ordine.stato !== "annullato")
          .flatMap((ordine) =>
            ordine.righe
              .filter((riga) => !filtroMateria || riga.materiaPrimaId === filtroMateria)
              .map((riga) => ({
                ordineId: ordine.id,
                data: ordine.dataConsegna,
                materiaId: riga.materiaPrimaId,
                materia: `${riga.codice} ${riga.nome}`,
                unita: riga.unitaMisura,
                tipoQuantita: riga.tipoQuantita,
                pianificata: riga.quantita,
                ordinata: ordine.versionePubblicata == null ? 0 : riga.quantita,
                confermata: 0,
                arrivata: null,
                arrivataMancante: false,
                accettata: null,
                respinta: null,
                scaricata: null,
                lottiCollegati: false,
                unitaLottoDiversa: false,
              }))
          )
      );
      setVociRiepilogo(res.voci);
      return;
    }
    let attivo = true;
    void resocontoApprovvigionamentoAction({
      ordineIds: ordiniFiltrati.map((ordine) => ordine.id),
      materiaId: filtroMateria || undefined,
    }).then((res) => {
      if (!attivo || !res.success) return;
      setRigheUfficiali(
        res.righe.map((riga) => ({
          ...riga,
          ordinata: riga.ordinata ?? 0,
          confermata: riga.confermata ?? 0,
        }))
      );
      setVociRiepilogo(res.voci);
    });
    return () => {
      attivo = false;
    };
    // Il riepilogo segue gli ordini filtrati del periodo aperto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveResoconto, test]);

  const anteprimaAttiva = Boolean(anteprima && anteprima.ok && anteprima.consegne.length > 0);
  const esclusioneAnteprima = anteprimaEsclusaDalFiltro({
    attiva: anteprimaAttiva,
    materiaId,
    fornitoreId,
    filtroMateria,
    filtroFornitore,
    filtroStato,
    filtroPiano,
  });
  const resoconto = useMemo(() => {
    const salvate = righeUfficiali.map((riga) => {
      const materia = materie.find((voce) => voce.id === riga.materiaId);
      return {
        ...riga,
        materia: materia ? `${materia.codice} ${materia.nome}` : riga.materia,
      };
    });
    const previste =
      anteprima && anteprima.ok && !esclusioneAnteprima
        ? anteprima.consegne.map((consegna) => {
            const materia = materie.find((voce) => voce.id === materiaId);
            return {
              data: consegna.data,
              materiaId: materiaId || "anteprima",
              materia: materia ? `${materia.codice} ${materia.nome}` : "Materia non scelta",
              unita: consegna.unitaMisura,
              tipoQuantita: consegna.tipoQuantita,
              quantita: consegna.quantita,
            };
          })
        : [];
    return resocontoConAnteprima({ salvate, anteprima: previste });
  }, [
    righeUfficiali,
    anteprima,
    esclusioneAnteprima,
    materiaId,
    materie,
  ]);

  function clicGiorno(iso: string) {
    if (operazione === "pianificazione" && cadenza === "personalizzata" && iso >= inizio && iso <= fine) {
      setDateScelte((correnti) =>
        correnti.includes(iso) ? correnti.filter((data) => data !== iso) : [...correnti, iso].sort()
      );
      setGiorno(iso);
      return;
    }
    apriGiorno(iso);
  }

  const celle = vista === "mese" ? celleMese(ancora) : giorniSettimana(ancora);
  const delGiorno = ordiniFiltrati.filter((ordine) => ordine.dataConsegna === giorno);
  const materiaDocumento = materie.find((voce) => voce.id === materiaId);
  const fornitoreDocumento = fornitori.find((voce) => voce.id === fornitoreId)?.nome ?? "Fornitore";

  function documentoEmailProva(): DocumentoPianificazione | null {
    const scelto = piani.find((voce) => voce.id === pianoAperto);
    if (!scelto) return null;
    const documento = documentoPianoSalvato(scelto, ordiniPiano);
    if (documento.consegne.length === 0) return null;
    return documento;
  }

  function documentoAnteprima(): DocumentoPianificazione {
    const consegne = anteprima && anteprima.ok ? anteprima.consegne : [];
    return {
      codice: test ? "Anteprima di prova" : "Anteprima",
      fornitore: fornitoreDocumento,
      materia: materiaDocumento ? `${materiaDocumento.codice} ${materiaDocumento.nome}` : "Materia non scelta",
      unita: etichettaUnita(unitaSigla, unitaPersonalizzata ? unitaNome : ""),
      periodoInizio: operazione === "singolo" ? giorno : inizio,
      periodoFine: operazione === "singolo" ? giorno : fine,
      note: note || "Anteprima non salvata.",
      consegne: consegne.map((consegna) => ({
        data: consegna.data,
        quantita: consegna.quantita,
        tipoQuantita: consegna.tipoQuantita,
        stato: "prevista",
      })),
    };
  }

  useRegistraAzioniTest({
    attiva: test,
    alterna: () => setTest((corrente) => !corrente),
    annulla: annullaProva,
  });

  const etichetteVista: Record<Vista, string> = {
    mese: "Mese",
    settimana: "Settimana",
    giorno: "Giorno",
  };

  return (
    <div className="grid gap-4">
      <section className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-3">
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Visualizza per</p>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(["mese", "settimana", "giorno"] as const).map((voce) => (
                <button
                  key={voce}
                  type="button"
                  onClick={() => setVista(voce)}
                  className={`rounded-md px-3 py-1.5 text-sm ${vista === voce ? "bg-slate-900 text-white" : "text-slate-700"}`}
                >
                  {etichetteVista[voce]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label={`Vai a ${nomeMese(ancora, -1)}`}
              onClick={() => setAncora((corrente) => spostaMese(corrente, -1))}
              className="flex flex-col items-center px-1 text-slate-800"
            >
              <span className="text-xl leading-none">←</span>
              <span className="text-[10px] text-slate-500">{nomeMese(ancora, -1)}</span>
            </button>
            <p className="min-w-28 px-1 pb-1 text-center text-lg font-semibold text-slate-900">
              {nomeMese(ancora)}
            </p>
            <button
              type="button"
              aria-label={`Vai a ${nomeMese(ancora, 1)}`}
              onClick={() => setAncora((corrente) => spostaMese(corrente, 1))}
              className="flex flex-col items-center px-1 text-slate-800"
            >
              <span className="text-xl leading-none">→</span>
              <span className="text-[10px] text-slate-500">{nomeMese(ancora, 1)}</span>
            </button>
          </div>
          <label className="text-xs text-slate-500">
            Anno
            <select
              aria-label="Anno"
              value={ancora.slice(0, 4)}
              onChange={(event) => setAncora(`${event.target.value}-${ancora.slice(5, 7)}-01`)}
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            >
              {anniNavigazione(ancora, inizio, fine).map((anno) => (
                <option key={anno} value={anno}>
                  {anno}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setErrore(null);
              setCreaAperta(true);
            }}
            className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold tracking-wide text-white"
          >
            CREA ORDINE MATERIA PRIMA
          </button>
        </div>
        {test ? (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p>Modalità test: stesse regole della produzione. Nessuna scrittura sul database aziendale.</p>
            <label className="mt-2 block">
              Email destinatario di prova
              <input
                value={emailProva}
                onChange={(event) => {
                  setEmailProva(event.target.value);
                  setConfermaEmail(false);
                  setAnteprimaEmail(null);
                }}
                className="mt-1 block w-full max-w-sm rounded border border-amber-300 bg-white px-2 py-1"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const documento = documentoEmailProva();
                  if (!documento) {
                    setErrore("Apri la pianificazione di prova da allegare.");
                    setAnteprimaEmail(null);
                    return;
                  }
                  const preparata = preparaEmailProva({
                    destinatario: emailProva,
                    emailFornitore: null,
                    codice: documento.codice,
                    conferma: false,
                  });
                  if (!preparata.ok) {
                    setErrore(preparata.motivo);
                    setAnteprimaEmail(null);
                    return;
                  }
                  setErrore(null);
                  setAnteprimaEmail(
                    `${preparata.busta.subject}\n\n${preparata.busta.text}\n\nAllegato: ${preparata.busta.allegato}`
                  );
                }}
                className="rounded border border-amber-700 px-2 py-1"
              >
                Anteprima email
              </button>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confermaEmail}
                  onChange={(event) => setConfermaEmail(event.target.checked)}
                />
                Confermo l&apos;invio solo a questo indirizzo
              </label>
              <button
                type="button"
                disabled={!confermaEmail || pending}
                onClick={() => {
                  const documento = documentoEmailProva();
                  if (!documento) {
                    setErrore("Apri la pianificazione di prova da allegare.");
                    return;
                  }
                  startTransition(async () => {
                    const res = await inviaEmailProvaApprovvigionamentoAction({
                      destinatario: emailProva,
                      emailFornitore: null,
                      codice: documento.codice,
                      conferma: true,
                      documento,
                    });
                    if (!res.success) {
                      setErrore(res.error);
                      return;
                    }
                    setMessaggio(
                      `Email di prova inviata solo a ${res.to}, con allegato ${res.allegato}. Nessun altro destinatario.`
                    );
                  });
                }}
                className="rounded bg-amber-900 px-2 py-1 text-white disabled:opacity-60"
              >
                Invia solo all&apos;indirizzo di prova
              </button>
            </div>
            {anteprimaEmail ? (
              <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-xs text-slate-800">{anteprimaEmail}</pre>
            ) : null}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          <select
            value={filtroFornitore}
            onChange={(event) => setFiltroFornitore(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Tutti i fornitori</option>
            {[...new Map(ordini.map((ordine) => [ordine.fornitoreId, ordine.fornitore])).entries()].map(
              ([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              )
            )}
          </select>
          <select
            value={filtroMateria}
            onChange={(event) => setFiltroMateria(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Tutte le materie</option>
            {materie.map((voce) => (
              <option key={voce.id} value={voce.id}>
                {voce.codice}
              </option>
            ))}
          </select>
          <select
            value={filtroStato}
            onChange={(event) => setFiltroStato(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Tutti gli stati</option>
            <option value="bozza">Bozza</option>
            <option value="pubblicato">Pubblicato</option>
            <option value="da_ripubblicare">Revisione da pubblicare</option>
            <option value="annullato">Annullata</option>
          </select>
          <select
            value={filtroPiano}
            onChange={(event) => setFiltroPiano(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Tutte le pianificazioni</option>
            {piani.map((pianoVoce) => (
              <option key={pianoVoce.id} value={pianoVoce.id}>
                {pianoVoce.codice}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 rounded-lg border border-slate-200 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resoconto · {resoconto.consegnePreviste} consegne previste
          </p>
          {esclusioneAnteprima ? (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-950">
              {esclusioneAnteprima}
            </p>
          ) : null}
          {resoconto.gruppi.length === 0 && !esclusioneAnteprima ? (
            <p className="mt-2 text-sm text-slate-600">Nessuna consegna nel resoconto.</p>
          ) : null}
          {resoconto.gruppi.length > 0 ? (
            <ul className="mt-2 grid gap-2">
              {resoconto.gruppi.map((gruppo) => (
                <GruppoResoconto key={`${gruppo.materiaId}|${gruppo.unita}`} gruppo={gruppo} />
              ))}
            </ul>
          ) : null}
          <GiacenzaResoconto voci={vociRiepilogo} />
        </div>
        <ul className="mb-3 flex flex-wrap gap-2 text-xs">
          {LEGENDA_CALENDARIO.map((voce) => (
            <li key={voce.chiave} className={`rounded px-2 py-1 ${voce.classe}`}>
              {voce.etichetta}
            </li>
          ))}
        </ul>
        {anteprima && anteprima.ok ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void scaricaFile(
                  "anteprima-pianificazione.pdf",
                  pdfPianificazione(documentoAnteprima()),
                  "application/pdf"
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              Esporta PDF
            </button>
            <button
              type="button"
              onClick={() =>
                void xlsxPianificazione(documentoAnteprima()).then((bytes) =>
                  scaricaFile(
                    "anteprima-pianificazione.xlsx",
                    bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  )
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              Esporta Excel
            </button>
          </div>
        ) : null}
        {vista !== "giorno" ? (
          <div className="grid grid-cols-7 gap-1">
            {FERIE.map((nome) => (
              <div key={nome} className="px-1 text-center text-xs font-medium text-slate-500">
                {nome}
              </div>
            ))}
            {(vista === "mese" ? celle : giorniSettimana(ancora)).map((iso) => {
              const voci = ordiniFiltrati.filter((ordine) => ordine.dataConsegna === iso);
              const fuoriMese = vista === "mese" && iso.slice(0, 7) !== ancora.slice(0, 7);
              const prevista = dateAnteprima.has(iso);
              const nelPeriodo =
                operazione === "pianificazione" && inizio <= iso && iso <= fine && Boolean(inizio && fine);
              const aspetto = aspettoGiorno({
                nelPeriodo,
                consegnaPrevista: prevista,
                selezionato: dateScelte.includes(iso),
                stati: voci.map((ordine) => ordine.stato),
                confermati: voci.map((ordine) => ordine.confermataDalFornitore),
              });
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => clicGiorno(iso)}
                  className={`min-h-24 rounded-lg border p-1 text-left ${iso === giorno ? "border-slate-900" : "border-slate-200"} ${fuoriMese ? "opacity-60" : ""} ${classeCellaCalendario(aspetto)}`}
                >
                  <span className="text-xs font-medium">{Number(iso.slice(8))}</span>
                  <ul className="mt-1 space-y-1">
                    {voci.slice(0, 3).map((ordine) => (
                      <li
                        key={ordine.id}
                        className={`truncate rounded px-1 text-[11px] ${classeConsegna(ordine.stato)}`}
                      >
                        {etichettaStatoBreve(ordine.stato)}
                        {ordine.righe.some((riga) => riga.tipoQuantita === "stimata") ? " · stimata" : ""}
                        {" · "}
                        {ordine.codice}
                      </li>
                    ))}
                    {voci.length > 3 ? (
                      <li className="text-[11px] text-slate-500">+{voci.length - 3}</li>
                    ) : null}
                    {prevista ? (
                      <li className="truncate rounded bg-sky-50 px-1 text-[11px] text-sky-950">Anteprima</li>
                    ) : null}
                  </ul>
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-2">
            {delGiorno.length === 0 ? (
              <li className="text-sm text-slate-500">Nessuna consegna in questo giorno.</li>
            ) : (
              delGiorno.map((ordine) => (
                <li key={ordine.id} className={`rounded-lg border p-3 text-sm ${classeConsegna(ordine.stato)}`}>
                  <button type="button" onClick={() => compila(ordine)} className="font-medium text-slate-900">
                    {ordine.codice} · {ordine.fornitore}
                  </button>
                  <StatoOrdine ordine={ordine} />
                  <BilancioOrdine ordine={ordine} />
                  <p className="text-slate-600">
                    Revisione {ordine.revisione}
                    {ordine.pianoCodice ? ` · ${ordine.pianoCodice}` : ""}
                    {" · "}
                    {ordine.righe
                      .map((riga) => `${riga.nome} ${riga.quantita} ${etichettaUnita(riga.unitaMisura, riga.unitaNome)} ${riga.tipoQuantita}`)
                      .join(", ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending || ordine.stato === "annullato"}
                      onClick={() => pubblicaOrdine(ordine)}
                      className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {test ? "Pubblicazione simulata" : "Pubblica e invia"}
                    </button>
                    <button
                      type="button"
                      disabled={pending || ordine.stato === "annullato" || ordine.carichi.length > 0}
                      onClick={() => annullaConsegna(ordine)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-60"
                    >
                      Annulla consegna
                    </button>
                    {ordine.notificaStato === "incerta" || ordine.notificaStato === "fallita" ? (
                      <button
                        type="button"
                        disabled={pending || !ordine.notificaId}
                        onClick={() => ordine.notificaId && recupera(ordine.notificaId, ordine.notificaStato === "incerta")}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-60"
                      >
                        Recupera esito incerto
                      </button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-white p-3">
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
                  {etichettaTipologia(voce.tipologia)} ·{" "}
                  {quadriApprovvigionamento({
                    stato: voce.stato,
                    notifica: voce.notificaStato,
                    visionato: Boolean(voce.visionatoAt),
                  }).documento}{" "}
                  {voce.revisione} · {voce.periodoInizio} – {voce.periodoFine} · {voce.ordini.length} ordini
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pubblicaPiano(voce)}
                  className="mt-1 rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {test ? "Pubblicazione simulata" : "Invia pianificazione al fornitore"}
                </button>
                <p className="mt-1 text-xs text-slate-500">
                  Pubblica la versione già salvata. Non cambia quantità né date e non parte dal salvataggio della bozza.
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
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-sm text-slate-700">Consegne di questa pianificazione</p>
              <ul className="mt-2 space-y-1">
                {ordiniPiano
                  .filter((ordine) => ordine.pianoId === pianoAperto)
                  .map((ordine) => (
                    <li key={ordine.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>
                        {ordine.dataConsegna} · {etichettaStatoBreve(ordine.stato)} ·{" "}
                        {ordine.righe
                          .map((riga) => `${riga.quantita} ${etichettaUnita(riga.unitaMisura, riga.unitaNome)} ${riga.tipoQuantita}`)
                          .join(", ")}
                      </span>
                      <button
                        type="button"
                        disabled={ordine.stato === "annullato"}
                        onClick={() => compila(ordine)}
                        className="text-sky-800 disabled:opacity-60"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        disabled={pending || ordine.stato === "annullato" || ordine.carichi.length > 0}
                        onClick={() => annullaConsegna(ordine)}
                        className="text-red-800 disabled:opacity-60"
                      >
                        Annulla
                      </button>
                    </li>
                  ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const scelto = piani.find((voce) => voce.id === pianoAperto);
                    if (!scelto) return;
                    const documento = documentoPianoSalvato(scelto, ordiniPiano);
                    void scaricaFile(
                      `${scelto.codice}.pdf`,
                      pdfPianificazione(documento),
                      "application/pdf"
                    );
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  Esporta PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const scelto = piani.find((voce) => voce.id === pianoAperto);
                    if (!scelto) return;
                    void xlsxPianificazione(documentoPianoSalvato(scelto, ordiniPiano)).then((bytes) =>
                      scaricaFile(
                        `${scelto.codice}.xlsx`,
                        bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      )
                    );
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  Esporta Excel
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Materia
                  <select
                    value={materiaAggiunta}
                    onChange={(event) => {
                      const valore = event.target.value;
                      setMateriaAggiunta(valore);
                      if (unitaAggiunta) return;
                      const catalogo = materie.find((voce) => voce.id === valore)?.unitaMisura ?? "";
                      if (unitaStandard(catalogo)) setUnitaAggiunta(catalogo);
                    }}
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-2"
                  >
                    <option value="">Seleziona</option>
                    {materie.map((voce) => (
                      <option key={voce.id} value={voce.id}>
                        {voce.codice} · {voce.unitaMisura ?? "senza unità"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Tipo
                  <select
                    value={tipoAggiunta}
                    onChange={(event) =>
                      setTipoAggiunta(event.target.value === "stimata" ? "stimata" : "precisa")
                    }
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-2"
                  >
                    <option value="precisa">Precisa</option>
                    <option value="stimata">Stimata</option>
                  </select>
                </label>
                <label className="text-sm">
                  Nuova data
                  <input
                    type="date"
                    value={dataAggiunta}
                    onChange={(event) => setDataAggiunta(event.target.value)}
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-2"
                  />
                </label>
                <label className="text-sm">
                  Quantità
                  <input
                    value={qtyAggiunta}
                    onChange={(event) => setQtyAggiunta(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-2"
                  />
                </label>
                <SelettoreUnita
                  sigla={unitaAggiunta}
                  nome={nomeAggiunta}
                  personalizzata={personalizzataAggiunta}
                  onChange={(valore) => {
                    setUnitaAggiunta(valore.sigla);
                    setNomeAggiunta(valore.nome);
                    setPersonalizzataAggiunta(valore.personalizzata);
                  }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const scelto = piani.find((voce) => voce.id === pianoAperto);
                    if (scelto) aggiungiConsegnaAlPiano(scelto);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
                >
                  Aggiungi consegna
                </button>
              </div>
              {test && piani.find((voce) => voce.id === pianoAperto)?.versionePubblicata == null ? (
                <p className="mt-3 text-sm text-amber-900">
                  Pubblica la simulazione prima di proporre una revisione.
                </p>
              ) : null}
              {test && piani.find((voce) => voce.id === pianoAperto)?.versionePubblicata != null ? (
                <RevisionePianoPannello
                  key={pianoAperto}
                  consegne={consegneUfficiali(
                    ordiniPiano.filter((ordine) => ordine.pianoId === pianoAperto)
                  )}
                  pending={pending}
                  onProponi={(input) => {
                    if (!testRef.current) return;
                    const scelto = piani.find((voce) => voce.id === pianoAperto);
                    if (!scelto) return;
                    const ufficiali = consegneUfficiali(
                      ordiniPiano.filter((ordine) => ordine.pianoId === pianoAperto)
                    );
                    const costruita = costruisciRevisionePiano({
                      ufficiali,
                      bozza: input.bozza,
                      motivazione: input.motivazione,
                    });
                    if (!costruita.ok) {
                      setErrore(costruita.motivo);
                      return;
                    }
                    const prima = sessione.ordini.map((ordine) => ({
                      id: ordine.id,
                      data: ordine.dataConsegna,
                      quantita: ordine.righe[0]?.quantita ?? 0,
                      stato: ordine.stato,
                    }));
                    setProposte((correnti) => [
                      {
                        id: crypto.randomUUID(),
                        pianoId: scelto.id,
                        codice: scelto.codice,
                        motivazione: costruita.motivazione,
                        voci: costruita.voci,
                      },
                      ...correnti,
                    ]);
                    const dopo = sessione.ordini.map((ordine) => ({
                      id: ordine.id,
                      data: ordine.dataConsegna,
                      quantita: ordine.righe[0]?.quantita ?? 0,
                      stato: ordine.stato,
                    }));
                    if (JSON.stringify(prima) !== JSON.stringify(dopo)) {
                      setErrore("La revisione di prova ha toccato gli ordini.");
                      return;
                    }
                    setMessaggio(
                      "Revisione di prova registrata. Gli ordini simulati non sono stati modificati."
                    );
                  }}
                />
              ) : null}
              <ValutazioneRevisione
                proposte={(test ? proposte : proposteAzienda).filter(
                  (proposta) => proposta.pianoId === pianoAperto
                )}
                pending={pending}
                onDecidi={(propostaId, voceId, esito, nota) => {
                  const elenco = testRef.current ? proposte : proposteAzienda;
                  const attuale = elenco.find((proposta) => proposta.id === propostaId);
                  if (!attuale) return;
                  const decisa = decidiVoceRevisione(attuale, voceId, esito, nota);
                  if (!decisa.ok) {
                    setErrore(decisa.motivo);
                    return;
                  }
                  if (testRef.current) {
                    setProposte((correnti) =>
                      correnti.map((proposta) =>
                        proposta.id === propostaId ? decisa.proposta : proposta
                      )
                    );
                    setMessaggio(
                      esito === "accettata"
                        ? "Modifica accettata in prova. Gli ordini non sono stati aggiornati."
                        : "Modifica respinta in prova. Gli ordini restano quelli della versione."
                    );
                    return;
                  }
                  startTransition(async () => {
                    if (vietatoInProva()) return;
                    const res = await decidiVocePropostaPianoAction({
                      propostaId,
                      voceId,
                      esito,
                      nota,
                    });
                    if (!res.success) {
                      setErrore(res.error);
                      return;
                    }
                    setProposteAzienda((correnti) =>
                      correnti.map((proposta) =>
                        proposta.id === propostaId ? res.proposta : proposta
                      )
                    );
                    setMessaggio("Esito registrato. Gli ordini ufficiali non sono stati modificati.");
                  });
                }}
              />
            </div>
          </div>
        ) : null}
      </section>
      {creaAperta ? (
        <CreaOrdineMateriaPrimaModal
          materie={materie}
          fornitori={fornitori}
          pending={pending}
          prova={test}
          errore={errore}
          onClose={() => setCreaAperta(false)}
          onSalva={salvaProcedura}
        />
      ) : null}
    </div>
  );
}

function etichettaTipologia(tipologia: PianoCalendario["tipologia"]): string {
  if (tipologia === "mensile") return "Mensile";
  if (tipologia === "regolare") return "Ogni N giorni";
  if (tipologia === "personalizzata") return "Date scelte";
  if (tipologia === "giorni_fissi") return "Giorni fissi della settimana";
  return "Settimanale";
}

function etichettaStatoBreve(stato: OrdineCalendario["stato"]): string {
  if (stato === "pubblicato") return "Pubblicato";
  if (stato === "da_ripubblicare") return "Revisione";
  if (stato === "annullato") return "Annullata";
  return "Bozza";
}

function classeConsegna(stato: OrdineCalendario["stato"]): string {
  if (stato === "annullato") return "bg-slate-200 text-slate-600 line-through";
  if (stato === "pubblicato") return "bg-emerald-50 text-emerald-950";
  if (stato === "da_ripubblicare") return "bg-amber-100 text-amber-950";
  return "bg-sky-50 text-sky-950";
}

function etichettaCarico(stato: "aperto" | "parziale" | "arrivato"): string {
  if (stato === "arrivato") return "Arrivo registrato";
  if (stato === "parziale") return "Registrazione parziale";
  return "Aperto";
}

function BilancioOrdine(props: { ordine: OrdineCalendario }) {
  if (props.ordine.bilancio.length === 0 && props.ordine.carichi.length === 0) return null;
  return (
    <div className="mt-1 text-xs text-slate-600">
      {props.ordine.bilancio.map((riga) => (
        <p key={riga.codice}>
          {riga.codice}: ordinato {riga.ordinata} {etichettaUnita(riga.unitaMisura)}, ricevuto {riga.ricevuta}, da
          ricevere {riga.residua}
          {riga.oltre ? " · oltre il previsto" : ""}
        </p>
      ))}
      {props.ordine.carichi.map((carico) => (
        <p key={carico.id}>
          {carico.codice}
          {carico.versioneNumero ? ` · versione ${carico.versioneNumero}` : ""} · {etichettaCarico(carico.stato)}
          {carico.conteggiato ? "" : " · non conteggiato sulla versione corrente"}
          {carico.foglioId ? (
            <>
              {" "}
              ·{" "}
              <a
                href={`/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso?foglio=${carico.foglioId}`}
                className="text-sky-800"
              >
                {carico.foglioCodice ?? "Foglio"}
              </a>
            </>
          ) : null}
        </p>
      ))}
    </div>
  );
}

function StatoOrdine(props: { ordine: OrdineCalendario }) {
  const quadri = quadriApprovvigionamento({
    stato: props.ordine.stato,
    notifica: props.ordine.notificaStato,
    visionato: Boolean(props.ordine.visionatoAt),
  });
  const presa =
    props.ordine.visioneOrigine === "piano" && quadri.presaVisione
      ? `${quadri.presaVisione} con il piano`
      : quadri.presaVisione;
  return (
    <p className="text-xs text-slate-700">
      {quadri.documento}
      {quadri.notifica ? ` · ${quadri.notifica}` : ""}
      {presa ? ` · ${presa}` : ""}
      {props.ordine.visionatoDa ? ` · ${props.ordine.visionatoDa}` : ""}
      {props.ordine.versionePubblicata ? ` · v${props.ordine.versionePubblicata}` : ""}
    </p>
  );
}

function Scheda(props: {
  giorno: string;
  ordini: OrdineCalendario[];
  materie: MateriaCalendario[];
  fornitori: { id: string; nome: string; targa: string }[];
  ordineId: string | null;
  modificaBloccata: boolean;
  fornitoreId: string;
  note: string;
  righe: RigaForm[];
  dataCopia: string;
  settimanaDestinazione: string;
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
  onSalva: () => void;
  onCopia: (ordine: OrdineCalendario) => void;
  onCopiaSettimana: () => void;
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
      {props.ordineId ? (
      <>
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
          return (
            <div key={`${indice}-${riga.materiaPrimaId}`} className="rounded-lg border border-slate-200 p-2">
              <select
                value={riga.materiaPrimaId}
                onChange={(event) => {
                  const copia = [...props.righe];
                  const materiaScelta = props.materie.find((voce) => voce.id === event.target.value);
                  const catalogo = materiaScelta?.unitaMisura ?? "";
                  copia[indice] = {
                    ...riga,
                    materiaPrimaId: event.target.value,
                    unitaMisura: riga.unitaMisura || (unitaStandard(catalogo) ? catalogo : ""),
                  };
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
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  value={riga.quantita}
                  onChange={(event) => {
                    const copia = [...props.righe];
                    copia[indice] = { ...riga, quantita: event.target.value };
                    props.onRighe(copia);
                  }}
                  inputMode="decimal"
                  placeholder="Quantità"
                  aria-label="Quantità"
                  className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <SelettoreUnita
                  sigla={riga.unitaMisura}
                  nome={riga.unitaNome}
                  personalizzata={riga.personalizzata}
                  onChange={(valore) => {
                    const copia = [...props.righe];
                    copia[indice] = {
                      ...riga,
                      unitaMisura: valore.sigla,
                      unitaNome: valore.nome,
                      personalizzata: valore.personalizzata,
                    };
                    props.onRighe(copia);
                  }}
                />
                <select
                  value={riga.tipoQuantita}
                  onChange={(event) => {
                    const copia = [...props.righe];
                    const tipo = event.target.value === "stimata" ? "stimata" : "precisa";
                    copia[indice] = { ...riga, tipoQuantita: tipo };
                    props.onRighe(copia);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="precisa">Precisa</option>
                  <option value="stimata">Stimata</option>
                </select>
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
        disabled={
          props.pending ||
          props.mancaUnita ||
          props.modificaBloccata ||
          !props.fornitoreId ||
          !props.ordineId
        }
        onClick={props.onSalva}
        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Salva modifica
      </button>
      </>
      ) : (
        <p className="text-sm text-slate-600">
          Seleziona un ordine già salvato per modificarlo. Una bozza non viene pubblicata da sola.
        </p>
      )}
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
