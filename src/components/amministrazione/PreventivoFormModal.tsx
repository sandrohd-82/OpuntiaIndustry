"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createPreventivoAction,
  getListinoPrezzoVigenteAction,
} from "@/app/actions/preventivi";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Cliente } from "@/lib/amministrazione/clienti";
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
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [dataPreventivo, setDataPreventivo] = useState(today);
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
    if (!cliente) {
      setFormError("Seleziona un’azienda.");
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
      clienteId: cliente.id,
      cliente: cliente.ragioneSociale,
      codiceTargaCliente: cliente.codiceTarga,
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
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo preventivo
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Stato iniziale: Creato (non inviato). Il prezzo arriva dal listino In
          Uso. Fuori produzione: non preventivabile. Non disponibile: si può
          preventivare; l’ordine successivo resterà sospeso.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Azienda</span>
              <ClienteSelectField
                value={cliente?.id ?? ""}
                onChange={setCliente}
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Data preventivo</span>
              <input
                type="date"
                required
                value={dataPreventivo}
                onChange={(e) => setDataPreventivo(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Prodotti</p>
              <button
                type="button"
                onClick={() => setRighe((p) => [...p, emptyRiga()])}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium"
              >
                <FaPlus size={10} />
                Aggiungi
              </button>
            </div>
            <div className="space-y-3">
              {righe.map((riga, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[var(--border)] bg-slate-50/70 p-3 sm:grid-cols-[1fr_5.5rem_7rem_1fr_auto]"
                >
                  <select
                    required
                    disabled={!ready}
                    value={riga.prodottoId}
                    onChange={(e) => void onProdotto(index, e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
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
                    className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                  <div>
                    <ClearableNumberInput
                      required
                      min={0}
                      placeholder="€/kg"
                      value={riga.prezzoUnitario}
                      disabled={riga.prezzoDaListino || Boolean(riga.blocco)}
                      onValueChange={(v) =>
                        setRighe((prev) =>
                          prev.map((r, i) =>
                            i === index
                              ? { ...r, prezzoUnitario: v, prezzoDaListino: false }
                              : r
                          )
                        )
                      }
                      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
                    />
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
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
                    className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={righe.length === 1}
                    onClick={() =>
                      setRighe((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="rounded-lg p-2 text-red-600 disabled:opacity-40"
                  >
                    <FaTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Metodo di consegna</span>
              <select
                value={consegnaMetodo}
                onChange={(e) =>
                  setConsegnaMetodo(e.target.value as PreventivoConsegna)
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                {PREVENTIVO_CONSEGNA.map((c) => (
                  <option key={c} value={c}>
                    {PREVENTIVO_CONSEGNA_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Spedizione a carico</span>
              <select
                value={spedizioneACarico}
                onChange={(e) =>
                  setSpedizioneACarico(
                    e.target.value as "cliente" | "agrinsicilia" | "diviso"
                  )
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Pagamento concordato</span>
              <select
                value={tipoPagamento}
                onChange={(e) =>
                  setTipoPagamento(e.target.value as OrdineTipoPagamento)
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Note tempi pagamento</span>
              <input
                value={tempiNote}
                onChange={(e) => setTempiNote(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Crea preventivo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
