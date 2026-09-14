"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  creaLottoUscitaCompositoAction,
  listLottiEsterniAction,
} from "@/app/actions/lotti-esterni";
import {
  labelTipoLottoEsterno,
  type LottoEsterno,
} from "@/lib/produzione/lotti-esterni";

export function LottiEsterniBoard() {
  const [items, setItems] = useState<LottoEsterno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function reload() {
    void listLottiEsterniAction().then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setItems(res.items);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  const semplici = items.filter((i) => !i.isComposito);

  async function creaInclusivo() {
    setBusy(true);
    setError(null);
    const res = await creaLottoUscitaCompositoAction({ lottiIds: picked });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPicked([]);
    reload();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Lotti <strong>esterni</strong>: 10 caratteri, settimana + anno +
        progressivo hex. Nascono col foglio di lavorazione e vanno su fatture,
        DDT e clienti. I lotti <strong>interni</strong> (MP, FIMP, L-, FL-,
        targhe) restano per la navigazione in azienda.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Se la vendita usa <strong>un solo</strong> lotto, si comunica quello. Se
        usa <strong>due o più</strong>, si genera un lotto inclusivo (qui sotto,
        in prova; dagli ordini arriverà in automatico).
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {picked.length >= 2 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p>
            Selezionati {picked.length} lotti. Verrà creato un nuovo codice che
            li include.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void creaInclusivo()}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Creazione…" : "Crea lotto inclusivo"}
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Lotto</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Foglio</th>
              <th className="px-3 py-2">Prodotto</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted)]">
                  Nessun lotto in uscita. Creane uno aprendo un foglio di
                  lavorazione.
                </td>
              </tr>
            ) : (
              items.map((l) => (
                <tr key={l.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    {!l.isComposito ? (
                      <input
                        type="checkbox"
                        checked={picked.includes(l.id)}
                        onChange={(e) =>
                          setPicked((prev) =>
                            e.target.checked
                              ? [...prev, l.id]
                              : prev.filter((id) => id !== l.id)
                          )
                        }
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-base">{l.codice}</td>
                  <td className="px-3 py-2">
                    {labelTipoLottoEsterno(l.tipo)}
                    {l.componenti.length ? (
                      <span className="block text-xs text-[var(--muted)]">
                        {l.componenti.map((c) => c.codice).join(" + ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{l.foglioCodice ?? "—"}</td>
                  <td className="px-3 py-2">{l.prodottoNome ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/app/produzione/fogli-lavorazione/decifratore?codice=${l.codice}`}
                      className="text-sky-700 underline"
                    >
                      Decifra
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {semplici.length === 0 ? null : (
        <p className="text-xs text-[var(--muted)]">
          Spunta almeno due lotti semplici per provare un lotto inclusivo.
        </p>
      )}
    </div>
  );
}
