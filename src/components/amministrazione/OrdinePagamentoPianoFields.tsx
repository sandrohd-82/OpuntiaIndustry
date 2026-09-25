"use client";

import {
  applyTotaleToPiano,
  ensureRateCount,
  labelTipoScadenza,
  PAGAMENTO_TIPI_SCADENZA,
  type OrdinePagamentoPiano,
  type PagamentoTipoScadenza,
} from "@/lib/amministrazione/ordine-pagamento-piano";

type Props = {
  piano: OrdinePagamentoPiano;
  onChange: (piano: OrdinePagamentoPiano) => void;
  totale: number;
  compact?: boolean;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function OrdinePagamentoPianoFields({
  piano,
  onChange,
  totale,
  compact = false,
}: Props) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Modalità</span>
          <select
            value={piano.modalita}
            onChange={(e) => {
              const modalita = e.target.value as "unica" | "dilazione";
              if (modalita === "unica") {
                onChange(
                  applyTotaleToPiano(
                    { ...piano, modalita, tipoUnica: piano.tipoUnica },
                    totale
                  )
                );
                return;
              }
              onChange(ensureRateCount({ ...piano, modalita }, 2, totale));
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="unica">1) Unica soluzione</option>
            <option value="dilazione">2) Dilazione</option>
          </select>
        </label>

        {piano.modalita === "unica" ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Scadenza</span>
            <select
              value={piano.tipoUnica}
              onChange={(e) => {
                const tipoUnica = e.target.value as PagamentoTipoScadenza;
                onChange(
                  applyTotaleToPiano({ ...piano, tipoUnica }, totale)
                );
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              {PAGAMENTO_TIPI_SCADENZA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Numero dilazioni</span>
            <input
              type="number"
              min={2}
              max={24}
              value={piano.rate.length}
              onChange={(e) =>
                onChange(
                  ensureRateCount(piano, Number(e.target.value) || 2, totale)
                )
              }
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
        )}
      </div>

      {piano.modalita === "dilazione" ? (
        <div className="space-y-2">
          {piano.rate.map((r, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-3"
            >
              <p className="text-xs font-semibold sm:col-span-3">
                Rata {i + 1} · {euro(r.importo)} €
              </p>
              {i === 0 ? (
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--muted)]">
                    Scadenza prima rata
                  </span>
                  <select
                    value={r.tipoScadenza ?? piano.tipoUnica}
                    onChange={(e) => {
                      const tipo = e.target.value as PagamentoTipoScadenza;
                      const rate = piano.rate.map((x, idx) =>
                        idx === 0 ? { ...x, tipoScadenza: tipo } : x
                      );
                      onChange({ ...piano, tipoUnica: tipo, rate });
                    }}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    {PAGAMENTO_TIPI_SCADENZA.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--muted)]">
                    Data pagamento
                  </span>
                  <input
                    type="date"
                    required
                    value={r.dataPagamento ?? ""}
                    onChange={(e) => {
                      const rate = piano.rate.map((x, idx) =>
                        idx === i
                          ? { ...x, dataPagamento: e.target.value || null }
                          : x
                      );
                      onChange({ ...piano, rate });
                    }}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  />
                </label>
              )}
              <p className="self-end text-xs text-[var(--muted)]">
                {i === 0
                  ? labelTipoScadenza(r.tipoScadenza ?? piano.tipoUnica)
                  : r.dataPagamento || "Data obbligatoria"}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
