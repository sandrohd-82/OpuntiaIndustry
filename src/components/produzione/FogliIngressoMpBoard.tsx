"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listFogliIngressoMpAction } from "@/app/actions/produzione-ingresso-mp";
import { IngressoMpLottoPrintModal } from "@/components/produzione/IngressoMpLottoPrintModal";
import {
  labelStatoIngresso,
  type FoglioIngressoMp,
} from "@/lib/produzione/fogli-ingresso-mp";

type Props = {
  storico?: boolean;
};

function formatArrivo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FogliIngressoMpBoard({ storico = false }: Props) {
  const [items, setItems] = useState<FoglioIngressoMp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [print, setPrint] = useState<FoglioIngressoMp | null>(null);

  useEffect(() => {
    void listFogliIngressoMpAction({ storico }).then((res) => {
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setItems(res.items);
    });
  }, [storico]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Caricamento fogli…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        {storico
          ? "Fogli ingresso MP chiusi, con codice lotto già assegnato."
          : "Bozze e fogli registrati ancora aperti."}
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted)]">
          Nessun foglio in questo elenco.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Lotto MP</th>
                <th className="px-4 py-3 font-medium">Fornitore</th>
                <th className="px-4 py-3 font-medium">Materiale</th>
                <th className="px-4 py-3 font-medium">Arrivo</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-medium">{f.codice}</td>
                  <td className="px-4 py-3">
                    {labelStatoIngresso(f.documentoStato)} · v{f.versione}
                  </td>
                  <td className="px-4 py-3 font-mono">{f.lottoCodice ?? "—"}</td>
                  <td className="px-4 py-3">{f.fornitoreLabel}</td>
                  <td className="px-4 py-3">{f.materiaPrimaLabel}</td>
                  <td className="px-4 py-3">{formatArrivo(f.arrivatoAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/app/produzione/foglio-ingresso-mp/nuovo?id=${f.id}`}
                      className="text-[var(--primary)] underline"
                    >
                      Apri
                    </Link>
                    {f.lottoCodice ? (
                      <button
                        type="button"
                        onClick={() => setPrint(f)}
                        className="ml-3 text-slate-600 underline"
                      >
                        Stampa
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {print?.lottoCodice ? (
        <IngressoMpLottoPrintModal
          lotto={print.lottoCodice}
          arrivatoAt={print.arrivatoAt}
          onClose={() => setPrint(null)}
        />
      ) : null}
    </div>
  );
}
