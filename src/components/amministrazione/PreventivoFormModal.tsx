"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createPreventivoAction,
  listPreventivoCommercialiRiferimentoAction,
  peekNextNumeroPreventivoAction,
  stimaSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoA4PiePagina } from "@/components/amministrazione/PreventivoA4PiePagina";
import {
  PreventivoAggiungiProdottoModal,
  type PreventivoProdottoDraft,
} from "@/components/amministrazione/PreventivoAggiungiProdottoModal";
import {
  PreventivoDestinatarioModal,
  PreventivoDestinatarioPicker,
} from "@/components/amministrazione/PreventivoDestinatarioPicker";
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  ORDINE_TIPI_PAGAMENTO,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import {
  CONFEZIONE_STANDARD,
  GIORNI_CONSEGNA_DEFAULT,
  PREVENTIVO_CONSEGNA,
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_IVA_DEFAULT,
  PREVENTIVO_NOTE_DEFAULT,
  PREVENTIVO_VALIDITA_GIORNI,
  prezzoNettoRigaPreventivo,
  roundEuro,
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
  type DestinatarioPreventivo,
} from "@/lib/amministrazione/preventivo-letterhead";
import { LISTINO_CONTRATTO_MSG } from "@/lib/ecosystem/listino-vigente";

type DraftRiga = PreventivoProdottoDraft & {
  key: string;
  prodottoCodice: string;
  prodottoNome: string;
};

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

export function PreventivoFormModal({ onClose, onSaved }: Props) {
  const titleId = useId();
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

  const spedizioneImporto =
    consegnaMetodo === "corriere_nostro" && spedizioneBase !== ""
      ? applicaMargineSpedizione(spedizioneBase)
      : 0;

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
    let cancelled = false;
    void peekNextNumeroPreventivoAction(dataPreventivo).then((res) => {
      if (cancelled) return;
      setNumeroPreview(res.success ? res.numero : "N/ANNO");
    });
    return () => {
      cancelled = true;
    };
  }, [dataPreventivo]);

  useEffect(() => {
    if (consegnaMetodo !== "corriere_nostro") {
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
  }, [consegnaMetodo, destinatario, pesoKg, spedizioneBase]);

  function applyConsegna(next: PreventivoConsegna, nolo: number | "") {
    setConsegnaMetodo(next);
    setSpedizioneACarico(caricoDefaultDaConsegna(next));
    setSpedizioneFonte(fonteDefaultDaConsegna(next));
    if (next !== "corriere_nostro") {
      setSpedizioneBase("");
      setSpedizioneMsg(null);
    } else {
      setSpedizioneBase(nolo);
    }
  }

  function openEdit(kind: Exclude<EditKind, null>, rowKey: string | null = null) {
    setEditKey(rowKey);
    if (kind === "data") setDraftData(dataPreventivo);
    if (kind === "commerciale") {
      setDraftCommercialeId(commerciale?.id ?? "");
    }
    if (kind === "spedizione") {
      setDraftConsegna(consegnaMetodo);
      setDraftNolo(spedizioneBase);
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      confezionamento: r.confezionamento,
      imballaggioVoceId: r.imballaggioVoceId,
    }));
    const base =
      consegnaMetodo === "corriere_nostro" && spedizioneBase !== ""
        ? spedizioneBase
        : 0;
    setSaving(true);
    setFormError(null);
    const result = await createPreventivoAction({
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
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    onSaved(result.item);
  }

  const draftNoloImporto =
    draftConsegna === "corriere_nostro" && draftNolo !== ""
      ? applicaMargineSpedizione(draftNolo)
      : 0;

  const totali = useMemo(() => {
    let imponibile = 0;
    let iva = 0;
    for (const r of righe) {
      const netto = prezzoNettoRigaPreventivo(
        r.prezzoUnitario,
        r.scontoExtraPct
      );
      const imp = netto * r.quantita;
      const aliq = r.ivaPercentuale > 0 ? r.ivaPercentuale : ivaDocumento;
      imponibile += imp;
      iva += imp * (aliq / 100);
    }
    if (spedizioneImporto > 0) {
      imponibile += spedizioneImporto;
      iva += spedizioneImporto * (ivaDocumento / 100);
    }
    const impR = roundEuro(imponibile);
    const ivaR = roundEuro(iva);
    return {
      imponibile: impR,
      iva: ivaR,
      totale: roundEuro(impR + ivaR),
    };
  }, [righe, spedizioneImporto, ivaDocumento]);

  const spedizioneTesto =
    consegnaMetodo === "corriere_nostro" && spedizioneImporto > 0
      ? `${PREVENTIVO_CONSEGNA_LABEL[consegnaMetodo]} · ${euro(spedizioneImporto)} €`
      : PREVENTIVO_CONSEGNA_LABEL[consegnaMetodo];

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !fieldOpen) onClose();
      }}
    >
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <h2 id={titleId} className="text-sm font-semibold text-white">
          Nuovo preventivo
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            form="preventivo-a4-form"
            disabled={saving}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva bozza"}
          </button>
        </div>
      </div>

      {formError ? (
        <p className="mx-auto mb-3 max-w-[210mm] rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {formError}
        </p>
      ) : null}

      <form
        id="preventivo-a4-form"
        onSubmit={onSubmit}
        aria-labelledby={titleId}
      >
        <article
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
        >
          <div className="box-border flex min-h-[297mm] flex-col px-[14mm] py-[12mm]">
            <PreventivoA4Letterhead
              numero={numeroPreview}
              dataPreventivo={dataPreventivo}
              onEditData={() => openEdit("data")}
              commerciale={commerciale}
              onEditCommerciale={() => openEdit("commerciale")}
            />

            <PreventivoDestinatarioPicker
              value={destinatario}
              onChange={setDestinatario}
              onEdit={() => openEdit("destinatario")}
            />

            <div className="mt-8 border-t border-slate-200 pt-5">
              <PreventivoDocField
                label="Aggiungi o modifica prodotti"
                onEdit={() => openEdit("prodotto")}
              >
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-300 text-slate-600">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                      <th className="py-1.5 pr-2 font-medium">Qty</th>
                      <th className="py-1.5 pr-2 font-medium">Listino</th>
                      <th className="py-1.5 pr-2 font-medium">Extra</th>
                      <th className="py-1.5 pr-2 font-medium">Netto</th>
                      <th className="py-1.5 pr-2 font-medium">Conf.</th>
                      <th className="py-1.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {righe.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-2 text-slate-400 italic"
                        >
                          Descrizione prodotto, quantità, prezzo…
                        </td>
                      </tr>
                    ) : (
                      righe.map((riga) => {
                        const netto = prezzoNettoRigaPreventivo(
                          riga.prezzoUnitario,
                          riga.scontoExtraPct
                        );
                        return (
                          <tr
                            key={riga.key}
                            className="border-b border-slate-100"
                          >
                            <td className="py-1.5 pr-2">
                              {riga.prodottoCodice} — {riga.prodottoNome}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {riga.quantita} {riga.unitaMisura}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {euro(riga.prezzoUnitario)} €
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {riga.scontoExtraPct
                                ? `${riga.scontoExtraPct} %`
                                : "—"}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums font-medium">
                              {euro(netto)} €
                            </td>
                            <td className="py-1.5 pr-2">
                              {riga.confezionamento || "Standard"}
                            </td>
                            <td className="py-1.5 text-right print:hidden">
                              <button
                                type="button"
                                onClick={() => openEdit("prodotto", riga.key)}
                                className="mr-1 text-[10px] text-slate-500 underline"
                              >
                                modifica
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRighe((prev) =>
                                    prev.filter((r) => r.key !== riga.key)
                                  )
                                }
                                className="text-red-600"
                                aria-label="Rimuovi riga"
                              >
                                <FaTrash size={11} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </PreventivoDocField>
              {righe.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openEdit("prodotto")}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400 print:hidden"
                >
                  <FaPlus size={8} />
                  Aggiungi riga
                </button>
              ) : null}

              <PreventivoDocField
                label="Modifica note"
                onEdit={() => openEdit("note")}
                className="mt-4"
              >
                <p className="whitespace-pre-line text-[11px] leading-[1.45] text-slate-800">
                  {note}
                </p>
              </PreventivoDocField>

              <div className="mt-4 space-y-1 text-[11px] leading-[1.45]">
                <PreventivoDocField
                  label="Modifica spedizione e consegna"
                  onEdit={() => openEdit("spedizione")}
                >
                  <PreventivoDocQa
                    domanda="Spedizione e consegna"
                    risposta={spedizioneTesto}
                  />
                </PreventivoDocField>
                <PreventivoDocField
                  label="Modifica giorni di consegna"
                  onEdit={() => openEdit("giorni")}
                >
                  <PreventivoDocQa
                    domanda="Giorni di consegna"
                    risposta={giorniConsegna}
                  />
                </PreventivoDocField>
              </div>
              <div className="mt-3 h-px w-full bg-slate-900" />
            </div>

            <PreventivoA4PiePagina
              tipoPagamento={tipoPagamento}
              onEditPagamento={() => openEdit("pagamento")}
              numero={numeroPreview}
              dataPreventivo={dataPreventivo}
              ivaPercentuale={ivaDocumento}
              validitaGiorni={validitaGiorni}
              onEditTotali={() => openEdit("totali")}
              imponibile={totali.imponibile}
              totaleIva={totali.iva}
              totalePreventivo={totali.totale}
            />
          </div>
        </article>
      </form>

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
          initial={
            editing
              ? {
                  prodottoId: editing.prodottoId,
                  quantita: editing.quantita,
                  scontoExtraPct: editing.scontoExtraPct,
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
            applyConsegna(draftConsegna, draftNolo);
            closeEdit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Modalità</span>
            <select
              value={draftConsegna}
              onChange={(e) =>
                setDraftConsegna(e.target.value as PreventivoConsegna)
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {PREVENTIVO_CONSEGNA.map((c) => (
                <option key={c} value={c}>
                  {PREVENTIVO_CONSEGNA_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {draftConsegna === "corriere_nostro" ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nolo corriere (€)</span>
                <ClearableNumberInput
                  min={0}
                  value={draftNolo}
                  onValueChange={setDraftNolo}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <p className="text-xs text-slate-500">
                In preventivo (+{SPEDIZIONE_MARKUP_SICUREZZA_PCT}%):{" "}
                {draftNoloImporto ? `${euro(draftNoloImporto)} €` : "—"}
                {spedizioneMsg ? ` · ${spedizioneMsg}` : ""}
              </p>
            </>
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
    </div>
  );
}
