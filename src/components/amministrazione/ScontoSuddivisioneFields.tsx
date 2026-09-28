"use client";

import { useState } from "react";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { validaQuoteSuddivisione } from "@/lib/amministrazione/sconto-suddivisione";

export function ScontoSuddivisioneFields({
  scontoPct,
  attiva,
  quotaAzienda,
  quotaCommerciale,
  onChange,
}: {
  scontoPct: number;
  attiva: boolean;
  quotaAzienda: number | "";
  quotaCommerciale: number | "";
  onChange: (next: {
    attiva: boolean;
    quotaAzienda: number | "";
    quotaCommerciale: number | "";
  }) => void;
}) {
  const [aperto, setAperto] = useState(attiva);
  if (scontoPct <= 0) return null;
  const azienda = quotaAzienda === "" ? 0 : quotaAzienda;
  const commerciale = quotaCommerciale === "" ? 0 : quotaCommerciale;
  const check = attiva
    ? validaQuoteSuddivisione({
        scontoPct,
        attiva: true,
        quotaAziendaPct: azienda,
        quotaCommercialePct: commerciale,
      })
    : null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          const next = !aperto;
          setAperto(next);
          onChange({
            attiva: next,
            quotaAzienda: next ? 0 : "",
            quotaCommerciale: next ? scontoPct : "",
          });
        }}
        className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-50"
      >
        {aperto ? "Suddivisione attiva" : "Suddividi con azienda"}
      </button>
      {aperto ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <p className="text-xs text-sky-950">
            Lo sconto {scontoPct.toLocaleString("it-IT")}% si divide fra
            Agrinsicilia e il commerciale. La somma deve essere uguale allo
            sconto. Senza approvazione del grado più alto, lo sconto resta
            tutto a carico del commerciale.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium">
                Agrinsicilia %
              </span>
              <ClearableNumberInput
                min={0}
                max={100}
                value={quotaAzienda}
                onValueChange={(quotaAziendaNext) =>
                  onChange({
                    attiva: true,
                    quotaAzienda: quotaAziendaNext,
                    quotaCommerciale,
                  })
                }
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium">
                Commerciale %
              </span>
              <ClearableNumberInput
                min={0}
                max={100}
                value={quotaCommerciale}
                onValueChange={(quotaCommercialeNext) =>
                  onChange({
                    attiva: true,
                    quotaAzienda,
                    quotaCommerciale: quotaCommercialeNext,
                  })
                }
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>
          {check && !check.ok ? (
            <p className="mt-2 text-xs text-red-700">{check.error}</p>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Solo la quota del commerciale riduce la provvigione. Se inserisce
              il Senior, la ripartizione con un sottoposto è già approvata. Fra
              Senior e azienda serve la firma dell’azienda.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
