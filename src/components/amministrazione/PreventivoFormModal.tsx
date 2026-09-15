"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createPreventivoAction,
  getListinoPrezzoVigenteAction,
  peekNextNumeroPreventivoAction,
} from "@/app/actions/preventivi";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoDestinatarioPicker } from "@/components/amministrazione/PreventivoDestinatarioPicker";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  ORDINE_TIPI_PAGAMENTO,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import {
  PREVENTIVO_CONSEGNA,
  PREVENTIVO_CONSEGNA_LABEL,
  type Preventivo,
  type PreventivoConsegna,
} from "@/lib/amministrazione/preventivi";
import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";
import { LISTINO_CONTRATTO_MSG } from "@/lib/ecosystem/listino-vigente";

type DraftRiga = {
  prodottoId: string;
  quantita: number | "";
  prezzoUnitario: number | "";
  listinoId: string | null;
  prezzoDaListino: boolean;
  confezionamento: string;
  disponibilita:
    | "in_produzione"
    | "fuori_produzione"
    | "non_disponibile"
    | null;
  blocco: "fuori_produzione" | "senza_prezzo" | null;
};

type Props = {
  onClose: () => void;
  onSaved: (item: Preventivo) => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyRiga(): DraftRiga {
  return {
    prodottoId: "",
    quantita: "",
    prezzoUnitario: "",
    listinoId: null,
    prezzoDaListino: false,
    confezionamento: "",
    disponibilita: null,
    blocco: null,
  };
}

export function PreventivoFormModal({ onClose, onSaved }: Props) {
  const titleId = useId();
  const { prodotti, ready } = useProdottiPropri();
  const [destinatario, setDestinatario] =
    useState<DestinatarioPreventivo | null>(null);
  const [dataPreventivo, setDataPreventivo] = useState(today);
  const [numeroPreview, setNumeroPreview] = useState("N/ANNO");
  const [righe, setRighe] = useState<DraftRiga[]>([emptyRiga()]);
  const [consegnaMetodo, setConsegnaMetodo] =
    useState<PreventivoConsegna>("corriere_nostro");
  const [spedizioneACarico, setSpedizioneACarico] = useState<
    "cliente" | "agrinsicilia" | "diviso"
  >("agrinsicilia");
  const [spedizioneImporto, setSpedizioneImporto] = useState<number | "">("");
  const [tipoPagamento, setTipoPagamento] =
    useState<OrdineTipoPagamento>("alla_consegna");
  const [tempiGiorni, setTempiGiorni] = useState<number | "">("");
  const [tempiNote, setTempiNote] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving]);

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

  async function onProdotto(index: number, prodottoId: string) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, prodottoId } : r))
    );
    if (!prodottoId) return;
    const res = await getListinoPrezzoVigenteAction(prodottoId);
    if (!res.success) {
      setFormError(res.error);
      return;
    }
    const disp = res.disponibilita;
    let blocco: DraftRiga["blocco"] = null;
    if (disp === "fuori_produzione") blocco = "fuori_produzione";
    else if (res.prezzo == null || res.prezzo <= 0) blocco = "senza_prezzo";
    setRighe((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              prodottoId,
              prezzoUnitario:
                blocco || res.prezzo == null ? "" : res.prezzo,
              listinoId: res.listinoId,
              prezzoDaListino: Boolean(res.prezzo && res.prezzo > 0),
              disponibilita: disp,
              blocco,
            }
          : r
      )
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!destinatario) {
      setFormError("Seleziona un destinatario.");
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
    const mapped = righe.map((r) => {
      const p = prodotti.find((x) => x.id === r.prodottoId);
      return {
        prodottoId: r.prodottoId,
        prodottoCodice: p?.codice ?? "",
        prodottoNome: p?.nome ?? "",
        quantita: r.quantita === "" ? 0 : r.quantita,
        prezzoUnitario: r.prezzoUnitario === "" ? 0 : r.prezzoUnitario,
        listinoId: r.listinoId,
        prezzoDaListino: r.prezzoDaListino,
        confezionamento: r.confezionamento,
      };
    });
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
      spedizioneImporto:
        consegnaMetodo === "corriere_nostro" && spedizioneACarico !== "cliente"
          ? spedizioneImporto === ""
            ? 0
            : spedizioneImporto
          : 0,
      tipoPagamento,
      tempiPagamentoGiorni: tempiGiorni === "" ? null : tempiGiorni,
      tempiPagamentoNote: tempiNote,
      note,
      righe: mapped,
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    onSaved(result.item);
  }

  const mostraCostoSpedizione =
    consegnaMetodo === "corriere_nostro" && spedizioneACarico !== "cliente";

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
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
          <div className="box-border min-h-[297mm] px-[14mm] py-[12mm]">
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
                    onClick={() => setRighe((p) => [...p, emptyRiga()])}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium"
                  >
                    <FaPlus size={10} />
                    Aggiungi
                  </button>
                </div>
                <div className="space-y-3">
                  {righe.map((riga, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[1fr_5.5rem_7rem_1fr_auto]"
                    >
                      <select
                        required
                        disabled={!ready}
                        value={riga.prodottoId}
                        onChange={(e) => void onProdotto(index, e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Prodotto…</option>
                        {prodotti.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codice} — {p.nome}
                          </option>
                        ))}
                      </select>
                      <ClearableNumberInput
                        required
                        min={0}
                        placeholder="kg"
                        value={riga.quantita}
                        onValueChange={(v) =>
                          setRighe((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, quantita: v } : r
                            )
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      />
                      <div>
                        <ClearableNumberInput
                          required
                          min={0}
                          placeholder="€/kg"
                          value={riga.prezzoUnitario}
                          disabled={
                            riga.prezzoDaListino || Boolean(riga.blocco)
                          }
                          onValueChange={(v) =>
                            setRighe((prev) =>
                              prev.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      prezzoUnitario: v,
                                      prezzoDaListino: false,
                                    }
                                  : r
                              )
                            )
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
                        />
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {riga.blocco === "fuori_produzione"
                            ? "Fuori produzione"
                            : riga.blocco === "senza_prezzo"
                              ? "Imposta il prezzo in listino"
                              : riga.disponibilita === "non_disponibile"
                                ? "Al momento non disponibile"
                                : riga.prezzoDaListino
                                  ? "Da listino In Uso"
                                  : "Manuale"}
                        </p>
                      </div>
                      <input
                        value={riga.confezionamento}
                        onChange={(e) =>
                          setRighe((prev) =>
                            prev.map((r, i) =>
                              i === index
                                ? { ...r, confezionamento: e.target.value }
                                : r
                            )
                          )
                        }
                        placeholder="Confezionamento"
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={righe.length === 1}
                        onClick={() =>
                          setRighe((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded p-2 text-red-600 disabled:opacity-40"
                      >
                        <FaTrash size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Metodo di consegna
                  </span>
                  <select
                    value={consegnaMetodo}
                    onChange={(e) =>
                      setConsegnaMetodo(e.target.value as PreventivoConsegna)
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
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Spedizione a carico
                  </span>
                  <select
                    value={spedizioneACarico}
                    onChange={(e) =>
                      setSpedizioneACarico(
                        e.target.value as "cliente" | "agrinsicilia" | "diviso"
                      )
                    }
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="cliente">Cliente</option>
                    <option value="agrinsicilia">Nostro (Agrinsicilia)</option>
                    <option value="diviso">Diviso</option>
                  </select>
                </label>
                {mostraCostoSpedizione ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      Prezzo spedizione (€)
                    </span>
                    <ClearableNumberInput
                      min={0}
                      value={spedizioneImporto}
                      onValueChange={setSpedizioneImporto}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                ) : null}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Pagamento concordato
                  </span>
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
                  <span className="mb-1 block font-medium">Tempi (giorni)</span>
                  <ClearableNumberInput
                    min={0}
                    value={tempiGiorni}
                    onValueChange={setTempiGiorni}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">
                    Note tempi pagamento
                  </span>
                  <input
                    value={tempiNote}
                    onChange={(e) => setTempiNote(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Note</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>

              {formError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              ) : null}
            </div>
          </div>
        </article>
      </form>
    </div>
  );
}
