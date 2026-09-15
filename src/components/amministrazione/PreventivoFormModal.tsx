"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  createPreventivoAction,
  peekNextNumeroPreventivoAction,
  stimaSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoA4PiePagina } from "@/components/amministrazione/PreventivoA4PiePagina";
import {
  PreventivoAggiungiProdottoModal,
  type PreventivoProdottoDraft,
} from "@/components/amministrazione/PreventivoAggiungiProdottoModal";
import { PreventivoDestinatarioPicker } from "@/components/amministrazione/PreventivoDestinatarioPicker";
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
  const [dataPreventivo, setDataPreventivo] = useState(today);
  const [numeroPreview, setNumeroPreview] = useState("N/ANNO");
  const [righe, setRighe] = useState<DraftRiga[]>([]);
  const [prodottoOpen, setProdottoOpen] = useState(false);
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
  const [noteEditing, setNoteEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const editing = editKey
    ? (righe.find((r) => r.key === editKey) ?? null)
    : null;

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
      if (e.key === "Escape" && !saving && !prodottoOpen) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving, prodottoOpen]);

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

  function onConsegna(next: PreventivoConsegna) {
    setConsegnaMetodo(next);
    setSpedizioneACarico(caricoDefaultDaConsegna(next));
    setSpedizioneFonte(fonteDefaultDaConsegna(next));
    if (next !== "corriere_nostro") {
      setSpedizioneBase("");
      setSpedizioneMsg(null);
    }
  }

  function openNuovoProdotto() {
    setEditKey(null);
    setProdottoOpen(true);
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
    setProdottoOpen(false);
    setEditKey(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!destinatario) {
      setFormError("Seleziona un destinatario.");
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
      ivaPercentuale: r.ivaPercentuale,
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

  const mostraCostoSpedizione = consegnaMetodo === "corriere_nostro";

  const totali = useMemo(() => {
    let imponibile = 0;
    let iva = 0;
    for (const r of righe) {
      const netto = prezzoNettoRigaPreventivo(
        r.prezzoUnitario,
        r.scontoExtraPct
      );
      const imp = netto * r.quantita;
      const aliq =
        r.ivaPercentuale > 0 ? r.ivaPercentuale : PREVENTIVO_IVA_DEFAULT;
      imponibile += imp;
      iva += imp * (aliq / 100);
    }
    if (spedizioneImporto > 0) {
      imponibile += spedizioneImporto;
      iva += spedizioneImporto * (PREVENTIVO_IVA_DEFAULT / 100);
    }
    const impR = roundEuro(imponibile);
    const ivaR = roundEuro(iva);
    return {
      imponibile: impR,
      iva: ivaR,
      totale: roundEuro(impR + ivaR),
    };
  }, [righe, spedizioneImporto]);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !prodottoOpen) onClose();
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
              onDataChange={setDataPreventivo}
            />

            <PreventivoDestinatarioPicker
              value={destinatario}
              onChange={setDestinatario}
            />

            <div className="mt-8 space-y-4 border-t border-slate-200 pt-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Prodotti</p>
                  <button
                    type="button"
                    onClick={openNuovoProdotto}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium"
                  >
                    <FaPlus size={10} />
                    Aggiungi prodotto
                  </button>
                </div>
                {righe.length === 0 ? (
                  <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                    Nessun prodotto. Usa «Aggiungi prodotto».
                  </p>
                ) : (
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
                      {righe.map((riga) => {
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
                            <td className="py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditKey(riga.key);
                                  setProdottoOpen(true);
                                }}
                                className="mr-1 rounded p-1 text-slate-600 hover:bg-slate-100"
                                aria-label="Modifica riga"
                              >
                                <FaPen size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRighe((prev) =>
                                    prev.filter((r) => r.key !== riga.key)
                                  )
                                }
                                className="rounded p-1 text-red-600 hover:bg-red-50"
                                aria-label="Rimuovi riga"
                              >
                                <FaTrash size={11} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">
                    Spedizione e consegna
                  </span>
                  <select
                    value={consegnaMetodo}
                    onChange={(e) =>
                      onConsegna(e.target.value as PreventivoConsegna)
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
                {mostraCostoSpedizione ? (
                  <>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">
                        Nolo corriere (€)
                      </span>
                      <ClearableNumberInput
                        min={0}
                        value={spedizioneBase}
                        onValueChange={setSpedizioneBase}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="text-sm">
                      <p className="mb-1 font-medium">
                        In preventivo (+{SPEDIZIONE_MARKUP_SICUREZZA_PCT}%)
                      </p>
                      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 tabular-nums">
                        {spedizioneImporto
                          ? `${euro(spedizioneImporto)} €`
                          : "—"}
                      </p>
                    </div>
                    {spedizioneMsg ? (
                      <p className="text-xs text-slate-500 sm:col-span-2">
                        {spedizioneMsg}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Pagamento</span>
                  <select
                    value={tipoPagamento}
                    onChange={(e) =>
                      setTipoPagamento(e.target.value as OrdineTipoPagamento)
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
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Giorni di consegna
                  </span>
                  <input
                    value={giorniConsegna}
                    onChange={(e) => setGiorniConsegna(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {formError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="mt-auto">
              <PreventivoA4PiePagina
                note={note}
                noteEditing={noteEditing}
                onNoteChange={setNote}
                onToggleNoteEdit={() => setNoteEditing((v) => !v)}
                tipoPagamento={tipoPagamento}
                numero={numeroPreview}
                dataPreventivo={dataPreventivo}
                imponibile={totali.imponibile}
                totaleIva={totali.iva}
                totalePreventivo={totali.totale}
              />
            </div>
          </div>
        </article>
      </form>

      {prodottoOpen ? (
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
          onClose={() => {
            setProdottoOpen(false);
            setEditKey(null);
          }}
          onConfirm={onConfirmProdotto}
        />
      ) : null}
    </div>
  );
}
