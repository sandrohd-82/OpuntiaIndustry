"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import {
  OrdineDettaglioFields,
  useOrdineDettaglioState,
} from "@/components/amministrazione/OrdineDettaglioFields";
import {
  loadOrdiniRicevuti,
  readFileAsDocumentoCliente,
  type OrdineDettaglioInput,
} from "@/lib/amministrazione/ordini";

export type NuovoOrdineValues = OrdineDettaglioInput;

type Props = {
  onClose: () => void;
  onCreate: (values: NuovoOrdineValues) => void | Promise<void>;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function suggestNumeroRicevuto(): string {
  const year = new Date().getFullYear();
  const existing = loadOrdiniRicevuti();
  const prefix = `ORD-${year}-`;
  const seq =
    existing.filter((o) => (o.numeroInterno || o.numero).startsWith(prefix))
      .length + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export function NuovoOrdineModal({ onClose, onCreate }: Props) {
  const titleId = useId();
  const suggested = useMemo(() => suggestNumeroRicevuto(), []);
  const dettaglio = useOrdineDettaglioState(suggested);
  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [dataOrdine, setDataOrdine] = useState(todayInputValue);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-cliente-modal-root='true']")) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (document.querySelector("[data-cliente-modal-root='true']")) return;
    setFormError(null);

    if (!clienteId || !clienteNome.trim()) {
      setFormError("Seleziona un cliente dall’anagrafica.");
      return;
    }
    if (!dettaglio.numeroInterno.trim()) {
      setFormError("Inserisci il numero ordine interno.");
      return;
    }
    if (!dataOrdine) return;
    const righeValide = dettaglio.righe.filter(
      (r) => r.prodottoId && r.quantita > 0
    );
    if (righeValide.length === 0) {
      setFormError("Aggiungi almeno una riga prodotto valida.");
      return;
    }

    setSaving(true);
    try {
      let documento = dettaglio.documentoEsistente;
      if (dettaglio.documentoFile) {
        documento = await readFileAsDocumentoCliente(dettaglio.documentoFile);
      }
      await onCreate({
        clienteId,
        cliente: clienteNome.trim(),
        dataOrdine,
        numeroInterno: dettaglio.numeroInterno.trim(),
        numeroCliente: dettaglio.numeroCliente.trim() || undefined,
        documentoOrdineCliente: documento,
        righe: dettaglio.righe,
        trasporto: dettaglio.trasporto,
        note: note.trim(),
      });
    } catch {
      setFormError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={() => {
        if (document.querySelector("[data-cliente-modal-root='true']")) return;
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo ordine ricevuto
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Compila i dati dell’ordine, i prodotti e l’eventuale trasporto.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Cliente</span>
            <ClienteSelectField
              value={clienteId}
              autoFocus
              onChange={(cliente) => {
                setClienteId(cliente?.id ?? "");
                setClienteNome(cliente?.ragioneSociale ?? "");
              }}
            />
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data ordine</span>
            <input
              type="date"
              value={dataOrdine}
              onChange={(e) => setDataOrdine(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <OrdineDettaglioFields
            numeroInterno={dettaglio.numeroInterno}
            onNumeroInternoChange={dettaglio.setNumeroInterno}
            numeroCliente={dettaglio.numeroCliente}
            onNumeroClienteChange={dettaglio.setNumeroCliente}
            documentoFile={dettaglio.documentoFile}
            documentoEsistente={dettaglio.documentoEsistente}
            onDocumentoFileChange={dettaglio.setDocumentoFile}
            onDocumentoEsistenteClear={() =>
              dettaglio.setDocumentoEsistente(null)
            }
            righe={dettaglio.righe}
            onRigheChange={dettaglio.setRighe}
            trasporto={dettaglio.trasporto}
            onTrasportoChange={dettaglio.setTrasporto}
          />

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : "Salva ordine"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
