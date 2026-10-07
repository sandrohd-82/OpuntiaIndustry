"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createOrdineWizardAction,
  previewNumeroInternoOrdineAction,
} from "@/app/actions/ordini";
import { getScontoFuoriListinoContextAction } from "@/app/actions/ordine-sconto";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  fasciaScontoExtra,
  parseScontoExtraPct,
  prezzoNettoDaSconto,
  SCONTO_FUORI_LISTINO_REGOLE,
  SCONTO_FUORI_LISTINO_TITOLO,
} from "@/lib/amministrazione/sconto-fuori-listino";
import { ScontoSuddivisioneFields } from "@/components/amministrazione/ScontoSuddivisioneFields";
import { StoricoScontiProdotto } from "@/components/amministrazione/StoricoScontiProdotto";
import { validaQuoteSuddivisione } from "@/lib/amministrazione/sconto-suddivisione";
import { getAccordoPrezzoProdottoAction } from "@/app/actions/accordi-prezzo";
import { getListinoVoceVigenteAction } from "@/app/actions/listini";
import {
  accordoForzato,
  voceAccordoPrezzo,
  type AccordoPrezzoProdotto,
} from "@/lib/amministrazione/accordi-prezzo";
import {
  LISTINO_CONTRATTO_MSG,
  valutaListinoPerContratto,
  type ListinoVoceVigente,
} from "@/lib/ecosystem/listino-vigente";
import {
  createCorriereAction,
  listCorrieriAction,
  listImballaggiVociAction,
} from "@/app/actions/imballaggi-spedizioni";
import {
  getPreventivoProdottoContestoAction,
  listPreventiviAccettatiAction,
} from "@/app/actions/preventivi";
import {
  CONFEZIONE_SISTEMA,
  confezioniListinoDistinte,
  modoConfezioneApplicato,
  pianoConfezionamento,
} from "@/lib/amministrazione/preventivo-confezionamento";
import type { PreventivoScontisticaRiga } from "@/lib/amministrazione/preventivi";
import { calcolaConsegnaOrdineAction } from "@/app/actions/produzione-capacita";
import { linkEntityReferenteAction } from "@/app/actions/rubrica";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { AziendaOrdineSelect } from "@/components/amministrazione/AziendaOrdineSelect";
import { CampionaturaAltroPostoModal } from "@/components/amministrazione/CampionaturaAltroPostoModal";
import { ConsegnaCalendarioModal } from "@/components/amministrazione/ConsegnaCalendarioModal";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { ReferentiPickerField } from "@/components/amministrazione/ReferentiPickerField";
import { FatturaA4Modal } from "@/components/amministrazione/FatturaA4Modal";
import { FatturaWebmailComposeModal } from "@/components/amministrazione/FatturaWebmailComposeModal";
import type { FatturaInvioMailDraft } from "@/lib/amministrazione/fattura-invio-mail";
import { OrdinePagamentoPianoFields } from "@/components/amministrazione/OrdinePagamentoPianoFields";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import { SpedizioneMailPanel } from "@/components/amministrazione/SpedizioneMailPanel";
import { anagraficaMailDi } from "@/components/amministrazione/SpedizioneDestinatarioMailField";
import {
  applyContributoSpeseSpedizione,
  listinoEScontoDaOrdine,
  type FatturaA4Riga,
} from "@/lib/amministrazione/fattura-a4-documento";
import { todayIsoDate } from "@/lib/amministrazione/fatture";
import {
  applyTotaleToPiano,
  emptyPagamentoPiano,
  tipoPagamentoFromPiano,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  buildOrdineSessioneLocale,
  destinatarioSessioneDaCliente,
  emailsDaCliente,
  clearOrdineSessione,
  loadOrdineSessione,
  ORDINI_PERSISTENZA_DEFINITIVA,
  saveOrdineSessione,
} from "@/lib/amministrazione/ordine-sessione";
import {
  generaCorpoMailSpedizioneAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { loadAnagraficaExtraAction } from "@/app/actions/anagrafica-extra";
import { updateSedePartenzaAction } from "@/app/actions/impostazioni-sedi";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  attivitaToOrdineDraft,
  type AttivitaOrdineDraft,
} from "@/lib/amministrazione/attivita";
import {
  defaultUnitaCampionatura,
  emptyTrasporto,
  opzioniUnitaCampionatura,
  quantitaInUnitaBase,
  unitaBaseProdotto,
  type Ordine,
  type OrdineTipoPagamento,
  type OrdineUnitaMisura,
} from "@/lib/amministrazione/ordini";
import type { AnagraficaSede } from "@/lib/amministrazione/anagrafica-extra";
import {
  clienteSpedizioneOptions,
  pickSpedizioneDefault,
} from "@/lib/amministrazione/campionature";
import type { Cliente } from "@/lib/amministrazione/clienti";
import type { AnagraficaOrdineFonte } from "@/lib/amministrazione/ordine-anagrafica";
import { clienteFromPossibile } from "@/lib/promemorie-e-note/types";
import {
  notifyPreventiviSpedizioneNav,
  type Preventivo,
} from "@/lib/amministrazione/preventivi";
import type { RubricaContatto } from "@/lib/rubrica/types";
import {
  imponibileRiga,
  ivaRiga,
  totaleRiga,
} from "@/lib/amministrazione/ordini";
import {
  childStadioFor,
  voceCollegataAlProdotto,
  emptyConfezionamentoDraft,
  emptyNodo,
  filterVociForWizardStadio,
  labelImballaggioVoce,
  normalizeConfezionamentoDraft,
  totaleKgConfezionati,
  type ConfezionamentoDraft,
  type ConfezionamentoNodoDraft,
  type Corriere,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  resolveLineaFromProdottoCodice,
  type CapacitaCalcoloResult,
} from "@/lib/amministrazione/produzione-capacita";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import type { OrdineConfezionamentoNodoStadio } from "@/types/database";
import { loadOrdinePerModificaWizardAction } from "@/app/actions/ordine-wizard-modifica";

type Props = {
  /** Riapre la procedura già compilata su questo ordine. */
  modificaOrdineId?: string;
  onClose: () => void;
  onSaved: (ordine: Ordine) => void;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateIt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

function domandaKgPerUnita(
  parent: ConfezionamentoNodoDraft | null,
  pesiDiversi = false
): string {
  const q =
    parent && typeof parent.quantita === "number" && Number.isFinite(parent.quantita)
      ? parent.quantita
      : 0;
  const n = q.toLocaleString("it-IT");
  if (!parent || parent.stadio === "isolamento") {
    if (q <= 0) {
      return "Indica prima quanti isolamenti ci sono nella confezione. Poi scrivi quanti kg di prodotto sono presenti dentro un isolamento.";
    }
    const pezzi = q === 1 ? "1 isolamento" : `${n} isolamenti`;
    if (pesiDiversi) {
      return `Hai impostato ${pezzi}. Indica i kg di prodotto dentro ciascun isolamento.`;
    }
    return `Hai impostato ${pezzi}. Quanti kg di prodotto sono presenti dentro un isolamento?`;
  }
  if (parent.stadio === "confezione") {
    if (q <= 0) {
      return "Indica prima quante confezioni ci sono. Poi scrivi quanti kg di prodotto sono presenti dentro una confezione.";
    }
    const pezzi = q === 1 ? "1 confezione" : `${n} confezioni`;
    if (pesiDiversi) {
      return `Hai impostato ${pezzi}. Indica i kg di prodotto dentro ciascuna confezione.`;
    }
    return `Hai impostato ${pezzi}. Quanti kg di prodotto sono presenti dentro una confezione?`;
  }
  return "Quanti kg di prodotto sono presenti in questa unità?";
}

function nuovoPesoProdotto(
  prodotto: { nome: string; codice: string } | null
): ConfezionamentoNodoDraft {
  const child = emptyNodo("prodotto_kg");
  child.quantita = 1;
  child.kgProdotto = "";
  if (prodotto) {
    child.nome = prodotto.nome;
    child.codice = prodotto.codice;
  }
  return child;
}

function bloccaQtyProdotto(nodes: ConfezionamentoNodoDraft[]): {
  nodi: ConfezionamentoNodoDraft[];
  changed: boolean;
} {
  const unSoloPeso =
    nodes.filter((n) => n.stadio === "prodotto_kg").length <= 1;
  let changed = false;
  const nodi = nodes.map((n) => {
    const kids = bloccaQtyProdotto(n.children);
    if (kids.changed) changed = true;
    if (unSoloPeso && n.stadio === "prodotto_kg" && n.quantita !== 1) {
      changed = true;
      return { ...n, quantita: 1, children: kids.nodi };
    }
    if (kids.changed) return { ...n, children: kids.nodi };
    return n;
  });
  return { nodi, changed };
}

function pezziPeso(n: ConfezionamentoNodoDraft): number {
  return typeof n.quantita === "number" && n.quantita > 0 ? n.quantita : 0;
}

function sommaPezziPesi(pesi: ConfezionamentoNodoDraft[]): number {
  return pesi.reduce((s, p) => s + pezziPeso(p), 0);
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Azienda" },
  { n: 2, label: "Prodotto" },
  { n: 3, label: "Quantità" },
  { n: 4, label: "Consegna" },
  { n: 5, label: "Spedizione" },
  { n: 6, label: "Confezione" },
  { n: 7, label: "Pagamento" },
];

function updateNodoInTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string,
  patch: Partial<ConfezionamentoNodoDraft>
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === localId) return { ...n, ...patch };
    return { ...n, children: updateNodoInTree(n.children, localId, patch) };
  });
}

function removeNodoFromTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string
): ConfezionamentoNodoDraft[] {
  return nodes
    .filter((n) => n.localId !== localId)
    .map((n) => ({
      ...n,
      children: removeNodoFromTree(n.children, localId),
    }));
}

function addChildToNode(
  nodes: ConfezionamentoNodoDraft[],
  parentId: string,
  child: ConfezionamentoNodoDraft
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === parentId) {
      return { ...n, children: [...n.children, child] };
    }
    return {
      ...n,
      children: addChildToNode(n.children, parentId, child),
    };
  });
}

export function OrdineNuovoWizardModal({
  modificaOrdineId,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const { prodotti, ready: prodottiReady, addProdotto, refresh } =
    useProdottiPropri();
  const [step, setStep] = useState<Step>(1);
  const [modificaPronta, setModificaPronta] = useState(!modificaOrdineId);
  const [sedePartenzaId, setSedePartenzaId] = useState("");
  const savedPriceRef = useRef<{
    prezzo: number | "";
    scontoAccordo: number | "";
    dataDisp: string;
  } | null>(null);
  const skipUnitaOnce = useRef(false);
  const pianoLock = useRef(Boolean(modificaOrdineId));
  const unlockPianoNext = useRef(false);
  const hydratedId = useRef("");
  const addressManual = useRef(false);
  const preserveSavedAddress = useRef(Boolean(modificaOrdineId));
  const indirizzoSpedizioneRef = useRef("");
  const hydratedCliente = useRef<string | null>(null);
  const hydratedProdotto = useRef<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const spedDraft = useRef({
    trackingUrl: "",
    letteraViaPath: "",
    letteraViaName: "",
    allegati: [] as Array<{ path: string; name: string; contentType: string }>,
    allegaTracking: false,
    allegaLettera: false,
    allegaFile: false,
    destinatarioEmail: "",
    sedePartenzaId: "",
    bozzaPronta: false,
    mailAccountId: "",
    mailOggetto: "",
    mailCorpo: "",
  });
  const [composeAfter, setComposeAfter] = useState<{
    prenotazione: SpedizioneMailPrenotazione;
    subject: string;
    bodyText: string;
    to: string;
    ordine: Ordine;
  } | null>(null);
  const [fatturaMailDraft, setFatturaMailDraft] =
    useState<FatturaInvioMailDraft | null>(null);

  const [anagraficaFonte, setAnagraficaFonte] =
    useState<AnagraficaOrdineFonte>("cliente");
  const [clienteId, setClienteId] = useState("");
  const [possibileClienteId, setPossibileClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTarga, setClienteTarga] = useState("");
  const [dataOrdine, setDataOrdine] = useState(todayInputValue());
  const [numeroInterno, setNumeroInterno] = useState("");

  const [prodotto, setProdotto] = useState<ProdottoProprio | null>(null);
  const [notaProdotto, setNotaProdotto] = useState("");
  const [notaProdottoAperta, setNotaProdottoAperta] = useState(false);
  const [voceListino, setVoceListino] = useState<ListinoVoceVigente | null>(
    null
  );
  const [voceListinoLoading, setVoceListinoLoading] = useState(false);
  const [dataDisponibilitaPresunta, setDataDisponibilitaPresunta] =
    useState("");
  const [creatingProdotto, setCreatingProdotto] = useState(false);

  const [quantita, setQuantita] = useState<number | "">(100);
  const [unitaMisura, setUnitaMisura] = useState<OrdineUnitaMisura>("kg");
  const [prezzoUnitario, setPrezzoUnitario] = useState<number | "">("");
  const [scontoExtraPct, setScontoExtraPct] = useState<number | "">("");
  const [condizioniListino, setCondizioniListino] = useState<
    PreventivoScontisticaRiga[]
  >([]);
  const [modoConfezione, setModoConfezione] = useState(CONFEZIONE_SISTEMA);
  const [scontoListinoManuale, setScontoListinoManuale] = useState<
    number | null
  >(null);
  const [modificaScontoListino, setModificaScontoListino] = useState(false);
  const [scontoListinoInput, setScontoListinoInput] = useState<number | "">(
    ""
  );
  const [fontePreventivo, setFontePreventivo] = useState(false);
  const [scontoListinoDalPreventivo, setScontoListinoDalPreventivo] =
    useState<number | null>(null);
  const [testoConfezionePreventivo, setTestoConfezionePreventivo] =
    useState("");
  const fontePreventivoRef = useRef(false);
  const [accordo, setAccordo] = useState<AccordoPrezzoProdotto | null>(null);
  const [scontoAccordo, setScontoAccordo] = useState<number | "">("");
  const [scontoSuddivisioneAttiva, setScontoSuddivisioneAttiva] = useState(false);
  const [scontoQuotaAzienda, setScontoQuotaAzienda] = useState<number | "">("");
  const [scontoQuotaCommerciale, setScontoQuotaCommerciale] = useState<
    number | ""
  >("");
  const [scontoCtx, setScontoCtx] = useState<{
    canOltre30: boolean;
    isSuperadmin: boolean;
    isSenior: boolean;
  } | null>(null);
  const [preventivoId, setPreventivoId] = useState("");
  const [preventiviAccettati, setPreventiviAccettati] = useState<Preventivo[]>(
    []
  );
  const [mailAccettazione, setMailAccettazione] = useState<{
    id: string;
    subject: string;
  } | null>(null);
  const [mailRichiesta, setMailRichiesta] = useState<{
    id: string;
    subject: string;
  } | null>(null);
  const [timelineMailKind, setTimelineMailKind] = useState<
    "accettazione" | "richiesta" | null
  >(null);
  const [referenteAccettazione, setReferenteAccettazione] =
    useState<RubricaContatto | null>(null);
  const [timelineMailOpen, setTimelineMailOpen] = useState(false);
  const [tipoPagamento, setTipoPagamento] =
    useState<OrdineTipoPagamento>("alla_consegna");
  const [pagamentoPiano, setPagamentoPiano] = useState<OrdinePagamentoPiano>(
    () => emptyPagamentoPiano("alla_consegna")
  );
  const [savedOrdine, setSavedOrdine] = useState<Ordine | null>(null);
  const [sessioneMsg, setSessioneMsg] = useState<string | null>(null);
  const [fatturaA4Open, setFatturaA4Open] = useState(false);
  const [tipoOrdine, setTipoOrdine] = useState<"vendita" | "campionatura">(
    "vendita"
  );
  const lastStep: Step = tipoOrdine === "campionatura" ? 6 : 7;

  const [consegnaTipo, setConsegnaTipo] = useState<"asap" | "data">("asap");
  const [dataRichiesta, setDataRichiesta] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [usaMagazzino, setUsaMagazzino] = useState(false);
  const [usaSabato, setUsaSabato] = useState(false);
  const [giacenzaKg, setGiacenzaKg] = useState(0);
  const [calcolo, setCalcolo] = useState<CapacitaCalcoloResult | null>(null);
  const [calcoloLoading, setCalcoloLoading] = useState(false);
  const [sabatoProposto, setSabatoProposto] = useState(false);
  const [resaOverride, setResaOverride] = useState<number | "">("");
  const [kgEssiccatore, setKgEssiccatore] = useState<number | "">(2200);
  const [overridesSeeded, setOverridesSeeded] = useState(false);
  const [calendarioOpen, setCalendarioOpen] = useState(false);
  const [giorniProduzione, setGiorniProduzione] = useState<string[]>([]);
  const [giorniAttivita, setGiorniAttivita] = useState<string[]>([]);
  const [attivitaDrafts, setAttivitaDrafts] = useState<AttivitaOrdineDraft[]>(
    []
  );
  const [attivitaSnapshot, setAttivitaSnapshot] = useState<
    Array<{
      attivitaId: string;
      codice: string;
      titolo: string;
      dates: string[];
      modalitaTempo?: "throughput" | "durata_fissa";
      kgPerOra?: number;
      oreGiorno?: number;
      oreCiclo?: number | null;
      giorniOverride?: number | null;
    }>
  >([]);
  const [dataConsegnaCalendario, setDataConsegnaCalendario] = useState<
    string | null
  >(null);

  const [corrieri, setCorrieri] = useState<Corriere[]>([]);
  const [corriereId, setCorriereId] = useState<string>("");
  const [corriereDopo, setCorriereDopo] = useState(false);
  const [nuovoCorriereNome, setNuovoCorriereNome] = useState("");
  const [aCarico, setACarico] = useState<
    "cliente" | "agrinsicilia" | "diviso"
  >("cliente");
  const [pctAgrin, setPctAgrin] = useState<number | "">(50);
  const [spedizioneImporto, setSpedizioneImporto] = useState<number | "">("");
  const [spedizioneIvaModo, setSpedizioneIvaModo] = useState<
    "compreso" | "piu_iva"
  >("piu_iva");
  const [modalitaSpedizionePrezzo, setModalitaSpedizionePrezzo] = useState<
    "inserito" | "richiesto"
  >("inserito");
  const [clienteSped, setClienteSped] = useState<Cliente | null>(null);
  const [sediExtra, setSediExtra] = useState<AnagraficaSede[]>([]);
  const [sediError, setSediError] = useState<string | null>(null);
  const [addressKey, setAddressKey] = useState("");
  const [altroPostoOpen, setAltroPostoOpen] = useState(false);
  const [altroPostoLabel, setAltroPostoLabel] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [indirizzoSpedizione, setIndirizzoSpedizione] = useState("");

  const [catalogo, setCatalogo] = useState<ImballaggioVoce[]>([]);
  const [conf, setConf] = useState<ConfezionamentoDraft>(
    emptyConfezionamentoDraft()
  );

  useEffect(() => {
    const fixed = bloccaQtyProdotto(conf.nodi);
    if (!fixed.changed) return;
    setConf((prev) => ({ ...prev, nodi: bloccaQtyProdotto(prev.nodi).nodi }));
  }, [conf.nodi]);

  useEffect(() => {
    clearOrdineSessione();
    if (!ORDINI_PERSISTENZA_DEFINITIVA) {
      setSavedOrdine(null);
      setFatturaMailDraft(null);
      setSessioneMsg(
        "Sessione precedente cancellata: ordine e fattura di prova non ci sono più. Puoi ricominciare il test da zero."
      );
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (modificaOrdineId) return;
    if (!dataOrdine) {
      setNumeroInterno("");
      return;
    }
    if (clienteId && clienteTarga) {
      let cancelled = false;
      void (async () => {
        const result = await previewNumeroInternoOrdineAction({
          clienteId,
          codiceTargaCliente: clienteTarga,
          dataOrdine,
        });
        if (cancelled) return;
        if (result.success) setNumeroInterno(result.numeroInterno);
      })();
      return () => {
        cancelled = true;
      };
    }
    if (anagraficaFonte === "possibile" && possibileClienteId) {
      let cancelled = false;
      void (async () => {
        const result = await previewNumeroInternoOrdineAction({
          clienteId: "",
          codiceTargaCliente: "Pc",
          dataOrdine,
        });
        if (cancelled) return;
        if (result.success) setNumeroInterno(result.numeroInterno);
      })();
      return () => {
        cancelled = true;
      };
    }
    setNumeroInterno("");
    return undefined;
  }, [
    anagraficaFonte,
    clienteId,
    clienteTarga,
    dataOrdine,
    possibileClienteId,
    modificaOrdineId,
  ]);

  useEffect(() => {
    if (!modificaOrdineId || !prodottiReady) return;
    if (hydratedId.current === modificaOrdineId) return;
    let cancelled = false;
    void (async () => {
      const res = await loadOrdinePerModificaWizardAction(modificaOrdineId);
      if (cancelled) return;
      if (!res.success) {
        setFormError(res.error);
        setModificaPronta(true);
        return;
      }
      const d = res.draft;
      hydratedId.current = modificaOrdineId;
      const trovato =
        prodotti.find((p) => p.id === d.prodottoId) ??
        ({
          id: d.prodottoId,
          codice: d.prodottoCodice,
          nome: d.prodottoNome,
          note: "",
          isBio: false,
          createdAt: "",
          settori: [],
        } satisfies ProdottoProprio);
      savedPriceRef.current = {
        prezzo: d.prezzoUnitario,
        scontoAccordo: d.scontoAccordo ?? "",
        dataDisp: d.dataDisponibilitaPresunta,
      };
      skipUnitaOnce.current = true;
      hydratedCliente.current = d.clienteId;
      hydratedProdotto.current = d.prodottoId;
      setAnagraficaFonte(d.anagraficaFonte);
      setClienteId(d.clienteId);
      setPossibileClienteId(d.possibileClienteId);
      setClienteNome(d.cliente);
      setClienteTarga(d.codiceTarga);
      setDataOrdine(d.dataOrdine);
      setNumeroInterno(d.numeroInterno);
      setTipoOrdine(d.tipo);
      setProdotto(trovato);
      setNotaProdotto(d.notaProdotto);
      setNotaProdottoAperta(Boolean(d.notaProdotto.trim()));
      setQuantita(d.quantita);
      setUnitaMisura(d.unitaMisura);
      setScontoExtraPct(d.scontoExtraPct || "");
      setModoConfezione(d.modoConfezione || CONFEZIONE_SISTEMA);
      setScontoListinoDalPreventivo(
        d.preventivoId ? d.scontoListinoStandardPct : null
      );
      setFontePreventivo(Boolean(d.preventivoId));
      fontePreventivoRef.current = Boolean(d.preventivoId);
      setTestoConfezionePreventivo(d.confezionamentoListino || "");
      {
        const ridotto =
          d.scontoListinoStandardPct > 0 &&
          d.scontoListinoPct + 0.0001 < d.scontoListinoStandardPct;
        setScontoListinoManuale(ridotto ? d.scontoListinoPct : null);
        setModificaScontoListino(ridotto);
        setScontoListinoInput(ridotto ? d.scontoListinoPct : "");
      }
      setScontoSuddivisioneAttiva(d.scontoSuddivisioneAttiva);
      setScontoQuotaAzienda(d.scontoQuotaAziendaPct || "");
      setScontoQuotaCommerciale(d.scontoQuotaCommercialePct || "");
      setConsegnaTipo(d.consegnaTipo);
      setDataRichiesta(d.dataRichiesta);
      setUrgente(d.urgente);
      setUsaMagazzino(d.usaMagazzino);
      setUsaSabato(d.usaSabato);
      setDataDisponibilitaPresunta(d.dataDisponibilitaPresunta);
      setCorriereId(d.corriereId);
      setCorriereDopo(d.corriereDaCompilare);
      setACarico(d.spedizioneACarico);
      setPctAgrin(d.spedizionePctAgrinsicilia ?? 50);
      setModalitaSpedizionePrezzo(
        d.modalitaSpedizionePrezzo === "richiesto" ? "richiesto" : "inserito"
      );
      setSpedizioneImporto(d.spedizioneImporto > 0 ? d.spedizioneImporto : "");
      setSpedizioneIvaModo(d.spedizioneIvaModo);
      setDestinatario(d.destinatario);
      setIndirizzoSpedizione(d.indirizzoSpedizione);
      setPreventivoId(d.preventivoId ?? "");
      setMailAccettazione(
        d.webmailAccettazioneId
          ? { id: d.webmailAccettazioneId, subject: d.webmailAccettazioneSubject }
          : null
      );
      setMailRichiesta(
        d.webmailRichiestaId
          ? { id: d.webmailRichiestaId, subject: d.webmailRichiestaSubject }
          : null
      );
      setReferenteAccettazione(d.referente);
      setPagamentoPiano(d.pagamentoPiano);
      setConf(d.confezionamento);
      setGiorniProduzione(d.giorniProduzione);
      setGiorniAttivita(d.giorniAttivita);
      setAttivitaSnapshot(d.attivitaSnapshot);
      setDataConsegnaCalendario(d.dataConsegnaCalendario);
      if (d.resaOverride != null) setResaOverride(d.resaOverride);
      if (d.kgEssiccatore != null) setKgEssiccatore(d.kgEssiccatore);
      if (d.resaOverride != null || d.kgEssiccatore != null) {
        setOverridesSeeded(true);
      }
      setSedePartenzaId(d.sedePartenzaId);
      setModificaPronta(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [modificaOrdineId, prodottiReady, prodotti]);

  useEffect(() => {
    void (async () => {
      const [cRes, iRes] = await Promise.all([
        listCorrieriAction(),
        listImballaggiVociAction(),
      ]);
      if (cRes.success) setCorrieri(cRes.items);
      if (iRes.success) setCatalogo(iRes.items);
    })();
  }, []);

  indirizzoSpedizioneRef.current = indirizzoSpedizione;

  useEffect(() => {
    if (!clienteSped) return;
    const ownerId = clienteId || possibileClienteId;
    if (!ownerId) return;
    const ownerKind = clienteId ? "cliente" : "cliente_possibile";
    const purpose =
      tipoOrdine === "campionatura" ? "campionature" : "acquisti";
    let cancelled = false;
    void loadAnagraficaExtraAction({ ownerKind, ownerId }).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setSediError(
          res.error || "Impossibile leggere le sedi della scheda."
        );
        return;
      }
      setSediError(null);
      setSediExtra(res.sedi);
      const options = clienteSpedizioneOptions(clienteSped, res.sedi, purpose);
      if (addressManual.current || preserveSavedAddress.current) {
        const current = indirizzoSpedizioneRef.current.trim().toLowerCase();
        const hit = options.find(
          (o) => o.indirizzo.trim().toLowerCase() === current
        );
        if (hit) setAddressKey(hit.key);
        else if (current) setAddressKey("altro");
        return;
      }
      const preferred = pickSpedizioneDefault(options, purpose);
      if (!preferred) return;
      setAddressKey(preferred.key);
      setDestinatario(preferred.destinatario);
      setIndirizzoSpedizione(preferred.indirizzo);
    });
    return () => {
      cancelled = true;
    };
  }, [clienteSped, clienteId, possibileClienteId, tipoOrdine]);

  const regolaListino = useMemo(
    () => valutaListinoPerContratto(voceListino),
    [voceListino]
  );
  const ordineSospeso = regolaListino.esito === "sospeso";
  const unitaBase = unitaBaseProdotto({
    listinoUm: voceListino?.unitaMisura,
    prodottoCodice: prodotto?.codice,
  });
  const umCampionaturaOptions = opzioniUnitaCampionatura(unitaBase);

  useEffect(() => {
    const base = unitaBaseProdotto({
      listinoUm: voceListino?.unitaMisura,
      prodottoCodice: prodotto?.codice,
    });
    if (tipoOrdine === "campionatura") {
      setUnitaMisura((prev) => {
        const allowed = opzioniUnitaCampionatura(base).map((o) => o.value);
        return allowed.includes(prev) ? prev : defaultUnitaCampionatura(base);
      });
      return;
    }
    if (skipUnitaOnce.current) {
      skipUnitaOnce.current = false;
      return;
    }
    setUnitaMisura(base);
  }, [tipoOrdine, prodotto?.codice, voceListino?.unitaMisura]);

  useEffect(() => {
    if (!prodotto?.id) {
      setVoceListino(null);
      setAccordo(null);
      setScontoAccordo("");
      setDataDisponibilitaPresunta("");
      return;
    }
    let cancelled = false;
    setVoceListinoLoading(true);
    void (async () => {
      const res = await getListinoVoceVigenteAction(prodotto.id);
      if (cancelled) return;
      setVoceListinoLoading(false);
      if (!res.success) {
        setFormError(res.error);
        setVoceListino(null);
        if (savedPriceRef.current) {
          const saved = savedPriceRef.current;
          savedPriceRef.current = null;
          unlockPianoNext.current = true;
          setPrezzoUnitario(saved.prezzo);
          setScontoAccordo(saved.scontoAccordo);
          setDataDisponibilitaPresunta(saved.dataDisp);
        }
        return;
      }
      setVoceListino(res.voce);
      const aziendaId =
        anagraficaFonte === "possibile" ? possibileClienteId : clienteId;
      let nextAccordo: AccordoPrezzoProdotto | null = null;
      if (tipoOrdine !== "campionatura" && aziendaId && prodotto) {
        const acc = await getAccordoPrezzoProdottoAction({
          aziendaTipo:
            anagraficaFonte === "possibile" ? "cliente_possibile" : "cliente",
          aziendaId,
          prodottoCodice: prodotto.codice,
        });
        if (!cancelled && acc.success) nextAccordo = acc.item;
      }
      if (cancelled) return;
      setAccordo(nextAccordo);
      if (savedPriceRef.current) {
        const saved = savedPriceRef.current;
        savedPriceRef.current = null;
        unlockPianoNext.current = true;
        setPrezzoUnitario(saved.prezzo);
        setScontoAccordo(saved.scontoAccordo);
        setDataDisponibilitaPresunta(saved.dataDisp);
        return;
      }
      if (tipoOrdine === "campionatura") {
        setPrezzoUnitario(0);
        setScontoAccordo("");
      } else if (
        nextAccordo?.modalita === "prezzo_fisso" &&
        nextAccordo.prezzoKg != null
      ) {
        setPrezzoUnitario(nextAccordo.prezzoKg);
        setScontoAccordo("");
      } else if (res.voce && res.voce.prezzo > 0) {
        setPrezzoUnitario(res.voce.prezzo);
        setScontoAccordo(
          nextAccordo?.modalita === "sconto_percentuale"
            ? (nextAccordo.scontoPct ?? 0)
            : ""
        );
      } else {
        setScontoAccordo("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    prodotto,
    tipoOrdine,
    anagraficaFonte,
    clienteId,
    possibileClienteId,
  ]);

  const sortedProdotti = useMemo(
    () =>
      [...prodotti].sort((a, b) =>
        a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
      ),
    [prodotti]
  );

  const vociByStadio = useMemo(() => {
    const map: Record<string, ImballaggioVoce[]> = {
      movimentazione: [],
      confezione: [],
      isolamento: [],
    };
    for (const v of catalogo) {
      map[v.stadio]?.push(v);
    }
    return map;
  }, [catalogo]);

  useEffect(() => {
    if (!prodotto?.id || tipoOrdine === "campionatura") {
      setCondizioniListino([]);
      return;
    }
    let cancelled = false;
    void getPreventivoProdottoContestoAction(prodotto.id).then((res) => {
      if (cancelled || !res.success) return;
      setCondizioniListino(res.condizioni);
    });
    return () => {
      cancelled = true;
    };
  }, [prodotto?.id, tipoOrdine]);

  useEffect(() => {
    if (fontePreventivoRef.current) {
      fontePreventivoRef.current = false;
      return;
    }
    setFontePreventivo(false);
    setScontoListinoDalPreventivo(null);
    setTestoConfezionePreventivo("");
  }, [quantita, modoConfezione]);

  const quantitaInserita = numberOrZero(quantita);
  const umEffettiva: OrdineUnitaMisura =
    tipoOrdine === "campionatura" ? unitaMisura : unitaBase;
  const quantitaKg = quantitaInUnitaBase(quantitaInserita, umEffettiva);
  const prezzoKg = numberOrZero(prezzoUnitario);
  const scontoAccordoNum = scontoAccordo === "" ? 0 : numberOrZero(scontoAccordo);
  const prezzoDopoAccordo =
    accordo?.modalita === "sconto_percentuale"
      ? prezzoNettoDaSconto(prezzoKg, scontoAccordoNum)
      : prezzoKg;
  const packListino = useMemo(
    () => confezioniListinoDistinte(condizioniListino),
    [condizioniListino]
  );
  const modoConfezioneEff = modoConfezioneApplicato(
    modoConfezione,
    packListino.map((p) => p.imballaggioVoceId)
  );
  const pianoListino = useMemo(() => {
    if (tipoOrdine === "campionatura" || !packListino.length || !(quantitaInserita > 0)) {
      return null;
    }
    return pianoConfezionamento({
      quantita: quantitaInserita,
      condizioni: condizioniListino,
      modo: modoConfezioneEff,
    });
  }, [
    tipoOrdine,
    packListino.length,
    quantitaInserita,
    condizioniListino,
    modoConfezioneEff,
  ]);
  const propostaListino = useMemo(() => {
    if (tipoOrdine === "campionatura" || !packListino.length || !(quantitaInserita > 0)) {
      return null;
    }
    return pianoConfezionamento({
      quantita: quantitaInserita,
      condizioni: condizioniListino,
      modo: CONFEZIONE_SISTEMA,
    });
  }, [tipoOrdine, packListino.length, quantitaInserita, condizioniListino]);
  const accordoSconto = accordo?.modalita === "sconto_percentuale";
  const scontoListinoOrigine = accordoSconto
    ? 0
    : (fontePreventivo
        ? (scontoListinoDalPreventivo ?? 0)
        : (pianoListino?.scontoPct ?? 0));
  const scontoListinoApplicato = accordoSconto
    ? 0
    : scontoListinoManuale == null
      ? scontoListinoOrigine
      : Math.min(Math.max(0, scontoListinoManuale), scontoListinoOrigine);
  const testoConfezione =
    fontePreventivo && testoConfezionePreventivo
      ? testoConfezionePreventivo
      : (pianoListino?.testo ?? "");
  const voceDalPreventivo =
    fontePreventivo && preventivoId
      ? (preventiviAccettati
          .find((p) => p.id === preventivoId)
          ?.righe.find((r) => r.prodottoId === prodotto?.id)?.imballaggioVoceId ??
        null)
      : null;
  const voceImballoOrdine =
    voceDalPreventivo ??
    (pianoListino?.manuale
      ? pianoListino.modo
      : (pianoListino?.pezzi[0]?.imballaggioVoceId ?? null));
  const scontoPct = parseScontoExtraPct(scontoExtraPct);
  const fasciaSconto = fasciaScontoExtra(scontoPct);
  const prezzoDopoListino = accordoSconto
    ? prezzoDopoAccordo
    : prezzoNettoDaSconto(prezzoDopoAccordo, scontoListinoApplicato);
  const prezzoNetto = prezzoNettoDaSconto(prezzoDopoListino, scontoPct);
  const IVA_PCT = 22;
  const rigaImporti = useMemo(() => {
    const riga = {
      id: "wizard-preview",
      prodottoId: prodotto?.id ?? "",
      prodottoCodice: prodotto?.codice ?? "",
      prodottoNome: prodotto?.nome ?? "",
      quantita: quantitaInserita,
      unitaMisura: umEffettiva,
      lottoCodice: "",
      note: "",
      prezzoUnitario: prezzoNetto,
      ivaPercentuale: IVA_PCT,
    };
    return {
      imponibile: imponibileRiga(riga),
      iva: ivaRiga(riga),
      totale: totaleRiga(riga),
    };
  }, [
    quantitaInserita,
    umEffettiva,
    prezzoNetto,
    prodotto?.id,
    prodotto?.codice,
    prodotto?.nome,
  ]);

  useEffect(() => {
    if (pianoLock.current) {
      if (unlockPianoNext.current) {
        unlockPianoNext.current = false;
        pianoLock.current = false;
      }
      return;
    }
    setPagamentoPiano((prev) => applyTotaleToPiano(prev, rigaImporti.totale));
  }, [rigaImporti.totale]);

  useEffect(() => {
    if (tipoOrdine === "campionatura") return;
    let cancelled = false;
    void getScontoFuoriListinoContextAction().then((res) => {
      if (cancelled || !res.success) return;
      setScontoCtx({
        canOltre30: res.canOltre30,
        isSuperadmin: res.isSuperadmin,
        isSenior: res.isSenior,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tipoOrdine]);

  const kgConfezionati = useMemo(
    () => totaleKgConfezionati(conf.nodi),
    [conf.nodi]
  );
  const kgDelta = Math.round((quantitaKg - kgConfezionati) * 1000) / 1000;

  async function runCalcolo(opts?: { usaSabatoOverride?: boolean }) {
    if (!prodotto || quantitaKg <= 0) return;
    setCalcoloLoading(true);
    setFormError(null);
    const sab = opts?.usaSabatoOverride ?? usaSabato;
    try {
    const result = await calcolaConsegnaOrdineAction({
      prodottoId: prodotto.id,
      prodottoCodice: prodotto.codice,
      quantitaKg,
      consegnaTipo,
      dataRichiesta: consegnaTipo === "data" ? dataRichiesta || null : null,
      urgente,
      usaMagazzino,
      usaSabato: sab,
      resaPercentualeOverride:
        resaOverride === "" ? null : Number(resaOverride),
      capacitaIngressoKgPerEssiccatoreOverride:
        kgEssiccatore === "" ? null : Number(kgEssiccatore),
    });
    if (!result.success) {
      setFormError(result.error);
      setCalcolo(null);
      return;
    }
    setGiacenzaKg(result.giacenzaKg);
    setCalcolo(result.calcolo);
    if (!overridesSeeded) {
      setResaOverride(result.calcolo.resaPercentualeUsata);
      if (result.calcolo.essiccatoriAttivi > 0) {
        const per =
          result.calcolo.capacitaIngressoGiornalieraKg /
          result.calcolo.essiccatoriAttivi;
        if (Number.isFinite(per) && per > 0) setKgEssiccatore(Math.round(per));
      }
      setOverridesSeeded(true);
    }
    if (result.calcolo.chiedereSabato && !sab) {
      setSabatoProposto(true);
    }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Calcolo consegna non disponibile."
      );
      setCalcolo(null);
    } finally {
      setCalcoloLoading(false);
    }
  }

  useEffect(() => {
    if (step === 4) setFormError(null);
  }, [step]);

  useEffect(() => {
    if (
      hydratedCliente.current !== null &&
      hydratedCliente.current === clienteId
    ) {
      hydratedCliente.current = null;
      return;
    }
    setPreventivoId("");
    setMailAccettazione(null);
    setReferenteAccettazione(null);
    setTipoPagamento("alla_consegna");
    setPagamentoPiano(emptyPagamentoPiano("alla_consegna"));
    setSavedOrdine(null);
  }, [clienteId]);

  useEffect(() => {
    if (tipoOrdine === "campionatura" || !clienteId || step !== 3) return;
    let cancelled = false;
    void listPreventiviAccettatiAction({
      clienteId,
      prodottoId: prodotto?.id,
    }).then((res) => {
      if (cancelled) return;
      setPreventiviAccettati(res.success ? res.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [tipoOrdine, clienteId, prodotto?.id, step]);

  useEffect(() => {
    if (
      hydratedProdotto.current !== null &&
      hydratedProdotto.current === prodotto?.id
    ) {
      hydratedProdotto.current = null;
      return;
    }
    setAttivitaDrafts([]);
    setGiorniProduzione([]);
    setGiorniAttivita([]);
    setAttivitaSnapshot([]);
    setDataConsegnaCalendario(null);
  }, [prodotto?.id]);

  const attesaCalcoloSpedizione =
    tipoOrdine !== "campionatura" &&
    !preventivoId &&
    aCarico === "cliente" &&
    modalitaSpedizionePrezzo === "richiesto";
  let etichettaSalvataggio = "Salva in sessione";
  if (saving) etichettaSalvataggio = "Salvataggio…";
  else if (attesaCalcoloSpedizione) {
    etichettaSalvataggio = "Salva e attendi il calcolo";
  } else if (modificaOrdineId) etichettaSalvataggio = "Salva modifiche";
  else if (ORDINI_PERSISTENZA_DEFINITIVA) etichettaSalvataggio = "Salva ordine";

  function canNext(): boolean {
    if (step === 1) {
      if (anagraficaFonte === "possibile") {
        return Boolean(possibileClienteId && clienteNome);
      }
      return Boolean(clienteId && clienteNome && clienteTarga);
    }
    if (step === 2) {
      if (!prodotto || voceListinoLoading) return false;
      if (regolaListino.esito === "fuori_produzione") return false;
      if (tipoOrdine === "campionatura") return true;
      return (
        regolaListino.esito === "ordinabile" || regolaListino.esito === "sospeso"
      );
    }
    if (step === 3) {
      if (!(quantitaInserita > 0)) return false;
      if (tipoOrdine !== "campionatura" && !(numberOrZero(prezzoUnitario) > 0)) {
        return false;
      }
      if (ordineSospeso && !dataDisponibilitaPresunta) return false;
      if (
        tipoOrdine !== "campionatura" &&
        preventivoId &&
        (!mailAccettazione || !referenteAccettazione)
      ) {
        return false;
      }
      if (
        tipoOrdine !== "campionatura" &&
        fasciaSconto === "oltre_30" &&
        scontoCtx &&
        !scontoCtx.canOltre30
      ) {
        return false;
      }
      return true;
    }
    if (step === 4) {
      if (ordineSospeso) return Boolean(dataDisponibilitaPresunta);
      if (consegnaTipo === "data") return Boolean(dataRichiesta);
      return true;
    }
    if (step === 5) {
      if (!corriereDopo && !corriereId) return false;
      if (aCarico === "diviso" && (pctAgrin === "" || Number(pctAgrin) < 0))
        return false;
      return true;
    }
    if (step === 7 && tipoOrdine !== "campionatura") {
      if (
        pagamentoPiano.modalita === "dilazione" &&
        pagamentoPiano.rate.some((r, i) => i > 0 && !r.dataPagamento)
      ) {
        return false;
      }
    }
    return true;
  }

  function applyPreventivo(id: string) {
    setPreventivoId(id);
    if (!id) {
      setFontePreventivo(false);
      setScontoListinoDalPreventivo(null);
      setTestoConfezionePreventivo("");
      setScontoListinoManuale(null);
      setModificaScontoListino(false);
      if (
        voceListino &&
        voceListino.prezzo > 0 &&
        accordo?.modalita !== "prezzo_fisso"
      ) {
        setPrezzoUnitario(voceListino.prezzo);
      }
      return;
    }
    const item = preventiviAccettati.find((p) => p.id === id);
    if (!item) return;
    const riga =
      item.righe.find((r) => r.prodottoId === prodotto?.id) ?? item.righe[0];
    if (riga) {
      fontePreventivoRef.current = true;
      setFontePreventivo(true);
      setQuantita(riga.quantita);
      setPrezzoUnitario(riga.prezzoUnitario);
      setScontoExtraPct(riga.scontoExtraPct || "");
      setScontoListinoDalPreventivo(riga.scontoListinoStandardPct);
      setTestoConfezionePreventivo(riga.confezionamento || "");
      const ridotto =
        riga.scontoListinoStandardPct > 0 &&
        riga.scontoListinoPct + 0.0001 < riga.scontoListinoStandardPct;
      setScontoListinoManuale(ridotto ? riga.scontoListinoPct : null);
      setModificaScontoListino(ridotto);
      setScontoListinoInput(ridotto ? riga.scontoListinoPct : "");
      if (riga.scontoSuddivisioneAttiva) {
        setScontoSuddivisioneAttiva(true);
        setScontoQuotaAzienda(riga.scontoQuotaAziendaPct || "");
        setScontoQuotaCommerciale(riga.scontoQuotaCommercialePct || "");
      }
      if (riga.accordoModalita === "sconto_percentuale") {
        setScontoAccordo(riga.scontoListinoPct);
      }
      savedPriceRef.current = {
        prezzo: riga.prezzoUnitario,
        scontoAccordo:
          riga.accordoModalita === "sconto_percentuale"
            ? riga.scontoListinoPct
            : scontoAccordo,
        dataDisp: dataDisponibilitaPresunta,
      };
      const altro = prodotti.find((p) => p.id === riga.prodottoId);
      if (altro && altro.id !== prodotto?.id) setProdotto(altro);
      setOverridesSeeded(false);
    }
    setTipoPagamento(item.tipoPagamento);
    if (
      item.tipoPagamento === "anticipato" ||
      item.tipoPagamento === "alla_consegna" ||
      item.tipoPagamento === "pronto_magazzino" ||
      item.tipoPagamento === "posticipato"
    ) {
      setPagamentoPiano(emptyPagamentoPiano(item.tipoPagamento));
    } else {
      setPagamentoPiano(
        applyTotaleToPiano(
          { ...emptyPagamentoPiano(), modalita: "dilazione" },
          rigaImporti.totale
        )
      );
    }
  }

  function rigaProdottoFatturaSessione(): FatturaA4Riga | null {
    if (!prodotto) return null;
    const mapped = listinoEScontoDaOrdine({
      prezzoRiga: tipoOrdine === "campionatura" ? 0 : prezzoNetto,
      prezzoListinoHeader:
        tipoOrdine === "campionatura" ? null : numberOrZero(prezzoUnitario),
      scontoExtraPct: tipoOrdine === "campionatura" ? 0 : scontoPct,
      isSpedizione: false,
    });
    return {
      prodottoId: prodotto.id,
      codice: prodotto.codice,
      descrizione: prodotto.nome,
      quantita: quantitaInserita,
      unitaMisura: umEffettiva,
      prezzoUnitario: mapped.prezzoUnitario,
      scontoPercentuale: mapped.scontoPercentuale,
      ivaPercentuale: tipoOrdine === "campionatura" ? 0 : 22,
      isSpedizione: false,
      note: "",
    };
  }

  function righeFatturaConSpedizione(
    prevRighe?: FatturaA4Riga[] | null,
    rimosso?: boolean
  ): FatturaA4Riga[] {
    const prodottoRiga = rigaProdottoFatturaSessione();
    const base =
      prevRighe && prevRighe.length > 0
        ? prevRighe
        : prodottoRiga
          ? [prodottoRiga]
          : [];
    return applyContributoSpeseSpedizione(base, {
      aCaricoCliente: aCarico === "cliente",
      importo: numberOrZero(spedizioneImporto),
      ivaInclusa: spedizioneIvaModo === "compreso",
      ivaAliquota: tipoOrdine === "campionatura" ? 0 : 22,
      rimosso,
    });
  }

  async function onReferenteAccettazioneChange(next: RubricaContatto[]) {
    const last = next[next.length - 1] ?? null;
    setReferenteAccettazione(last);
    if (!last || !clienteId) return;
    if (!ORDINI_PERSISTENZA_DEFINITIVA) return;
    await linkEntityReferenteAction({
      tipo: "cliente",
      entityId: clienteId,
      entityLabel: clienteNome,
      contattoId: last.id,
    });
  }

  async function submit(
    modoMail?: "prenota" | "compila" | "salva",
    opts?: { keepOpen?: boolean }
  ) {
    if (!prodotto) return;
    if (anagraficaFonte === "possibile" && !possibileClienteId) return;
    if (anagraficaFonte === "cliente" && !clienteId) return;
    if (savedOrdine) {
      if (opts?.keepOpen) {
        if (attesaCalcoloSpedizione) {
          setFormError(
            "La fattura non si apre: prima si conferma il costo di spedizione. Non parte nulla verso il cliente."
          );
          return;
        }
        if (!ORDINI_PERSISTENZA_DEFINITIVA) {
          const prev = loadOrdineSessione();
          if (prev) {
            saveOrdineSessione({
              ...prev,
              fattura: prev.fattura
                ? {
                    ...prev.fattura,
                    righe: righeFatturaConSpedizione(
                      prev.fattura.righe,
                      prev.fattura.contributoSpedizioneRimosso
                    ),
                  }
                : {
                    numeroFattura: "AA/NNNN",
                    dataDocumento: todayIsoDate(),
                    destinatario: destinatarioSessioneDaCliente(
                      clienteSped,
                      clienteNome
                    ),
                    righe: righeFatturaConSpedizione(),
                    noteDocumento: "",
                    piano: pagamentoPiano,
                    invioEmail: "",
                    intenzione: "bozza",
                  },
            });
          }
        }
        setFatturaA4Open(true);
        return;
      }
      if (ORDINI_PERSISTENZA_DEFINITIVA) onSaved(savedOrdine);
      else {
        setSessioneMsg("Ordine già in sessione. Nessun salvataggio sul server.");
      }
      return;
    }
    if (Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0 && !conf.coerenzaIgnorata) {
      setFormError(
        kgDelta > 0
          ? `${kgDelta} kg restano fuori dal confezionamento: modifica oppure spunta «Ignora».`
          : `Confezionamento supera l’ordine di ${Math.abs(kgDelta)} kg: modifica oppure spunta «Ignora».`
      );
      return;
    }
    if (tipoOrdine !== "campionatura" && scontoSuddivisioneAttiva) {
      const quote = validaQuoteSuddivisione({
        scontoPct,
        attiva: true,
        quotaAziendaPct: scontoQuotaAzienda === "" ? 0 : scontoQuotaAzienda,
        quotaCommercialePct:
          scontoQuotaCommerciale === "" ? 0 : scontoQuotaCommerciale,
      });
      if (!quote.ok) {
        setFormError(quote.error);
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    const confNorm = normalizeConfezionamentoDraft(conf);
    try {
      if (!ORDINI_PERSISTENZA_DEFINITIVA) {
        const prev = loadOrdineSessione();
        const ordine = buildOrdineSessioneLocale({
          existingId: prev?.ordine.id ?? null,
          numeroInterno: numeroInterno || prev?.ordine.numeroInterno || "",
          clienteId: clienteId || null,
          clienteNome,
          clienteTarga: anagraficaFonte === "possibile" ? "Pc" : clienteTarga || "C000",
          dataOrdine,
          tipo: tipoOrdine,
          prodottoId: prodotto.id,
          prodottoCodice: prodotto.codice,
        prodottoNome: prodotto.nome,
        notaProdotto: notaProdotto.trim(),
        quantita: quantitaInserita,
        unitaMisura: umEffettiva,
        prezzoNetto: tipoOrdine === "campionatura" ? 0 : prezzoNetto,
          prezzoListino:
            tipoOrdine === "campionatura" ? null : numberOrZero(prezzoUnitario),
          scontoExtraPct: tipoOrdine === "campionatura" ? 0 : scontoPct,
          importoEuro: rigaImporti.totale,
          tipoPagamento: tipoPagamentoFromPiano(pagamentoPiano),
          pagamentoModalita: pagamentoPiano.modalita,
          destinatario,
          indirizzoSpedizione,
        });
        ordine.trasporto = {
          ...emptyTrasporto(),
          imponibile: attesaCalcoloSpedizione
            ? 0
            : (aCarico === "cliente" ? numberOrZero(spedizioneImporto) : 0),
          ivaPercentuale:
            aCarico === "cliente" && spedizioneIvaModo === "compreso" ? 0 : 22,
        };
        ordine.modalitaSpedizionePrezzo = attesaCalcoloSpedizione
          ? "richiesto"
          : (aCarico === "cliente" ? "inserito" : "non_applicabile");
        ordine.spedizioneImporto = attesaCalcoloSpedizione
          ? 0
          : (aCarico === "cliente" ? numberOrZero(spedizioneImporto) : 0);
        ordine.spedizioneIvaModo = spedizioneIvaModo;
        saveOrdineSessione({
          ordine,
          fattura: prev?.fattura
            ? {
                ...prev.fattura,
                righe: righeFatturaConSpedizione(
                  prev.fattura.righe,
                  prev.fattura.contributoSpedizioneRimosso
                ),
              }
            : {
                numeroFattura: "AA/NNNN",
                dataDocumento: todayIsoDate(),
                destinatario: destinatarioSessioneDaCliente(
                  clienteSped,
                  clienteNome
                ),
                righe: righeFatturaConSpedizione(),
                noteDocumento: "",
                piano: pagamentoPiano,
                invioEmail: "",
                intenzione: "bozza",
              },
        });
        setSavedOrdine(ordine);
        setSessioneMsg(
          attesaCalcoloSpedizione
            ? `Salvato in sessione (${ordine.numeroInterno || "senza numero"}). Calcolo spedizione in attesa: nessuna fattura e nessuna mail.`
            : `Salvato in sessione (${ordine.numeroInterno || "senza numero"}). Niente è stato scritto sul server.`
        );
        if (opts?.keepOpen && !attesaCalcoloSpedizione) setFatturaA4Open(true);
        return;
      }
      const result = await createOrdineWizardAction({
        anagraficaFonte,
        possibileClienteId: possibileClienteId || null,
        clienteId: clienteId || undefined,
        cliente: clienteNome,
        codiceTargaCliente:
          anagraficaFonte === "possibile" ? "Pc" : clienteTarga || "C000",
        dataOrdine,
        prodottoId: prodotto.id,
        prodottoCodice: prodotto.codice,
        prodottoNome: prodotto.nome,
        notaProdotto: notaProdotto.trim(),
        quantita: quantitaInserita,
        unitaMisura: umEffettiva,
        prezzoUnitario: tipoOrdine === "campionatura" ? 0 : numberOrZero(prezzoUnitario),
        scontoExtraPct: tipoOrdine === "campionatura" ? 0 : scontoPct,
        scontoListinoPct:
          tipoOrdine === "campionatura" ? 0 : scontoListinoApplicato,
        scontoListinoStandardPct:
          tipoOrdine === "campionatura" ? 0 : scontoListinoOrigine,
        confezionamentoListino:
          tipoOrdine === "campionatura" ? "" : testoConfezione,
        imballaggioVoceId: voceImballoOrdine,
        modoConfezione: modoConfezioneEff,
        accordoId: accordo?.id ?? null,
        accordoModalita: accordo?.modalita ?? null,
        accordoValoreOrigine: accordo
          ? Number(accordo.scontoPct ?? accordo.prezzoKg ?? 0)
          : null,
        accordoValoreApplicato:
          accordo?.modalita === "sconto_percentuale"
            ? scontoAccordoNum
            : accordo?.modalita === "prezzo_fisso"
              ? numberOrZero(prezzoUnitario)
              : null,
        accordoGiustificazione: accordo?.giustificazione ?? "",
        scontoSuddivisioneAttiva:
          tipoOrdine === "campionatura" ? false : scontoSuddivisioneAttiva,
        scontoQuotaAziendaPct:
          tipoOrdine === "campionatura" || scontoQuotaAzienda === ""
            ? 0
            : scontoQuotaAzienda,
        scontoQuotaCommercialePct:
          tipoOrdine === "campionatura" || scontoQuotaCommerciale === ""
            ? 0
            : scontoQuotaCommerciale,
        ivaPercentuale: tipoOrdine === "campionatura" ? 0 : 22,
        consegnaTipo,
        dataRichiesta: consegnaTipo === "data" ? dataRichiesta || null : null,
        urgente,
        usaMagazzino,
        usaSabato,
        resaPercentualeOverride:
          resaOverride === "" ? null : Number(resaOverride),
        capacitaIngressoKgPerEssiccatoreOverride:
          kgEssiccatore === "" ? null : Number(kgEssiccatore),
        spedizioneMezzo: "corriere",
        corriereId: corriereDopo ? null : corriereId || null,
        corriereDaCompilare: corriereDopo,
        spedizioneACarico: aCarico,
        modalitaSpedizionePrezzo: attesaCalcoloSpedizione
          ? "richiesto"
          : (aCarico === "cliente" ? "inserito" : "non_applicabile"),
        spedizioneImporto: attesaCalcoloSpedizione
          ? 0
          : (aCarico === "cliente" ? numberOrZero(spedizioneImporto) : 0),
        spedizioneIvaModo,
        spedizionePctAgrinsicilia:
          aCarico === "diviso" ? Number(pctAgrin) : null,
        destinatario,
        indirizzoSpedizione,
        giorniProduzione,
        giorniAttivita,
        giorniPreparazione: giorniAttivita,
        attivitaSnapshot,
        dataConsegnaCalendario,
        confezionamento: confNorm,
        tipoPagamento: tipoPagamentoFromPiano(pagamentoPiano),
        pagamentoPiano,
        tipo: tipoOrdine,
        preventivoId: preventivoId || null,
        webmailAccettazioneId: mailAccettazione?.id ?? null,
        webmailRichiestaId: mailRichiesta?.id ?? null,
        ordineId: modificaOrdineId,
        referenteAccettazioneId: referenteAccettazione?.id ?? null,
        dataDisponibilitaPresunta: ordineSospeso
          ? dataDisponibilitaPresunta || null
          : null,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setSavedOrdine(result.ordine);
      if (spedDraft.current.sedePartenzaId) {
        await updateSedePartenzaAction({
          entityType: "ordine",
          entityId: result.ordine.id,
          sedeId: spedDraft.current.sedePartenzaId,
        });
      }
      if (attesaCalcoloSpedizione) {
        setSessioneMsg(
          `Ordine ${result.ordine.numeroInterno} salvato. In attesa del calcolo spedizione: non è partita la fattura e non è partita alcuna mail.`
        );
        notifyPreventiviSpedizioneNav();
        return;
      }
      if (opts?.keepOpen) {
        setFatturaA4Open(true);
        return;
      }
      if (modoMail && !(modificaOrdineId && !spedDraft.current.bozzaPronta)) {
        const d = spedDraft.current;
        let oggetto = d.mailOggetto.trim();
        let corpo = d.mailCorpo.trim();
        if (modoMail !== "salva" && (!oggetto || !corpo)) {
          const testo = await generaCorpoMailSpedizioneAction({
            cliente: clienteNome,
            numero: result.ordine.numeroInterno,
            prodotti: `${prodotto.codice} ${quantitaInserita} ${umEffettiva}`,
            trackingUrl: d.trackingUrl,
            haLettera: false,
          });
          if (!testo.success) {
            setFormError(testo.error);
            onSaved(result.ordine);
            return;
          }
          oggetto = testo.subject;
          corpo = testo.bodyText;
        }
        const up = await upsertPrenotazioneSpedizioneMailAction({
          entityType: "ordine",
          entityId: result.ordine.id,
          trackingUrl: d.trackingUrl,
          letteraViaPath: d.letteraViaPath,
          letteraViaName: d.letteraViaName,
          allegati: d.allegati,
          allegaTracking: modoMail === "salva" ? false : d.allegaTracking,
          allegaLettera: false,
          allegaFile: false,
          destinatarioEmail: d.destinatarioEmail,
          oggetto,
          corpo,
          accountId: d.mailAccountId || null,
          modo: modoMail,
          soloTracking: Boolean(modificaOrdineId),
        });
        if (up.success && up.apriBozza && oggetto) {
          setComposeAfter({
            prenotazione: up.item,
            subject: oggetto,
            bodyText: corpo,
            to: d.destinatarioEmail,
            ordine: result.ordine,
          });
          return;
        }
        if (!up.success) setFormError(up.error);
      }
      onSaved(result.ordine);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Salvataggio non riuscito. Riprova."
      );
    } finally {
      setSaving(false);
    }
  }

  function applyCatalogToNodo(
    localId: string,
    voceId: string,
    stadio: OrdineConfezionamentoNodoStadio
  ) {
    const voce = catalogo.find((v) => v.id === voceId);
    if (!voce) return;
    setConf((prev) => ({
      ...prev,
      nodi: updateNodoInTree(prev.nodi, localId, {
        catalogoId: voce.id,
        nome: voce.nome,
        codice: voce.codice,
        stadio: stadio === "prodotto_kg" ? "prodotto_kg" : voce.stadio,
      }),
    }));
  }

  function renderNodo(nodo: ConfezionamentoNodoDraft, depth: number) {
    const parentVoce = catalogo.find((v) => v.id === nodo.catalogoId) ?? null;
    const nextStadio = childStadioFor(
      nodo.stadio,
      conf.movimentazioneModo,
      parentVoce
    );
    const optionsBase =
      nodo.stadio === "prodotto_kg"
        ? []
        : filterVociForWizardStadio(
            catalogo,
            nodo.stadio,
            prodotto?.id ?? null,
            {
              bidoniInEntrambi:
                resolveLineaFromProdottoCodice(prodotto?.codice ?? "", [])
                  ?.codice === "gel",
            }
          );
    const selectedVoce =
      nodo.catalogoId && !optionsBase.some((v) => v.id === nodo.catalogoId)
        ? catalogo.find((v) => v.id === nodo.catalogoId)
        : null;
    const options = selectedVoce
      ? [selectedVoce, ...optionsBase]
      : optionsBase;
    const pesi = nodo.children.filter((c) => c.stadio === "prodotto_kg");
    const altriFigli = nodo.children.filter((c) => c.stadio !== "prodotto_kg");
    const pesiDiversi = pesi.length > 1;
    const pezziTotali = sommaPezziPesi(pesi);
    const sommaPesi = pesi.reduce((s, p) => {
      const kg = typeof p.kgProdotto === "number" ? p.kgProdotto : 0;
      return s + (pesiDiversi ? pezziPeso(p) * kg : kg);
    }, 0);

    function scriviPesi(
      nextPesi: ConfezionamentoNodoDraft[],
      quantita?: ConfezionamentoNodoDraft["quantita"]
    ) {
      const q =
        quantita !== undefined
          ? quantita
          : nextPesi.length > 1
            ? sommaPezziPesi(nextPesi)
            : nodo.quantita;
      setConf((prev) => ({
        ...prev,
        nodi: updateNodoInTree(prev.nodi, nodo.localId, {
          quantita: q,
          children: [...altriFigli, ...nextPesi],
        }),
      }));
    }

    function aggiungiAltroPeso() {
      if (pesi.length === 0) return;
      const extra = nuovoPesoProdotto(prodotto);
      extra.quantita = 1;
      if (pesi.length === 1) {
        const nAttuale =
          typeof nodo.quantita === "number" && nodo.quantita > 1
            ? Math.round(nodo.quantita)
            : 1;
        const primo = {
          ...pesi[0],
          quantita: nAttuale > 1 ? nAttuale - 1 : 1,
        };
        scriviPesi([primo, extra]);
        return;
      }
      scriviPesi([...pesi, extra]);
    }
    return (
      <div
        key={nodo.localId}
        className="rounded-lg border border-[var(--border)] bg-white p-3"
        style={{ marginLeft: depth * 12 }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {nodo.stadio === "prodotto_kg"
              ? "Prodotto (kg)"
              : nodo.stadio}
          </span>
          {nodo.stadio !== "prodotto_kg" ? (
            <select
              value={nodo.catalogoId ?? ""}
              onChange={(e) =>
                applyCatalogToNodo(nodo.localId, e.target.value, nodo.stadio)
              }
              className="min-w-[180px] flex-1 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
            >
              <option value="">Seleziona da catalogo…</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {voceCollegataAlProdotto(v, prodotto?.id ?? null)
                    ? "Consigliato · "
                    : ""}
                  {labelImballaggioVoce(v)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-700">
              {prodotto ? `${prodotto.codice} — ${prodotto.nome}` : "Prodotto"}
            </span>
          )}
          {nodo.stadio === "prodotto_kg" ? null : (
            <label className="text-xs">
              N
              <ClearableNumberInput
                min={0}
                value={pesiDiversi ? pezziTotali : nodo.quantita}
                disabled={pesiDiversi}
                title={
                  pesiDiversi
                    ? "Somma dei numeri sulle righe dei pesi"
                    : undefined
                }
                onValueChange={(v) => {
                  if (pesiDiversi) return;
                  setConf((prev) => ({
                    ...prev,
                    nodi: updateNodoInTree(prev.nodi, nodo.localId, {
                      quantita: v,
                    }),
                  }));
                }}
                className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
          )}
          {nextStadio && !(nextStadio === "prodotto_kg" && pesi.length > 0) ? (
            <button
              type="button"
              className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => {
                const child = emptyNodo(nextStadio);
                if (nextStadio === "prodotto_kg") {
                  child.quantita = 1;
                  child.kgProdotto = "";
                  if (prodotto) {
                    child.nome = prodotto.nome;
                    child.codice = prodotto.codice;
                  }
                }
                setConf((prev) => ({
                  ...prev,
                  nodi: addChildToNode(prev.nodi, nodo.localId, child),
                }));
              }}
            >
              + {nextStadio === "prodotto_kg" ? "kg prodotto" : nextStadio}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded p-1.5 text-red-600 hover:bg-red-50"
            aria-label="Rimuovi"
            onClick={() =>
              setConf((prev) => ({
                ...prev,
                nodi: removeNodoFromTree(prev.nodi, nodo.localId),
              }))
            }
          >
            <FaTrash size={11} />
          </button>
        </div>
        {nodo.stadio !== "prodotto_kg" && nodo.catalogoId ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            1 {nodo.nome} composto da:{" "}
            {nodo.children.length
              ? nodo.children
                  .map((c) =>
                    c.stadio === "prodotto_kg"
                      ? pesiDiversi
                        ? `N${c.quantita} × ${
                            typeof c.kgProdotto === "number"
                              ? c.kgProdotto.toLocaleString("it-IT")
                              : "?"
                          } kg`
                        : typeof c.kgProdotto === "number"
                          ? `${c.kgProdotto.toLocaleString("it-IT")} kg`
                          : "kg da indicare"
                      : `N${c.quantita} ${c.nome || c.stadio}`
                  )
                  .join(" + ")
              : "— (aggiungi livello successivo)"}
          </p>
        ) : null}
        {pesi.length > 0 ? (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm text-slate-800">
              {domandaKgPerUnita(nodo, pesiDiversi)}
            </p>
            {pesiDiversi ? (
              <p className="text-xs text-[var(--muted)]">
                Su ogni riga il numero è modificabile: quanti isolamenti hanno
                quel peso. Esempio: 4 da 10 kg e 1 da 5 kg per 45 kg.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Questo peso vale per ogni isolamento. Per pesi diversi, per
                esempio un sacchetto da 10 kg e uno da 5 kg, usa «Aggiungi
                altro peso».
              </p>
            )}
            {pesi.map((peso, index) => (
              <div key={peso.localId} className="flex flex-wrap items-center gap-2">
                {pesiDiversi ? (
                  <label className="text-xs">
                    N
                    <ClearableNumberInput
                      min={0}
                      value={peso.quantita}
                      onValueChange={(v) => {
                        const next = pesi.map((p) =>
                          p.localId === peso.localId ? { ...p, quantita: v } : p
                        );
                        scriviPesi(next);
                      }}
                      className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                    />
                  </label>
                ) : null}
                <ClearableNumberInput
                  min={0}
                  value={peso.kgProdotto ?? ""}
                  onValueChange={(v) => {
                    const next = pesi.map((p) =>
                      p.localId === peso.localId
                        ? {
                            ...p,
                            kgProdotto: v,
                            nome: prodotto?.nome ?? (p.nome || "Prodotto"),
                            codice: prodotto?.codice ?? p.codice,
                          }
                        : p
                    );
                    scriviPesi(next);
                  }}
                  className="w-28 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-slate-600">kg</span>
                <button
                  type="button"
                  className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  aria-label={
                    pesiDiversi ? `Rimuovi peso ${index + 1}` : "Rimuovi kg prodotto"
                  }
                  onClick={() => {
                    const next = pesi.filter((p) => p.localId !== peso.localId);
                    if (next.length === 1) {
                      const n = pezziPeso(next[0]) || 1;
                      scriviPesi([{ ...next[0], quantita: 1 }], n);
                      return;
                    }
                    scriviPesi(next, next.length === 0 ? 1 : undefined);
                  }}
                >
                  <FaTrash size={11} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs hover:bg-slate-50"
              onClick={aggiungiAltroPeso}
            >
              Aggiungi altro peso
            </button>
            {pesiDiversi ? (
              <p className="text-xs font-medium text-slate-800">
                Somma: {pezziTotali.toLocaleString("it-IT")} isolamenti ·{" "}
                {sommaPesi.toLocaleString("it-IT")} kg
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2 space-y-2">
          {altriFigli.map((c) => renderNodo(c, depth + 1))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {modificaOrdineId
            ? `Modifica ordine ${numeroInterno || ""}`.trim()
            : "Crea ordine"}
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Seleziona l’azienda digitando il nome: l’elenco sotto si filtra mentre
          scrivi.
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          L’ordine resta in attesa: amministrazione o produzione lo inseriranno
          in scaletta. Il campione si registra con Invio campionatura, se è già
          in magazzino o dopo la prima produzione disponibile.
        </p>
        {modificaOrdineId && !modificaPronta ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Carico i dati dell’ordine…
          </p>
        ) : null}
        {!ORDINI_PERSISTENZA_DEFINITIVA ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Salvataggio provvisorio: ordine e fattura restano solo in questa
            sessione del browser. Niente database, email o SDI finché non lo
            chiedi.
          </p>
        ) : null}

        <ol className="mt-4 flex flex-wrap gap-2">
          {STEPS.filter((s) => s.n <= lastStep).map((s) => (
            <li
              key={s.n}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                step === s.n
                  ? "bg-[var(--primary)] text-white"
                  : step > s.n
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {s.n}. {s.label}
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-4">
          {step === 1 && (
            <>
              <div className="block text-sm">
                <span className="mb-1 block font-medium">
                  Azienda / cliente
                </span>
                <AziendaOrdineSelect
                  fonte={anagraficaFonte}
                  clienteId={clienteId}
                  possibileClienteId={possibileClienteId}
                  autoFocus
                  onFonteChange={setAnagraficaFonte}
                  onChange={(sel) => {
                    setAnagraficaFonte(sel.fonte);
                    setPossibileClienteId(sel.possibile?.id ?? "");
                    setClienteId(sel.cliente?.id ?? "");
                    setClienteNome(
                      sel.cliente?.ragioneSociale ??
                        sel.possibile?.ragioneSociale ??
                        ""
                    );
                    setClienteTarga(sel.cliente?.codiceTarga ?? "");
                    const nextCliente = sel.cliente
                      ? sel.cliente
                      : sel.possibile
                        ? clienteFromPossibile(sel.possibile)
                        : null;
                    setClienteSped(nextCliente);
                    setSediExtra([]);
                    setSediError(null);
                    addressManual.current = false;
                    preserveSavedAddress.current = false;
                    if (!nextCliente) {
                      setAddressKey("");
                      setDestinatario("");
                      setIndirizzoSpedizione("");
                      return;
                    }
                    const ownerKind = sel.cliente
                      ? "cliente"
                      : "cliente_possibile";
                    const ownerId = sel.cliente?.id ?? sel.possibile?.id ?? "";
                    const applyOpts = (sedi: AnagraficaSede[]) => {
                      const purpose =
                        tipoOrdine === "campionatura"
                          ? "campionature"
                          : "acquisti";
                      const options = clienteSpedizioneOptions(
                        nextCliente,
                        sedi,
                        purpose
                      );
                      const preferred = pickSpedizioneDefault(options, purpose);
                      if (preferred) {
                        setAddressKey(preferred.key);
                        setDestinatario(preferred.destinatario);
                        setIndirizzoSpedizione(preferred.indirizzo);
                      } else {
                        setAddressKey("");
                        setDestinatario(nextCliente.ragioneSociale);
                        setIndirizzoSpedizione("");
                      }
                    };
                    applyOpts([]);
                    if (!ownerId) return;
                    void loadAnagraficaExtraAction({
                      ownerKind,
                      ownerId,
                    }).then((res) => {
                      if (!res.success) {
                        setSediError(
                          res.error ||
                            "Impossibile leggere le sedi della scheda."
                        );
                        return;
                      }
                      setSediError(null);
                      setSediExtra(res.sedi);
                      applyOpts(res.sedi);
                    });
                  }}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Data ordine</span>
                <input
                  type="date"
                  value={dataOrdine}
                  onChange={(e) => setDataOrdine(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              {numeroInterno ? (
                <p className="text-sm text-[var(--muted)]">
                  N. interno previsto:{" "}
                  <span className="font-mono font-medium text-slate-800">
                    {numeroInterno}
                  </span>
                </p>
              ) : null}
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex gap-2">
                <select
                  value={prodotto?.id ?? ""}
                  disabled={!prodottiReady}
                  onChange={(e) => {
                    const p =
                      sortedProdotti.find((x) => x.id === e.target.value) ??
                      null;
                    setProdotto(p);
                    if (prodotto?.id && p?.id !== prodotto.id) {
                      setNotaProdotto("");
                      setNotaProdottoAperta(false);
                    }
                    setOverridesSeeded(false);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                >
                  <option value="">
                    {prodottiReady
                      ? "Seleziona prodotto proprio…"
                      : "Caricamento…"}
                  </option>
                  {sortedProdotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingProdotto(true)}
                  className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Nuovo
                </button>
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setNotaProdottoAperta((open) => !open)}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Nota
                </button>
                {notaProdottoAperta ? (
                  <label className="mt-2 block text-sm">
                    <span className="mb-1 block font-medium">
                      Nota del prodotto
                    </span>
                    <input
                      type="text"
                      maxLength={500}
                      value={notaProdotto}
                      onChange={(e) => setNotaProdotto(e.target.value)}
                      placeholder="Es. Nopal dry C da 50 micron"
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                ) : null}
              </div>
              {voceListinoLoading ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Verifica listino In Uso…
                </p>
              ) : null}
              {prodotto && !voceListinoLoading && regolaListino.esito === "fuori_produzione" ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {LISTINO_CONTRATTO_MSG.fuori_produzione}
                </p>
              ) : null}
              {prodotto &&
              !voceListinoLoading &&
              regolaListino.esito === "senza_prezzo" &&
              tipoOrdine !== "campionatura" ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {LISTINO_CONTRATTO_MSG.senza_prezzo}
                </p>
              ) : null}
              {prodotto && !voceListinoLoading && ordineSospeso ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {LISTINO_CONTRATTO_MSG.sospeso}
                </p>
              ) : null}
              {prodotto && tipoOrdine !== "campionatura" ? (
                <div className="mt-3 space-y-2">
                  {accordo ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      {voceAccordoPrezzo({
                        modalita: accordo.modalita,
                        valoreOrigine: Number(
                          accordo.scontoPct ?? accordo.prezzoKg ?? 0
                        ),
                        valoreApplicato: Number(
                          accordo.scontoPct ?? accordo.prezzoKg ?? 0
                        ),
                        giustificazione: accordo.giustificazione,
                        unita: unitaBase,
                      })}
                    </p>
                  ) : null}
                  <StoricoScontiProdotto
                    azienda={
                      anagraficaFonte === "possibile" && possibileClienteId
                        ? {
                            tipo: "cliente_possibile",
                            id: possibileClienteId,
                          }
                        : clienteId
                          ? { tipo: "cliente", id: clienteId }
                          : null
                    }
                    prodottoCodice={prodotto.codice}
                  />
                </div>
              ) : null}
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {prodotto && tipoOrdine !== "campionatura" ? (
                <StoricoScontiProdotto
                  azienda={
                    anagraficaFonte === "possibile" && possibileClienteId
                      ? { tipo: "cliente_possibile", id: possibileClienteId }
                      : clienteId
                        ? { tipo: "cliente", id: clienteId }
                        : null
                  }
                  prodottoCodice={prodotto.codice}
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Quantità</span>
                  <div className="flex gap-2">
                    <ClearableNumberInput
                      min={0}
                      value={quantita}
                      onValueChange={(v) => {
                        setQuantita(v);
                        setOverridesSeeded(false);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                    />
                    {tipoOrdine === "campionatura" ? (
                      <select
                        value={umEffettiva}
                        onChange={(e) =>
                          setUnitaMisura(e.target.value as OrdineUnitaMisura)
                        }
                        className="w-20 rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm outline-none focus:border-[var(--primary)]"
                        aria-label="Unità di misura"
                      >
                        {umCampionaturaOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                        {unitaBase}
                      </span>
                    )}
                  </div>
                  {tipoOrdine === "campionatura" ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Default {defaultUnitaCampionatura(unitaBase)}; puoi
                      scegliere anche {unitaBase}.
                    </p>
                  ) : null}
                </label>
                {tipoOrdine === "campionatura" ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                    <p className="font-medium">Campionatura gratuita</p>
                    <p className="mt-1 text-xs">
                      Nessun prezzo di listino e importo € 0,00.
                    </p>
                  </div>
                ) : (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Prezzo vendita (€/{unitaBase})
                  </span>
                  <ClearableNumberInput
                    min={0}
                    value={prezzoUnitario}
                    onValueChange={setPrezzoUnitario}
                    disabled={
                      !fontePreventivo &&
                      Boolean(voceListino && voceListino.prezzo > 0) &&
                      accordo?.modalita !== "prezzo_fisso"
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:bg-slate-50"
                  />
                  {accordo?.modalita === "prezzo_fisso" ? (
                    <p className="mt-1 text-xs text-amber-900">
                      {voceAccordoPrezzo({
                        modalita: "prezzo_fisso",
                        valoreOrigine: Number(accordo.prezzoKg ?? 0),
                        valoreApplicato: numberOrZero(prezzoUnitario),
                        giustificazione: accordo.giustificazione,
                        unita: unitaBase,
                      })}
                    </p>
                  ) : fontePreventivo ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Prezzo del preventivo. Puoi modificarlo.
                    </p>
                  ) : voceListino && voceListino.prezzo > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Prezzo da listino In Uso (€/{voceListino.unitaMisura})
                    </p>
                  ) : null}
                </label>
                )}
              </div>
              {tipoOrdine === "campionatura" || packListino.length === 0 ? null : (
                <div className="space-y-2 rounded-lg border border-[var(--border)] px-4 py-3">
                  <p className="text-sm font-medium">Confezione e sconto di listino</p>
                  <p className="text-xs text-[var(--muted)]">
                    {fontePreventivo
                      ? "Presi dal preventivo. Quantità, confezione e sconto si possono cambiare."
                      : "In base alla quantità il sistema propone la confezione con lo sconto di listino più alto. Puoi scegliere un’altra confezione o ridurre lo sconto."}
                  </p>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Confezionamento</span>
                    <select
                      value={modoConfezioneEff}
                      onChange={(e) => {
                        fontePreventivoRef.current = false;
                        setModoConfezione(e.target.value);
                        setScontoListinoManuale(null);
                        setModificaScontoListino(false);
                        setScontoListinoInput("");
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    >
                      <option value={CONFEZIONE_SISTEMA}>
                        Soluzione migliore (sconto di listino più alto)
                      </option>
                      {packListino.map((p) => (
                        <option key={p.imballaggioVoceId} value={p.imballaggioVoceId}>
                          Solo {p.kg.toLocaleString("it-IT")} kg — {p.etichetta}
                        </option>
                      ))}
                    </select>
                  </label>
                  {fontePreventivo && testoConfezione ? (
                    <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                      Preventivo: {testoConfezione}
                      {scontoListinoApplicato > 0
                        ? `. Sconto listino ${scontoListinoApplicato.toLocaleString("it-IT")}%.`
                        : ". Nessuno sconto di listino."}
                    </p>
                  ) : propostaListino ? (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                      Proposta: {propostaListino.testo}
                      {propostaListino.scontoPct > 0
                        ? `. Sconto listino ${propostaListino.scontoPct.toLocaleString("it-IT")}%${
                            propostaListino.targa ? ` ${propostaListino.targa}` : ""
                          }.`
                        : ". Nessuno sconto di listino su questa quantità."}
                    </p>
                  ) : null}
                  {pianoListino && modoConfezioneEff !== CONFEZIONE_SISTEMA && !fontePreventivo ? (
                    <p className="text-xs text-[var(--muted)]">
                      Scelta operatore: {pianoListino.testo}.
                      {scontoListinoOrigine > 0
                        ? ` Sconto standard ${scontoListinoOrigine.toLocaleString("it-IT")}%.`
                        : " Nessuno sconto di listino su questa confezione."}
                    </p>
                  ) : null}
                  {scontoListinoOrigine > 0 && !accordoSconto ? (
                    <div className="text-sm">
                      <p>
                        Sconto standard{" "}
                        <span className="font-semibold">
                          {scontoListinoApplicato.toLocaleString("it-IT")}%
                        </span>
                        {scontoListinoApplicato + 0.0001 < scontoListinoOrigine
                          ? ` su ${scontoListinoOrigine.toLocaleString("it-IT")}% di listino`
                          : " di listino"}
                        .
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setModificaScontoListino(true);
                          setScontoListinoInput(scontoListinoApplicato);
                        }}
                        className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                      >
                        Modifica sconto standard
                      </button>
                      {modificaScontoListino ? (
                        <label className="mt-2 block">
                          <span className="mb-1 block text-xs text-[var(--muted)]">
                            Da 0 a {scontoListinoOrigine.toLocaleString("it-IT")}%.
                            0 annulla lo sconto. Un aumento si scrive in Sconto extra.
                          </span>
                          <ClearableNumberInput
                            min={0}
                            max={scontoListinoOrigine}
                            value={scontoListinoInput}
                            onValueChange={(value) => {
                              if (value === "") {
                                setScontoListinoInput("");
                                setScontoListinoManuale(null);
                                return;
                              }
                              const capped = Math.min(value, scontoListinoOrigine);
                              setScontoListinoInput(capped);
                              setScontoListinoManuale(capped);
                            }}
                            className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2"
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
              {tipoOrdine === "campionatura" ? null : accordo?.modalita === "sconto_percentuale" ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Sconto concordato (%)
                  </span>
                  <ClearableNumberInput
                    min={0}
                    max={100}
                    value={scontoAccordo}
                    onValueChange={setScontoAccordo}
                    className="w-full max-w-xs rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <p className="mt-1 text-xs text-amber-900">
                    {voceAccordoPrezzo({
                      modalita: "sconto_percentuale",
                      valoreOrigine: Number(accordo.scontoPct ?? 0),
                      valoreApplicato: scontoAccordoNum,
                      giustificazione: accordo.giustificazione,
                    })}{" "}
                    Quantità e confezione non ricalcolano questo sconto.
                  </p>
                </label>
              ) : null}
              {tipoOrdine === "campionatura" ? null : (
                <label className="block text-sm">
                  <span className="mb-1 inline-flex items-center gap-1.5 font-medium">
                    Sconto extra fuori listino (%)
                    <InfoHint title={SCONTO_FUORI_LISTINO_TITOLO} wide>
                      <span className="block space-y-2">
                        {SCONTO_FUORI_LISTINO_REGOLE.map((r) => (
                          <span key={r.fascia} className="block">
                            <span className="font-semibold">{r.fascia}.</span>{" "}
                            Inserisce: {r.inserisce} Approva: {r.approva}
                          </span>
                        ))}
                        <span className="block text-slate-600">
                          Super Admin: l’ordine è già firmato da te, tranne oltre
                          il 30% (serve anche l’altro Super Admin).
                        </span>
                      </span>
                    </InfoHint>
                  </span>
                  <ClearableNumberInput
                    min={0}
                    max={100}
                    value={scontoExtraPct}
                    onValueChange={setScontoExtraPct}
                    className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <ScontoSuddivisioneFields
                    scontoPct={scontoPct}
                    attiva={scontoSuddivisioneAttiva}
                    quotaAzienda={scontoQuotaAzienda}
                    quotaCommerciale={scontoQuotaCommerciale}
                    onChange={(next) => {
                      setScontoSuddivisioneAttiva(next.attiva);
                      setScontoQuotaAzienda(next.quotaAzienda);
                      setScontoQuotaCommerciale(next.quotaCommerciale);
                    }}
                  />
                      {scontoPct > 0 || scontoListinoApplicato > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Prezzo netto {prezzoNetto.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      })}
                      /{unitaBase}
                      {scontoListinoApplicato > 0
                        ? ` · sconto listino ${scontoListinoApplicato.toLocaleString("it-IT")}%`
                        : ""}
                      {scontoPct <= 0
                        ? ""
                        : (fasciaSconto === "fino_10"
                            ? " · nessuna firma aggiuntiva"
                            : (fasciaSconto === "oltre_30" &&
                                scontoCtx &&
                                !scontoCtx.canOltre30
                                ? " · riservato a Senior o Super Admin"
                                : " · l’ordine resta In attesa sconto fino alle firme"))}
                    </p>
                  ) : null}
                </label>
              )}
              {ordineSospeso ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Data presunta di disponibilità
                  </span>
                  <input
                    type="date"
                    required
                    min={dataOrdine}
                    value={dataDisponibilitaPresunta}
                    onChange={(e) =>
                      setDataDisponibilitaPresunta(e.target.value)
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <p className="mt-1 text-xs text-amber-800">
                    L’ordine resterà sospeso e non entrerà in produzione fino
                    alla disponibilità.
                  </p>
                </label>
              ) : null}

              {tipoOrdine === "campionatura" ? null : (
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Calcolo importi (IVA {IVA_PCT}%)
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-[var(--muted)]">Imponibile</dt>
                    <dd className="text-base font-semibold tabular-nums">
                      {rigaImporti.imponibile.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">IVA</dt>
                    <dd className="text-base font-semibold tabular-nums">
                      {rigaImporti.iva.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Totale</dt>
                    <dd className="text-base font-semibold tabular-nums text-emerald-800">
                      {rigaImporti.totale.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
              )}

              <div className="space-y-2 rounded-lg border border-[var(--border)] px-4 py-3">
                <p className="text-sm font-medium">Richiesta pervenuta per mail</p>
                <p className="text-xs text-[var(--muted)]">
                  Se il cliente ha scritto per mail, collega il messaggio
                  ricevuto. Il sistema mette in alto le più inerenti.
                </p>
                <button
                  type="button"
                  disabled={
                    anagraficaFonte === "possibile"
                      ? !possibileClienteId
                      : !clienteId
                  }
                  onClick={() => {
                    setTimelineMailKind("richiesta");
                    setTimelineMailOpen(true);
                  }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {mailRichiesta
                    ? mailRichiesta.subject || "Mail collegata"
                    : "Collega mail ricevuta"}
                </button>
              </div>

              {tipoOrdine !== "campionatura" ? (
                <div className="space-y-3 rounded-lg border border-[var(--border)] px-4 py-3">
                  <p className="text-sm font-medium">Preventivo accettato</p>
                  <p className="text-xs text-[var(--muted)]">
                    Collegabile solo se stato Accettato. Un prodotto o più
                    righe («di tanti»). Se lo colleghi, servono anche mail e
                    referente di accettazione.
                  </p>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Preventivo</span>
                    <select
                      value={preventivoId}
                      onChange={(e) => applyPreventivo(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Nessuno</option>
                      {preventiviAccettati.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.numeroInterno} · {p.righe.length}{" "}
                          {p.righe.length === 1 ? "prodotto" : "prodotti"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {preventivoId ? (
                    <p className="text-xs text-[var(--muted)]">
                      {preventiviAccettati
                        .find((p) => p.id === preventivoId)
                        ?.righe.map(
                          (r) =>
                            `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura} @ ${r.prezzoUnitario} €`
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="text-sm">
                      <span className="mb-1 block font-medium">
                        Mail di accettazione
                      </span>
                      <button
                        type="button"
                        disabled={!clienteId}
                        onClick={() => {
                          setTimelineMailKind("accettazione");
                          setTimelineMailOpen(true);
                        }}
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {mailAccettazione
                          ? mailAccettazione.subject || "Mail collegata"
                          : "Collega mail"}
                      </button>
                    </div>
                    <div className="text-sm">
                      <span className="mb-1 block font-medium">
                        Referente che ha inviato
                      </span>
                      <ReferentiPickerField
                        value={
                          referenteAccettazione ? [referenteAccettazione] : []
                        }
                        onChange={(next) =>
                          void onReferenteAccettazioneChange(next)
                        }
                        defaultAziendaTipo="cliente"
                        defaultAziendaLabel={clienteNome}
                        defaultAziendaId={clienteId}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {step === 4 && ordineSospeso ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Ordine sospeso — non in produzione</p>
              <p>{LISTINO_CONTRATTO_MSG.sospeso}</p>
              <label className="block">
                <span className="mb-1 block font-medium">
                  Data presunta di disponibilità
                </span>
                <input
                  type="date"
                  min={dataOrdine}
                  value={dataDisponibilitaPresunta}
                  onChange={(e) => setDataDisponibilitaPresunta(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2"
                />
              </label>
            </div>
          ) : null}

          {step === 4 && !ordineSospeso && (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Modalità consegna</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="consegna"
                    checked={consegnaTipo === "asap"}
                    onChange={() => setConsegnaTipo("asap")}
                  />
                  Prima possibile
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="consegna"
                    checked={consegnaTipo === "data"}
                    onChange={() => setConsegnaTipo("data")}
                  />
                  Data specifica
                </label>
                {consegnaTipo === "data" ? (
                  <input
                    type="date"
                    value={dataRichiesta}
                    min={dataOrdine}
                    onChange={(e) => setDataRichiesta(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  />
                ) : null}
              </fieldset>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={urgente}
                  onChange={(e) => setUrgente(e.target.checked)}
                />
                Ordine urgente
              </label>

              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                L’ordine verrà salvato in attesa di processazione. I giorni in
                scaletta li assegna amministrazione o produzione dalla pagina
                Processati.
              </p>

              <div className="hidden">
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm">
                <p className="font-medium">
                  Giacenza magazzino: {giacenzaKg.toLocaleString("it-IT")} kg
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={usaMagazzino}
                    onChange={(e) => setUsaMagazzino(e.target.checked)}
                    disabled={giacenzaKg <= 0}
                  />
                  <span>Usa magazzino per questo ordine</span>
                </label>
              </div>

              {(sabatoProposto || urgente) && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={usaSabato}
                    onChange={(e) => {
                      setUsaSabato(e.target.checked);
                      setSabatoProposto(false);
                    }}
                  />
                  <span>Includi il sabato tra i giorni produttivi</span>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Resa usata (%)
                  </span>
                  <ClearableNumberInput
                    min={0}
                    max={100}
                    value={resaOverride}
                    onValueChange={setResaOverride}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Modificabile: ricalcola giorni e data (non altera i default
                    globali).
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    kg / essiccatore
                  </span>
                  <ClearableNumberInput
                    min={0}
                    value={kgEssiccatore}
                    onValueChange={setKgEssiccatore}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Default tipico 2200 kg ingresso per essiccatore attivo.
                  </span>
                </label>
              </div>

              <div className="rounded-lg border border-[var(--border)] px-3 py-3 text-sm">
                {calcoloLoading ? (
                  <p className="text-[var(--muted)]">Calcolo capacità…</p>
                ) : calcolo ? (
                  <ul className="space-y-1.5">
                    <li>
                      Linea:{" "}
                      <strong>
                        {calcolo.lineaCodice === "secco"
                          ? "Secco (ODR/NDR)"
                          : calcolo.lineaCodice === "gel"
                            ? "Gel (OGL/NGL)"
                            : "—"}
                      </strong>{" "}
                      · stagione {calcolo.stagione}
                    </li>
                    <li>
                      Resa usata: {calcolo.resaPercentualeUsata}% (
                      {calcolo.resaFonte === "override_operatore"
                        ? "modificata operatore"
                        : calcolo.resaFonte === "media_osservata"
                          ? "media reale"
                          : "baseline"}
                      )
                    </li>
                    <li>
                      Capacità ingresso/giorno:{" "}
                      {calcolo.capacitaIngressoGiornalieraKg.toLocaleString(
                        "it-IT"
                      )}{" "}
                      kg
                      {calcolo.essiccatoriAttivi > 0
                        ? ` · ${calcolo.essiccatoriAttivi} essiccatori`
                        : null}
                    </li>
                    <li>
                      Capacità uscita/giorno:{" "}
                      {calcolo.capacitaUscitaGiornalieraKg.toLocaleString(
                        "it-IT"
                      )}{" "}
                      kg
                    </li>
                    <li>
                      Giorni lavorativi stimati:{" "}
                      {calcolo.giorniLavorativiNecessari}
                    </li>
                    <li className="font-semibold text-slate-900">
                      Data consegna stimata:{" "}
                      {formatDateIt(
                        dataConsegnaCalendario ?? calcolo.dataConsegnaStimata
                      )}
                    </li>
                    {giorniProduzione.length > 0 ? (
                      <li className="text-emerald-800">
                        Calendario: {giorniProduzione.length} giorni lavorazione
                        {giorniAttivita.length > 0
                          ? ` + ${giorniAttivita.length} attività`
                          : ""}
                        {dataConsegnaCalendario
                          ? ` · consegna ${formatDateIt(dataConsegnaCalendario)}`
                          : ""}
                      </li>
                    ) : (
                      <li className="text-amber-800">
                        Apri il calendario e seleziona i giorni di lavorazione
                        per abilitare Avanti.
                      </li>
                    )}
                    {calcolo.avvisi.map((a) => (
                      <li key={a} className="text-xs text-[var(--muted)]">
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--muted)]">
                    Imposta i parametri per calcolare la consegna.
                  </p>
                )}
              </div>

              {calcolo && calcolo.giorniLavorativiNecessari > 0 ? (
                <button
                  type="button"
                  onClick={() => setCalendarioOpen(true)}
                  className="w-full rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  {giorniProduzione.length
                    ? "Riapri calendario produzione"
                    : `Apri calendario · ${calcolo.giorniLavorativiNecessari} lavorazione + prep.`}
                </button>
              ) : null}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">
                  Indirizzo di ricezione
                </legend>
                <p className="text-xs text-[var(--muted)]">
                  {tipoOrdine === "campionatura"
                    ? "Di default l’indirizzo segnato in scheda per le campionature."
                    : "Di default l’indirizzo segnato in scheda per gli acquisti, oppure quello delle campionature se gli acquisti non sono indicati."}{" "}
                  Puoi scegliere qualunque sede inserita in scheda.
                </p>
                {sediError ? (
                  <p className="text-xs text-red-700">{sediError}</p>
                ) : null}
                {(clienteSped
                  ? clienteSpedizioneOptions(
                      clienteSped,
                      sediExtra,
                      tipoOrdine === "campionatura"
                        ? "campionature"
                        : "acquisti"
                    )
                  : []
                ).map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${
                      addressKey === opt.key
                        ? "border-[var(--primary)] bg-slate-50"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="ordine-indirizzo-spedizione"
                      checked={addressKey === opt.key}
                      onChange={() => {
                        addressManual.current = true;
                        preserveSavedAddress.current = false;
                        setAddressKey(opt.key);
                        setAltroPostoLabel("");
                        setDestinatario(opt.destinatario);
                        setIndirizzoSpedizione(opt.indirizzo);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {opt.indirizzo}
                      </span>
                    </span>
                  </label>
                ))}
                {addressKey === "altro" && indirizzoSpedizione ? (
                  <label className="flex cursor-pointer gap-2 rounded-lg border border-[var(--primary)] bg-slate-50 px-3 py-2">
                    <input type="radio" checked readOnly className="mt-1" />
                    <span>
                      <span className="font-medium">
                        Altro posto
                        {altroPostoLabel ? ` · ${altroPostoLabel}` : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {destinatario} — {indirizzoSpedizione}
                      </span>
                    </span>
                  </label>
                ) : null}
                {!clienteSped ? (
                  <p className="text-xs text-[var(--muted)]">
                    Seleziona prima l’azienda.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!clienteId && !possibileClienteId}
                  onClick={() => {
                    if (!clienteId && !possibileClienteId) {
                      setFormError("Seleziona prima un’azienda.");
                      return;
                    }
                    setAltroPostoOpen(true);
                  }}
                  className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Spedisci in altro posto
                </button>
              </fieldset>
              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">Mezzo</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked readOnly />
                  Corriere
                </label>
                <p className="text-xs text-[var(--muted)]">
                  Mezzo corriere resta selezionato.
                </p>
                <select
                  disabled={corriereDopo}
                  value={corriereId}
                  onChange={(e) => setCorriereId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">Seleziona corriere…</option>
                  {corrieri.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={corriereDopo}
                    onChange={(e) => {
                      setCorriereDopo(e.target.checked);
                      if (e.target.checked) setCorriereId("");
                    }}
                  />
                  Compilerò dopo
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={nuovoCorriereNome}
                    onChange={(e) => setNuovoCorriereNome(e.target.value)}
                    placeholder="Nuovo corriere…"
                    className="min-w-[160px] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={async () => {
                      if (!nuovoCorriereNome.trim()) return;
                      const res = await createCorriereAction({
                        nome: nuovoCorriereNome.trim(),
                      });
                      if (!res.success) {
                        setFormError(res.error);
                        return;
                      }
                      setCorrieri((prev) =>
                        [...prev, res.item].sort((a, b) =>
                          a.nome.localeCompare(b.nome, "it")
                        )
                      );
                      setCorriereId(res.item.id);
                      setCorriereDopo(false);
                      setNuovoCorriereNome("");
                    }}
                  >
                    <FaPlus size={11} /> Aggiungi
                  </button>
                </div>
              </fieldset>

              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">A carico</legend>
                {(
                  [
                    ["cliente", "Cliente"],
                    ["agrinsicilia", "Agrinsicilia"],
                    ["diviso", "Diviso"],
                  ] as const
                ).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="aCarico"
                      checked={aCarico === val}
                      onChange={() => setACarico(val)}
                    />
                    {label}
                  </label>
                ))}
                {aCarico === "diviso" ? (
                  <label className="mt-2 block text-sm">
                    <span className="mb-1 block font-medium">
                      % Agrinsicilia (resto al cliente)
                    </span>
                    <ClearableNumberInput
                      min={0}
                      max={100}
                      value={pctAgrin}
                      onValueChange={setPctAgrin}
                      className="w-40 rounded-lg border border-[var(--border)] px-3 py-2"
                    />
                    {pctAgrin !== "" ? (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        Cliente:{" "}
                        {Math.round((100 - Number(pctAgrin)) * 100) / 100}%
                      </span>
                    ) : null}
                  </label>
                ) : null}
                {aCarico === "cliente" ? (
                  <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    <p className="text-sm font-medium">
                      Richiesta importo al cliente
                    </p>
                    {tipoOrdine !== "campionatura" && !preventivoId ? (
                      <div className="space-y-2">
                        <p className="text-xs text-[var(--muted)]">
                          L&apos;ordine è diretto, senza preventivo. Puoi
                          inserire il prezzo ora oppure chiedere il calcolo,
                          come sul preventivo.
                        </p>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="modalita-spedizione-prezzo"
                            checked={modalitaSpedizionePrezzo === "inserito"}
                            onChange={() =>
                              setModalitaSpedizionePrezzo("inserito")
                            }
                          />
                          Inserisci il prezzo ora
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="modalita-spedizione-prezzo"
                            checked={modalitaSpedizionePrezzo === "richiesto"}
                            onChange={() =>
                              setModalitaSpedizionePrezzo("richiesto")
                            }
                          />
                          Richiedi l&apos;inserimento del prezzo
                        </label>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">
                        In fattura compare la voce «Contributo Spese di
                        spedizione»: puoi modificarla o cancellarla dal
                        documento. Fattura e mail partono solo se le confermi.
                      </p>
                    )}
                    {attesaCalcoloSpedizione ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        L&apos;ordine si salva e resta in attesa dell&apos;operatore
                        calcolo spedizioni. Non si apre la fattura e non parte
                        alcuna mail finché il costo non è confermato. Anche
                        dopo, fattura e mail partono solo con un comando
                        esplicito.
                      </p>
                    ) : (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium">
                            Importo (€)
                          </span>
                          <ClearableNumberInput
                            min={0}
                            value={spedizioneImporto}
                            onValueChange={setSpedizioneImporto}
                            className="w-40 rounded-lg border border-[var(--border)] px-3 py-2"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="spedizione-iva-modo"
                            checked={spedizioneIvaModo === "compreso"}
                            onChange={() => setSpedizioneIvaModo("compreso")}
                          />
                          Importo comprensivo di Iva
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="spedizione-iva-modo"
                            checked={spedizioneIvaModo === "piu_iva"}
                            onChange={() => setSpedizioneIvaModo("piu_iva")}
                          />
                          Importo + IVA
                        </label>
                      </>
                    )}
                  </div>
                ) : null}
              </fieldset>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              {testoConfezione ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                  Confezione per lo sconto: {testoConfezione}. Qui sotto si
                  compila il confezionamento di produzione, che resta
                  modificabile.
                </p>
              ) : null}
              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">
                  Movimentazione
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={conf.movimentazioneModo === "su_pallet"}
                    onChange={() =>
                      setConf((p) => ({
                        ...p,
                        movimentazioneModo: "su_pallet",
                        nodi: [],
                      }))
                    }
                  />
                  Su pallet
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={conf.movimentazioneModo === "nessun_pallet"}
                    onChange={() =>
                      setConf((p) => ({
                        ...p,
                        movimentazioneModo: "nessun_pallet",
                        palletCatalogoId: null,
                        nodi: [],
                      }))
                    }
                  />
                  Nessun pallet
                </label>
                {conf.movimentazioneModo === "su_pallet" ? (
                  <>
                    <select
                      value={conf.palletCatalogoId ?? ""}
                      onChange={(e) =>
                        setConf((p) => ({
                          ...p,
                          palletCatalogoId: e.target.value || null,
                        }))
                      }
                      className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Tipo pallet (catalogo)…</option>
                      {vociByStadio.movimentazione.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome}
                        </option>
                      ))}
                    </select>
                    <label className="mt-2 block text-sm">
                      <span className="mb-1 block text-xs text-[var(--muted)]">
                        Misure personalizzate (opz.)
                      </span>
                      <input
                        value={conf.palletMisureCustom}
                        onChange={(e) =>
                          setConf((p) => ({
                            ...p,
                            palletMisureCustom: e.target.value,
                          }))
                        }
                        placeholder="es. 1100×900 mm"
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                ) : null}
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Confezione (blocchi)</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  onClick={() => {
                    const rootStadio = childStadioFor(
                      null,
                      conf.movimentazioneModo
                    )!;
                    const n = emptyNodo(rootStadio);
                    if (
                      conf.movimentazioneModo === "su_pallet" &&
                      conf.palletCatalogoId
                    ) {
                      const v = catalogo.find(
                        (x) => x.id === conf.palletCatalogoId
                      );
                      if (v) {
                        n.catalogoId = v.id;
                        n.nome = v.nome;
                        n.codice = v.codice;
                      }
                    }
                    setConf((p) => ({ ...p, nodi: [...p.nodi, n] }));
                  }}
                >
                  <FaPlus size={11} />
                  Aggiungi blocco{" "}
                  {conf.movimentazioneModo === "su_pallet"
                    ? "pallet"
                    : "confezione"}
                </button>
              </div>

              <div className="space-y-2">
                {conf.nodi.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nessun blocco. Aggiungi pallet/confezione e scendi ai
                    livelli. Isolamento: elenco catalogo; in cima i collegati
                    al prodotto (Consigliato). Per il gel, bidoni, taniche e
                    fusti sono sia in confezione, se partono da soli, sia in
                    isolamento, se vanno dentro un cartone.
                  </p>
                ) : (
                  conf.nodi.map((n) => renderNodo(n, 0))
                )}
              </div>

              <div
                className={`rounded-lg border px-3 py-3 text-sm ${
                  Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0
                    ? "border-amber-300 bg-amber-50"
                    : "border-[var(--border)] bg-slate-50"
                }`}
              >
                <p>
                  Ordine:{" "}
                  <strong>
                    {quantitaInserita.toLocaleString("it-IT")} {umEffettiva}
                    {umEffettiva === "g" || umEffettiva === "ml"
                      ? ` (= ${quantitaKg.toLocaleString("it-IT")} ${unitaBase})`
                      : ""}
                  </strong>
                  {" · "}
                  Confezionati:{" "}
                  <strong>{kgConfezionati.toLocaleString("it-IT")} kg</strong>
                  {" · "}
                  Delta:{" "}
                  <strong>
                    {kgDelta > 0 ? "+" : ""}
                    {kgDelta.toLocaleString("it-IT")} kg
                  </strong>
                </p>
                {Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0 ? (
                  <>
                    <p className="mt-2 text-amber-950">
                      {kgDelta > 0
                        ? `${kgDelta} kg restano fuori. Vuoi modificare qualcosa o ignorare?`
                        : `Confezionamento in eccesso di ${Math.abs(kgDelta)} kg.`}
                    </p>
                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={conf.coerenzaIgnorata}
                        onChange={(e) =>
                          setConf((p) => ({
                            ...p,
                            coerenzaIgnorata: e.target.checked,
                          }))
                        }
                      />
                      Ignora e salva comunque
                    </label>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Coerenza kg OK (o nessun blocco — puoi salvare e completare
                    dopo).
                  </p>
                )}
              </div>

            </div>
          )}

          {step === 7 && tipoOrdine !== "campionatura" ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm font-semibold">Pagamento</p>
                <p className="text-xs text-[var(--muted)]">
                  Unica soluzione oppure dilazione. In dilazione la prima rata
                  ha la stessa scadenza (anticipato, consegna, pronto
                  magazzino, posticipato); le altre richiedono la data di
                  pagamento.
                </p>
                <OrdinePagamentoPianoFields
                  piano={pagamentoPiano}
                  onChange={(next) => {
                    setPagamentoPiano(next);
                    setTipoPagamento(tipoPagamentoFromPiano(next));
                  }}
                  totale={rigaImporti.totale}
                />
                {scontoPct > 0 ? (
                  <p className="text-xs text-emerald-800">
                    Totale già al netto dello sconto extra {scontoPct}%:{" "}
                    {rigaImporti.totale.toLocaleString("it-IT", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm font-semibold">Fattura</p>
                <p className="text-xs text-[var(--muted)]">
                  Documento A4 come il preventivo. Puoi modificare intestazione,
                  dicitura, prezzi e sconto con le matite: la fattura può
                  differire dall’ordine.
                  {ORDINI_PERSISTENZA_DEFINITIVA
                    ? " Sempre salvata; invio email + SDI subito o dopo."
                    : " Per ora si salva solo in sessione: niente database, email o SDI."}
                </p>
                {attesaCalcoloSpedizione ? (
                  <p className="text-xs text-amber-800">
                    La fattura resta chiusa finché l&apos;operatore non conferma
                    il costo di spedizione. Non parte nulla verso il cliente.
                  </p>
                ) : anagraficaFonte !== "cliente" ? (
                  <p className="text-xs text-amber-800">
                    Per creare la fattura serve un cliente registrato (non un
                    possibile cliente).
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={saving || !canNext()}
                    onClick={() => void submit("salva", { keepOpen: true })}
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savedOrdine
                      ? "Apri documento fattura"
                      : (ORDINI_PERSISTENZA_DEFINITIVA
                        ? "Crea fattura A4"
                        : "Apri fattura (sessione)")}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {step === lastStep ? (
            <div className="mt-4">
              {attesaCalcoloSpedizione ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Il salvataggio non invia nulla al cliente. La mail di
                  tracking si sblocca dopo la conferma del costo di spedizione.
                </p>
              ) : (
              <SpedizioneMailPanel
                entityType="ordine"
                entityId={modificaOrdineId ?? ""}
                sedePartenzaIdDefault={sedePartenzaId}
                persistDisabled={!ORDINI_PERSISTENZA_DEFINITIVA}
                clienteNome={clienteNome}
                numero={numeroInterno || "ordine"}
                prodotti={
                  prodotto
                    ? `${prodotto.codice} ${quantitaInserita} ${umEffettiva}`
                    : ""
                }
                destEmailDefault={clienteSped?.email ?? ""}
                anagrafica={anagraficaMailDi({
                  fonte: anagraficaFonte,
                  possibileId: possibileClienteId,
                  clienteId,
                })}
                emailPec={clienteSped?.pec ?? ""}
                emailGeneriche={clienteSped?.emailGeneriche ?? []}
                onDraftChange={(d) => {
                  spedDraft.current = d;
                }}
                onNeedEntity={(modo) => void submit(modo)}
                sceltaOrdineFissa={Boolean(modificaOrdineId)}
              />
              )}
            </div>
          ) : null}

          {sessioneMsg ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {sessioneMsg}
            </p>
          ) : null}
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (savedOrdine && attesaCalcoloSpedizione) onSaved(savedOrdine);
              else onClose();
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {savedOrdine && attesaCalcoloSpedizione ? "Chiudi" : "Annulla"}
          </button>
          <div className="flex gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Indietro
              </button>
            ) : null}
            {step < lastStep ? (
              <button
                type="button"
                disabled={!modificaPronta || !canNext()}
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                Avanti
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  saving ||
                  !modificaPronta ||
                  calcoloLoading ||
                  (tipoOrdine !== "campionatura" &&
                    !modificaOrdineId &&
                    !calcolo?.dataConsegnaStimata)
                }
                onClick={() => {
                  if (attesaCalcoloSpedizione) {
                    void submit();
                    return;
                  }
                  const d = spedDraft.current;
                  const modo = !d.allegaTracking
                    ? "salva"
                    : d.trackingUrl.trim()
                      ? "compila"
                      : "prenota";
                  void submit(modo);
                }}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {etichettaSalvataggio}
              </button>
            )}
          </div>
        </div>
      </div>

      {altroPostoOpen && (clienteId || possibileClienteId) ? (
        <CampionaturaAltroPostoModal
          clienteId={clienteId || possibileClienteId}
          clienteLabel={clienteNome}
          aziendaTipo={
            anagraficaFonte === "possibile" && !clienteId
              ? "cliente_possibile"
              : "cliente"
          }
          onClose={() => setAltroPostoOpen(false)}
          onSaved={(r) => {
            addressManual.current = true;
            preserveSavedAddress.current = false;
            setAddressKey("altro");
            setAltroPostoLabel(r.label);
            setDestinatario(r.destinatario);
            setIndirizzoSpedizione(r.indirizzo);
            setAltroPostoOpen(false);
          }}
        />
      ) : null}

      {creatingProdotto && (
        <ProdottoProprioFormModal
          mode="create"
          catalog={prodotti}
          elevated
          onClose={() => setCreatingProdotto(false)}
          onSave={async (values) => {
            const result = await addProdotto(values);
            if (!result.success) {
              throw new Error(result.error);
            }
            setProdotto(result.prodotto);
            setCreatingProdotto(false);
            await refresh();
          }}
        />
      )}

      {timelineMailOpen &&
      (anagraficaFonte === "possibile"
        ? possibileClienteId
        : clienteId) ? (
        <AziendaTimelineModal
          elevated
          aziendaTipo={
            anagraficaFonte === "possibile" ? "cliente_possibile" : "cliente"
          }
          aziendaId={
            anagraficaFonte === "possibile" ? possibileClienteId : clienteId
          }
          aziendaLabel={clienteNome}
          onClose={() => {
            setTimelineMailOpen(false);
            setTimelineMailKind(null);
          }}
          pickMode={{
            purpose:
              timelineMailKind === "accettazione"
                ? "ordine-accettazione-mail"
                : tipoOrdine === "campionatura"
                  ? "campionatura-mail"
                  : "ordine-richiesta-mail",
            prodotti: prodotto
              ? [`${prodotto.codice} ${prodotto.nome}`.trim()]
              : [],
            extra: [
              clienteNome,
              preventiviAccettati.find((p) => p.id === preventivoId)
                ?.numeroInterno ?? "",
              quantita !== "" ? `${quantita} ${unitaMisura}` : "",
            ].filter(Boolean),
            onPicked: (picked: { id: string; subject: string }) => {
              if (timelineMailKind === "accettazione") {
                setMailAccettazione(picked);
              } else {
                setMailRichiesta(picked);
              }
              setTimelineMailOpen(false);
              setTimelineMailKind(null);
            },
          }}
        />
      ) : null}

      {calendarioOpen && calcolo && calcolo.giorniLavorativiNecessari > 0 ? (
        <ConsegnaCalendarioModal
          giorniProduzioneNecessari={calcolo.giorniLavorativiNecessari}
          kgOrdine={quantitaKg}
          usaSabato={usaSabato}
          onToggleSabato={setUsaSabato}
          attivitaDrafts={attivitaDrafts}
          onAttivitaDraftsChange={setAttivitaDrafts}
          initialGiorniProduzione={giorniProduzione}
          initialGiorniAttivita={giorniAttivita}
          initialDataConsegna={dataConsegnaCalendario}
          onClose={() => setCalendarioOpen(false)}
          onConfirm={({
            giorniProduzione: days,
            giorniAttivita: attDays,
            segmentiAttivita,
            dataConsegna,
            attivitaDrafts: drafts,
          }) => {
            setGiorniProduzione(days);
            setGiorniAttivita(attDays);
            setAttivitaDrafts(drafts);
            setAttivitaSnapshot(
              segmentiAttivita.map((s) => {
                const d = drafts.find((x) => x.attivitaId === s.attivitaId);
                return {
                  ...s,
                  modalitaTempo: d?.modalitaTempo,
                  kgPerOra: d?.kgPerOra,
                  oreGiorno: d?.oreGiorno,
                  oreCiclo: d?.oreCiclo ?? null,
                  giorniOverride: d?.giorniOverride ?? null,
                };
              })
            );
            setDataConsegnaCalendario(dataConsegna);
            setCalendarioOpen(false);
          }}
        />
      ) : null}

      {fatturaA4Open && savedOrdine ? (
        <FatturaA4Modal
          ordineId={
            ORDINI_PERSISTENZA_DEFINITIVA ? savedOrdine.id : undefined
          }
          sessioneDraft={
            ORDINI_PERSISTENZA_DEFINITIVA
              ? null
              : {
                  cliente: clienteSped,
                  destinatario: destinatarioSessioneDaCliente(
                    clienteSped,
                    clienteNome
                  ),
                  righe: righeFatturaConSpedizione(
                    loadOrdineSessione()?.fattura?.righe,
                    loadOrdineSessione()?.fattura?.contributoSpedizioneRimosso
                  ),
                  piano: pagamentoPiano,
                  emails: emailsDaCliente(clienteSped),
                  numeroFattura: "AA/NNNN",
                  dataDocumento: todayIsoDate(),
                  noteDocumento: "",
                }
          }
          pianoIniziale={pagamentoPiano}
          onClose={() => setFatturaA4Open(false)}
          onSaved={({ inviata }) => {
            if (!inviata) return;
            setFatturaA4Open(false);
          }}
          onSimulaInvio={(mailDraft) => {
            setFatturaA4Open(false);
            setFatturaMailDraft(mailDraft);
            setSessioneMsg(
              "Scheda di invio aperta: da qui parte la mail Webmail e, a parte, la fattura attraverso lo SDI."
            );
          }}
        />
      ) : null}

      {fatturaMailDraft ? (
        <FatturaWebmailComposeModal
          draft={fatturaMailDraft}
          onClose={() => setFatturaMailDraft(null)}
        />
      ) : null}

      {composeAfter ? (
        <SpedizioneMailComposeModal
          prenotazione={composeAfter.prenotazione}
          subject={composeAfter.subject}
          bodyText={composeAfter.bodyText}
          to={composeAfter.to}
          anagrafica={anagraficaMailDi({
            fonte: anagraficaFonte,
            possibileId: possibileClienteId,
            clienteId,
          })}
          emailAzienda={clienteSped?.email ?? ""}
          emailPec={clienteSped?.pec ?? ""}
          emailGeneriche={clienteSped?.emailGeneriche ?? []}
          solaLettura={Boolean(modificaOrdineId)}
          onClose={() => {
            const o = composeAfter.ordine;
            setComposeAfter(null);
            onSaved(o);
          }}
          onInviata={() => {
            const o = composeAfter.ordine;
            setComposeAfter(null);
            onSaved(o);
          }}
        />
      ) : null}
    </div>
  );
}
