"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import {
  OrdineDettaglioFields,
  useOrdineDettaglioState,
} from "@/components/amministrazione/OrdineDettaglioFields";
import {
  nextNumeroInternoOrdine,
  readFileAsDocumentoCliente,
  type OrdineDettaglioInput,
} from "@/lib/amministrazione/ordini";

export type AggiungiOrdineStoricoValues = OrdineDettaglioInput & {
  dataConsegna: string;
};

type Props = {
  onClose: () => void;
  onCreate: (values: AggiungiOrdineStoricoValues) => void | Promise<void>;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AggiungiOrdineStoricoModal({ onClose, onCreate }: Props) {
  const titleId = useId();
  const dettaglio = useOrdineDettaglioState();
  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTarga, setClienteTarga] = useState("");
  const [dataOrdine, setDataOrdine] = useState(todayInputValue);
  const [dataConsegna, setDataConsegna] = useState(todayInputValue);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clienteId || !clienteTarga || !dataOrdine) {
      dettaglio.setNumeroInterno("");
      return;
    }
    dettaglio.setNumeroInterno(
      nextNumeroInternoOrdine({
        dataOrdine,
        codiceTargaCliente: clienteTarga,
        clienteId,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when keys change
  }, [clienteId, clienteTarga, dataOrdine]);

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

    if (!clienteId || !clienteNome.trim() || !clienteTarga) {
      setFormError("Seleziona un cliente dall’anagrafica.");
      return;
    }
    if (!dataOrdine || !dataConsegna) return;
    if (dataConsegna < dataOrdine) {
      setFormError(
        "La data di consegna non può essere precedente alla data ordine."
      );
      return;
    }
    const righeValide = dettaglio.righe.filter(
      (r) => r.prodottoId && r.quantita > 0
    );
    if (righeValide.length === 0) {
      setFormError("Aggiungi almeno una riga prodotto valida.");
      return;
    }

    const numeroInterno = nextNumeroInternoOrdine({
      dataOrdine,
      codiceTargaCliente: clienteTarga,
      clienteId,
    });

    setSaving(true);
    try {
      let documento = dettaglio.documentoEsistente;
      if (dettaglio.documentoFile) {
        documento = await readFileAsDocumentoCliente(dettaglio.documentoFile);
      }
      await onCreate({
        clienteId,
        cliente: clienteNome.trim(),
        codiceTargaCliente: clienteTarga,
        dataOrdine,
        dataConsegna,
        numeroInterno,
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
          Aggiungi ordine storico
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Inserisci un ordine già ricevuto, processato e consegnato in passato.
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
                setClienteTarga(cliente?.codiceTarga ?? "");
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Data consegna</span>
              <input
                type="date"
                value={dataConsegna}
                onChange={(e) => setDataConsegna(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <OrdineDettaglioFields
            numeroInterno={dettaglio.numeroInterno}
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
              {saving ? "Salvataggio…" : "Salva nello storico"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
