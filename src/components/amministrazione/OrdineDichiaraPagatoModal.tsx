"use client";

import { useState } from "react";
import { dichiaraOrdinePagatoAction } from "@/app/actions/ordini";
import type { Ordine } from "@/lib/amministrazione/ordini";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function OrdineDichiaraPagatoModal({
  ordine,
  onClose,
  onFatto,
}: {
  ordine: Ordine;
  onClose: () => void;
  onFatto: (messaggio: string) => void;
}) {
  const fattura = ordine.fatturaElenco ?? null;
  const [dataPagamento, setDataPagamento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(
    fattura ? null : "Manca la fattura. Nessun importo è stato inserito a mano."
  );

  async function registra() {
    if (!fattura) return;
    if (!dataPagamento) {
      setErrore("Indica la data di avvenuto pagamento.");
      return;
    }
    setOccupato(true);
    setErrore(null);
    const fd = new FormData();
    fd.set("ordineId", ordine.id);
    fd.set("dataPagamento", dataPagamento);
    if (file) fd.set("ricevutaPagamentoFile", file);
    const res = await dichiaraOrdinePagatoAction(fd);
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const allegato = res.ricevuta
      ? " Ricevuta allegata."
      : " Nessuna ricevuta allegata.";
    onFatto(
      `${ordine.numeroInterno} pagato il ${dataPagamento}. Importo ${formatEuro(res.importo)} dalla fattura.${allegato}`
    );
  }

  const numero = fattura?.numero.trim() || "prenotata";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Dichiara pagato
        </h2>
        <p className="mt-2 text-sm text-slate-800">
          Ordine {ordine.numeroInterno}. L&apos;importo è quello della fattura{" "}
          {numero} e non si modifica.
        </p>
        {fattura ? (
          <p className="mt-3 text-lg font-semibold tabular-nums text-slate-900">
            {formatEuro(fattura.totale)}
          </p>
        ) : null}
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Data di avvenuto pagamento <span className="text-red-600">*</span>
          </span>
          <input
            type="date"
            value={dataPagamento}
            disabled={occupato || !fattura}
            onChange={(e) => setDataPagamento(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Ricevuta di pagamento{" "}
            <span className="font-normal text-slate-500">(facoltativa)</span>
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={occupato || !fattura}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Puoi allegare un PDF o un&apos;immagine, oppure registrare il
            pagamento senza ricevuta.
          </span>
        </label>
        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errore}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={occupato || !fattura || !dataPagamento}
            onClick={() => void registra()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {occupato ? "Registro…" : "Registra pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
