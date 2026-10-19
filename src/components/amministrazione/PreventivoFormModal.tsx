"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  createPreventivoAction,
  getPreventivoPerModificaAction,
  inviaPreventivoMailAction,
  listCasellePreventivoMailAction,
  listPreventivoCommercialiRiferimentoAction,
  peekNextNumeroPreventivoAction,
  savePreventivoAction,
  sostituisciAllegatiInvioPreventivoAction,
  stimaSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import { traduciIntercomunicazioneAction } from "@/app/actions/traduci-intercomunicazione";
import { AziendaNoteBanner } from "@/components/amministrazione/AziendaNoteBanner";
import { dicituraTradottoConAi } from "@/lib/amministrazione/dicitura-traduzione-ai";
import {
  PreventivoAggiungiProdottoModal,
  type PreventivoProdottoDraft,
} from "@/components/amministrazione/PreventivoAggiungiProdottoModal";
import { PreventivoDestinatarioModal } from "@/components/amministrazione/PreventivoDestinatarioPicker";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
import { PreventivoFoglioA4 } from "@/components/amministrazione/PreventivoFoglioA4";
import {
  TraduciIntercomunicazione,
  type TestoTraducibile,
} from "@/components/amministrazione/TraduciIntercomunicazione";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  ORDINE_TIPI_PAGAMENTO,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import {
  CONFEZIONE_STANDARD,
  GIORNI_CONSEGNA_DEFAULT,
  PREVENTIVO_CONSEGNA_LABEL,
  nomeFilePreventivoPdf,
  PREVENTIVO_IVA_DEFAULT,
  PREVENTIVO_NOTE_DEFAULT,
  PREVENTIVO_VALIDITA_GIORNI,
  labelModalitaPagamentoPreventivo,
  normalizzaVoceSpedizioneMail,
  testoSpedizionePreventivo,
  voceSpedizionePreventivo,
  type Preventivo,
  type PreventivoConsegna,
} from "@/lib/amministrazione/preventivi";
import {
  applicaMargineSpedizione,
  caricoDefaultDaConsegna,
  fonteDefaultDaConsegna,
  SPEDIZIONE_MARKUP_SICUREZZA_PCT,
  type PreventivoSpedizioneFonte,
} from "@/lib/amministrazione/preventivo-spedizione";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  AGRINSICILIA_MAIL_FIRMA,
  formatDestinatarioIndirizzo,
  type DestinatarioPreventivo,
} from "@/lib/amministrazione/preventivo-letterhead";
import { campiAccordoRiga } from "@/lib/amministrazione/accordi-prezzo";
import {
  fraseCausalePreventivo,
  fraseValiditaPreventivo,
  notaScontoRigaPreventivo,
  vociEtichetteFissePreventivo,
} from "@/lib/amministrazione/preventivo-etichette";
import { foglioPreventivoToPdfBase64 } from "@/lib/amministrazione/preventivo-foglio-cattura";
import { scaricaBlob, zipNonCompresso } from "@/lib/amministrazione/zip-store";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";
import { LISTINO_CONTRATTO_MSG } from "@/lib/ecosystem/listino-vigente";
import {
  clearPreventivoSessione,
  labelIntenzionePreventivo,
  loadPreventivoSessione,
  PREVENTIVI_SESSIONE_PROVA,
  PREVENTIVI_SESSIONE_PROVA_MSG,
  savePreventivoSessione,
  type PreventivoIntenzione,
} from "@/lib/amministrazione/preventivo-sessione";

type DraftRiga = PreventivoProdottoDraft & {
  key: string;
  prodottoCodice: string;
  prodottoNome: string;
};

type ModoPrezzoSpedizione = "inserito" | "richiesto" | "in_fattura";

const MODI_PREZZO_SPEDIZIONE: { id: ModoPrezzoSpedizione; label: string }[] = [
  { id: "inserito", label: "Inserisci importo" },
  { id: "richiesto", label: "Prenota il calcolo" },
  { id: "in_fattura", label: "Costo calcolato in fattura" },
];

type EditKind =
  | null
  | "data"
  | "commerciale"
  | "destinatario"
  | "prodotto"
  | "spedizione"
  | "giorni"
  | "pagamento"
  | "note"
  | "totali";

type Props = {
  onClose: () => void;
  onSaved: (item: Preventivo) => void;
  /** Preventivo già in archivio: la modale si apre compilata, numero invariato. */
  preventivoId?: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function newKey() {
  return crypto.randomUUID();
}

function CoppiaCentrata({
  naturale,
  children,
}: {
  naturale?: boolean;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [misura, setMisura] = useState<{
    scale: number;
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const row = rowRef.current;
    if (!outer || !row || naturale) return;
    const misuraOra = () => {
      const available = outer.clientWidth;
      const naturalW = row.offsetWidth;
      const naturalH = row.offsetHeight;
      const scale = naturalW > 0 ? Math.min(1, available / naturalW) : 1;
      const width = naturalW * scale;
      const height = naturalH * scale;
      setMisura((prev) => {
        if (
          prev &&
          prev.scale === scale &&
          prev.width === width &&
          prev.height === height
        ) {
          return prev;
        }
        return { scale, width, height };
      });
    };
    misuraOra();
    const osservatore = new ResizeObserver(misuraOra);
    osservatore.observe(outer);
    osservatore.observe(row);
    return () => osservatore.disconnect();
  }, [naturale]);

  const scale = naturale ? 1 : (misura?.scale ?? 1);

  return (
    <div ref={outerRef} className="mx-auto w-full">
      <div
        className="mx-auto"
        style={{
          width: naturale ? undefined : misura?.width,
          height: naturale ? undefined : misura?.height,
          overflow: misura && !naturale ? "hidden" : "visible",
        }}
      >
        <div
          ref={rowRef}
          className="mx-auto flex w-max items-start justify-center gap-[12mm]"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function PreventivoFormModal({ onClose, onSaved, preventivoId }: Props) {
  const titleId = useId();
  const foglioRef = useRef<HTMLDivElement>(null);
  const foglioStampaItRef = useRef<HTMLDivElement>(null);
  const foglioTradottoRef = useRef<HTMLDivElement>(null);
  const { prodotti, ready } = useProdottiPropri();
  const [destinatario, setDestinatario] =
    useState<DestinatarioPreventivo | null>(null);
  const [commerciale, setCommerciale] =
    useState<PreventivoCommercialeRiferimento | null>(null);
  const [commercialiOpts, setCommercialiOpts] = useState<
    PreventivoCommercialeRiferimento[]
  >([]);
  const [draftCommercialeId, setDraftCommercialeId] = useState("");
  const [dataPreventivo, setDataPreventivo] = useState(today);
  const [numeroPreview, setNumeroPreview] = useState("N/ANNO");
  const [righe, setRighe] = useState<DraftRiga[]>([]);
  const [editKind, setEditKind] = useState<EditKind>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [consegnaMetodo, setConsegnaMetodo] =
    useState<PreventivoConsegna>("da_concordare");
  const [spedizioneACarico, setSpedizioneACarico] = useState<
    "cliente" | "agrinsicilia" | "diviso"
  >("cliente");
  const [spedizioneBase, setSpedizioneBase] = useState<number | "">("");
  const [spedizioneFonte, setSpedizioneFonte] =
    useState<PreventivoSpedizioneFonte>("da_concordare");
  const [spedizioneMsg, setSpedizioneMsg] = useState<string | null>(null);
  const [tipoPagamento, setTipoPagamento] =
    useState<OrdineTipoPagamento>("anticipato");
  const [giorniConsegna, setGiorniConsegna] = useState(GIORNI_CONSEGNA_DEFAULT);
  const [note, setNote] = useState(PREVENTIVO_NOTE_DEFAULT);
  const [ivaDocumento, setIvaDocumento] = useState(PREVENTIVO_IVA_DEFAULT);
  const [validitaGiorni, setValiditaGiorni] = useState(PREVENTIVO_VALIDITA_GIORNI);
  const [draftData, setDraftData] = useState(today);
  const [draftConsegna, setDraftConsegna] =
    useState<PreventivoConsegna>("da_concordare");
  const [draftNolo, setDraftNolo] = useState<number | "">("");
  const [draftGiorni, setDraftGiorni] = useState(GIORNI_CONSEGNA_DEFAULT);
  const [draftPagamento, setDraftPagamento] =
    useState<OrdineTipoPagamento>("anticipato");
  const [draftNote, setDraftNote] = useState(PREVENTIVO_NOTE_DEFAULT);
  const [draftIva, setDraftIva] = useState<number | "">(PREVENTIVO_IVA_DEFAULT);
  const [draftValidita, setDraftValidita] = useState<number | "">(
    PREVENTIVO_VALIDITA_GIORNI
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [intenzione, setIntenzione] = useState<PreventivoIntenzione>("bozza");
  const [sessionePronta, setSessionePronta] = useState(false);
  const [inviaOpen, setInviaOpen] = useState(false);
  const [invioEmail, setInvioEmail] = useState("");
  const [invioOggetto, setInvioOggetto] = useState("");
  const [invioMessaggio, setInvioMessaggio] = useState("");
  const [sessioneMsg, setSessioneMsg] = useState<string | null>(null);
  const [prezzoAcquirenteModo, setPrezzoAcquirenteModo] =
    useState<ModoPrezzoSpedizione>("in_fattura");
  const [mailAccountId, setMailAccountId] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailOggetto, setMailOggetto] = useState("");
  const [mailTesto, setMailTesto] = useState("");
  const [caselle, setCaselle] = useState<Array<{ id: string; label: string; email: string }>>(
    []
  );
  const [draftPrezzoModo, setDraftPrezzoModo] =
    useState<ModoPrezzoSpedizione>("in_fattura");
  const [mailError, setMailError] = useState<string | null>(null);
  const [mailLinguaApplicata, setMailLinguaApplicata] = useState<string | null>(
    null
  );
  const [preparazioneInvio, setPreparazioneInvio] = useState<
    "lingua" | "invio" | null
  >(null);
  const [allegatiMail, setAllegatiMail] = useState<File[]>([]);
  const [scaricaAvviso, setScaricaAvviso] = useState(false);
  const bozzaMailItRef = useRef({ oggetto: "", testo: "" });
  const [foglioPronto, setFoglioPronto] = useState(!preventivoId);
  const [copiaTradotta, setCopiaTradotta] = useState<Record<string, string> | null>(
    null
  );
  const [firmaTradotta, setFirmaTradotta] = useState<string | null>(null);
  const [nomeLinguaTradotta, setNomeLinguaTradotta] = useState<string | null>(
    null
  );
  const [linguaTradotta, setLinguaTradotta] = useState<string | null>(null);
  const [linguaScelta, setLinguaScelta] = useState<string | null>(null);
  const [modelloAi, setModelloAi] = useState<string | null>(null);
  const erroreRef = useRef<HTMLParagraphElement>(null);
  const [catturaNaturale, setCatturaNaturale] = useState(false);

  const editing = editKey
    ? (righe.find((r) => r.key === editKey) ?? null)
    : null;
  const fieldOpen = editKind != null;

  const pesoKg = useMemo(
    () =>
      righe.reduce(
        (sum, r) => sum + (Number.isFinite(r.quantita) ? r.quantita : 0),
        0
      ),
    [righe]
  );

  let spedizioneImporto = 0;
  if (
    prezzoAcquirenteModo === "inserito" &&
    spedizioneBase !== "" &&
    consegnaMetodo !== "ritiro"
  ) {
    spedizioneImporto =
      consegnaMetodo === "corriere_nostro"
        ? applicaMargineSpedizione(spedizioneBase)
        : Number(spedizioneBase);
  }

  const testiTraducibili = useMemo<TestoTraducibile[]>(() => {
    const modalita =
      consegnaMetodo === "ritiro" ? "non_applicabile" : prezzoAcquirenteModo;
    return [
      ...righe.flatMap((riga, index) => [
        {
          key: `nome-${riga.key}`,
          etichetta: `Prodotto ${index + 1}`,
          text: riga.prodottoNome,
        },
        {
          key: `conf-${riga.key}`,
          etichetta: `Confezionamento ${index + 1}`,
          text: riga.confezionamento,
        },
        {
          key: `giust-${riga.key}`,
          etichetta: `Giustificazione ${index + 1}`,
          text: riga.accordoGiustificazione ?? "",
        },
      ]),
      {
        key: "consegna",
        etichetta: "Consegna",
        text: testoSpedizionePreventivo({
          consegnaMetodo,
          modalita,
          importo: spedizioneImporto,
        }),
      },
      {
        key: "pagamento",
        etichetta: "Pagamento",
        text: labelModalitaPagamentoPreventivo(tipoPagamento),
      },
      { key: "note", etichetta: "Note", text: note },
      {
        key: "giorniTesto",
        etichetta: "Giorni di consegna",
        text: giorniConsegna,
      },
      {
        key: "causaleFrase",
        etichetta: "Causale",
        text: fraseCausalePreventivo(numeroPreview, dataPreventivo),
      },
      {
        key: "validitaFrase",
        etichetta: "Validità",
        text: fraseValiditaPreventivo(validitaGiorni),
      },
      ...righe.map((riga, index) => ({
        key: `sconto-${riga.key}`,
        etichetta: `Sconto riga ${index + 1}`,
        text: notaScontoRigaPreventivo(riga),
      })),
      ...vociEtichetteFissePreventivo(),
    ];
  }, [
    righe,
    consegnaMetodo,
    prezzoAcquirenteModo,
    spedizioneImporto,
    tipoPagamento,
    note,
    giorniConsegna,
    numeroPreview,
    dataPreventivo,
    validitaGiorni,
  ]);
  const firmaCorrente = useMemo(
    () =>
      JSON.stringify({
        testi: testiTraducibili.map((item) => [item.key, item.text]),
        dataPreventivo,
        commercialeId: commerciale?.id ?? "",
        destinatarioId: destinatario?.id ?? "",
        indirizzo: destinatario
          ? formatDestinatarioIndirizzo(destinatario.sede)
          : null,
        righe: righe.map((riga) => ({
          key: riga.key,
          codice: riga.prodottoCodice,
          quantita: riga.quantita,
          unita: riga.unitaMisura,
          prezzo: riga.prezzoUnitario,
          iva: riga.ivaPercentuale,
          scontoExtra: riga.scontoExtraPct,
          scontoListino: riga.scontoListinoPct ?? 0,
          scontoStandard: riga.scontoListinoStandardPct ?? 0,
        })),
        giorniConsegna,
        ivaDocumento,
        validitaGiorni,
        numeroPreview,
      }),
    [
      testiTraducibili,
      dataPreventivo,
      commerciale?.id,
      destinatario,
      righe,
      giorniConsegna,
      ivaDocumento,
      validitaGiorni,
      numeroPreview,
    ]
  );
  const traduzioneObsoleta =
    copiaTradotta != null && firmaTradotta !== firmaCorrente;

  useEffect(() => {
    setCopiaTradotta(null);
    setFirmaTradotta(null);
    setNomeLinguaTradotta(null);
    setLinguaTradotta(null);
    setModelloAi(null);
    setLinguaScelta(null);
    setMailLinguaApplicata(null);
    bozzaMailItRef.current = { oggetto: "", testo: "" };
  }, [destinatario?.id]);

  useEffect(() => {
    if (!formError) return;
    erroreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [formError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !fieldOpen) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving, fieldOpen]);

  useEffect(() => {
    if (preventivoId) {
      let cancelled = false;
      setSavedId(preventivoId);
      void getPreventivoPerModificaAction(preventivoId).then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setFormError(res.error);
          setFoglioPronto(true);
          return;
        }
        const foglio = res.foglio;
        setNumeroPreview(foglio.numeroInterno);
        setDataPreventivo(foglio.dataPreventivo);
        setNote(foglio.note);
        setGiorniConsegna(foglio.giorniConsegna);
        setValiditaGiorni(foglio.validitaGiorni);
        setIvaDocumento(foglio.ivaDocumento);
        setTipoPagamento(foglio.tipoPagamento);
        setConsegnaMetodo(foglio.consegnaMetodo);
        setSpedizioneACarico(foglio.spedizioneACarico);
        setSpedizioneFonte(foglio.spedizioneFonte);
        setPrezzoAcquirenteModo(foglio.prezzoAcquirenteModo);
        setSpedizioneBase(foglio.spedizioneBase ?? "");
        setDestinatario(foglio.destinatario);
        setCommerciale(foglio.commerciale);
        setMailAccountId(foglio.mailAccountId);
        setMailTo(foglio.mailTo);
        setMailOggetto(foglio.mailOggetto);
        setMailTesto(foglio.mailTesto);
        setInvioEmail(foglio.mailTo);
        setInvioOggetto(foglio.mailOggetto);
        setInvioMessaggio(foglio.mailTesto);
        setIntenzione(foglio.stato === "inviato" ? "inviato" : "salvato");
        setRighe(
          foglio.righe.map((r) => ({
            ...r,
            scontoListinoTarga: "",
            disponibilita: null,
            blocco: null,
          }))
        );
        setSessioneMsg(null);
        setFoglioPronto(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!PREVENTIVI_SESSIONE_PROVA) {
      clearPreventivoSessione();
      setSessionePronta(true);
      return;
    }
    const sessione = loadPreventivoSessione();
    if (sessione) {
      setSavedId(sessione.savedId);
      setIntenzione(sessione.intenzione);
      setDestinatario(
        sessione.destinatario
          ? { ...sessione.destinatario, email: sessione.destinatario.email ?? "" }
          : null
      );
      setCommerciale(sessione.commerciale);
      setDataPreventivo(sessione.dataPreventivo);
      if (sessione.numeroInterno) setNumeroPreview(sessione.numeroInterno);
      setConsegnaMetodo(sessione.consegnaMetodo);
      setSpedizioneACarico(sessione.spedizioneACarico);
      setSpedizioneBase(sessione.spedizioneBase);
      setSpedizioneFonte(sessione.spedizioneFonte);
      setTipoPagamento(sessione.tipoPagamento);
      setGiorniConsegna(sessione.giorniConsegna);
      setNote(sessione.note);
      setIvaDocumento(sessione.ivaDocumento);
      setValiditaGiorni(sessione.validitaGiorni);
      setInvioEmail(sessione.invioEmail);
      setRighe(
        sessione.righe.map((r) => ({
          ...r,
          scontoListinoPct: r.scontoListinoPct ?? 0,
          scontoListinoStandardPct:
            r.scontoListinoStandardPct ?? r.scontoListinoPct ?? 0,
          scontoListinoTarga: r.scontoListinoTarga ?? "",
          scontoSuddivisioneAttiva: Boolean(r.scontoSuddivisioneAttiva),
          scontoQuotaAziendaPct: r.scontoQuotaAziendaPct ?? 0,
          scontoQuotaCommercialePct: r.scontoQuotaCommercialePct ?? 0,
          disponibilita: (r.disponibilita as DraftRiga["disponibilita"]) ?? null,
          blocco: (r.blocco as DraftRiga["blocco"]) ?? null,
        }))
      );
      setSessioneMsg(
        `Sessione provvisoria ripresa (${labelIntenzionePreventivo(sessione.intenzione)}).`
      );
    }
    setSessionePronta(true);
  }, [preventivoId]);

  useEffect(() => {
    let cancelled = false;
    void listPreventivoCommercialiRiferimentoAction().then((res) => {
      if (cancelled || !res.success) return;
      setCommercialiOpts(res.items);
      setCommerciale((prev) => prev ?? res.defaultItem);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (savedId) return;
    let cancelled = false;
    void peekNextNumeroPreventivoAction(dataPreventivo).then((res) => {
      if (cancelled) return;
      setNumeroPreview(res.success ? res.numero : "N/ANNO");
    });
    return () => {
      cancelled = true;
    };
  }, [dataPreventivo, savedId]);

  useEffect(() => {
    if (consegnaMetodo !== "corriere_nostro" || prezzoAcquirenteModo !== "inserito") {
      setSpedizioneMsg(null);
      return;
    }
    let cancelled = false;
    void stimaSpedizionePreventivoAction({
      consegnaMetodo,
      cap: destinatario?.sede.cap ?? "",
      nazione: destinatario?.sede.nazione ?? "",
      provincia: destinatario?.sede.provincia ?? "",
      pesoKg,
      importoBaseManuale: spedizioneBase === "" ? null : spedizioneBase,
    }).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setSpedizioneMsg(res.error);
        return;
      }
      setSpedizioneFonte(res.stima.fonte);
      setSpedizioneMsg(res.stima.messaggio);
    });
    return () => {
      cancelled = true;
    };
  }, [consegnaMetodo, destinatario, pesoKg, spedizioneBase, prezzoAcquirenteModo]);

  function applyConsegna(
    next: PreventivoConsegna,
    nolo: number | "",
    modo: ModoPrezzoSpedizione
  ) {
    setConsegnaMetodo(next);
    setSpedizioneACarico(caricoDefaultDaConsegna(next));
    if (next === "ritiro") {
      setSpedizioneFonte("ritiro");
      setSpedizioneBase("");
      setSpedizioneMsg(null);
      setPrezzoAcquirenteModo("in_fattura");
      return;
    }
    setPrezzoAcquirenteModo(modo);
    if (modo === "inserito") {
      setSpedizioneFonte(
        next === "da_concordare" ? "da_concordare" : "manuale"
      );
      setSpedizioneBase(nolo);
      return;
    }
    setSpedizioneFonte(fonteDefaultDaConsegna(next));
    setSpedizioneBase("");
    setSpedizioneMsg(null);
  }

  function openEdit(kind: Exclude<EditKind, null>, rowKey: string | null = null) {
    if (kind === "prodotto" && !destinatario) {
      setFormError(
        "Seleziona prima il destinatario: lo sconto o il prezzo concordato si precompila da quella scheda."
      );
      return;
    }
    setEditKey(rowKey);
    if (kind === "data") setDraftData(dataPreventivo);
    if (kind === "commerciale") {
      setDraftCommercialeId(commerciale?.id ?? "");
    }
    if (kind === "spedizione") {
      setDraftConsegna(consegnaMetodo);
      setDraftNolo(spedizioneBase);
      setDraftPrezzoModo(prezzoAcquirenteModo);
    }
    if (kind === "giorni") setDraftGiorni(giorniConsegna);
    if (kind === "pagamento") setDraftPagamento(tipoPagamento);
    if (kind === "note") setDraftNote(note);
    if (kind === "totali") {
      setDraftIva(ivaDocumento);
      setDraftValidita(validitaGiorni);
    }
    setEditKind(kind);
  }

  function closeEdit() {
    setEditKind(null);
    setEditKey(null);
  }

  function onConfirmProdotto(draft: PreventivoProdottoDraft) {
    const p = prodotti.find((x) => x.id === draft.prodottoId);
    const row: DraftRiga = {
      ...draft,
      key: editKey ?? newKey(),
      prodottoCodice: p?.codice ?? "",
      prodottoNome: p?.nome ?? "",
    };
    setRighe((prev) => {
      if (editKey) {
        return prev.map((r) => (r.key === editKey ? row : r));
      }
      return [...prev, row];
    });
    closeEdit();
  }

  function snapshotSessione(
    nextIntenzione: PreventivoIntenzione = intenzione,
    nextSavedId: string | null = savedId,
    nextNumero = numeroPreview
  ) {
    savePreventivoSessione({
      savedId: nextSavedId,
      numeroInterno: nextNumero,
      intenzione: nextIntenzione,
      destinatario,
      commerciale,
      dataPreventivo,
      consegnaMetodo,
      spedizioneACarico,
      spedizioneBase,
      spedizioneFonte,
      tipoPagamento,
      giorniConsegna,
      note,
      ivaDocumento,
      validitaGiorni,
      invioEmail: invioEmail || destinatario?.email || "",
      righe: righe.map((r) => ({
        key: r.key,
        prodottoId: r.prodottoId,
        prodottoCodice: r.prodottoCodice,
        prodottoNome: r.prodottoNome,
        quantita: r.quantita,
        unitaMisura: r.unitaMisura,
        prezzoUnitario: r.prezzoUnitario,
        ivaPercentuale: r.ivaPercentuale,
        listinoId: r.listinoId,
        prezzoDaListino: r.prezzoDaListino,
        scontoExtraPct: r.scontoExtraPct,
        scontoListinoPct: r.scontoListinoPct ?? 0,
        scontoListinoStandardPct:
          r.scontoListinoStandardPct ?? r.scontoListinoPct ?? 0,
        scontoListinoTarga: r.scontoListinoTarga ?? "",
        scontoSuddivisioneAttiva: r.scontoSuddivisioneAttiva,
        scontoQuotaAziendaPct: r.scontoQuotaAziendaPct,
        scontoQuotaCommercialePct: r.scontoQuotaCommercialePct,
        confezioneValue: r.confezioneValue,
        confezionamento: r.confezionamento,
        imballaggioVoceId: r.imballaggioVoceId,
        ...campiAccordoRiga(r),
        disponibilita: r.disponibilita,
        blocco: r.blocco,
      })),
    });
  }

  useEffect(() => {
    if (!PREVENTIVI_SESSIONE_PROVA || !sessionePronta || preventivoId) return;
    snapshotSessione();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot esplicito del foglio
  }, [
    sessionePronta,
    savedId,
    intenzione,
    destinatario,
    commerciale,
    dataPreventivo,
    numeroPreview,
    consegnaMetodo,
    spedizioneACarico,
    spedizioneBase,
    spedizioneFonte,
    tipoPagamento,
    giorniConsegna,
    note,
    ivaDocumento,
    validitaGiorni,
    invioEmail,
    righe,
    preventivoId,
  ]);

  async function persist(
    nextIntenzione: PreventivoIntenzione
  ): Promise<Preventivo | null> {
    if (!destinatario) {
      setFormError("Seleziona un destinatario.");
      return null;
    }
    if (!commerciale) {
      setFormError("Seleziona il commerciale di riferimento.");
      return null;
    }
    if (!righe.length) {
      setFormError("Aggiungi almeno un prodotto.");
      return null;
    }
    const bloccata = righe.find((r) => r.blocco);
    if (bloccata?.blocco === "fuori_produzione") {
      setFormError(LISTINO_CONTRATTO_MSG.fuori_produzione);
      return null;
    }
    if (bloccata?.blocco === "senza_prezzo") {
      setFormError(LISTINO_CONTRATTO_MSG.senza_prezzo);
      return null;
    }
    const mapped = righe.map((r) => ({
      prodottoId: r.prodottoId,
      prodottoCodice: r.prodottoCodice,
      prodottoNome: r.prodottoNome,
      quantita: r.quantita,
      unitaMisura: r.unitaMisura,
      prezzoUnitario: r.prezzoUnitario,
      ivaPercentuale: r.ivaPercentuale || ivaDocumento,
      listinoId: r.listinoId,
      prezzoDaListino: r.prezzoDaListino,
      scontoExtraPct: r.scontoExtraPct,
      scontoListinoPct: r.scontoListinoPct ?? 0,
      scontoListinoStandardPct:
        r.scontoListinoStandardPct ?? r.scontoListinoPct ?? 0,
      scontoSuddivisioneAttiva: Boolean(r.scontoSuddivisioneAttiva),
      scontoQuotaAziendaPct: r.scontoQuotaAziendaPct ?? 0,
      scontoQuotaCommercialePct: r.scontoQuotaCommercialePct ?? 0,
      confezionamento: r.confezionamento,
      imballaggioVoceId: r.imballaggioVoceId,
      ...campiAccordoRiga(r),
    }));
    const base =
      prezzoAcquirenteModo === "inserito" &&
      spedizioneBase !== "" &&
      consegnaMetodo !== "ritiro"
        ? spedizioneBase
        : 0;
    setSaving(true);
    setFormError(null);
    const modalitaSpedizionePrezzo =
      consegnaMetodo === "ritiro" ? "non_applicabile" : prezzoAcquirenteModo;
    if (PREVENTIVI_SESSIONE_PROVA && !preventivoId) {
      const id = savedId ?? `prova-${crypto.randomUUID()}`;
      const numero =
        numeroPreview && numeroPreview !== "N/ANNO"
          ? numeroPreview
          : `N/${dataPreventivo.slice(0, 4)}`;
      setSaving(false);
      setSavedId(id);
      setNumeroPreview(numero);
      setIntenzione(nextIntenzione);
      snapshotSessione(nextIntenzione, id, numero);
      const stato = nextIntenzione === "inviato" ? "inviato" : "creato";
      const item: Preventivo = {
        id,
        numeroInterno: numero,
        clienteId: destinatario.kind === "cliente" ? destinatario.id : "",
        cliente: destinatario.ragioneSociale,
        clienteCodiceTarga: destinatario.codiceTarga || "PC",
        dataPreventivo,
        stato,
        documentoStato: nextIntenzione === "bozza" ? "bozza" : "approvato",
        versione: 1,
        consegnaMetodo,
        spedizioneACarico,
        spedizioneImporto,
        spedizioneImportoBase: base,
        spedizioneMarkupPct: SPEDIZIONE_MARKUP_SICUREZZA_PCT,
        spedizioneFonte,
        tipoPagamento,
        tempiPagamentoGiorni: null,
        tempiPagamentoNote: "",
        giorniConsegna: giorniConsegna.trim() || GIORNI_CONSEGNA_DEFAULT,
        validitaGiorni,
        includeCoordinateBancarie: true,
        coordinateBanca: AGRINSICILIA_COORDINATE.banca,
        coordinateIban: AGRINSICILIA_COORDINATE.iban,
        coordinateBic: AGRINSICILIA_COORDINATE.bic,
        commercialeRiferimentoId: commerciale.id,
        commercialeRiferimentoNome: commerciale.nome,
        commercialeRiferimentoTelefono: commerciale.telefono,
        commercialeRiferimentoEmail: commerciale.email,
        note: note.trim() || PREVENTIVO_NOTE_DEFAULT,
        webmailAccettazioneId: null,
        webmailInvioId: null,
        referenteAccettazioneId: null,
        referenteAccettazioneLabel: "",
        archiviatoAt: null,
        spedizioneInCorso: false,
        accettazioneSeniorStato: "non_richiesta",
        accettazioneSeniorNota: "",
        accettazioneSeniorPuoRispondere: false,
        righe: [],
        pdfEmessi: [],
        createdAt: new Date().toISOString(),
      };
      return item;
    }
    const result = await savePreventivoAction({
      id: savedId ?? undefined,
      intenzione: nextIntenzione,
      clienteId: destinatario.kind === "cliente" ? destinatario.id : null,
      clientePossibileId:
        destinatario.kind === "possibile" ? destinatario.id : null,
      cliente: destinatario.ragioneSociale,
      codiceTargaCliente: destinatario.codiceTarga || "PC",
      dataPreventivo,
      consegnaMetodo,
      spedizioneACarico,
      spedizioneImporto,
      spedizioneImportoBase: base,
      spedizioneMarkupPct: SPEDIZIONE_MARKUP_SICUREZZA_PCT,
      spedizioneFonte,
      tipoPagamento,
      giorniConsegna: giorniConsegna.trim() || GIORNI_CONSEGNA_DEFAULT,
      includeCoordinateBancarie: true,
      coordinateBanca: AGRINSICILIA_COORDINATE.banca,
      coordinateIban: AGRINSICILIA_COORDINATE.iban,
      coordinateBic: AGRINSICILIA_COORDINATE.bic,
      commercialeRiferimentoId: commerciale.id,
      validitaGiorni,
      note: note.trim() || PREVENTIVO_NOTE_DEFAULT,
      righe: mapped,
      modalitaSpedizionePrezzo,
      mailAccountId: mailAccountId || undefined,
      mailTo,
      mailOggetto,
      mailTesto,
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      if (inviaOpen) setMailError(result.error);
      return null;
    }
    setSavedId(result.item.id);
    setNumeroPreview(result.item.numeroInterno);
    setIntenzione(nextIntenzione);
    if (PREVENTIVI_SESSIONE_PROVA && !preventivoId) {
      snapshotSessione(nextIntenzione, result.item.id, result.item.numeroInterno);
    }
    onSaved(result.item);
    return result.item;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  async function onSalvaBozza() {
    const item = await persist("bozza");
    if (!item) return;
    onClose();
  }

  async function mailNellaLinguaSelezionata(): Promise<
    | {
        ok: true;
        lingua: string;
        oggetto: string;
        testo: string;
        modello: string | null;
      }
    | { ok: false; error: string }
  > {
    const lingua = (linguaScelta ?? "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(lingua)) {
      return {
        ok: false,
        error: "Seleziona la lingua di traduzione del preventivo.",
      };
    }
    const oggettoCorrente = mailOggetto.trim();
    const testoCorrente = mailTesto.trim();
    if (lingua === "it") {
      const ancoraTradotta =
        mailLinguaApplicata != null &&
        mailLinguaApplicata !== "it" &&
        Boolean(
          bozzaMailItRef.current.testo.trim() ||
            bozzaMailItRef.current.oggetto.trim()
        );
      const oggetto = ancoraTradotta
        ? bozzaMailItRef.current.oggetto.trim() || oggettoCorrente
        : oggettoCorrente;
      const testo = ancoraTradotta
        ? bozzaMailItRef.current.testo.trim() || testoCorrente
        : testoCorrente;
      return { ok: true, lingua, oggetto, testo, modello: null };
    }
    if (!copiaTradotta || linguaTradotta !== lingua) {
      return {
        ok: false,
        error:
          "Traduci il preventivo nella lingua scelta, oppure imposta «Non tradurre · italiano».",
      };
    }
    if (traduzioneObsoleta) {
      return {
        ok: false,
        error:
          "Aggiorna la traduzione prima dell'invio, così l'allegato è allineato al foglio.",
      };
    }
    if (mailLinguaApplicata === lingua) {
      return {
        ok: true,
        lingua,
        oggetto: oggettoCorrente,
        testo: testoCorrente,
        modello: modelloAi,
      };
    }
    if (!destinatario) {
      return { ok: false, error: "Seleziona un destinatario." };
    }
    const fonte = bozzaMailItRef.current.testo.trim()
      ? bozzaMailItRef.current
      : { oggetto: oggettoCorrente, testo: testoCorrente };
    const res = await traduciIntercomunicazioneAction({
      tipo: destinatario.kind === "possibile" ? "cliente_possibile" : "cliente",
      id: destinatario.id,
      documento: "mail",
      lingua,
      testi: [
        { key: "oggetto", text: fonte.oggetto },
        { key: "corpo", text: fonte.testo },
      ],
    });
    if (!res.success) return { ok: false, error: res.error };
    const oggetto =
      res.testi.find((item) => item.key === "oggetto")?.text.trim() ||
      fonte.oggetto;
    const testo =
      res.testi.find((item) => item.key === "corpo")?.text.trim() ||
      fonte.testo;
    setMailOggetto(oggetto);
    setMailTesto(testo);
    setMailLinguaApplicata(res.lingua);
    return {
      ok: true,
      lingua: res.lingua,
      oggetto,
      testo,
      modello: modelloAi || res.modello,
    };
  }

  function onFase2Mail() {
    if (!destinatario) {
      setFormError("Seleziona un destinatario.");
      return;
    }
    if (!commerciale) {
      setFormError("Seleziona il commerciale di riferimento.");
      return;
    }
    if (!righe.length) {
      setFormError("Aggiungi almeno un prodotto.");
      return;
    }
    const bloccata = righe.find((r) => r.blocco);
    if (bloccata?.blocco === "fuori_produzione") {
      setFormError(LISTINO_CONTRATTO_MSG.fuori_produzione);
      return;
    }
    if (bloccata?.blocco === "senza_prezzo") {
      setFormError(LISTINO_CONTRATTO_MSG.senza_prezzo);
      return;
    }
    if (
      consegnaMetodo !== "ritiro" &&
      prezzoAcquirenteModo === "inserito" &&
      spedizioneImporto <= 0
    ) {
      setFormError("Inserisci l'importo della spedizione.");
      return;
    }
    setFormError(null);
    if (!mailTo.trim()) {
      setMailTo(invioEmail.trim() || destinatario.email || "");
    }
    const oggettoBase =
      mailOggetto.trim() ||
      `Preventivo n. ${numeroPreview} del ${dataPreventivo.split("-").reverse().join("/")}`;
    const baseMail = mailTesto.trim()
      ? mailTesto
      : `In allegato il preventivo n. ${numeroPreview}.\nValidità ${validitaGiorni} giorni.`;
    const testoBase = normalizzaVoceSpedizioneMail(
      baseMail,
      consegnaMetodo,
      prezzoAcquirenteModo
    );
    const mailGiaTradotta = Boolean(
      mailLinguaApplicata && mailLinguaApplicata !== "it"
    );
    if (!mailGiaTradotta) {
      setMailOggetto(oggettoBase);
      setMailTesto(testoBase);
      bozzaMailItRef.current = { oggetto: oggettoBase, testo: testoBase };
    } else if (!bozzaMailItRef.current.testo.trim()) {
      bozzaMailItRef.current = { oggetto: oggettoBase, testo: testoBase };
    }
    setMailError(null);
    void listCasellePreventivoMailAction().then((res) => {
      if (!res.success) {
        setMailError(res.error);
        return;
      }
      setCaselle(res.accounts);
      setMailAccountId((current) =>
        res.accounts.some((a) => a.id === current) ? current : ""
      );
    });
    setInviaOpen(true);
  }

  async function memorizzaAllegati(id: string) {
    if (id.startsWith("prova-")) return { success: true as const, count: 0 };
    const body = new FormData();
    body.set("preventivoId", id);
    for (const file of allegatiMail) body.append("file", file);
    const res = await sostituisciAllegatiInvioPreventivoAction(body);
    if (!res.success) return res;
    if (res.count !== allegatiMail.length) {
      return {
        success: false as const,
        error:
          "Gli allegati salvati non coincidono con quelli scelti. La mail non è partita.",
      };
    }
    return res;
  }

  function aggiungiAllegatiMail(lista: FileList | null) {
    const scelti = Array.from(lista ?? []);
    if (!scelti.length) return;
    const ammessi = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const next = [...allegatiMail];
    for (const file of scelti) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const mimeOk =
        ammessi.includes(file.type) ||
        ext === "pdf" ||
        ext === "jpg" ||
        ext === "jpeg" ||
        ext === "png" ||
        ext === "webp";
      if (!mimeOk) {
        setMailError(`Tipo non ammesso per «${file.name}». Usa PDF, JPEG, PNG o WebP.`);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setMailError(`«${file.name}» supera 15 MB.`);
        return;
      }
      if (next.length >= 8) {
        setMailError("Puoi allegare al massimo 8 file.");
        return;
      }
      next.push(file);
    }
    setAllegatiMail(next);
    setMailError(null);
  }

  async function onSalvaRichiestaCalcolo() {
    if (!destinatario) {
      setFormError("Seleziona un destinatario.");
      return;
    }
    if (!commerciale) {
      setFormError("Seleziona il commerciale di riferimento.");
      return;
    }
    if (!righe.length) {
      setFormError("Aggiungi almeno un prodotto.");
      return;
    }
    if (
      !mailAccountId ||
      !mailTo.includes("@") ||
      !mailOggetto.trim() ||
      !mailTesto.trim()
    ) {
      setMailError(
        "Compila casella, destinatario, oggetto e testo della mail."
      );
      return;
    }
    setMailError(null);
    setPreparazioneInvio("lingua");
    const preparata = await mailNellaLinguaSelezionata();
    if (!preparata.ok) {
      setPreparazioneInvio(null);
      setMailError(preparata.error);
      return;
    }
    setPreparazioneInvio(null);
    const mapped = righe.map((r) => ({
      prodottoId: r.prodottoId,
      prodottoCodice: r.prodottoCodice,
      prodottoNome: r.prodottoNome,
      quantita: r.quantita,
      unitaMisura: r.unitaMisura,
      prezzoUnitario: r.prezzoUnitario,
      ivaPercentuale: r.ivaPercentuale || ivaDocumento,
      listinoId: r.listinoId,
      prezzoDaListino: r.prezzoDaListino,
      scontoExtraPct: r.scontoExtraPct,
      scontoListinoPct: r.scontoListinoPct ?? 0,
      scontoListinoStandardPct:
        r.scontoListinoStandardPct ?? r.scontoListinoPct ?? 0,
      scontoSuddivisioneAttiva: Boolean(r.scontoSuddivisioneAttiva),
      scontoQuotaAziendaPct: r.scontoQuotaAziendaPct ?? 0,
      scontoQuotaCommercialePct: r.scontoQuotaCommercialePct ?? 0,
      confezionamento: r.confezionamento,
      imballaggioVoceId: r.imballaggioVoceId,
      ...campiAccordoRiga(r),
    }));
    setSaving(true);
    setFormError(null);
    setMailError(null);
    const payload = {
      intenzione: "salvato" as const,
      clienteId: destinatario.kind === "cliente" ? destinatario.id : null,
      clientePossibileId:
        destinatario.kind === "possibile" ? destinatario.id : null,
      cliente: destinatario.ragioneSociale,
      codiceTargaCliente: destinatario.codiceTarga || "PC",
      dataPreventivo,
      consegnaMetodo,
      spedizioneACarico,
      spedizioneImporto: 0,
      spedizioneImportoBase: 0,
      spedizioneMarkupPct: 0,
      spedizioneFonte: fonteDefaultDaConsegna(consegnaMetodo),
      tipoPagamento,
      giorniConsegna: giorniConsegna.trim() || GIORNI_CONSEGNA_DEFAULT,
      includeCoordinateBancarie: true,
      coordinateBanca: AGRINSICILIA_COORDINATE.banca,
      coordinateIban: AGRINSICILIA_COORDINATE.iban,
      coordinateBic: AGRINSICILIA_COORDINATE.bic,
      commercialeRiferimentoId: commerciale.id,
      validitaGiorni,
      note: note.trim() || PREVENTIVO_NOTE_DEFAULT,
      righe: mapped,
      modalitaSpedizionePrezzo: "richiesto",
      mailAccountId,
      mailTo: mailTo.trim(),
      mailOggetto: preparata.oggetto,
      mailTesto: preparata.testo,
    };
    const result = preventivoId
      ? await savePreventivoAction({ ...payload, id: preventivoId })
      : await createPreventivoAction(payload);
    setSaving(false);
    if (!result.success) {
      setMailError(result.error);
      setFormError(result.error);
      return;
    }
    const allegati = await memorizzaAllegati(result.item.id);
    if (!allegati.success) {
      setMailError(allegati.error);
      setFormError(allegati.error);
      return;
    }
    setInviaOpen(false);
    closeEdit();
    onSaved(result.item);
    onClose();
  }

  async function onConfermaInvioProva() {
    if (!mailAccountId || !mailTo.includes("@") || !mailOggetto.trim() || !mailTesto.trim()) {
      setMailError("Compila casella, destinatario, oggetto e testo della mail.");
      return;
    }
    setMailError(null);
    setPreparazioneInvio("lingua");
    const preparata = await mailNellaLinguaSelezionata();
    if (!preparata.ok) {
      setPreparazioneInvio(null);
      setMailError(preparata.error);
      return;
    }
    setInvioEmail(mailTo.trim());
    setInvioOggetto(preparata.oggetto);
    setInvioMessaggio(preparata.testo);
    const nodeIt = foglioStampaItRef.current;
    const inviaTradotto = preparata.lingua !== "it";
    const nodeTradotto = inviaTradotto ? foglioTradottoRef.current : null;
    if (!nodeIt || (inviaTradotto && !nodeTradotto)) {
      setPreparazioneInvio(null);
      setMailError(
        "La scheda non è pronta per l'allegato. Resta sul preventivo e riprova l'invio."
      );
      return;
    }
    if (PREVENTIVI_SESSIONE_PROVA) {
      setPreparazioneInvio(null);
      const item = await persist("inviato");
      if (!item) return;
      setInviaOpen(false);
      setSessioneMsg(
        preventivoId
          ? `Preventivo aggiornato. La mail per ${mailTo.trim()} è memorizzata e non è stata inviata.`
          : `Invio di prova registrato per ${mailTo.trim()}. Nessuna email reale è partita.`
      );
      return;
    }
    setPreparazioneInvio("invio");
    const item = await persist("salvato");
    if (!item) {
      setPreparazioneInvio(null);
      return;
    }
    const allegati = await memorizzaAllegati(item.id);
    if (!allegati.success) {
      setPreparazioneInvio(null);
      setMailError(allegati.error);
      return;
    }
    setSaving(true);
    setMailError(null);
    try {
      const pdfItaliano = await foglioPreventivoToPdfBase64(nodeIt);
      const pdfAllegato = nodeTradotto
        ? await foglioPreventivoToPdfBase64(nodeTradotto)
        : pdfItaliano;
      const res = await inviaPreventivoMailAction({
        preventivoId: item.id,
        mailAccountId,
        mailTo: mailTo.trim(),
        mailOggetto: preparata.oggetto,
        mailTesto: preparata.testo,
        pdfBase64: pdfAllegato,
        pdfArchivioBase64: nodeTradotto ? pdfItaliano : undefined,
        linguaAllegato: preparata.lingua,
        modelloTraduzione: preparata.modello || undefined,
      });
      if (!res.success) {
        setMailError(res.error);
        return;
      }
      clearPreventivoSessione();
      setInviaOpen(false);
      onSaved(res.item);
      onClose();
    } catch (e) {
      setMailError(
        e instanceof Error
          ? `Preventivo salvato in archivio. Invio mail non riuscito: ${e.message}`
          : "Preventivo salvato in archivio. Invio mail non riuscito."
      );
    } finally {
      setSaving(false);
      setPreparazioneInvio(null);
      setCatturaNaturale(false);
    }
  }

  const draftNoloImporto =
    draftConsegna === "corriere_nostro" && draftNolo !== ""
      ? applicaMargineSpedizione(draftNolo)
      : 0;
  const allertaAziende: {
    tipo: "cliente" | "cliente_possibile";
    id: string;
  }[] = [];
  if (destinatario?.id) {
    allertaAziende.push({
      tipo: destinatario.kind === "possibile" ? "cliente_possibile" : "cliente",
      id: destinatario.id,
    });
  }

  const affiancato = copiaTradotta != null;

  async function onConfermaScarica() {
    setScaricaAvviso(false);
    setFormError(null);
    const lingua = (linguaScelta ?? "it").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(lingua)) {
      setFormError("Seleziona la lingua di traduzione del preventivo.");
      return;
    }
    if (lingua !== "it" && (!copiaTradotta || linguaTradotta !== lingua)) {
      setFormError(
        "Traduci il preventivo nella lingua scelta, oppure imposta «Non tradurre · italiano»."
      );
      return;
    }
    if (lingua !== "it" && traduzioneObsoleta) {
      setFormError(
        "Aggiorna la traduzione prima del salvataggio, così il PDF è allineato al foglio."
      );
      return;
    }
    const nodeIt = foglioStampaItRef.current;
    const nodeTradotto = lingua !== "it" ? foglioTradottoRef.current : null;
    if (!nodeIt || (lingua !== "it" && !nodeTradotto)) {
      setFormError("La scheda non è pronta per il PDF. Resta sul preventivo e riprova.");
      return;
    }
    setPreparazioneInvio("invio");
    const item = await persist("da_inviare");
    if (!item) {
      setPreparazioneInvio(null);
      return;
    }
    if (allegatiMail.length) {
      const allegati = await memorizzaAllegati(item.id);
      if (!allegati.success) {
        setPreparazioneInvio(null);
        setFormError(allegati.error);
        return;
      }
    }
    try {
      const pdfItaliano = await foglioPreventivoToPdfBase64(nodeIt);
      const pdfScelto = nodeTradotto
        ? await foglioPreventivoToPdfBase64(nodeTradotto)
        : pdfItaliano;
      const bin = atob(pdfScelto);
      const pdfBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) pdfBytes[i] = bin.charCodeAt(i);
      const nomePdf = nomeFilePreventivoPdf(item.numeroInterno);
      if (allegatiMail.length === 0) {
        scaricaBlob(new Blob([pdfBytes], { type: "application/pdf" }), nomePdf);
      } else {
        const extra = await Promise.all(
          allegatiMail.map(async (file) => ({
            name: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
          }))
        );
        scaricaBlob(
          zipNonCompresso([{ name: nomePdf, bytes: pdfBytes }, ...extra]),
          nomePdf.replace(/\.pdf$/i, "") + ".zip"
        );
      }
    } catch (e) {
      setPreparazioneInvio(null);
      setFormError(
        e instanceof Error
          ? `Preventivo salvato. Download non riuscito: ${e.message}`
          : "Preventivo salvato. Download non riuscito."
      );
      return;
    }
    setPreparazioneInvio(null);
    setInviaOpen(false);
    onSaved(item);
    onClose();
  }

  function etichettaConfermaMail() {
    if (preparazioneInvio === "lingua") return "Preparazione lingua…";
    if (saving || preparazioneInvio === "invio") return "Salvataggio…";
    if (prezzoAcquirenteModo === "richiesto") return "Salva e prenota invio";
    return "Salva e invia";
  }
  const fascia = affiancato
    ? "mx-auto w-[98vw] max-w-[98vw]"
    : "mx-auto max-w-[210mm]";

  function schedaPreventivo(
    tradotto: boolean,
    cattura: "schermo" | "pdf" = "schermo"
  ) {
    const solaLettura = tradotto || cattura === "pdf";
    const copia = tradotto ? copiaTradotta : null;
    const righeVista = righe.map((riga) => {
      if (!copia) return riga;
      const conf = copia[`conf-${riga.key}`]?.trim() || riga.confezionamento;
      const giust = copia[`giust-${riga.key}`]?.trim();
      const confezionamento = giust ? `${conf}\n${giust}` : conf;
      return {
        ...riga,
        prodottoNome: copia[`nome-${riga.key}`]?.trim() || riga.prodottoNome,
        confezionamento,
      };
    });
    let noteVista = note;
    let giorniVista = giorniConsegna;
    if (copia) {
      const tradotta = copia.note?.trim();
      if (tradotta) noteVista = tradotta;
      const giorniTradotti = copia.giorniTesto?.trim();
      if (giorniTradotti) giorniVista = giorniTradotti;
    }
    let foglioCapture: typeof foglioRef | undefined;
    if (cattura === "pdf") {
      foglioCapture = tradotto ? foglioTradottoRef : foglioStampaItRef;
    } else if (!tradotto) {
      foglioCapture = foglioRef;
    }
    return (
      <PreventivoFoglioA4
        ref={foglioCapture}
        titleId={solaLettura ? undefined : titleId}
        numero={numeroPreview}
        dataPreventivo={dataPreventivo}
        commerciale={commerciale}
        destinatario={
          destinatario
            ? {
                ragioneSociale: destinatario.ragioneSociale,
                partitaIva: destinatario.partitaIva,
                codiceFiscale: destinatario.codiceFiscale,
                via: formatDestinatarioIndirizzo(destinatario.sede).via,
                capCitta: formatDestinatarioIndirizzo(destinatario.sede)
                  .capCitta,
              }
            : null
        }
        righe={righeVista}
        consegnaMetodo={consegnaMetodo}
        spedizioneImporto={spedizioneImporto}
        spedizioneDaCalcolare={prezzoAcquirenteModo === "richiesto"}
        spedizioneModalita={
          consegnaMetodo === "ritiro" ? "non_applicabile" : prezzoAcquirenteModo
        }
        note={noteVista}
        testoSpedizione={copia?.consegna}
        testoPagamento={copia?.pagamento}
        etichette={copia ?? undefined}
        giorniConsegna={giorniVista}
        tipoPagamento={tipoPagamento}
        ivaPercentuale={ivaDocumento}
        validitaGiorni={validitaGiorni}
        stampa={solaLettura}
        onEditData={solaLettura ? undefined : () => openEdit("data")}
        onEditCommerciale={solaLettura ? undefined : () => openEdit("commerciale")}
        onEditDestinatario={
          solaLettura ? undefined : () => openEdit("destinatario")
        }
        onEditProdotto={
          solaLettura ? undefined : (key) => openEdit("prodotto", key ?? null)
        }
        onRemoveRiga={
          solaLettura
            ? undefined
            : (key) => setRighe((prev) => prev.filter((r) => r.key !== key))
        }
        onAddRiga={solaLettura ? undefined : () => openEdit("prodotto")}
        onEditNote={solaLettura ? undefined : () => openEdit("note")}
        onEditSpedizione={solaLettura ? undefined : () => openEdit("spedizione")}
        onEditGiorni={solaLettura ? undefined : () => openEdit("giorni")}
        onEditPagamento={solaLettura ? undefined : () => openEdit("pagamento")}
        onEditTotali={solaLettura ? undefined : () => openEdit("totali")}
        dicituraAi={
          tradotto && modelloAi ? dicituraTradottoConAi(modelloAi) : undefined
        }
      />
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[60] overflow-y-auto bg-slate-950/65 py-6 ${affiancato ? "px-[1vw]" : "px-3 sm:px-6"}`}
      role="presentation"
    >
      <div className={`${fascia} sticky top-0 z-40 mb-4 flex items-center justify-between gap-3 bg-slate-950/95 px-6 py-3 print:hidden`}>
        <h2 id={titleId} className="text-sm font-semibold text-white">
          {preventivoId
            ? `Modifica preventivo ${numeroPreview}`
            : PREVENTIVI_SESSIONE_PROVA
              ? "Nuovo preventivo · sessione di prova"
              : savedId
                ? `Preventivo ${numeroPreview}`
                : "Nuovo preventivo"}
          <span className="ml-2 text-xs font-normal text-white/70">
            {labelIntenzionePreventivo(intenzione)}
          </span>
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void onSalvaBozza()}
            disabled={saving || !foglioPronto}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            Salva bozza
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setScaricaAvviso(true);
            }}
            disabled={saving || preparazioneInvio != null || !foglioPronto}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            Salva e scarica preventivo
          </button>
          <button
            type="button"
            onClick={onFase2Mail}
            disabled={saving || !foglioPronto}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Fase 2 Mail
          </button>
        </div>
      </div>

      {PREVENTIVI_SESSIONE_PROVA && !preventivoId ? (
        <p className={`${fascia} mb-3 rounded border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950 print:hidden`}>
          {PREVENTIVI_SESSIONE_PROVA_MSG}
        </p>
      ) : null}
      {sessioneMsg ? (
        <p className={`${fascia} mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden`}>
          {sessioneMsg}
        </p>
      ) : null}

      {preventivoId && !foglioPronto ? (
        <p className={`${fascia} mb-3 rounded border border-white/20 bg-white px-3 py-2 text-sm text-slate-700 print:hidden`}>
          Caricamento del preventivo e della mail…
        </p>
      ) : null}

      {formError ? (
        <p ref={erroreRef} className={`${fascia} mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden`}>
          {formError}
        </p>
      ) : null}

      {destinatario ? (
        <div className={`${fascia} mb-3 print:hidden`}>
          <TraduciIntercomunicazione
            tipo={
              destinatario.kind === "possibile" ? "cliente_possibile" : "cliente"
            }
            id={destinatario.id}
            documento="preventivo"
            testi={testiTraducibili}
            traduzionePronta={affiancato}
            daAggiornare={traduzioneObsoleta}
            onCopia={(items, meta) => {
              setCopiaTradotta(
                Object.fromEntries(items.map((item) => [item.key, item.text]))
              );
              setFirmaTradotta(firmaCorrente);
              setNomeLinguaTradotta(meta.nomeLingua);
              setLinguaTradotta(meta.lingua);
              setLinguaScelta(meta.lingua);
              setModelloAi(meta.modello);
            }}
            lingua={linguaScelta}
            onLinguaChange={(codice) => {
              setLinguaScelta(codice);
              if (mailLinguaApplicata && mailLinguaApplicata !== codice) {
                const it = bozzaMailItRef.current;
                if (it.oggetto || it.testo) {
                  setMailOggetto(it.oggetto);
                  setMailTesto(it.testo);
                }
                setMailLinguaApplicata(codice === "it" ? "it" : null);
              } else if (codice === "it") {
                setMailLinguaApplicata("it");
              }
              if (codice === linguaTradotta) return;
              setCopiaTradotta(null);
              setFirmaTradotta(null);
              setNomeLinguaTradotta(null);
              setLinguaTradotta(null);
              setModelloAi(null);
            }}
          />
        </div>
      ) : null}

      <div
        className="pointer-events-none fixed left-[-200vw] top-0 w-[210mm]"
        aria-hidden
      >
        {schedaPreventivo(false, "pdf")}
        {copiaTradotta ? schedaPreventivo(true, "pdf") : null}
      </div>

      <form
        id="preventivo-a4-form"
        onSubmit={onSubmit}
        aria-labelledby={titleId}
        className={affiancato ? fascia : undefined}
      >
        {affiancato ? (
          <CoppiaCentrata naturale={catturaNaturale}>
            <div className="w-[210mm] shrink-0">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-white">
                Italiano
              </p>
              {schedaPreventivo(false)}
            </div>
            <div className="w-[210mm] shrink-0">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-white">
                {nomeLinguaTradotta ?? "Traduzione"}
              </p>
              {schedaPreventivo(true)}
            </div>
          </CoppiaCentrata>
        ) : (
          schedaPreventivo(false)
        )}
      </form>

      {typeof document !== "undefined" && !inviaOpen
        ? createPortal(
            <div className="fixed bottom-12 right-12 z-[175] print:hidden">
              <button
                type="button"
                onClick={onFase2Mail}
                disabled={saving || !foglioPronto}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white shadow-lg disabled:opacity-50"
              >
                Avanti
              </button>
            </div>,
            document.body
          )
        : null}

      {editKind === "commerciale" ? (
        <PreventivoEditModal
          title="Commerciale di riferimento"
          onClose={closeEdit}
          onConfirm={() => {
            const picked =
              commercialiOpts.find((c) => c.id === draftCommercialeId) ?? null;
            if (!picked) {
              setFormError("Seleziona un commerciale o un admin.");
              return;
            }
            setCommerciale(picked);
            setFormError(null);
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <select
              value={draftCommercialeId}
              onChange={(e) => setDraftCommercialeId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {commercialiOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const preview =
              commercialiOpts.find((c) => c.id === draftCommercialeId) ?? null;
            if (!preview) return null;
            return (
              <div className="space-y-0.5 text-sm text-slate-600">
                <p>
                  <span className="font-semibold">Telefono:</span>{" "}
                  {preview.telefono || "—"}
                </p>
                <p>
                  <span className="font-semibold">Email:</span>{" "}
                  {preview.email || "—"}
                </p>
              </div>
            );
          })()}
        </PreventivoEditModal>
      ) : null}

      {editKind === "data" ? (
        <PreventivoEditModal
          title="Data preventivo"
          onClose={closeEdit}
          onConfirm={() => {
            setDataPreventivo(draftData);
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data</span>
            <input
              type="date"
              required
              value={draftData}
              onChange={(e) => setDraftData(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}

      {editKind === "destinatario" ? (
        <PreventivoDestinatarioModal
          value={destinatario}
          onChange={setDestinatario}
          onClose={closeEdit}
        />
      ) : null}

      {editKind === "prodotto" ? (
        <PreventivoAggiungiProdottoModal
          prodotti={prodotti}
          ready={ready}
          azienda={
            destinatario
              ? {
                  tipo:
                    destinatario.kind === "cliente"
                      ? "cliente"
                      : "cliente_possibile",
                  id: destinatario.id,
                }
              : null
          }
          escludiPreventivoId={preventivoId ?? null}
          initial={
            editing
              ? {
                  prodottoId: editing.prodottoId,
                  quantita: editing.quantita,
                  scontoExtraPct: editing.scontoExtraPct,
                  scontoListinoPct: editing.scontoListinoPct ?? 0,
                  scontoListinoStandardPct:
                    editing.scontoListinoStandardPct ??
                    editing.scontoListinoPct ??
                    0,
                  scontoListinoTarga: editing.scontoListinoTarga ?? "",
                  scontoSuddivisioneAttiva: Boolean(editing.scontoSuddivisioneAttiva),
                  scontoQuotaAziendaPct: editing.scontoQuotaAziendaPct ?? 0,
                  scontoQuotaCommercialePct: editing.scontoQuotaCommercialePct ?? 0,
                  confezioneValue:
                    editing.confezioneValue || CONFEZIONE_STANDARD,
                  confezionamento: editing.confezionamento,
                  imballaggioVoceId: editing.imballaggioVoceId,
                  prezzoUnitario: editing.prezzoUnitario,
                  ivaPercentuale: editing.ivaPercentuale,
                  listinoId: editing.listinoId,
                  prezzoDaListino: editing.prezzoDaListino,
                  unitaMisura: editing.unitaMisura,
                  disponibilita: editing.disponibilita,
                  blocco: editing.blocco,
                  ...campiAccordoRiga(editing),
                }
              : null
          }
          onClose={closeEdit}
          onConfirm={onConfirmProdotto}
        />
      ) : null}

      {editKind === "spedizione" ? (
        <PreventivoEditModal
          title="Spedizione e consegna"
          onClose={closeEdit}
          onConfirm={() => {
            if (
              draftConsegna !== "ritiro" &&
              draftPrezzoModo === "inserito" &&
              (draftNolo === "" || Number(draftNolo) <= 0)
            ) {
              setFormError("Inserisci l'importo della spedizione.");
              return;
            }
            setFormError(null);
            applyConsegna(draftConsegna, draftNolo, draftPrezzoModo);
            closeEdit();
          }}
        >
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Spedizione</legend>
            {(
              [
                "corriere_cliente",
                "corriere_nostro",
                "da_concordare",
                ...(draftConsegna === "ritiro" || consegnaMetodo === "ritiro"
                  ? (["ritiro"] as const)
                  : []),
              ] as const
            ).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="consegna-preventivo"
                  checked={draftConsegna === c}
                  onChange={() => setDraftConsegna(c)}
                />
                {PREVENTIVO_CONSEGNA_LABEL[c]}
              </label>
            ))}
          </fieldset>
          {draftConsegna !== "ritiro" ? (
            <fieldset className="space-y-2 text-sm">
              <legend className="mb-1 font-medium">Importo</legend>
              {MODI_PREZZO_SPEDIZIONE.map((modo) => (
                <label key={modo.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="modo-prezzo-spedizione"
                    checked={draftPrezzoModo === modo.id}
                    onChange={() => setDraftPrezzoModo(modo.id)}
                  />
                  {modo.label}
                </label>
              ))}
              {draftPrezzoModo === "inserito" ? (
                <label className="block pt-1">
                  <span className="mb-1 block font-medium">Importo spedizione (€)</span>
                  <ClearableNumberInput
                    min={0}
                    value={draftNolo}
                    onValueChange={setDraftNolo}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                  {draftConsegna === "corriere_nostro" ? (
                    <span className="mt-1 block text-xs text-slate-500">
                      In preventivo (+{SPEDIZIONE_MARKUP_SICUREZZA_PCT}%):{" "}
                      {draftNoloImporto ? `${euro(draftNoloImporto)} €` : "—"}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-slate-500">
                      L&apos;importo entra nel totale, senza maggiorazione.
                    </span>
                  )}
                </label>
              ) : null}
              {draftPrezzoModo === "richiesto" ? (
                <p className="text-xs text-slate-600">
                  Il preventivo si salva e passa a chi calcola il prezzo. La mail
                  parte solo dopo quel calcolo.
                </p>
              ) : null}
              {draftPrezzoModo === "in_fattura" ? (
                <p className="text-xs text-slate-600">
                  Nessuna cifra nel preventivo. In scheda e nella mail compare solo «
                  {voceSpedizionePreventivo(draftConsegna)}».
                </p>
              ) : null}
            </fieldset>
          ) : null}
        </PreventivoEditModal>
      ) : null}

      {editKind === "giorni" ? (
        <PreventivoEditModal
          title="Giorni di consegna"
          onClose={closeEdit}
          onConfirm={() => {
            setGiorniConsegna(draftGiorni.trim() || GIORNI_CONSEGNA_DEFAULT);
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Giorni di consegna</span>
            <input
              value={draftGiorni}
              onChange={(e) => setDraftGiorni(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}

      {editKind === "pagamento" ? (
        <PreventivoEditModal
          title="Modalità di pagamento"
          onClose={closeEdit}
          onConfirm={() => {
            setTipoPagamento(draftPagamento);
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Pagamento</span>
            <select
              value={draftPagamento}
              onChange={(e) =>
                setDraftPagamento(e.target.value as OrdineTipoPagamento)
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {ORDINE_TIPI_PAGAMENTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </PreventivoEditModal>
      ) : null}

      {editKind === "note" ? (
        <PreventivoEditModal
          title="Note"
          onClose={closeEdit}
          onConfirm={() => {
            setNote(draftNote.trim() || PREVENTIVO_NOTE_DEFAULT);
            closeEdit();
          }}
        >
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            rows={5}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </PreventivoEditModal>
      ) : null}

      {editKind === "totali" ? (
        <PreventivoEditModal
          title="Aliquota e validità"
          onClose={closeEdit}
          onConfirm={() => {
            const n = draftIva === "" ? PREVENTIVO_IVA_DEFAULT : draftIva;
            const v =
              draftValidita === ""
                ? PREVENTIVO_VALIDITA_GIORNI
                : draftValidita;
            setIvaDocumento(Math.min(100, Math.max(0, n)));
            setValiditaGiorni(Math.min(365, Math.max(1, Math.round(v))));
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Aliquota IVA (%)</span>
            <ClearableNumberInput
              min={0}
              max={100}
              value={draftIva}
              onValueChange={setDraftIva}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Validità preventivo (giorni)
            </span>
            <ClearableNumberInput
              min={1}
              max={365}
              value={draftValidita}
              onValueChange={setDraftValidita}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}

      {inviaOpen ? (
        <PreventivoEditModal
          title="Mail del preventivo"
          onClose={() => setInviaOpen(false)}
          confirmLabel={etichettaConfermaMail()}
          confirmDisabled={saving || preparazioneInvio != null}
          notice={mailError}
          onConfirm={() => {
            if (prezzoAcquirenteModo === "richiesto") {
              void onSalvaRichiestaCalcolo();
              return;
            }
            void onConfermaInvioProva();
          }}
        >
          <p className="text-sm font-medium text-slate-800">
            {linguaScelta && linguaScelta !== "it"
              ? `Invio in ${labelLingua(linguaScelta)}: la mail e il PDF partono in questa lingua.`
              : "Invio in italiano: la mail e il PDF restano il testo originale."}
          </p>
          {prezzoAcquirenteModo === "richiesto" ? (
            <p className="text-sm text-slate-600">
              La mail resta pronta. Parte solo quando chi calcola la spedizione
              inserisce l&apos;importo e completa.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              {PREVENTIVI_SESSIONE_PROVA
                ? "Conferma l'invio in sessione di prova: nessuna email reale parte."
                : "Salva e invia chiude la mail e il preventivo."}
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Casella</span>
            <select
              value={mailAccountId}
              onChange={(e) => setMailAccountId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {caselle.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.email})
                </option>
              ))}
            </select>
            {caselle.length === 0 ? (
              <span className="mt-1 block text-xs text-slate-500">
                Nessuna casella assegnata a questo operatore.
              </span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Destinatario</span>
            <input
              type="email"
              value={mailTo}
              onChange={(e) => setMailTo(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="email@cliente.it"
            />
          </label>
          {destinatario ? (
            <TraduciIntercomunicazione
              tipo={
                destinatario.kind === "possibile"
                  ? "cliente_possibile"
                  : "cliente"
              }
              id={destinatario.id}
              documento="mail"
              lingua={linguaScelta}
              nascondiSelettore
              testi={[
                { key: "oggetto", etichetta: "Oggetto", text: mailOggetto },
                { key: "corpo", etichetta: "Testo", text: mailTesto },
              ]}
              onApplica={(items, meta) => {
                const oggetto = items.find((item) => item.key === "oggetto");
                const corpo = items.find((item) => item.key === "corpo");
                const nextOggetto = oggetto?.text ?? mailOggetto;
                const nextTesto = corpo?.text ?? mailTesto;
                if (oggetto) setMailOggetto(oggetto.text);
                if (corpo) setMailTesto(corpo.text);
                if (meta?.lingua && meta.lingua !== "it") {
                  setMailLinguaApplicata(meta.lingua);
                  if (meta.modello) {
                    setModelloAi((current) => current ?? meta.modello);
                  }
                } else {
                  setMailLinguaApplicata("it");
                  bozzaMailItRef.current = {
                    oggetto: nextOggetto,
                    testo: nextTesto,
                  };
                }
              }}
            />
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Oggetto</span>
            <input
              value={mailOggetto}
              onChange={(e) => {
                const value = e.target.value;
                setMailOggetto(value);
                if (!mailLinguaApplicata || mailLinguaApplicata === "it") {
                  bozzaMailItRef.current = {
                    ...bozzaMailItRef.current,
                    oggetto: value,
                  };
                }
              }}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Testo</span>
            <textarea
              value={mailTesto}
              onChange={(e) => {
                const value = e.target.value;
                setMailTesto(value);
                if (!mailLinguaApplicata || mailLinguaApplicata === "it") {
                  bozzaMailItRef.current = {
                    ...bozzaMailItRef.current,
                    testo: value,
                  };
                }
              }}
              rows={5}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {modelloAi && linguaScelta && linguaScelta !== "it" ? (
            <p className="text-xs text-slate-600">
              In calce alla mail e sul PDF tradotto: {dicituraTradottoConAi(modelloAi)}
            </p>
          ) : null}
          <div className="border-t border-slate-200 pt-3">
            <img
              src={AGRINSICILIA_LETTERHEAD.logoSrc}
              alt={AGRINSICILIA_LETTERHEAD.logoAlt}
              className="h-14 w-auto"
            />
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-800">
              {AGRINSICILIA_MAIL_FIRMA}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              PDF
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">
                {nomeFilePreventivoPdf(numeroPreview)}
              </span>
              <span className="block text-xs text-slate-500">
                {PREVENTIVI_SESSIONE_PROVA
                  ? "Promemoria allegato. Il file non è ancora generato."
                  : (linguaScelta && linguaScelta !== "it"
                      ? `All'invio si allega il PDF in ${labelLingua(linguaScelta)}.`
                      : "All'invio si allega il PDF in italiano.")}
              </span>
            </span>
          </div>
          <div className="rounded border border-slate-200 px-3 py-2">
            <p className="text-sm font-medium text-slate-900">Altri allegati</p>
            <p className="mt-1 text-xs text-slate-500">
              PDF o immagini, massimo 8 file da 15 MB. Partono insieme al
              preventivo, anche se l&apos;invio aspetta il costo di spedizione.
            </p>
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              disabled={saving || preparazioneInvio != null}
              onChange={(e) => {
                aggiungiAllegatiMail(e.target.files);
                e.target.value = "";
              }}
              className="mt-2 block w-full text-sm"
            />
            {allegatiMail.length ? (
              <ul className="mt-2 space-y-1">
                {allegatiMail.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-red-700 underline"
                      onClick={() =>
                        setAllegatiMail((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Togli
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </PreventivoEditModal>
      ) : null}
      {scaricaAvviso ? (
        <PreventivoEditModal
          sopra
          title="Salva e scarica preventivo"
          confirmLabel="Conferma"
          confirmDisabled={saving || preparazioneInvio != null}
          onClose={() => setScaricaAvviso(false)}
          onConfirm={() => {
            void onConfermaScarica();
          }}
        >
          <p className="text-sm text-slate-800">
            Il preventivo verrà salvato come creato e sarà un preventivo a
            tutti gli effetti e con numero sequenziale, ti caricherai tu la
            responsabilità di inviarlo e di cliccare su preventivo inviato non
            appena lo avrai fatto.
          </p>
        </PreventivoEditModal>
      ) : null}
      <AziendaNoteBanner
        aziende={allertaAziende}
        emails={destinatario?.email ? [destinatario.email] : []}
      />
    </div>
  );
}
