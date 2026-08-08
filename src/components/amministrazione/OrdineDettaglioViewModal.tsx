"use client";

import { useEffect, useId, useState } from "react";
import { FaFilePdf } from "react-icons/fa6";
import { getOrdineAllegatoSignedUrlAction } from "@/app/actions/ordini";
import {
  imponibileRiga,
  totaleRiga,
  totaleTrasporto,
  type Ordine,
} from "@/lib/amministrazione/ordini";

type Props = {
  ordine: Ordine;
  onClose: () => void;
  onEdit: () => void;
};

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

function AllegatoLink({
  label,
  path,
  fileName,
}: {
  label: string;
  path: string;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const result = await getOrdineAllegatoSignedUrlAction(path);
    setBusy(false);
    if (result.success) window.open(result.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline disabled:opacity-60"
    >
      <FaFilePdf />
      {busy ? "Apertura…" : `${label}: ${fileName}`}
    </button>
  );
}

export function OrdineDettaglioViewModal({ ordine, onClose, onEdit }: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Dettaglio ordine
            </h2>
            <p className="mt-1 font-mono text-sm font-semibold text-[var(--primary)]">
              {ordine.numeroInterno}
            </p>
          </div>
          <p className="text-xs text-[var(--muted)]">
            v{ordine.versione} · {ordine.documentoStato}
          </p>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Cliente
            </dt>
            <dd className="mt-0.5 font-medium">
              {ordine.clienteCodiceTarga} — {ordine.cliente}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              N. ordine del cliente
            </dt>
            <dd className="mt-0.5">{ordine.numeroCliente || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Data ordine
            </dt>
            <dd className="mt-0.5">{formatDate(ordine.dataOrdine)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Data consegna
            </dt>
            <dd className="mt-0.5">{formatDate(ordine.dataConsegna)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Totale
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatEuro(ordine.importoEuro)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Origine
            </dt>
            <dd className="mt-0.5">
              {ordine.origineStorico === "chiusura"
                ? "Chiusura automatica"
                : ordine.origineStorico === "manuale"
                  ? "Inserimento manuale"
                  : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-col gap-1">
          {ordine.offerta ? (
            <AllegatoLink
              label="Offerta interna"
              path={ordine.offerta.storagePath}
              fileName={ordine.offerta.fileName}
            />
          ) : (
            <p className="text-xs text-[var(--muted)]">Nessuna offerta allegata</p>
          )}
          {ordine.ordineClienteDoc ? (
            <AllegatoLink
              label="Ordine del cliente"
              path={ordine.ordineClienteDoc.storagePath}
              fileName={ordine.ordineClienteDoc.fileName}
            />
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Nessun ordine cliente allegato
            </p>
          )}
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Prodotto</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Prezzo</th>
                <th className="px-3 py-2">IVA %</th>
                <th className="px-3 py-2 text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {ordine.righe.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    {r.prodottoCodice} — {r.prodottoNome}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.quantita}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatEuro(r.prezzoUnitario)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.ivaPercentuale}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(totaleRiga(r))}
                    <div className="text-[10px] text-[var(--muted)]">
                      Imp. {formatEuro(imponibileRiga(r))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold">Trasporto</p>
          <p className="mt-1 text-[var(--muted)]">
            {ordine.trasporto.azienda || "—"} · Imponibile{" "}
            {formatEuro(ordine.trasporto.imponibile)} · IVA{" "}
            {ordine.trasporto.ivaPercentuale}% · Totale{" "}
            <span className="font-medium text-slate-800">
              {formatEuro(totaleTrasporto(ordine.trasporto))}
            </span>
          </p>
        </div>

        {ordine.note ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            <span className="font-medium text-slate-700">Note: </span>
            {ordine.note}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Modifica
          </button>
        </div>
      </div>
    </div>
  );
}
