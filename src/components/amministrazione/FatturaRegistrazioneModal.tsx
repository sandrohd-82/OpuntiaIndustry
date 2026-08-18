"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  createFatturaAction,
  getFatturaByIdAction,
  getProdottoPrezzoStoricoHintAction,
  getSpedizioneIvaStoricoHintAction,
  listDilazioniFatturaEmessaAction,
  listFattureEmesseClienteAction,
  previewNumeroInternoFatturaAction,
  updateFatturaAction,
  type DilazioneFatturaOption,
} from "@/app/actions/fatture";
import type { PendingFicInvoiceCandidate } from "@/app/actions/fatture-sync";
import { ApriFatturaFicActions } from "@/components/amministrazione/ApriFatturaFicButton";
import { CatalogoOffertaFormModal } from "@/components/amministrazione/CatalogoOffertaFormModal";
import { CodificaArticoloRevisioneModal } from "@/components/amministrazione/CodificaArticoloRevisioneModal";
import { CollegaArticoloModal } from "@/components/amministrazione/CollegaArticoloModal";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { FornitoreSelectField } from "@/components/amministrazione/FornitoreSelectField";
import { MateriaPrimaFormModal } from "@/components/amministrazione/MateriaPrimaFormModal";
import { NcPendingFatturaPickerModal } from "@/components/amministrazione/NcPendingFatturaPickerModal";
import { ProdottoPrezzoStoricoInfo } from "@/components/amministrazione/ProdottoPrezzoStoricoInfo";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import {
  createCatalogoProdottoFornitoreAction,
  createCatalogoServizioAction,
  listCatalogoProdottiFornitoreAction,
  listCatalogoServiziAction,
} from "@/app/actions/catalogo-offerta";
import {
  scanFatturaRigheCatalogoAction,
  type RigaCatalogoMatchHint,
} from "@/app/actions/catalogo-collega";
import {
  listCollegamentiByCodiciAction,
  type ArticoloRef,
} from "@/app/actions/catalogo-collegamenti";
import {
  createMateriaPrimaAction,
  listMateriePrimeAction,
} from "@/app/actions/materie-prime";
import { ArticoloCollegatiManageModal } from "@/components/amministrazione/ArticoloCollegatiManageModal";
import { ArticoloCollegatiNuvola } from "@/components/amministrazione/ArticoloCollegatiNuvola";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { CatalogoOffertaItem } from "@/lib/amministrazione/catalogo-offerta";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";
import {
  bilancioDilazioni,
  calcolaTotaliFattura,
  canFlagBeneAmmortizzabile,
  emptyFatturaDilazione,
  emptyFatturaRiga,
  emptyFatturaRigaNotaCredito,
  emptyFatturaRigaStorno,
  formatDateIt,
  formatEuro,
  importoRiga,
  isDilazioneFutura,
  isRigaStornoQuantita,
  normalizeDilazioneStato,
  normalizeQuantitaNegativa,
  normalizeQuantitaNotaCredito,
  normalizeQuantitaPositiva,
  prezzoScontatoUnitario,
  statoPagamentoFromDilazioni,
  statoPagamentoFromIncassoNc,
  todayIsoDate,
  type Fattura,
  type FatturaCollegabileOption,
  type FatturaDilazione,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import type {
  FatturaModalitaCollegamentoNc,
  FatturaNaturaDocumento,
  FatturaRimborsoMezzo,
  FatturaStatoIncassoNc,
  FatturaStatoPagamento,
} from "@/types/database";
import {
  fatturaDetailPath,
  prodottoStoricoKey,
  type ProdottoPrezzoStoricoHint,
  type SpedizioneIvaStoricoHint,
} from "@/lib/amministrazione/fatture-storico";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";

type EditableRiga = Omit<
  FatturaRiga,
  "quantita" | "prezzoUnitario" | "scontoPercentuale" | "ivaPercentuale"
> & {
  quantita: number | "";
  prezzoUnitario: number | "";
  scontoPercentuale: number | "";
  ivaPercentuale: number | "";
};

/** Catalogo acquisti per fatture ricevute (non prodotti Agrinsicilia). */
type VoceAcquisto = {
  kind: "servizio" | "prodotto" | "materia";
  id: string;
  codice: string;
  nome: string;
};

type EditableDilazione = Omit<FatturaDilazione, "importo"> & {
  importo: number | "";
};

export type FatturaRegistrazionePrefill = {
  anagraficaId?: string;
  anagraficaRagioneSociale?: string;
  anagraficaCodiceTarga?: string;
  dataEmissione?: string;
  numeroDocumentoEsterno?: string;
  ficId?: number | null;
  spedizione?: number;
  spedizioneIvaApplicata?: boolean;
  spedizioneSottraiIncassi?: boolean;
  ivaPercentuale?: number;
  statoPagamento?: FatturaStatoPagamento;
  naturaDocumento?: FatturaNaturaDocumento | null;
  statoIncassoNc?: FatturaStatoIncassoNc | null;
  rimborsoNecessario?: boolean | null;
  rimborsoMezzo?: FatturaRimborsoMezzo | null;
  fatturaCompensativaId?: string | null;
  collegaComeCompensativaNcId?: string | null;
  note?: string;
  fatturaCollegataId?: string | null;
  riferimentoFatturaEsterno?: string;
  dilazioniAnnullateIds?: string[];
  righe?: FatturaRiga[];
  lockAnagrafica?: boolean;
};

type Props = {
  kind: FatturaKind;
  onClose: () => void;
  onSaved: (fattura: Fattura) => void;
  /** Durante sync: interrompe la coda senza chiudere come “salta documento”. */
  onPause?: () => void;
  prefill?: FatturaRegistrazionePrefill | null;
  /** Modifica documento esistente (numero interno invariato). */
  initial?: Fattura | null;
  elevated?: boolean;
  /** Sopra un’altra modale fattura (es. registrazione fattura da NC). */
  stackTop?: boolean;
};

function seedFromInitialOrPrefill(
  initial: Fattura | null | undefined,
  prefill: FatturaRegistrazionePrefill | null
): FatturaRegistrazionePrefill {
  if (initial) {
    return {
      anagraficaId: initial.anagraficaId || undefined,
      anagraficaRagioneSociale: initial.anagraficaRagioneSociale,
      anagraficaCodiceTarga: initial.anagraficaCodiceTarga,
      dataEmissione: initial.dataEmissione,
      numeroDocumentoEsterno: initial.numeroDocumentoEsterno,
      ficId: initial.ficId,
      spedizione: Math.abs(initial.spedizione),
      spedizioneIvaApplicata: initial.spedizioneIvaApplicata,
      spedizioneSottraiIncassi: initial.spedizioneSottraiIncassi,
      ivaPercentuale: initial.ivaPercentuale,
      statoPagamento: initial.statoPagamento,
      naturaDocumento: initial.naturaDocumento,
      statoIncassoNc: initial.statoIncassoNc,
      rimborsoNecessario: initial.rimborsoNecessario,
      rimborsoMezzo: initial.rimborsoMezzo,
      fatturaCompensativaId: initial.fatturaCompensativaId,
      note: initial.note,
      fatturaCollegataId: initial.fatturaCollegataId,
      riferimentoFatturaEsterno: initial.riferimentoFatturaEsterno,
      righe: initial.righe ?? [],
      lockAnagrafica: true,
    };
  }
  return prefill ?? {};
}

function asEditableRiga(r: FatturaRiga): EditableRiga {
  return {
    ...r,
    quantita: r.quantita,
    unitaMisura: r.unitaMisura || "NR",
    prezzoUnitario: r.prezzoUnitario,
    scontoPercentuale: r.scontoPercentuale ?? 0,
    ivaPercentuale: r.ivaPercentuale ?? 22,
  };
}

function toEditableRighe(
  source: FatturaRiga[] | undefined,
  kind: FatturaKind
): EditableRiga[] {
  if (source?.length) {
    return source.map((r) => {
      const qty =
        kind === "nota_credito"
          ? normalizeQuantitaNotaCredito(r.quantita)
          : r.quantita;
      const scontoPercentuale = r.scontoPercentuale ?? 0;
      const prezzoUnitario = Math.abs(r.prezzoUnitario);
      return asEditableRiga({
        ...r,
        quantita: qty,
        prezzoUnitario,
        scontoPercentuale,
        importo: importoRiga(qty, prezzoUnitario, scontoPercentuale),
      });
    });
  }
  return [
    asEditableRiga(
      kind === "nota_credito" ? emptyFatturaRigaNotaCredito() : emptyFatturaRiga()
    ),
  ];
}

export function FatturaRegistrazioneModal({
  kind,
  onClose,
  onSaved,
  onPause,
  prefill = null,
  initial = null,
  elevated = false,
  stackTop = false,
}: Props) {
  const titleId = useId();
  const isEdit = Boolean(initial?.id);
  const seed = seedFromInitialOrPrefill(initial, prefill);
  const { prodotti, addProdotto, refresh } = useProdottiPropri();
  const isRicevuta = kind === "ricevuta";
  const [vociAcquisto, setVociAcquisto] = useState<VoceAcquisto[]>([]);
  const [catalogServizi, setCatalogServizi] = useState<CatalogoOffertaItem[]>(
    []
  );
  const [catalogProdottiFornitore, setCatalogProdottiFornitore] = useState<
    CatalogoOffertaItem[]
  >([]);
  const [catalogMaterie, setCatalogMaterie] = useState<MateriaPrima[]>([]);
  const [creatingAcquistoKind, setCreatingAcquistoKind] = useState<
    "servizio" | "prodotto" | "materia" | null
  >(null);
  const [codificaRiga, setCodificaRiga] = useState<{
    index: number;
    kind: "servizio" | "prodotto" | "materia";
  } | null>(null);
  const [collegaRigaIndex, setCollegaRigaIndex] = useState<number | null>(null);
  const [matchHints, setMatchHints] = useState<
    Record<string, RigaCatalogoMatchHint>
  >({});
  const [matchScanPending, setMatchScanPending] = useState(false);
  const [collegatiByCodice, setCollegatiByCodice] = useState<
    Record<string, ArticoloRef[]>
  >({});
  const [linkingArticolo, setLinkingArticolo] = useState<{
    kind: "servizio" | "prodotto" | "materia";
    id: string;
    codice: string;
    nome: string;
  } | null>(null);
  const [anagraficaId, setAnagraficaId] = useState(seed.anagraficaId ?? "");
  const [anagraficaRagioneSociale, setAnagraficaRagioneSociale] = useState(
    seed.anagraficaRagioneSociale ?? ""
  );
  const [anagraficaCodiceTarga, setAnagraficaCodiceTarga] = useState(
    seed.anagraficaCodiceTarga ?? ""
  );
  const [dataEmissione, setDataEmissione] = useState(
    seed.dataEmissione || new Date().toISOString().slice(0, 10)
  );
  const [numeroDocumentoEsterno, setNumeroDocumentoEsterno] = useState(
    seed.numeroDocumentoEsterno ?? ""
  );
  const [spedizione, setSpedizione] = useState<number | "">(
    seed.spedizione ?? 0
  );
  const [spedizioneIvaApplicata, setSpedizioneIvaApplicata] = useState(
    seed.spedizioneIvaApplicata ?? false
  );
  const [spedizioneSottraiIncassi, setSpedizioneSottraiIncassi] = useState(
    seed.spedizioneSottraiIncassi ?? true
  );
  const [ivaPercentuale, setIvaPercentuale] = useState<number | "">(
    seed.ivaPercentuale ?? 22
  );
  const isNc = kind === "nota_credito";
  const [statoIncassoNc, setStatoIncassoNc] = useState<FatturaStatoIncassoNc>(
    seed.statoIncassoNc ??
      (seed.statoPagamento === "pagato" ? "gia_incassata" : "non_incassata")
  );
  const [statoPagamento, setStatoPagamento] = useState<FatturaStatoPagamento>(
    seed.statoPagamento ?? (isRicevuta ? "pagato" : "da_pagare")
  );
  const [naturaDocumento, setNaturaDocumento] =
    useState<FatturaNaturaDocumento>(
      seed.naturaDocumento === "acconto" ? "acconto" : "saldo"
    );
  const [totaleManuale, setTotaleManuale] = useState(
    Boolean(initial?.totaleManuale)
  );
  const [totaleEditUnlocked, setTotaleEditUnlocked] = useState(
    Boolean(initial?.totaleManuale)
  );
  const [totaleOverride, setTotaleOverride] = useState<number | "">(
    initial?.totaleManuale ? initial.totale : ""
  );
  const [rimborsoNecessario, setRimborsoNecessario] = useState(
    seed.rimborsoNecessario ?? false
  );
  const [rimborsoMezzo, setRimborsoMezzo] = useState<FatturaRimborsoMezzo | "">(
    seed.rimborsoMezzo ?? ""
  );
  const [fatturaCompensativaId, setFatturaCompensativaId] = useState(
    seed.fatturaCompensativaId ?? ""
  );
  const [fatturaCollegataId, setFatturaCollegataId] = useState(
    seed.fatturaCollegataId ?? ""
  );
  const [modalitaCollegamento, setModalitaCollegamento] =
    useState<FatturaModalitaCollegamentoNc>(
      initial?.modalitaCollegamento ??
        (prefill as { modalitaCollegamento?: FatturaModalitaCollegamentoNc })
          ?.modalitaCollegamento ??
        "normale"
    );
  const [fatturaSostitutivaId, setFatturaSostitutivaId] = useState(
    initial?.fatturaSostitutivaId ?? ""
  );
  const [pendingPickerTarget, setPendingPickerTarget] = useState<
    "collegata" | "sostitutiva"
  >("collegata");
  const [riferimentoFatturaEsterno, setRiferimentoFatturaEsterno] = useState(
    seed.riferimentoFatturaEsterno ?? ""
  );
  const [fattureCollegabili, setFattureCollegabili] = useState<
    FatturaCollegabileOption[]
  >([]);
  const [dilazioniCollegate, setDilazioniCollegate] = useState<
    DilazioneFatturaOption[]
  >([]);
  const [dilazioniAnnullateIds, setDilazioniAnnullateIds] = useState<string[]>(
    seed.dilazioniAnnullateIds ?? []
  );
  const [note, setNote] = useState(seed.note ?? "");
  const [righe, setRighe] = useState<EditableRiga[]>(() =>
    toEditableRighe(seed.righe, kind)
  );
  const [ricevuta, setRicevuta] = useState<File | null>(null);
  const [numeroInterno, setNumeroInterno] = useState(
    initial?.numeroInterno ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(isEdit);
  const [formError, setFormError] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<Fattura | null>(
    initial ?? null
  );
  const [creatingProdotto, setCreatingProdotto] = useState(false);
  const [rigaIndexForNuovo, setRigaIndexForNuovo] = useState<number | null>(
    null
  );
  const [spedizioneIvaHint, setSpedizioneIvaHint] =
    useState<SpedizioneIvaStoricoHint | null>(null);
  const [prezzoHints, setPrezzoHints] = useState<
    Record<string, ProdottoPrezzoStoricoHint>
  >({});
  const [dilazioni, setDilazioni] = useState<EditableDilazione[]>(() =>
    (initial?.dilazioni ?? []).map((d) => ({
      ...d,
      importo: d.importo,
    }))
  );
  const [showPendingPicker, setShowPendingPicker] = useState(false);
  const [pendingInvoiceToRegister, setPendingInvoiceToRegister] =
    useState<PendingFicInvoiceCandidate | null>(null);

  const totals = useMemo(
    () =>
      calcolaTotaliFattura({
        righe: righe.map((r) => ({
          quantita: numberOrZero(r.quantita),
          prezzoUnitario: numberOrZero(r.prezzoUnitario),
          scontoPercentuale: numberOrZero(r.scontoPercentuale),
          // Non usare `|| fallback`: IVA 0% diventerebbe 22%
          ivaPercentuale: isRicevuta
            ? numberOrZero(
                r.ivaPercentuale === "" || r.ivaPercentuale == null
                  ? 0
                  : r.ivaPercentuale
              )
            : numberOrZero(r.ivaPercentuale || ivaPercentuale),
        })),
        spedizione: numberOrZero(spedizione),
        spedizioneIvaApplicata,
        spedizioneSottraiIncassi: isNc ? spedizioneSottraiIncassi : true,
        notaCredito: isNc,
        ivaPercentuale: isRicevuta ? 0 : numberOrZero(ivaPercentuale),
        ivaPerRiga: isRicevuta,
      }),
    [
      righe,
      spedizione,
      spedizioneIvaApplicata,
      spedizioneSottraiIncassi,
      ivaPercentuale,
      isNc,
      isRicevuta,
    ]
  );

  const totaleEffettivo = useMemo(() => {
    if (
      isRicevuta &&
      totaleManuale &&
      totaleOverride !== "" &&
      Number.isFinite(Number(totaleOverride))
    ) {
      return Math.abs(Number(totaleOverride));
    }
    return totals.totale;
  }, [isRicevuta, totaleManuale, totaleOverride, totals.totale]);

  const dilazioniNormalizzate = useMemo(
    () =>
      dilazioni.map((d) => ({
        dataScadenza: d.dataScadenza || todayIsoDate(),
        importo: numberOrZero(d.importo),
        statoPagamento: normalizeDilazioneStato(
          d.dataScadenza || todayIsoDate(),
          d.statoPagamento
        ),
        note: d.note ?? "",
      })),
    [dilazioni]
  );

  const statoDaDilazioni =
    dilazioniNormalizzate.length > 0
      ? statoPagamentoFromDilazioni(dilazioniNormalizzate)
      : null;

  const dilazioniBilancio = useMemo(
    () =>
      bilancioDilazioni(
        totaleEffettivo,
        dilazioniNormalizzate.map((d) => d.importo)
      ),
    [totaleEffettivo, dilazioniNormalizzate]
  );

  useEffect(() => {
    if (isNc) return;
    if (statoDaDilazioni && statoDaDilazioni !== statoPagamento) {
      setStatoPagamento(statoDaDilazioni);
    }
  }, [statoDaDilazioni, statoPagamento, isNc]);

  const isSostituzione =
    isNc && modalitaCollegamento === "sostituzione";

  useEffect(() => {
    if (!isNc || isSostituzione) return;
    setStatoPagamento(statoPagamentoFromIncassoNc(statoIncassoNc));
  }, [isNc, statoIncassoNc, isSostituzione]);

  useEffect(() => {
    if (!isSostituzione) return;
    setStatoPagamento("pagato");
    setRimborsoNecessario(false);
    setRimborsoMezzo("");
    setFatturaCompensativaId("");
    setDilazioniAnnullateIds([]);
  }, [isSostituzione]);

  useEffect(() => {
    // Escape / click fuori non chiudono (evita perdita dati): solo Pausa / Annulla / Salva.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function applyDocumento(doc: Fattura) {
    setEditSnapshot(doc);
    setAnagraficaId(doc.anagraficaId || "");
    setAnagraficaRagioneSociale(doc.anagraficaRagioneSociale || "");
    setAnagraficaCodiceTarga(doc.anagraficaCodiceTarga || "");
    setDataEmissione(doc.dataEmissione);
    setNumeroDocumentoEsterno(doc.numeroDocumentoEsterno || "");
    setSpedizione(Math.abs(doc.spedizione) || 0);
    setSpedizioneIvaApplicata(Boolean(doc.spedizioneIvaApplicata));
    setSpedizioneSottraiIncassi(doc.spedizioneSottraiIncassi !== false);
    setIvaPercentuale(doc.ivaPercentuale ?? 22);
    setStatoPagamento(doc.statoPagamento);
    setNaturaDocumento(
      doc.naturaDocumento === "acconto" ? "acconto" : "saldo"
    );
    setTotaleManuale(Boolean(doc.totaleManuale));
    setTotaleEditUnlocked(Boolean(doc.totaleManuale));
    setTotaleOverride(doc.totaleManuale ? doc.totale : "");
    setStatoIncassoNc(
      doc.statoIncassoNc ??
        (doc.statoPagamento === "pagato" ? "gia_incassata" : "non_incassata")
    );
    setRimborsoNecessario(Boolean(doc.rimborsoNecessario));
    setRimborsoMezzo(doc.rimborsoMezzo ?? "");
    setFatturaCompensativaId(doc.fatturaCompensativaId ?? "");
    setFatturaCollegataId(doc.fatturaCollegataId ?? "");
    setModalitaCollegamento(doc.modalitaCollegamento ?? "normale");
    setFatturaSostitutivaId(doc.fatturaSostitutivaId ?? "");
    setRiferimentoFatturaEsterno(doc.riferimentoFatturaEsterno || "");
    setNote(doc.note || "");
    setNumeroInterno(doc.numeroInterno);
    setRighe(toEditableRighe(doc.righe, doc.kind));
    setDilazioni(
      (doc.dilazioni ?? []).map((d) => ({
        ...d,
        importo: d.importo,
      }))
    );
    // Opzioni select collegamento: includi subito le fatture già collegate
    const extras: FatturaCollegabileOption[] = [];
    if (doc.fatturaCollegataId) {
      extras.push({
        id: doc.fatturaCollegataId,
        numeroInterno: doc.fatturaCollegataNumeroInterno || "Fattura collegata",
        dataEmissione: "",
        totale: 0,
        label:
          doc.fatturaCollegataNumeroInterno ||
          doc.riferimentoFatturaEsterno ||
          "Fattura collegata",
      });
    }
    if (doc.fatturaSostitutivaId) {
      extras.push({
        id: doc.fatturaSostitutivaId,
        numeroInterno:
          doc.fatturaSostitutivaNumeroInterno || "Fattura sostitutiva",
        dataEmissione: "",
        totale: 0,
        label:
          doc.fatturaSostitutivaNumeroInterno || "Fattura di rimpiazzo",
      });
    }
    if (extras.length > 0) {
      setFattureCollegabili((prev) => {
        const byId = new Map(prev.map((f) => [f.id, f]));
        for (const e of extras) {
          if (!byId.has(e.id)) byId.set(e.id, e);
        }
        return [...byId.values()];
      });
    }
  }

  // Modifica: ricarica documento completo (righe, collegamenti) e idrata il form
  useEffect(() => {
    if (!isEdit || !initial?.id) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    // Applica subito i dati già in memoria (evita form vuoto durante fetch)
    applyDocumento(initial);
    void (async () => {
      const res = await getFatturaByIdAction(initial.kind, initial.id);
      if (cancelled) return;
      if (res.success) {
        applyDocumento(res.fattura);
      } else {
        setFormError(
          `Impossibile ricaricare il documento: ${res.error}. Uso i dati già aperti.`
        );
      }
      setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura modale
  }, [isEdit, initial?.id]);

  useEffect(() => {
    if (!isRicevuta) {
      setVociAcquisto([]);
      setCatalogServizi([]);
      setCatalogProdottiFornitore([]);
      setCatalogMaterie([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [serviziRes, prodottiRes, materieRes] = await Promise.all([
        listCatalogoServiziAction(),
        listCatalogoProdottiFornitoreAction(),
        listMateriePrimeAction(),
      ]);
      if (cancelled) return;
      const servizi = serviziRes.success ? serviziRes.items : [];
      const prodottiF = prodottiRes.success ? prodottiRes.items : [];
      const materie = materieRes.success ? materieRes.materie : [];
      setCatalogServizi(servizi);
      setCatalogProdottiFornitore(prodottiF);
      setCatalogMaterie(materie);
      setVociAcquisto([
        ...servizi.map(
          (i): VoceAcquisto => ({
            kind: "servizio",
            id: i.id,
            codice: i.codice,
            nome: i.nome,
          })
        ),
        ...prodottiF.map(
          (i): VoceAcquisto => ({
            kind: "prodotto",
            id: i.id,
            codice: i.codice,
            nome: i.nome,
          })
        ),
        ...materie.map(
          (i): VoceAcquisto => ({
            kind: "materia",
            id: i.id,
            codice: i.codice,
            nome: i.nome,
          })
        ),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isRicevuta]);

  /** Scan automatico descrizione ↔ catalogo (solo suggerimenti, nessuna auto-associazione). */
  useEffect(() => {
    if (!isRicevuta) {
      setMatchHints({});
      return;
    }
    if (vociAcquisto.length === 0 && righe.length === 0) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setMatchScanPending(true);
      void (async () => {
        const res = await scanFatturaRigheCatalogoAction({
          fornitoreId: anagraficaId || null,
          sameInvoiceCodici: righe
            .map((r) => r.codice)
            .filter((c) => Boolean(c?.trim()) && c !== "—"),
          codicePending: initial?.codiceCatalogoPending ?? null,
          catalogCodiciValidi: vociAcquisto.map((v) => v.codice),
          righe: righe.map((r, i) => ({
            key: String(i),
            descrizione: r.descrizione ?? "",
            codice: r.codice ?? "",
          })),
        });
        if (cancelled) return;
        setMatchScanPending(false);
        if (!res.success) {
          setMatchHints({});
          return;
        }
        const next: Record<string, RigaCatalogoMatchHint> = {};
        for (const h of res.hints) next[h.key] = h;
        setMatchHints(next);
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    isRicevuta,
    anagraficaId,
    vociAcquisto,
    righe,
    initial?.codiceCatalogoPending,
  ]);

  /** Carica legami articolo↔articolo per le targhe sulle righe (nuvola in fattura). */
  useEffect(() => {
    if (!isRicevuta) {
      setCollegatiByCodice({});
      return;
    }
    const codes = [
      ...new Set(
        righe
          .map((r) => (r.codice ?? "").trim())
          .filter((c) => c && c !== "—")
      ),
    ];
    if (codes.length === 0) {
      setCollegatiByCodice({});
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await listCollegamentiByCodiciAction(codes);
        if (cancelled) return;
        if (res.success) setCollegatiByCodice(res.byCodice);
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isRicevuta, righe]);

  useEffect(() => {
    if (!isNc || !anagraficaId) {
      if (!isEdit) setFattureCollegabili([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await listFattureEmesseClienteAction({
        clienteId: anagraficaId,
        excludeId: isEdit ? initial?.id : null,
      });
      if (cancelled) return;
      if (res.success) {
        setFattureCollegabili((prev) => {
          const byId = new Map(res.fatture.map((f) => [f.id, f]));
          // Mantieni opzioni già collegate se assenti dalla lista
          for (const p of prev) {
            if (!byId.has(p.id)) byId.set(p.id, p);
          }
          if (editSnapshot?.fatturaCollegataId && !byId.has(editSnapshot.fatturaCollegataId)) {
            byId.set(editSnapshot.fatturaCollegataId, {
              id: editSnapshot.fatturaCollegataId,
              numeroInterno:
                editSnapshot.fatturaCollegataNumeroInterno ||
                "Fattura collegata",
              dataEmissione: "",
              totale: 0,
              label:
                editSnapshot.fatturaCollegataNumeroInterno ||
                editSnapshot.riferimentoFatturaEsterno ||
                "Fattura collegata",
            });
          }
          if (
            editSnapshot?.fatturaSostitutivaId &&
            !byId.has(editSnapshot.fatturaSostitutivaId)
          ) {
            byId.set(editSnapshot.fatturaSostitutivaId, {
              id: editSnapshot.fatturaSostitutivaId,
              numeroInterno:
                editSnapshot.fatturaSostitutivaNumeroInterno ||
                "Fattura sostitutiva",
              dataEmissione: "",
              totale: 0,
              label:
                editSnapshot.fatturaSostitutivaNumeroInterno ||
                "Fattura di rimpiazzo",
            });
          }
          return [...byId.values()];
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNc, anagraficaId, isEdit, initial?.id, editSnapshot]);

  useEffect(() => {
    if (!isNc || isSostituzione || !fatturaCollegataId) {
      setDilazioniCollegate([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await listDilazioniFatturaEmessaAction(fatturaCollegataId);
      if (cancelled) return;
      if (res.success) setDilazioniCollegate(res.dilazioni);
      else setDilazioniCollegate([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNc, isSostituzione, fatturaCollegataId]);

  useEffect(() => {
    if (isEdit) {
      setNumeroInterno(initial?.numeroInterno ?? "");
      return;
    }
    if (!anagraficaId || !anagraficaCodiceTarga || !dataEmissione) {
      setNumeroInterno("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await previewNumeroInternoFatturaAction({
        kind,
        anagraficaId,
        codiceTarga: anagraficaCodiceTarga,
        dataEmissione,
      });
      if (cancelled) return;
      if (res.success) setNumeroInterno(res.numeroInterno);
      else setNumeroInterno("");
    })();
    return () => {
      cancelled = true;
    };
  }, [
    kind,
    anagraficaId,
    anagraficaCodiceTarga,
    dataEmissione,
    isEdit,
    initial?.numeroInterno,
  ]);

  useEffect(() => {
    if (!anagraficaId) {
      setSpedizioneIvaHint(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getSpedizioneIvaStoricoHintAction({
        kind,
        anagraficaId,
      });
      if (cancelled) return;
      if (res.success) setSpedizioneIvaHint(res.hint);
      else setSpedizioneIvaHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, anagraficaId]);

  const prodottoKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of righe) {
      const k = prodottoStoricoKey({
        prodottoId: r.prodottoId,
        codice: r.codice,
      });
      if (k) keys.add(k);
    }
    return [...keys].sort().join("|");
  }, [righe]);

  useEffect(() => {
    if (!anagraficaId || !prodottoKeys) {
      setPrezzoHints({});
      return;
    }
    let cancelled = false;
    const rows = righe
      .map((r) => ({
        key: prodottoStoricoKey({
          prodottoId: r.prodottoId,
          codice: r.codice,
        }),
        prodottoId: r.prodottoId,
        codice: r.codice,
      }))
      .filter((r): r is typeof r & { key: string } => Boolean(r.key));

    const unique = new Map<string, { prodottoId: string | null; codice: string }>();
    for (const r of rows) {
      if (!unique.has(r.key)) {
        unique.set(r.key, {
          prodottoId: r.prodottoId,
          codice: r.codice,
        });
      }
    }

    void (async () => {
      const next: Record<string, ProdottoPrezzoStoricoHint> = {};
      await Promise.all(
        [...unique.entries()].map(async ([key, ref]) => {
          const res = await getProdottoPrezzoStoricoHintAction({
            kind,
            anagraficaId,
            prodottoId: ref.prodottoId,
            codice: ref.codice,
          });
          if (res.success) next[key] = res.hint;
        })
      );
      if (!cancelled) setPrezzoHints(next);
    })();

    return () => {
      cancelled = true;
    };
    // prodottoKeys riassume le chiavi prodotto delle righe
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intenzionale: evita refetch a ogni keystroke numerico
  }, [kind, anagraficaId, prodottoKeys]);

  function patchRiga(index: number, patch: Partial<EditableRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        next.importo = importoRiga(
          numberOrZero(next.quantita),
          numberOrZero(next.prezzoUnitario),
          numberOrZero(next.scontoPercentuale)
        );
        if (!canFlagBeneAmmortizzabile(numberOrZero(next.prezzoUnitario))) {
          next.isBeneAmmortizzabile = false;
        }
        return next;
      })
    );
  }

  function applyProdotto(index: number, prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    const current = righe[index];
    const keepDesc = (current?.descrizione ?? "").trim();
    if (!p) {
      patchRiga(index, { prodottoId: null });
      return;
    }
    patchRiga(index, {
      prodottoId: p.id,
      codice: p.codice,
      // Non sovrascrivere la descrizione già presa dalla fattura/XML
      ...(keepDesc ? {} : { descrizione: p.nome }),
    });
  }

  function applyVoceAcquisto(index: number, codice: string) {
    const v = vociAcquisto.find((x) => x.codice === codice);
    const current = righe[index];
    const keepDesc = (current?.descrizione ?? "").trim();
    if (!v) {
      // Deselezione: togli solo il collegamento, non la descrizione fattura
      patchRiga(index, { prodottoId: null, codice: keepDesc ? "—" : "" });
      return;
    }
    patchRiga(index, {
      prodottoId: null,
      codice: v.codice,
      ...(keepDesc ? {} : { descrizione: v.nome }),
    });
  }

  async function refreshVociAcquisto() {
    const [serviziRes, prodottiRes, materieRes] = await Promise.all([
      listCatalogoServiziAction(),
      listCatalogoProdottiFornitoreAction(),
      listMateriePrimeAction(),
    ]);
    const servizi = serviziRes.success ? serviziRes.items : [];
    const prodottiF = prodottiRes.success ? prodottiRes.items : [];
    const materie = materieRes.success ? materieRes.materie : [];
    setCatalogServizi(servizi);
    setCatalogProdottiFornitore(prodottiF);
    setCatalogMaterie(materie);
    setVociAcquisto([
      ...servizi.map(
        (i): VoceAcquisto => ({
          kind: "servizio",
          id: i.id,
          codice: i.codice,
          nome: i.nome,
        })
      ),
      ...prodottiF.map(
        (i): VoceAcquisto => ({
          kind: "prodotto",
          id: i.id,
          codice: i.codice,
          nome: i.nome,
        })
      ),
      ...materie.map(
        (i): VoceAcquisto => ({
          kind: "materia",
          id: i.id,
          codice: i.codice,
          nome: i.nome,
        })
      ),
    ]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!anagraficaId) {
      setFormError(
        kind === "ricevuta"
          ? "Seleziona un fornitore (intestazione)."
          : "Seleziona un cliente (intestazione)."
      );
      return;
    }
    if (
      isRicevuta &&
      righe.some((r) => {
        const c = String(r.codice ?? "").trim();
        return !c || c === "—";
      })
    ) {
      setFormError(
        "Assegna il codice interno Opuntia a ogni riga (la descrizione resta quella della fattura)."
      );
      return;
    }
    if (isNc && !fatturaCollegataId) {
      setFormError("Seleziona la fattura collegata alla nota di credito.");
      return;
    }
    if (isSostituzione && !fatturaSostitutivaId) {
      setFormError("Seleziona la fattura sostitutiva (rimpiazzo gestionale).");
      return;
    }
    if (
      isSostituzione &&
      fatturaSostitutivaId &&
      fatturaSostitutivaId === fatturaCollegataId
    ) {
      setFormError(
        "La fattura sostitutiva deve essere diversa da quella stornata."
      );
      return;
    }
    if (
      isNc &&
      !isSostituzione &&
      statoIncassoNc === "gia_incassata" &&
      rimborsoNecessario &&
      !rimborsoMezzo
    ) {
      setFormError("Seleziona il mezzo di rimborso.");
      return;
    }
    if (
      !isNc &&
      dilazioniNormalizzate.length > 0 &&
      !dilazioniBilancio.equilibrato
    ) {
      if (dilazioniBilancio.mancante > 0) {
        setFormError(
          `Dilazioni incomplete: manca ${formatEuro(dilazioniBilancio.mancante)} rispetto al totale fattura (${formatEuro(dilazioniBilancio.totaleFattura)}).`
        );
      } else {
        setFormError(
          `Dilazioni in esubero di ${formatEuro(dilazioniBilancio.esubero)} rispetto al totale fattura (${formatEuro(dilazioniBilancio.totaleFattura)}).`
        );
      }
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const fd = new FormData();
      const righePayload: FatturaRiga[] = righe.map((r) => {
        const scontoPercentuale = numberOrZero(r.scontoPercentuale);
        const quantita = isNc
          ? normalizeQuantitaNotaCredito(numberOrZero(r.quantita))
          : numberOrZero(r.quantita);
        const prezzoUnitario = Math.abs(numberOrZero(r.prezzoUnitario));
        return {
          ...r,
          quantita,
          unitaMisura: (r.unitaMisura || "NR").trim() || "NR",
          prezzoUnitario,
          scontoPercentuale,
          ivaPercentuale: isRicevuta
            ? numberOrZero(
                r.ivaPercentuale === "" || r.ivaPercentuale == null
                  ? 0
                  : r.ivaPercentuale
              )
            : undefined,
          importo: importoRiga(quantita, prezzoUnitario, scontoPercentuale),
        };
      });
      fd.set(
        "payload",
        JSON.stringify({
          anagraficaId,
          anagraficaRagioneSociale,
          anagraficaCodiceTarga,
          dataEmissione,
          numeroDocumentoEsterno,
          ficId: editSnapshot?.ficId ?? seed.ficId ?? prefill?.ficId ?? null,
          spedizione: Math.abs(numberOrZero(spedizione)),
          spedizioneIvaApplicata,
          spedizioneSottraiIncassi: isNc ? spedizioneSottraiIncassi : true,
          ivaPercentuale: isRicevuta
            ? totals.ivaPercentualePrevalente
            : numberOrZero(ivaPercentuale),
          totaleManuale: isRicevuta ? totaleManuale : false,
          totaleOverride:
            isRicevuta && totaleManuale
              ? numberOrZero(totaleOverride)
              : null,
          statoPagamento: isSostituzione
            ? "pagato"
            : isNc
              ? statoPagamentoFromIncassoNc(statoIncassoNc)
              : dilazioniNormalizzate.length > 0
                ? statoPagamentoFromDilazioni(dilazioniNormalizzate)
                : statoPagamento,
          naturaDocumento: isRicevuta ? naturaDocumento : null,
          statoIncassoNc:
            isNc && !isSostituzione ? statoIncassoNc : null,
          rimborsoNecessario:
            isNc &&
            !isSostituzione &&
            statoIncassoNc === "gia_incassata"
              ? rimborsoNecessario
              : null,
          rimborsoMezzo:
            isNc &&
            !isSostituzione &&
            statoIncassoNc === "gia_incassata" &&
            rimborsoNecessario
              ? rimborsoMezzo || null
              : null,
          fatturaCompensativaId:
            isNc &&
            !isSostituzione &&
            rimborsoMezzo === "nuova_fattura"
              ? fatturaCompensativaId || null
              : null,
          modalitaCollegamento: isNc ? modalitaCollegamento : null,
          fatturaSostitutivaId: isSostituzione
            ? fatturaSostitutivaId || null
            : null,
          dilazioniAnnullateIds:
            isNc && !isSostituzione ? dilazioniAnnullateIds : [],
          collegaComeCompensativaNcId:
            prefill?.collegaComeCompensativaNcId ?? null,
          note,
          fatturaCollegataId: isNc ? fatturaCollegataId || null : null,
          riferimentoFatturaEsterno: isNc ? riferimentoFatturaEsterno : "",
          righe: righePayload,
          dilazioni: isNc ? [] : dilazioniNormalizzate,
        })
      );
      if (ricevuta) fd.set("ricevuta", ricevuta);
      const result =
        isEdit && initial?.id
          ? await updateFatturaAction(kind, initial.id, fd)
          : await createFatturaAction(kind, fd);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      onSaved(result.fattura);
    } finally {
      setSaving(false);
    }
  }

  const title = isEdit
    ? kind === "nota_credito"
      ? `Modifica nota di credito ${initial?.numeroInterno ?? ""}`
      : kind === "emessa"
        ? `Modifica fattura emessa ${initial?.numeroInterno ?? ""}`
        : `Modifica fattura ricevuta ${initial?.numeroInterno ?? ""}`
    : kind === "nota_credito"
      ? "Registrazione nota di credito"
      : kind === "emessa"
        ? "Registrazione fattura emessa"
        : "Registrazione fattura ricevuta";

  const zLayer = stackTop ? "z-[95]" : elevated ? "z-[80]" : "z-[60]";

  const dialog = (
    <div
      data-nested-modal={elevated || stackTop ? "fattura" : undefined}
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 sm:py-12 ${zLayer}`}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[85vw] max-w-[85vw] rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isEdit
                ? "Modifica del documento già registrato. I campi sono precompilati dai dati salvati."
                : kind === "nota_credito"
                  ? "Registrazione nota di credito nello storico (storno/annullamento). Apri il PDF FiC per verifica."
                  : "Registrazione nello storico. Non è una fattura da inviare."}
            </p>
            {(seed.riferimentoFatturaEsterno ||
              prefill?.riferimentoFatturaEsterno) &&
            isNc ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Riferimento fattura:{" "}
                <strong>
                  {riferimentoFatturaEsterno ||
                    seed.riferimentoFatturaEsterno ||
                    prefill?.riferimentoFatturaEsterno}
                </strong>
              </p>
            ) : null}
          </div>
          {(editSnapshot?.ficId ?? seed.ficId ?? prefill?.ficId) ? (
            <ApriFatturaFicActions
              kind={kind}
              ficId={
                (editSnapshot?.ficId ?? seed.ficId ?? prefill?.ficId) as number
              }
              variant="button"
            />
          ) : null}
        </div>

        {hydrating ? (
          <p className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm text-[var(--muted)]">
            Caricamento dati documento…
          </p>
        ) : null}

        <form
          onSubmit={submit}
          className={`mt-4 space-y-5 ${hydrating ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Intestazione
              </label>
              {isEdit || seed.lockAnagrafica || prefill?.lockAnagrafica ? (
                <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-mono font-medium">
                    {anagraficaCodiceTarga || "—"}
                  </span>
                  <span className="text-[var(--muted)]"> — </span>
                  <span className="font-medium">
                    {anagraficaRagioneSociale || "Anagrafica non impostata"}
                  </span>
                </div>
              ) : kind === "emessa" || kind === "nota_credito" ? (
                <ClienteSelectField
                  value={anagraficaId}
                  onChange={(c) => {
                    setAnagraficaId(c?.id ?? "");
                    setAnagraficaRagioneSociale(c?.ragioneSociale ?? "");
                    setAnagraficaCodiceTarga(c?.codiceTarga ?? "");
                  }}
                />
              ) : (
                <FornitoreSelectField
                  value={anagraficaId}
                  onChange={(f) => {
                    setAnagraficaId(f?.id ?? "");
                    setAnagraficaRagioneSociale(f?.ragioneSociale ?? "");
                    setAnagraficaCodiceTarga(f?.codiceTarga ?? "");
                  }}
                />
              )}
              {isEdit || seed.lockAnagrafica || prefill?.lockAnagrafica ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Intestazione bloccata (documento già registrato).
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Data emissione
              </label>
              <input
                type="date"
                required
                value={dataEmissione}
                onChange={(e) => setDataEmissione(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                N. documento interno
              </label>
              <input
                type="text"
                readOnly
                value={numeroInterno || "Seleziona intestazione…"}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-mono text-sm"
              />
            </div>
            {isNc ? (
              <div className="sm:col-span-2 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Modalità collegamento
                  </label>
                  <select
                    value={modalitaCollegamento}
                    onChange={(e) =>
                      setModalitaCollegamento(
                        e.target.value as FatturaModalitaCollegamentoNc
                      )
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="normale">
                      Normale (incasso / rimborso)
                    </option>
                    <option value="sostituzione">
                      Sostituzione gestionale (fattura rimpiazzata)
                    </option>
                  </select>
                  {isSostituzione ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      La fattura stornata resta registrata e visibile; la NC la
                      azzera contabilmente. Indica la fattura corretta di
                      rimpiazzo. Rimborso e dilazioni non si applicano.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    {isSostituzione
                      ? "Fattura stornata (originale)"
                      : "Collegata a fattura"}
                  </label>
                  <select
                    required
                    value={fatturaCollegataId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFatturaCollegataId(id);
                      setDilazioniAnnullateIds([]);
                      const opt = fattureCollegabili.find((f) => f.id === id);
                      if (opt) {
                        setRiferimentoFatturaEsterno(opt.numeroInterno);
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="">Seleziona fattura…</option>
                    {fattureCollegabili.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-[var(--muted)]">
                      Stessa azienda · n. interno, importo e data
                    </p>
                    <button
                      type="button"
                      disabled={!anagraficaId}
                      onClick={() => {
                        setPendingPickerTarget("collegata");
                        setShowPendingPicker(true);
                      }}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-950 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      Cerca fattura da sincronizzare
                    </button>
                  </div>
                </div>
                {isSostituzione ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      Fattura sostitutiva (corretta)
                    </label>
                    <select
                      required
                      value={fatturaSostitutivaId}
                      onChange={(e) => setFatturaSostitutivaId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona fattura di rimpiazzo…</option>
                      {fattureCollegabili
                        .filter((f) => f.id !== fatturaCollegataId)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                    </select>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[var(--muted)]">
                        Fattura con errori risolti · resta nello storico come
                        documento a sé
                      </p>
                      <button
                        type="button"
                        disabled={!anagraficaId}
                        onClick={() => {
                          setPendingPickerTarget("sostitutiva");
                          setShowPendingPicker(true);
                        }}
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-950 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        Cerca fattura da sincronizzare
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                N. documento esterno (FiC / fornitore)
              </label>
              <input
                type="text"
                value={numeroDocumentoEsterno}
                onChange={(e) => setNumeroDocumentoEsterno(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {isRicevuta
                  ? "Prodotti / servizi / materie"
                  : kind === "nota_credito"
                    ? "Prodotti"
                    : "Prodotti venduti"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {isRicevuta ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRigaIndexForNuovo(null);
                        setCreatingAcquistoKind("servizio");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      <FaPlus size={11} />
                      Nuovo servizio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRigaIndexForNuovo(null);
                        setCreatingAcquistoKind("prodotto");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      <FaPlus size={11} />
                      Nuovo prodotto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRigaIndexForNuovo(null);
                        setCreatingAcquistoKind("materia");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      <FaPlus size={11} />
                      Nuova materia
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRigaIndexForNuovo(null);
                      setCreatingProdotto(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    <FaPlus size={11} />
                    Crea nuovo prodotto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setRighe((prev) => [
                      ...prev,
                      asEditableRiga(
                        isNc
                          ? emptyFatturaRigaNotaCredito()
                          : emptyFatturaRiga()
                      ),
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  <FaPlus size={11} />
                  Aggiungi riga
                </button>
                {!isNc ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRighe((prev) => [
                        ...prev,
                        asEditableRiga(emptyFatturaRigaStorno()),
                      ])
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                    title="Aggiunge una voce con quantità negativa che riduce il totale"
                  >
                    <FaPlus size={11} />
                    Riga storno
                  </button>
                ) : null}
              </div>
            </div>

            {isRicevuta ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950">
                {matchScanPending ? (
                  <span>Controllo corrispondenze descrizione ↔ catalogo…</span>
                ) : (
                  <span>
                    Scan automatico: badge sulle righe (possibile match / nessun
                    match / da sostituire). Usa <strong>Cerca</strong> per
                    assegnare un codice o crearne uno nuovo. Il bottone{" "}
                    <strong>nodi collegati</strong> apre la gestione dei legami
                    tra articoli diversi.
                    {Object.values(matchHints).filter(
                      (h) => h.status !== "ok"
                    ).length > 0
                      ? ` · ${
                          Object.values(matchHints).filter(
                            (h) => h.status !== "ok"
                          ).length
                        } righe da rivedere`
                      : null}
                  </span>
                )}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    {!isNc ? (
                      <th className="px-2 py-2">Storno</th>
                    ) : null}
                    <th className="px-2 py-2">
                      {isRicevuta ? "Codice" : "Prodotto"}
                    </th>
                    {!isRicevuta ? (
                      <th className="px-2 py-2">Codice</th>
                    ) : null}
                    <th className="px-2 py-2">Descrizione</th>
                    <th className="px-2 py-2">Qtà</th>
                    {isRicevuta ? (
                      <th className="px-2 py-2">Unità</th>
                    ) : null}
                    <th className="px-2 py-2">Prezzo u.</th>
                    <th className="px-2 py-2">Sconto %</th>
                    {isRicevuta ? (
                      <th className="px-2 py-2">IVA %</th>
                    ) : null}
                    <th className="px-2 py-2">Importo</th>
                    {!isNc ? (
                      <th
                        className="px-2 py-2"
                        title={
                          kind === "ricevuta"
                            ? "Ingresso registro cespiti"
                            : "Uscita registro cespiti"
                        }
                      >
                        Beni amm.
                      </th>
                    ) : null}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga, index) => {
                    const listino = numberOrZero(riga.prezzoUnitario);
                    const sconto = numberOrZero(riga.scontoPercentuale);
                    const scontato = prezzoScontatoUnitario(listino, sconto);
                    const hasSconto = sconto > 0;
                    const isStorno =
                      isNc || isRigaStornoQuantita(numberOrZero(riga.quantita));
                    const storicoKey = prodottoStoricoKey({
                      prodottoId: riga.prodottoId,
                      codice: riga.codice,
                    });
                    const prezzoHint = storicoKey
                      ? prezzoHints[storicoKey]
                      : undefined;
                    const showInfo =
                      prezzoHint?.hasParticolari &&
                      (prezzoHint.condizioni.length ?? 0) > 0;
                    const ammEnabled = canFlagBeneAmmortizzabile(
                      numberOrZero(riga.prezzoUnitario)
                    );
                    return (
                      <tr
                        key={index}
                        className={
                          isStorno && !isNc
                            ? "border-t border-amber-200 bg-amber-50/50"
                            : "border-t border-[var(--border)]"
                        }
                      >
                        {!isNc ? (
                          <td className="px-2 py-2 align-middle">
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={isStorno}
                                onChange={(e) => {
                                  const q = numberOrZero(riga.quantita);
                                  patchRiga(index, {
                                    quantita: e.target.checked
                                      ? normalizeQuantitaNegativa(q)
                                      : normalizeQuantitaPositiva(q),
                                  });
                                }}
                                className="rounded border-[var(--border)]"
                                title="Quantità negativa: riduce il totale fattura"
                              />
                              <span className="sr-only">Storno</span>
                            </label>
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                          <div className="flex items-start gap-1.5">
                            {isRicevuta ? (
                              <>
                              <select
                                value={
                                  riga.codice &&
                                  riga.codice !== "—" &&
                                  vociAcquisto.some((v) => v.codice === riga.codice)
                                    ? riga.codice
                                    : riga.codice && riga.codice !== "—"
                                      ? `__orphan__:${riga.codice}`
                                      : ""
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "__new_servizio__") {
                                    setCodificaRiga({
                                      index,
                                      kind: "servizio",
                                    });
                                    return;
                                  }
                                  if (v === "__new_prodotto__") {
                                    setCodificaRiga({
                                      index,
                                      kind: "prodotto",
                                    });
                                    return;
                                  }
                                  if (v === "__new_materia__") {
                                    setCodificaRiga({
                                      index,
                                      kind: "materia",
                                    });
                                    return;
                                  }
                                  if (v.startsWith("__orphan__:")) return;
                                  applyVoceAcquisto(index, v);
                                }}
                                className="w-full min-w-[140px] rounded border border-[var(--border)] px-2 py-1.5 font-mono text-xs"
                                required
                              >
                                <option value="">Seleziona codice…</option>
                                {riga.codice &&
                                riga.codice !== "—" &&
                                !vociAcquisto.some(
                                  (v) => v.codice === riga.codice
                                ) ? (
                                  <option value={`__orphan__:${riga.codice}`}>
                                    {riga.codice} —{" "}
                                    {riga.descrizione || "Voce salvata"}
                                  </option>
                                ) : null}
                                <optgroup label="Servizi">
                                  {vociAcquisto
                                    .filter((v) => v.kind === "servizio")
                                    .map((v) => (
                                      <option key={v.id} value={v.codice}>
                                        {v.codice} — {v.nome}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Prodotti fornitore">
                                  {vociAcquisto
                                    .filter((v) => v.kind === "prodotto")
                                    .map((v) => (
                                      <option key={v.id} value={v.codice}>
                                        {v.codice} — {v.nome}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Materie prime">
                                  {vociAcquisto
                                    .filter((v) => v.kind === "materia")
                                    .map((v) => (
                                      <option key={v.id} value={v.codice}>
                                        {v.codice} — {v.nome}
                                      </option>
                                    ))}
                                </optgroup>
                                <option value="__new_servizio__">
                                  + Nuovo servizio
                                </option>
                                <option value="__new_prodotto__">
                                  + Nuovo prodotto
                                </option>
                                <option value="__new_materia__">
                                  + Nuova materia prima
                                </option>
                              </select>
                              <button
                                type="button"
                                onClick={() => setCollegaRigaIndex(index)}
                                className="shrink-0 rounded border border-sky-300 bg-sky-50 px-2 py-1.5 text-[10px] font-medium text-sky-950 hover:bg-sky-100"
                                title="Cerca codice corrispondente da assegnare alla riga, o crea nuovo"
                              >
                                Cerca
                              </button>
                              <ArticoloCollegatiNuvola
                                linked={
                                  riga.codice && riga.codice !== "—"
                                    ? collegatiByCodice[riga.codice] ?? []
                                    : []
                                }
                                sourceCodice={
                                  riga.codice && riga.codice !== "—"
                                    ? riga.codice
                                    : undefined
                                }
                                disabled={
                                  !riga.codice ||
                                  riga.codice === "—" ||
                                  !vociAcquisto.some((v) => v.codice === riga.codice)
                                }
                                disabledReason={
                                  !riga.codice || riga.codice === "—"
                                    ? "Assegna prima un codice alla riga (Cerca)"
                                    : "Codice non in catalogo: assegna un codice valido"
                                }
                                onManage={() => {
                                  const v = vociAcquisto.find(
                                    (x) => x.codice === riga.codice
                                  );
                                  if (!v) return;
                                  setLinkingArticolo({
                                    kind: v.kind,
                                    id: v.id,
                                    codice: v.codice,
                                    nome: v.nome,
                                  });
                                }}
                              />
                              </>
                            ) : (
                              <select
                                value={riga.prodottoId ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "__new__") {
                                    setRigaIndexForNuovo(index);
                                    setCreatingProdotto(true);
                                    return;
                                  }
                                  applyProdotto(index, v);
                                }}
                                className="w-full min-w-[140px] rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                              >
                                <option value="">Seleziona…</option>
                                {riga.prodottoId &&
                                !prodotti.some((p) => p.id === riga.prodottoId) ? (
                                  <option value={riga.prodottoId}>
                                    {riga.codice || "—"} —{" "}
                                    {riga.descrizione || "Prodotto salvato"}
                                  </option>
                                ) : null}
                                {prodotti.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.codice} — {p.nome}
                                  </option>
                                ))}
                                <option value="__new__">
                                  + Crea nuovo prodotto
                                </option>
                              </select>
                            )}
                            {showInfo && prezzoHint ? (
                              <ProdottoPrezzoStoricoInfo
                                kind={kind}
                                condizioni={prezzoHint.condizioni}
                              />
                            ) : null}
                          </div>
                          {isRicevuta
                            ? (() => {
                                const hint = matchHints[String(index)];
                                if (
                                  !hint ||
                                  hint.status === "ok" ||
                                  hint.status === "possibile_match"
                                ) {
                                  return null;
                                }
                                const label =
                                  hint.status === "da_sostituire"
                                    ? "Codice da sostituire"
                                    : hint.status === "codice_orfano"
                                      ? "Codice non in catalogo"
                                      : "Nessun match";
                                const cls =
                                  hint.status === "da_sostituire"
                                    ? "border-amber-300 bg-amber-50 text-amber-950"
                                    : "border-slate-300 bg-slate-50 text-slate-700";
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setCollegaRigaIndex(index)}
                                    className={`w-fit max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
                                    title={label}
                                  >
                                    {label}
                                  </button>
                                );
                              })()
                            : null}
                          </div>
                        </td>
                        {!isRicevuta ? (
                          <td className="px-2 py-2">
                            <input
                              value={riga.codice}
                              onChange={(e) =>
                                patchRiga(index, { codice: e.target.value })
                              }
                              className="w-24 rounded border border-[var(--border)] px-2 py-1.5 font-mono text-xs"
                              required
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <input
                            value={riga.descrizione}
                            onChange={(e) =>
                              patchRiga(index, { descrizione: e.target.value })
                            }
                            className="w-full min-w-[160px] rounded border border-[var(--border)] px-2 py-1.5"
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            value={riga.quantita}
                            onValueChange={(v) =>
                              patchRiga(index, {
                                quantita:
                                  v === ""
                                    ? ""
                                    : isNc
                                      ? normalizeQuantitaNotaCredito(v)
                                      : isStorno
                                        ? normalizeQuantitaNegativa(v)
                                        : v,
                              })
                            }
                            className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                            required
                            title={
                              isNc || isStorno
                                ? "Quantità negativa (storno)"
                                : "Quantità (usa «Storno» o valore negativo per annullare)"
                            }
                          />
                        </td>
                        {isRicevuta ? (
                          <td className="px-2 py-2">
                            <input
                              value={riga.unitaMisura || "NR"}
                              onChange={(e) =>
                                patchRiga(index, {
                                  unitaMisura:
                                    e.target.value.trim().toUpperCase() || "NR",
                                })
                              }
                              className="w-16 rounded border border-[var(--border)] px-2 py-1.5 font-mono text-xs uppercase"
                              title="Unità di misura (es. NR, KG, H)"
                              required
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            min={0}
                            value={riga.prezzoUnitario}
                            onValueChange={(v) =>
                              patchRiga(index, {
                                prezzoUnitario:
                                  v === "" ? "" : Math.abs(v),
                              })
                            }
                            className="w-24 rounded border border-[var(--border)] px-2 py-1.5"
                            required
                          />
                          {hasSconto ? (
                            <div className="mt-1 space-y-0.5 text-xs leading-tight">
                              <p className="text-[var(--muted)] line-through tabular-nums">
                                {formatEuro(listino)}
                              </p>
                              <p className="font-medium tabular-nums text-emerald-800">
                                {formatEuro(scontato)}
                              </p>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            min={0}
                            max={100}
                            value={riga.scontoPercentuale}
                            onValueChange={(v) =>
                              patchRiga(index, { scontoPercentuale: v })
                            }
                            className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                          />
                        </td>
                        {isRicevuta ? (
                          <td className="px-2 py-2">
                            <ClearableNumberInput
                              min={0}
                              max={100}
                              value={riga.ivaPercentuale}
                              onValueChange={(v) =>
                                patchRiga(index, { ivaPercentuale: v })
                              }
                              className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                              required
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-2 tabular-nums">
                          {formatEuro(riga.importo)}
                        </td>
                        {!isNc ? (
                          <td className="px-2 py-2 align-middle">
                            <label
                              className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                              title={
                                kind === "ricevuta"
                                  ? "Beni ammortizzabili: ingresso registro cespiti"
                                  : "Beni ammortizzabili: uscita registro cespiti"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={
                                  ammEnabled &&
                                  Boolean(riga.isBeneAmmortizzabile)
                                }
                                disabled={!ammEnabled}
                                onChange={(e) =>
                                  patchRiga(index, {
                                    isBeneAmmortizzabile: e.target.checked,
                                  })
                                }
                                className="rounded border-[var(--border)]"
                              />
                              <span className="sr-only">
                                Beni ammortizzabili
                              </span>
                            </label>
                          </td>
                        ) : null}
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            disabled={righe.length <= 1}
                            onClick={() =>
                              setRighe((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                            aria-label="Rimuovi riga"
                          >
                            <FaTrash size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Spedizione
              </label>
              <ClearableNumberInput
                min={0}
                value={spedizione}
                onValueChange={setSpedizione}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={spedizioneIvaApplicata}
                  onChange={(e) => setSpedizioneIvaApplicata(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Applica IVA anche sulla spedizione
                  <span className="mt-0.5 block text-[11px] opacity-80">
                    Di default l&apos;IVA non è applicata al trasporto.
                  </span>
                </span>
              </label>
              {isNc ? (
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={spedizioneSottraiIncassi}
                    onChange={(e) =>
                      setSpedizioneSottraiIncassi(e.target.checked)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    Sottrai il trasporto dagli incassi
                    <span className="mt-0.5 block text-[11px] opacity-80">
                      Se deselezionato resta tra gli incassi (non riduce il
                      totale NC).
                    </span>
                  </span>
                </label>
              ) : null}
              {spedizioneIvaHint?.applicataInPassato ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                  <p className="font-medium">
                    Nota: a questa anagrafica è già stata applicata l&apos;IVA
                    sulla spedizione
                    {spedizioneIvaHint.ultima
                      ? ` (es. ${spedizioneIvaHint.ultima.numeroInterno} del ${formatDateIt(spedizioneIvaHint.ultima.dataEmissione)})`
                      : ""}
                    .
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {spedizioneIvaHint.fatture.slice(0, 5).map((f) => (
                      <li key={f.id}>
                        <a
                          href={fatturaDetailPath(kind, f.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-amber-900 underline hover:no-underline"
                        >
                          {f.numeroInterno}
                        </a>
                        <span className="text-amber-800/80">
                          {" "}
                          · {formatDateIt(f.dataEmissione)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Imponibile totale
              </label>
              <input
                readOnly
                value={formatEuro(totals.imponibile)}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2"
              />
            </div>
            {isRicevuta ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Imposta IVA
                </label>
                <input
                  readOnly
                  value={formatEuro(totals.imposta)}
                  className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Calcolata dalle aliquote sulle singole righe (nessun % globale).
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  % IVA
                </label>
                <ClearableNumberInput
                  min={0}
                  max={100}
                  value={ivaPercentuale}
                  onValueChange={setIvaPercentuale}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Base IVA: {formatEuro(totals.baseIva)} · Imposta:{" "}
                  {formatEuro(totals.imposta)}
                </p>
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Totale
                </label>
                {isRicevuta ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (totaleEditUnlocked) return;
                      const ok = window.confirm(
                        "Attenzione: modificando il totale non sarà più allineato alle righe inserite (errore contabile volontario, es. allineamento a Fatture in Cloud).\n\nVuoi abilitare la modifica?"
                      );
                      if (!ok) return;
                      setTotaleManuale(true);
                      setTotaleEditUnlocked(true);
                      setTotaleOverride(totals.totale);
                    }}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title="Modifica totale (allineamento FiC)"
                    aria-label="Modifica totale"
                  >
                    <FaPen size={11} />
                  </button>
                ) : null}
                {isRicevuta && totaleManuale ? (
                  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    Totale forzato
                  </span>
                ) : null}
              </div>
              {isRicevuta && totaleEditUnlocked ? (
                <>
                  <ClearableNumberInput
                    min={0}
                    step="0.01"
                    value={totaleOverride}
                    onValueChange={setTotaleOverride}
                    className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 font-semibold"
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-amber-900">
                      Calcolato dalle righe: {formatEuro(totals.totale)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTotaleManuale(false);
                        setTotaleEditUnlocked(false);
                        setTotaleOverride("");
                      }}
                      className="text-xs font-medium text-[var(--primary)] hover:underline"
                    >
                      Ripristina da righe
                    </button>
                  </div>
                </>
              ) : (
                <input
                  readOnly
                  value={formatEuro(totaleEffettivo)}
                  className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-semibold"
                />
              )}
            </div>
          </div>

          {!isSostituzione ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {isRicevuta ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Natura documento
                </label>
                <select
                  value={naturaDocumento}
                  onChange={(e) =>
                    setNaturaDocumento(
                      e.target.value as FatturaNaturaDocumento
                    )
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <option value="saldo">Saldo</option>
                  <option value="acconto">Acconto</option>
                </select>
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {isNc ? "Incasso" : "Stato"}
              </label>
              {isNc ? (
                <select
                  value={statoIncassoNc}
                  onChange={(e) =>
                    setStatoIncassoNc(e.target.value as FatturaStatoIncassoNc)
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <option value="non_incassata">Non incassata</option>
                  <option value="gia_incassata">Già incassata</option>
                </select>
              ) : (
                <select
                  value={statoPagamento}
                  onChange={(e) =>
                    setStatoPagamento(e.target.value as FatturaStatoPagamento)
                  }
                  disabled={dilazioni.length > 0}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 disabled:bg-slate-50"
                >
                  <option value="pagato">Pagato</option>
                  <option value="da_pagare">Da pagare</option>
                </select>
              )}
              {!isNc && dilazioni.length > 0 ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Stato allineato alle dilazioni
                  {statoDaDilazioni === "pagato"
                    ? " (tutte pagate)."
                    : " (almeno una non saldata)."}
                </p>
              ) : null}
            </div>
            {(isNc ? statoIncassoNc === "gia_incassata" : statoPagamento === "pagato") ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Copia ricevuta (opzionale)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setRicevuta(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>
            ) : null}
          </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Sostituzione gestionale: la fattura originale resta nello storico;
              non servono rimborso né gestione dilazioni.
            </div>
          )}

          {isNc && !isSostituzione && statoIncassoNc === "gia_incassata" ? (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-slate-50/80 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rimborsoNecessario}
                  onChange={(e) => {
                    setRimborsoNecessario(e.target.checked);
                    if (!e.target.checked) {
                      setRimborsoMezzo("");
                      setFatturaCompensativaId("");
                    }
                  }}
                />
                <span className="font-medium">Rimborso necessario</span>
              </label>
              {rimborsoNecessario ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      Mezzo rimborso
                    </label>
                    <select
                      required
                      value={rimborsoMezzo}
                      onChange={(e) =>
                        setRimborsoMezzo(
                          e.target.value as FatturaRimborsoMezzo | ""
                        )
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona…</option>
                      <option value="denaro">Denaro</option>
                      <option value="rimpiazzo_merce">Rimpiazzo merce</option>
                      <option value="nuova_fattura">
                        Nuova fattura (collega)
                      </option>
                    </select>
                  </div>
                  {rimborsoMezzo === "nuova_fattura" ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                        Fattura compensativa
                      </label>
                      <select
                        value={fatturaCompensativaId}
                        onChange={(e) =>
                          setFatturaCompensativaId(e.target.value)
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="">
                          Nessuna ancora (verrà proposta in sync)
                        </option>
                        {fattureCollegabili
                          .filter((f) => f.id !== fatturaCollegataId)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {isNc && !isSostituzione ? (
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Dilazioni fattura collegata
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Seleziona le rate da annullare sulla fattura collegata.
                </p>
              </div>
              {!fatturaCollegataId ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]">
                  Seleziona prima la fattura collegata.
                </p>
              ) : dilazioniCollegate.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]">
                  Nessuna dilazione attiva su questa fattura.
                </p>
              ) : (
                <ul className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                  {dilazioniCollegate.map((d) => {
                    const checked = dilazioniAnnullateIds.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setDilazioniAnnullateIds((prev) =>
                                e.target.checked
                                  ? [...prev, d.id]
                                  : prev.filter((x) => x !== d.id)
                              );
                            }}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">
                              {formatDateIt(d.dataScadenza)} ·{" "}
                              {formatEuro(d.importo)}
                            </span>
                            <span className="ml-2 text-xs text-[var(--muted)]">
                              {d.statoPagamento === "pagato"
                                ? "Pagata"
                                : "Da pagare"}
                              {checked ? " → sarà annullata" : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {!isNc ? (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Dilazioni</h3>
                <p className="text-xs text-[var(--muted)]">
                  Una riga per scadenza con data e stato. Le date future risultano
                  non saldate.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDilazioni((prev) => {
                    const sommaAttuale = prev.reduce(
                      (s, d) => s + numberOrZero(d.importo),
                      0
                    );
                    const residuo = Math.max(
                      0,
                      Math.round((totaleEffettivo - sommaAttuale) * 100) / 100
                    );
                    return [
                      ...prev,
                      emptyFatturaDilazione(
                        prev.length === 0 ? totaleEffettivo : residuo
                      ),
                    ];
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                <FaPlus size={11} />
                Aggiungi dilazione
              </button>
            </div>

            {dilazioni.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]">
                Nessuna dilazione. Usa «Aggiungi dilazione» per scadenze multiple.
              </p>
            ) : (
              <>
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  dilazioniBilancio.equilibrato
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : dilazioniBilancio.esubero > 0
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
                role="status"
              >
                <p className="font-medium">
                  Controllo dilazioni · Somma rate{" "}
                  {formatEuro(dilazioniBilancio.sommaDilazioni)} su totale{" "}
                  {formatEuro(dilazioniBilancio.totaleFattura)}
                </p>
                {dilazioniBilancio.equilibrato ? (
                  <p className="mt-0.5">
                    Importi allineati al totale fattura.
                  </p>
                ) : dilazioniBilancio.mancante > 0 ? (
                  <p className="mt-0.5">
                    Mancano {formatEuro(dilazioniBilancio.mancante)} da
                    assegnare alle dilazioni.
                  </p>
                ) : (
                  <p className="mt-0.5">
                    Esubero di {formatEuro(dilazioniBilancio.esubero)} rispetto
                    al totale fattura.
                  </p>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-2">Data scadenza</th>
                      <th className="px-2 py-2">Importo</th>
                      <th className="px-2 py-2">Stato pagamento</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {dilazioni.map((d, index) => {
                      const futura = isDilazioneFutura(
                        d.dataScadenza || todayIsoDate()
                      );
                      const statoEffettivo = normalizeDilazioneStato(
                        d.dataScadenza || todayIsoDate(),
                        d.statoPagamento
                      );
                      return (
                        <tr
                          key={index}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              required
                              value={d.dataScadenza}
                              onChange={(e) => {
                                const dataScadenza = e.target.value;
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          dataScadenza,
                                          statoPagamento: normalizeDilazioneStato(
                                            dataScadenza,
                                            row.statoPagamento
                                          ),
                                        }
                                      : row
                                  )
                                );
                              }}
                              className="rounded border border-[var(--border)] px-2 py-1.5"
                            />
                            {futura ? (
                              <p className="mt-0.5 text-[11px] text-amber-800">
                                Futura → non saldata
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <ClearableNumberInput
                              min={0}
                              value={d.importo}
                              onValueChange={(v) =>
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, importo: v } : row
                                  )
                                )
                              }
                              className="w-28 rounded border border-[var(--border)] px-2 py-1.5"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={statoEffettivo}
                              disabled={futura}
                              onChange={(e) =>
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          statoPagamento: e.target
                                            .value as FatturaStatoPagamento,
                                        }
                                      : row
                                  )
                                )
                              }
                              className="rounded border border-[var(--border)] px-2 py-1.5 disabled:bg-slate-50"
                            >
                              <option value="da_pagare">Da pagare</option>
                              <option value="pagato">Pagato</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDilazioni((prev) =>
                                  prev.filter((_, i) => i !== index)
                                )
                              }
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                              aria-label="Rimuovi dilazione"
                            >
                              <FaTrash size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </div>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            {onPause ? (
              <button
                type="button"
                onClick={onPause}
                disabled={saving}
                className="mr-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                Pausa
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              {onPause ? "Salta documento" : "Annulla"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving
                ? "Salvataggio…"
                : kind === "nota_credito"
                  ? "Registra nota di credito"
                  : "Registra fattura"}
            </button>
          </div>
        </form>
      </div>

      {creatingProdotto && !isRicevuta ? (
        <ProdottoProprioFormModal
          mode="create"
          elevated
          catalog={prodotti}
          onClose={() => {
            setCreatingProdotto(false);
            setRigaIndexForNuovo(null);
          }}
          onSave={async (values) => {
            const result = await addProdotto(values);
            if (!result.success) {
              throw new Error(result.error);
            }
            await refresh();
            const idx =
              rigaIndexForNuovo ?? (righe.length > 0 ? righe.length - 1 : 0);
            if (rigaIndexForNuovo == null && !righe[0]?.codice) {
              applyProdottoToLocal(
                0,
                result.prodotto.id,
                result.prodotto.codice,
                result.prodotto.nome
              );
            } else if (rigaIndexForNuovo != null) {
              applyProdottoToLocal(
                idx,
                result.prodotto.id,
                result.prodotto.codice,
                result.prodotto.nome
              );
            } else {
              setRighe((prev) => [
                ...prev,
                asEditableRiga({
                  ...emptyFatturaRigaNotaCredito(),
                  prodottoId: result.prodotto.id,
                  codice: result.prodotto.codice,
                  descrizione: result.prodotto.nome,
                  quantita: isNc ? -1 : 1,
                }),
              ]);
            }
            setCreatingProdotto(false);
            setRigaIndexForNuovo(null);
          }}
        />
      ) : null}

      {codificaRiga ? (
        <CodificaArticoloRevisioneModal
          initialText={righe[codificaRiga.index]?.descrizione ?? ""}
          initialKind={codificaRiga.kind}
          fatturaRicevutaId={initial?.id ?? null}
          fatturaRigaId={righe[codificaRiga.index]?.id ?? null}
          onClose={() => setCodificaRiga(null)}
          onConfirmed={async (result) => {
            const idx = codificaRiga.index;
            await refreshVociAcquisto();
            applyProdottoToLocal(idx, "", result.codice, result.nome);
            setCodificaRiga(null);
          }}
        />
      ) : null}

      {collegaRigaIndex !== null ? (
        <CollegaArticoloModal
          descrizioneRiga={righe[collegaRigaIndex]?.descrizione ?? ""}
          fornitoreId={anagraficaId || null}
          sameInvoiceCodici={righe
            .map((r) => r.codice)
            .filter(
              (c) =>
                Boolean(c?.trim()) &&
                c !== "—" &&
                c !== (righe[collegaRigaIndex]?.codice ?? "")
            )}
          codiceDaSostituire={
            matchHints[String(collegaRigaIndex)]?.status === "da_sostituire"
              ? righe[collegaRigaIndex]?.codice ??
                initial?.codiceCatalogoPending ??
                null
              : initial?.codiceCatalogoPending &&
                  (righe[collegaRigaIndex]?.codice ?? "")
                    .trim()
                    .toLowerCase() ===
                    initial.codiceCatalogoPending.trim().toLowerCase()
                ? initial.codiceCatalogoPending
                : null
          }
          suggestedHit={
            matchHints[String(collegaRigaIndex)]?.status === "possibile_match"
              ? matchHints[String(collegaRigaIndex)]?.best ?? null
              : null
          }
          onClose={() => setCollegaRigaIndex(null)}
          onCollega={(hit) => {
            const idx = collegaRigaIndex;
            const keepDesc = (righe[idx]?.descrizione ?? "").trim();
            patchRiga(idx, {
              prodottoId: null,
              codice: hit.codice,
              ...(keepDesc ? {} : { descrizione: hit.nome }),
            });
            setCollegaRigaIndex(null);
            void refreshVociAcquisto();
          }}
          onCreaNuovo={(kind) => {
            const idx = collegaRigaIndex;
            setCollegaRigaIndex(null);
            setCodificaRiga({ index: idx, kind });
          }}
        />
      ) : null}

      {linkingArticolo ? (
        <ArticoloCollegatiManageModal
          kind={linkingArticolo.kind}
          id={linkingArticolo.id}
          codice={linkingArticolo.codice}
          nome={linkingArticolo.nome}
          onClose={() => {
            setLinkingArticolo(null);
            // refresh badge counts
            const codes = [
              ...new Set(
                righe
                  .map((r) => (r.codice ?? "").trim())
                  .filter((c) => c && c !== "—")
              ),
            ];
            if (codes.length === 0) return;
            void listCollegamentiByCodiciAction(codes).then((res) => {
              if (res.success) setCollegatiByCodice(res.byCodice);
            });
          }}
        />
      ) : null}

      {creatingAcquistoKind === "servizio" ||
      creatingAcquistoKind === "prodotto" ? (
        <CatalogoOffertaFormModal
          kind={creatingAcquistoKind}
          mode="create"
          catalog={
            creatingAcquistoKind === "servizio"
              ? catalogServizi
              : catalogProdottiFornitore
          }
          onClose={() => {
            setCreatingAcquistoKind(null);
            setRigaIndexForNuovo(null);
          }}
          onSave={async (values) => {
            const result =
              creatingAcquistoKind === "servizio"
                ? await createCatalogoServizioAction(values)
                : await createCatalogoProdottoFornitoreAction(values);
            if (!result.success) throw new Error(result.error);
            await refreshVociAcquisto();
            const idx =
              rigaIndexForNuovo ?? (righe.length > 0 ? righe.length - 1 : 0);
            applyProdottoToLocal(
              idx,
              "",
              result.item.codice,
              result.item.nome
            );
            setCreatingAcquistoKind(null);
            setRigaIndexForNuovo(null);
          }}
        />
      ) : null}

      {creatingAcquistoKind === "materia" ? (
        <MateriaPrimaFormModal
          mode="create"
          catalog={catalogMaterie}
          onClose={() => {
            setCreatingAcquistoKind(null);
            setRigaIndexForNuovo(null);
          }}
          onSave={async (values) => {
            const result = await createMateriaPrimaAction(values);
            if (!result.success) throw new Error(result.error);
            await refreshVociAcquisto();
            const idx =
              rigaIndexForNuovo ?? (righe.length > 0 ? righe.length - 1 : 0);
            applyProdottoToLocal(
              idx,
              "",
              result.materia.codice,
              result.materia.nome
            );
            setCreatingAcquistoKind(null);
            setRigaIndexForNuovo(null);
          }}
        />
      ) : null}

      {isNc && showPendingPicker && anagraficaId ? (
        <NcPendingFatturaPickerModal
          clienteId={anagraficaId}
          clienteLabel={
            anagraficaCodiceTarga
              ? `${anagraficaCodiceTarga} — ${anagraficaRagioneSociale}`
              : anagraficaRagioneSociale || "Cliente"
          }
          importoNc={Math.abs(totals.totale)}
          onClose={() => setShowPendingPicker(false)}
          onConfirm={(item) => {
            setPendingInvoiceToRegister(item);
            setShowPendingPicker(false);
          }}
        />
      ) : null}

      {isNc && pendingInvoiceToRegister ? (
        <FatturaRegistrazioneModal
          kind="emessa"
          stackTop
          elevated
          prefill={{
            anagraficaId,
            anagraficaRagioneSociale,
            anagraficaCodiceTarga,
            dataEmissione: pendingInvoiceToRegister.dataEmissione,
            numeroDocumentoEsterno: pendingInvoiceToRegister.numeroEsterno,
            ficId: pendingInvoiceToRegister.ficId,
            spedizione: pendingInvoiceToRegister.spedizione,
            spedizioneIvaApplicata:
              pendingInvoiceToRegister.spedizioneIvaApplicata,
            ivaPercentuale: pendingInvoiceToRegister.ivaPercentuale,
            statoPagamento: pendingInvoiceToRegister.statoPagamento,
            righe: pendingInvoiceToRegister.righe,
            lockAnagrafica: true,
            note:
              pendingPickerTarget === "sostitutiva"
                ? "Registrata come fattura sostitutiva (rimpiazzo gestionale NC)"
                : "Registrata prima della nota di credito (collegamento NC)",
          }}
          onClose={() => {
            setPendingInvoiceToRegister(null);
            setShowPendingPicker(true);
          }}
          onSaved={async (fattura) => {
            setPendingInvoiceToRegister(null);
            const res = await listFattureEmesseClienteAction({
              clienteId: anagraficaId,
            });
            if (res.success) setFattureCollegabili(res.fatture);
            if (pendingPickerTarget === "sostitutiva") {
              setFatturaSostitutivaId(fattura.id);
            } else {
              setFatturaCollegataId(fattura.id);
              setRiferimentoFatturaEsterno(fattura.numeroInterno);
              setDilazioniAnnullateIds([]);
            }
          }}
        />
      ) : null}
    </div>
  );

  function applyProdottoToLocal(
    index: number,
    id: string,
    codice: string,
    nome: string
  ) {
    setRighe((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const keepDesc = (r.descrizione ?? "").trim();
        return {
          ...r,
          prodottoId: id || null,
          codice,
          ...(keepDesc ? {} : { descrizione: nome }),
          importo: importoRiga(
            numberOrZero(r.quantita),
            numberOrZero(r.prezzoUnitario),
            numberOrZero(r.scontoPercentuale)
          ),
        };
      })
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
