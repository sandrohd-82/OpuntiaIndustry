"use client";

import { useEffect, useState } from "react";
import { listStoricoScontiProdottoAction } from "@/app/actions/storico-sconti-prodotto";
import type { StoricoScontoVoce } from "@/app/actions/storico-sconti-prodotto";
import type { AccordoPrezzoAziendaTipo } from "@/lib/amministrazione/accordi-prezzo";

type Props = {
  azienda: { tipo: AccordoPrezzoAziendaTipo; id: string } | null;
  prodottoCodice: string;
  escludiPreventivoId?: string | null;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dataBreve(iso: string) {
  if (!iso) return "";
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return day;
  return `${d}/${m}/${y}`;
}

function rigaSconto(voce: StoricoScontoVoce) {
  const parti = [
    voce.origine === "ordine" ? "Ordine" : "Preventivo",
    voce.numero,
    dataBreve(voce.data),
    voce.stato,
  ].filter(Boolean);
  const sconti = [
    voce.scontoListinoPct > 0
      ? `listino ${voce.scontoListinoPct.toLocaleString("it-IT")}%`
      : "",
    voce.scontoExtraPct > 0
      ? `extra ${voce.scontoExtraPct.toLocaleString("it-IT")}%`
      : "",
    voce.prezzoUnitario > 0
      ? `${euro(voce.prezzoUnitario)} €/${voce.unitaMisura || "kg"}`
      : "",
  ].filter(Boolean);
  return `${parti.join(" · ")} — ${sconti.join(" · ")}`;
}

export function StoricoScontiProdotto({
  azienda,
  prodottoCodice,
  escludiPreventivoId = null,
}: Props) {
  const [voci, setVoci] = useState<StoricoScontoVoce[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!azienda || !prodottoCodice) {
      setVoci([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listStoricoScontiProdottoAction({
      aziendaTipo: azienda.tipo,
      aziendaId: azienda.id,
      prodottoCodice,
      escludiPreventivoId,
    }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        setVoci([]);
        return;
      }
      setVoci(res.voci);
    });
    return () => {
      cancelled = true;
    };
  }, [azienda?.tipo, azienda?.id, prodottoCodice, escludiPreventivoId]);

  if (!azienda || !prodottoCodice) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <p className="font-medium text-slate-800">
        Sconti già fatti a questa azienda su {prodottoCodice}
      </p>
      {loading ? (
        <p className="mt-1 text-xs text-slate-500">Caricamento storico…</p>
      ) : error ? (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      ) : voci.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Nessuno sconto precedente su questo prodotto.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {voci.map((voce) => (
            <li key={voce.id} className="text-xs text-slate-700">
              {rigaSconto(voce)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
