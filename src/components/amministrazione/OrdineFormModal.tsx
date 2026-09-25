"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  createOrdineAction,
  previewNumeroInternoOrdineAction,
  updateOrdineAction,
} from "@/app/actions/ordini";
import { AziendaOrdineSelect } from "@/components/amministrazione/AziendaOrdineSelect";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import type { AnagraficaOrdineFonte } from "@/lib/amministrazione/ordine-anagrafica";
import {
  OrdineDettaglioFields,
  useOrdineDettaglioState,
} from "@/components/amministrazione/OrdineDettaglioFields";
import { OrdinePagamentoFields } from "@/components/amministrazione/OrdinePagamentoFields";
import {
  totaleOrdine,
  type Ordine,
  type OrdineAllegatoMeta,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import {
  buildOrdineSessioneLocale,
  loadOrdineSessione,
  ORDINI_PERSISTENZA_DEFINITIVA,
  saveOrdineSessione,
} from "@/lib/amministrazione/ordine-sessione";
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
  const [anagraficaFonte, setAnagraficaFonte] =
    useState<AnagraficaOrdineFonte>("cliente");
  const [clienteId, setClienteId] = useState(initial?.clienteId ?? "");
  const [possibileClienteId, setPossibileClienteId] = useState("");
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
  const [sessioneMsg, setSessioneMsg] = useState<string | null>(null);
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
    const targaDoc =
      anagraficaFonte === "possibile" ? "Pc" : clienteTarga;
    const idDoc = anagraficaFonte === "possibile" ? "" : clienteId;
    if (
      (anagraficaFonte === "possibile" ? !possibileClienteId : !idDoc) ||
      !targaDoc ||
      !dataOrdine
    ) {
      dettaglio.setNumeroInterno("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await previewNumeroInternoOrdineAction({
        clienteId: idDoc,
        codiceTargaCliente: targaDoc,
        dataOrdine,
      });
      if (cancelled) return;
      if (result.success) dettaglio.setNumeroInterno(result.numeroInterno);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anagraficaFonte, possibileClienteId, clienteId, clienteTarga, dataOrdine]);

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
    setSessioneMsg(null);

    if (mode === "create" && anagraficaFonte === "possibile") {
      if (!possibileClienteId || !clienteNome.trim()) {
        setFormError("Seleziona un possibile cliente.");
        return;
      }
    } else if (!clienteId || !clienteNome.trim() || !clienteTarga) {
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
      anagraficaFonte: mode === "create" ? anagraficaFonte : "cliente",
      possibileClienteId: possibileClienteId || null,
      clienteId: clienteId || undefined,
      cliente: clienteNome.trim(),
      codiceTargaCliente:
        anagraficaFonte === "possibile" ? "Pc" : clienteTarga || "C000",
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

    if (!ORDINI_PERSISTENZA_DEFINITIVA && mode === "create") {
      const first = righeValide[0];
      const prev = loadOrdineSessione();
      const ordine = buildOrdineSessioneLocale({
        existingId: prev?.ordine.id ?? null,
        numeroInterno: dettaglio.numeroInterno || prev?.ordine.numeroInterno || "",
        clienteId: clienteId || null,
        clienteNome: clienteNome.trim(),
        clienteTarga:
          anagraficaFonte === "possibile" ? "Pc" : clienteTarga || "C000",
        dataOrdine,
        tipo: "vendita",
        prodottoId: first.prodottoId,
        prodottoCodice: first.prodottoCodice,
        prodottoNome: first.prodottoNome,
        quantita: first.quantita,
        unitaMisura: first.unitaMisura,
        prezzoNetto: first.prezzoUnitario,
        prezzoListino: first.prezzoUnitario,
        scontoExtraPct: 0,
        importoEuro: totaleOrdine(righeValide, dettaglio.trasporto),
        tipoPagamento,
        pagamentoModalita: "unica",
        destinatario: clienteNome.trim(),
        indirizzoSpedizione: "",
      });
      ordine.righe = righeValide.map((r, i) => ({
        ...r,
        id: r.id || `${ordine.id}-r${i + 1}`,
      }));
      ordine.note = note.trim();
      ordine.dataConsegna = requireConsegna ? dataConsegna : null;
      ordine.numeroCliente = dettaglio.numeroCliente.trim();
      ordine.pagato = pagato;
      ordine.dataPagamento = dataPagamento || null;
      ordine.noteRateizzazione = noteRateizzazione.trim();
      ordine.trasporto = dettaglio.trasporto;
      saveOrdineSessione({
        ordine,
        fattura: prev?.fattura ?? null,
      });
      setSessioneMsg(
        `Salvato in sessione (${ordine.numeroInterno || "senza numero"}). Niente è stato scritto sul server.`
      );
      return;
    }

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
            : ORDINI_PERSISTENZA_DEFINITIVA
              ? "I dati vengono salvati su database con tracciabilità ISO 9001."
              : "Salvataggio provvisorio: l’ordine resta solo in questa sessione del browser."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Cliente</span>
            {mode === "create" ? (
              <AziendaOrdineSelect
                fonte={anagraficaFonte}
                clienteId={clienteId}
                possibileClienteId={possibileClienteId}
                autoFocus
                onFonteChange={setAnagraficaFonte}
                onChange={(sel) => {
                  setAnagraficaFonte(sel.fonte);
                  setPossibileClienteId(sel.possibile?.id ?? "");
                  setClienteId(sel.cliente?.id ?? "");
                  setClienteNome(
                    sel.cliente?.ragioneSociale ??
                      sel.possibile?.ragioneSociale ??
                      ""
                  );
                  setClienteTarga(sel.cliente?.codiceTarga ?? "");
                }}
              />
            ) : (
              <ClienteSelectField
                value={clienteId}
                onChange={(cliente) => {
                  setClienteId(cliente?.id ?? "");
                  setClienteNome(cliente?.ragioneSociale ?? "");
                  setClienteTarga(cliente?.codiceTarga ?? "");
                }}
              />
            )}
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
            tipoDocumento={initial?.tipo ?? "vendita"}
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

          {sessioneMsg ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {sessioneMsg}
            </p>
          ) : null}
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
                  : ORDINI_PERSISTENZA_DEFINITIVA
                    ? "Salva ordine"
                    : "Salva in sessione"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
