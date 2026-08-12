"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  createOrdineAction,
  previewNumeroInternoOrdineAction,
  updateOrdineAction,
} from "@/app/actions/ordini";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import {
  OrdineDettaglioFields,
  useOrdineDettaglioState,
} from "@/components/amministrazione/OrdineDettaglioFields";
import { OrdinePagamentoFields } from "@/components/amministrazione/OrdinePagamentoFields";
import type {
  Ordine,
  OrdineAllegatoMeta,
  OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import type { OrdineStato } from "@/types/database";

type Props = {
  mode: "create" | "edit";
  stato: OrdineStato;
  initial?: Ordine | null;
  requireConsegna?: boolean;
  onClose: () => void;
  onSaved: (ordine: Ordine) => void;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function OrdineFormModal({
  mode,
  stato,
  initial,
  requireConsegna = stato === "storico",
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const dettaglio = useOrdineDettaglioState();
  const [clienteId, setClienteId] = useState(initial?.clienteId ?? "");
  const [clienteNome, setClienteNome] = useState(initial?.cliente ?? "");
  const [clienteTarga, setClienteTarga] = useState(
    initial?.clienteCodiceTarga ?? ""
  );
  const [dataOrdine, setDataOrdine] = useState(
    initial?.dataOrdine ?? todayInputValue()
  );
  const [dataConsegna, setDataConsegna] = useState(
    initial?.dataConsegna ?? todayInputValue()
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [tipoPagamento, setTipoPagamento] = useState<OrdineTipoPagamento>(
    initial?.tipoPagamento ?? "alla_consegna"
  );
  const [pagato, setPagato] = useState(initial?.pagato ?? false);
  const [dataPagamento, setDataPagamento] = useState(
    initial?.dataPagamento ?? ""
  );
  const [noteRateizzazione, setNoteRateizzazione] = useState(
    initial?.noteRateizzazione ?? ""
  );
  const [ricevutaFile, setRicevutaFile] = useState<File | null>(null);
  const [ricevutaEsistente, setRicevutaEsistente] =
    useState<OrdineAllegatoMeta | null>(initial?.ricevutaPagamento ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeOfferta, setRemoveOfferta] = useState(false);
  const [removeOrdineCliente, setRemoveOrdineCliente] = useState(false);
  const [removeRicevuta, setRemoveRicevuta] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !initial) return;
    dettaglio.setNumeroInterno(initial.numeroInterno);
    dettaglio.setNumeroCliente(initial.numeroCliente);
    dettaglio.setRighe(
      initial.righe.length ? initial.righe : dettaglio.righe
    );
    dettaglio.setTrasporto(initial.trasporto);
    dettaglio.setOffertaEsistente(initial.offerta);
    dettaglio.setOrdineClienteEsistente(initial.ordineClienteDoc);
    setTipoPagamento(initial.tipoPagamento);
    setPagato(initial.pagato);
    setDataPagamento(initial.dataPagamento ?? "");
    setNoteRateizzazione(initial.noteRateizzazione ?? "");
    setRicevutaEsistente(initial.ricevutaPagamento);
    setRicevutaFile(null);
    setRemoveRicevuta(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initial?.id]);

  useEffect(() => {
    if (mode === "edit") return;
    if (!clienteId || !clienteTarga || !dataOrdine) {
      dettaglio.setNumeroInterno("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await previewNumeroInternoOrdineAction({
        clienteId,
        codiceTargaCliente: clienteTarga,
        dataOrdine,
      });
      if (cancelled) return;
      if (result.success) dettaglio.setNumeroInterno(result.numeroInterno);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clienteId, clienteTarga, dataOrdine]);

  useEffect(() => {
    // Escape / click fuori non chiudono (evita perdita dati): solo Annulla / Salva.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (document.querySelector("[data-cliente-modal-root='true']")) return;
    setFormError(null);

    if (!clienteId || !clienteNome.trim() || !clienteTarga) {
      setFormError("Seleziona un cliente dall’anagrafica.");
      return;
    }
    if (!dataOrdine) return;
    if (requireConsegna && !dataConsegna) {
      setFormError("Data consegna obbligatoria.");
      return;
    }
    if (requireConsegna && dataConsegna < dataOrdine) {
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
    if (pagato && !dataPagamento) {
      setFormError("Se l’ordine è pagato, indica la data pagamento.");
      return;
    }

    const payload = {
      clienteId,
      cliente: clienteNome.trim(),
      codiceTargaCliente: clienteTarga,
      dataOrdine,
      dataConsegna: requireConsegna ? dataConsegna : null,
      numeroInterno:
        mode === "edit"
          ? initial?.numeroInterno
          : dettaglio.numeroInterno || undefined,
      numeroCliente: dettaglio.numeroCliente.trim() || undefined,
      stato,
      origineStorico: stato === "storico" ? ("manuale" as const) : null,
      note: note.trim(),
      tipoPagamento,
      pagato,
      dataPagamento: dataPagamento || null,
      noteRateizzazione: noteRateizzazione.trim(),
      trasporto: dettaglio.trasporto,
      righe: righeValide,
    };

    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    if (dettaglio.offertaFile) fd.set("offertaFile", dettaglio.offertaFile);
    if (dettaglio.ordineClienteFile) {
      fd.set("ordineClienteFile", dettaglio.ordineClienteFile);
    }
    if (ricevutaFile) fd.set("ricevutaPagamentoFile", ricevutaFile);
    if (removeOfferta) fd.set("removeOfferta", "1");
    if (removeOrdineCliente) fd.set("removeOrdineCliente", "1");
    if (removeRicevuta) fd.set("removeRicevutaPagamento", "1");

    setSaving(true);
    try {
      const result =
        mode === "edit" && initial
          ? await updateOrdineAction(initial.id, fd)
          : await createOrdineAction(fd);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      onSaved(result.ordine);
    } catch {
      setFormError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "edit"
      ? `Modifica ordine ${initial?.numeroInterno ?? ""}`
      : stato === "storico"
        ? "Aggiungi ordine storico"
        : "Nuovo ordine ricevuto";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {mode === "edit"
            ? `Versione attuale: ${initial?.versione ?? 1}. Ogni salvataggio incrementa la versione e scrive in audit log.`
            : "I dati vengono salvati su database con tracciabilità ISO 9001."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Cliente</span>
            <ClienteSelectField
              value={clienteId}
              autoFocus={mode === "create"}
              onChange={(cliente) => {
                setClienteId(cliente?.id ?? "");
                setClienteNome(cliente?.ragioneSociale ?? "");
                setClienteTarga(cliente?.codiceTarga ?? "");
              }}
            />
          </div>

          <div
            className={`grid gap-3 ${requireConsegna ? "grid-cols-2" : "grid-cols-1"}`}
          >
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
            {requireConsegna ? (
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
            ) : null}
          </div>

          <OrdineDettaglioFields
            numeroInterno={
              mode === "edit"
                ? (initial?.numeroInterno ?? "")
                : dettaglio.numeroInterno
            }
            numeroCliente={dettaglio.numeroCliente}
            onNumeroClienteChange={dettaglio.setNumeroCliente}
            offertaFile={dettaglio.offertaFile}
            offertaEsistente={
              removeOfferta ? null : dettaglio.offertaEsistente
            }
            onOffertaFileChange={(f) => {
              dettaglio.setOffertaFile(f);
              if (f) setRemoveOfferta(false);
            }}
            onOffertaEsistenteClear={() => {
              dettaglio.setOffertaEsistente(null);
              setRemoveOfferta(true);
            }}
            ordineClienteFile={dettaglio.ordineClienteFile}
            ordineClienteEsistente={
              removeOrdineCliente ? null : dettaglio.ordineClienteEsistente
            }
            onOrdineClienteFileChange={(f) => {
              dettaglio.setOrdineClienteFile(f);
              if (f) setRemoveOrdineCliente(false);
            }}
            onOrdineClienteEsistenteClear={() => {
              dettaglio.setOrdineClienteEsistente(null);
              setRemoveOrdineCliente(true);
            }}
            righe={dettaglio.righe}
            onRigheChange={dettaglio.setRighe}
            trasporto={dettaglio.trasporto}
            onTrasportoChange={dettaglio.setTrasporto}
          />

          <OrdinePagamentoFields
            tipoPagamento={tipoPagamento}
            onTipoPagamentoChange={setTipoPagamento}
            pagato={pagato}
            onPagatoChange={setPagato}
            dataPagamento={dataPagamento}
            onDataPagamentoChange={setDataPagamento}
            noteRateizzazione={noteRateizzazione}
            onNoteRateizzazioneChange={setNoteRateizzazione}
            ricevutaFile={ricevutaFile}
            ricevutaEsistente={removeRicevuta ? null : ricevutaEsistente}
            onRicevutaFileChange={(f) => {
              setRicevutaFile(f);
              if (f) setRemoveRicevuta(false);
            }}
            onRicevutaEsistenteClear={() => {
              setRicevutaEsistente(null);
              setRemoveRicevuta(true);
            }}
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
              {saving
                ? "Salvataggio…"
                : mode === "edit"
                  ? "Salva modifiche"
                  : "Salva ordine"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
