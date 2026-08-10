"use client";

import { useId } from "react";
import { FaFilePdf, FaUpload } from "react-icons/fa6";
import {
  ORDINE_TIPI_PAGAMENTO,
  type OrdineAllegatoMeta,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";

type Props = {
  tipoPagamento: OrdineTipoPagamento;
  onTipoPagamentoChange: (value: OrdineTipoPagamento) => void;
  pagato: boolean;
  onPagatoChange: (value: boolean) => void;
  dataPagamento: string;
  onDataPagamentoChange: (value: string) => void;
  noteRateizzazione: string;
  onNoteRateizzazioneChange: (value: string) => void;
  ricevutaFile: File | null;
  ricevutaEsistente: OrdineAllegatoMeta | null;
  onRicevutaFileChange: (file: File | null) => void;
  onRicevutaEsistenteClear: () => void;
};

export function OrdinePagamentoFields({
  tipoPagamento,
  onTipoPagamentoChange,
  pagato,
  onPagatoChange,
  dataPagamento,
  onDataPagamentoChange,
  noteRateizzazione,
  onNoteRateizzazioneChange,
  ricevutaFile,
  ricevutaEsistente,
  onRicevutaFileChange,
  onRicevutaEsistenteClear,
}: Props) {
  const fileId = useId();
  const hasRicevuta = Boolean(ricevutaFile || ricevutaEsistente);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <p className="text-sm font-semibold">Pagamento</p>
      <p className="text-xs text-[var(--muted)]">
        Tipo obbligatorio. Ricevuta PDF (bonifico o altro) opzionale. Se pagato,
        indica la data.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tipo di pagamento</span>
          <select
            value={tipoPagamento}
            onChange={(e) =>
              onTipoPagamentoChange(e.target.value as OrdineTipoPagamento)
            }
            required
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            {ORDINE_TIPI_PAGAMENTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="block text-sm">
          <legend className="mb-1 block font-medium">Pagato</legend>
          <div className="flex gap-4 rounded-lg border border-[var(--border)] px-3 py-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ordine-pagato"
                checked={pagato}
                onChange={() => onPagatoChange(true)}
              />
              Sì
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ordine-pagato"
                checked={!pagato}
                onChange={() => onPagatoChange(false)}
              />
              No
            </label>
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            Data pagamento / rateizzazione{" "}
            {pagato ? (
              <span className="text-red-600">*</span>
            ) : (
              <span className="font-normal text-[var(--muted)]">(opz.)</span>
            )}
          </span>
          <input
            type="date"
            value={dataPagamento}
            onChange={(e) => onDataPagamentoChange(e.target.value)}
            required={pagato}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>

        <div className="block text-sm">
          <span className="mb-1 block font-medium">
            Ricevuta / bonifico{" "}
            <span className="font-normal text-[var(--muted)]">(opzionale)</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={fileId}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              <FaUpload size={11} />
              {hasRicevuta ? "Sostituisci" : "Carica PDF"}
            </label>
            <input
              id={fileId}
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!next) return;
                onRicevutaEsistenteClear();
                onRicevutaFileChange(next);
              }}
            />
            {ricevutaFile ? (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-slate-700">
                <FaFilePdf className="shrink-0 text-red-600" />
                <span className="truncate">{ricevutaFile.name}</span>
                <button
                  type="button"
                  onClick={() => onRicevutaFileChange(null)}
                  className="shrink-0 text-[var(--primary)] hover:underline"
                >
                  Rimuovi
                </button>
              </span>
            ) : ricevutaEsistente ? (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-slate-700">
                <FaFilePdf className="shrink-0 text-red-600" />
                <span className="truncate">{ricevutaEsistente.fileName}</span>
                <button
                  type="button"
                  onClick={onRicevutaEsistenteClear}
                  className="shrink-0 text-[var(--primary)] hover:underline"
                >
                  Rimuovi
                </button>
              </span>
            ) : (
              <span className="text-xs text-[var(--muted)]">Nessun allegato</span>
            )}
          </div>
        </div>
      </div>

      {tipoPagamento === "dilazionato" ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            Piano rateizzazione{" "}
            <span className="font-normal text-[var(--muted)]">(opzionale)</span>
          </span>
          <textarea
            value={noteRateizzazione}
            onChange={(e) => onNoteRateizzazioneChange(e.target.value)}
            rows={2}
            placeholder="Es. 3 rate da € … alle scadenze …"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>
      ) : null}
    </div>
  );
}
