"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createCampionaturaAction,
  previewNumeroCampionaturaAction,
} from "@/app/actions/campionature";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  CAMPIONATURA_UM,
  formatIndirizzoSede,
  type Campionatura,
  type CampionaturaUm,
} from "@/lib/amministrazione/campionature";

type DraftRiga = {
  prodottoId: string;
  quantita: number | "";
  unitaMisura: CampionaturaUm;
  lottoCodice: string;
  note: string;
};

type Props = {
  onClose: () => void;
  onSaved: (item: Campionatura) => void;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyRiga(): DraftRiga {
  return {
    prodottoId: "",
    quantita: "",
    unitaMisura: "g",
    lottoCodice: "",
    note: "",
  };
}

export function CampionaturaFormModal({ onClose, onSaved }: Props) {
  const titleId = useId();
  const { prodotti, ready: prodottiReady } = useProdottiPropri();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [dataInvio, setDataInvio] = useState(todayInputValue);
  const [destinatario, setDestinatario] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<DraftRiga[]>([emptyRiga()]);
  const [numeroPreview, setNumeroPreview] = useState<string | null>(null);
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
    if (!cliente?.codiceTarga || !dataInvio) {
      setNumeroPreview(null);
      return;
    }
    let cancelled = false;
    void previewNumeroCampionaturaAction({
      codiceTargaCliente: cliente.codiceTarga,
      dataInvio,
    }).then((r) => {
      if (cancelled) return;
      setNumeroPreview(r.success ? r.numeroInterno : null);
    });
    return () => {
      cancelled = true;
    };
  }, [cliente?.codiceTarga, dataInvio]);

  function applyCliente(next: Cliente | null) {
    setCliente(next);
    if (!next) return;
    setDestinatario((prev) => prev.trim() || next.ragioneSociale);
    const mag = formatIndirizzoSede(next.sedeMagazzino);
    const amm = formatIndirizzoSede(next.sedeAmministrativa);
    setIndirizzo((prev) => prev.trim() || mag || amm);
  }

  function updateRiga(index: number, patch: Partial<DraftRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cliente) {
      setFormError("Seleziona un’azienda.");
      return;
    }
    const mapped = righe.map((r) => {
      const prodotto = prodotti.find((p) => p.id === r.prodottoId);
      return {
        prodottoId: r.prodottoId,
        prodottoCodice: prodotto?.codice ?? "",
        prodottoNome: prodotto?.nome ?? "",
        quantita: r.quantita === "" ? 0 : r.quantita,
        unitaMisura: r.unitaMisura,
        lottoCodice: r.lottoCodice,
        note: r.note,
      };
    });
    setSaving(true);
    setFormError(null);
    const result = await createCampionaturaAction({
      clienteId: cliente.id,
      cliente: cliente.ragioneSociale,
      codiceTargaCliente: cliente.codiceTarga,
      dataInvio,
      destinatario: destinatario.trim() || cliente.ragioneSociale,
      indirizzoSpedizione: indirizzo,
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
          Invio campionatura
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Documento distinto dall’ordine. Numero interno{" "}
          <span className="font-mono">Cp-AA-TARGA/N</span>
          {numeroPreview ? (
            <>
              {" "}
              — anteprima{" "}
              <span className="font-mono font-medium text-slate-800">
                {numeroPreview}
              </span>
            </>
          ) : null}
          . Salvataggio = inviata e approvata (ISO 9001).
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Azienda</span>
              <ClienteSelectField
                value={cliente?.id ?? ""}
                onChange={applyCliente}
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Data invio</span>
              <input
                type="date"
                required
                value={dataInvio}
                onChange={(e) => setDataInvio(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Destinatario</span>
              <input
                type="text"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="Ragione sociale o referente"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Indirizzo di spedizione
              </span>
              <input
                type="text"
                value={indirizzo}
                onChange={(e) => setIndirizzo(e.target.value)}
                placeholder="Si precompila dalla sede magazzino del cliente"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Prodotti e lotti</p>
              <button
                type="button"
                onClick={() => setRighe((prev) => [...prev, emptyRiga()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                <FaPlus size={10} />
                Aggiungi riga
              </button>
            </div>
            <div className="space-y-3">
              {righe.map((riga, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[var(--border)] bg-slate-50/70 p-3 sm:grid-cols-[1fr_5.5rem_4.5rem_8rem_auto]"
                >
                  <label className="block text-xs sm:col-span-1">
                    <span className="mb-1 block font-medium text-slate-600">
                      Prodotto
                    </span>
                    <select
                      required
                      value={riga.prodottoId}
                      disabled={!prodottiReady}
                      onChange={(e) =>
                        updateRiga(index, { prodottoId: e.target.value })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    >
                      <option value="">Seleziona…</option>
                      {prodotti.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codice} — {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      Q.tà
                    </span>
                    <ClearableNumberInput
                      required
                      min={0}
                      step="any"
                      value={riga.quantita}
                      onValueChange={(v) => updateRiga(index, { quantita: v })}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      UM
                    </span>
                    <select
                      value={riga.unitaMisura}
                      onChange={(e) =>
                        updateRiga(index, {
                          unitaMisura: e.target.value as CampionaturaUm,
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    >
                      {CAMPIONATURA_UM.map((um) => (
                        <option key={um} value={um}>
                          {um}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      Lotto
                    </span>
                    <input
                      type="text"
                      required
                      value={riga.lottoCodice}
                      onChange={(e) =>
                        updateRiga(index, { lottoCodice: e.target.value })
                      }
                      placeholder="Codice lotto"
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      title="Rimuovi riga"
                      disabled={righe.length === 1}
                      onClick={() =>
                        setRighe((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <FaTrash size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
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
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Registra invio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
