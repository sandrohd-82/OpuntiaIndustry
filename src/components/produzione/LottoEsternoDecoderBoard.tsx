"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getDecodificaLottoAction,
  type DecodificaLotto,
} from "@/app/actions/lotti-esterni";
import {
  labelTipoLottoEsterno,
  VISIBILITA_LABEL,
} from "@/lib/produzione/lotti-esterni";

function LottoEsternoDecoderInner() {
  const params = useSearchParams();
  const initial = (params.get("codice") ?? "").toUpperCase();
  const [codice, setCodice] = useState(initial);
  const [data, setData] = useState<DecodificaLotto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    setBusy(true);
    setError(null);
    const res = await getDecodificaLottoAction(v);
    setBusy(false);
    if (!res.success) {
      setData(null);
      setError(res.error);
      return;
    }
    setData(res.data);
  }

  useEffect(() => {
    if (initial) void load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Incolla un lotto in uscita (10 caratteri). Il decifratore interno mostra
        tutta la storia, in ordine di tempo. Il QR pubblico mostra solo i campi
        con la spunta.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(codice);
        }}
      >
        <input
          value={codice}
          onChange={(e) => setCodice(e.target.value.toUpperCase())}
          maxLength={10}
          placeholder="es. 1426000001"
          className="w-48 rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm uppercase"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Lettura…" : "Decifra"}
        </button>
      </form>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {data ? <DecodificaView data={data} interno /> : null}
    </div>
  );
}

export function LottoEsternoDecoderBoard() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--muted)]">Caricamento decifratore…</p>
      }
    >
      <LottoEsternoDecoderInner />
    </Suspense>
  );
}

export function DecodificaView({
  data,
  interno,
}: {
  data: DecodificaLotto;
  interno?: boolean;
}) {
  const { lotto, eventi, publicUrl } = data;
  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase text-[var(--muted)]">
          {labelTipoLottoEsterno(lotto.tipo)}
        </p>
        <p className="font-mono text-3xl font-semibold tracking-wide">
          {lotto.codice}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {lotto.prodottoNome || "—"}
          {lotto.foglioCodice ? ` · foglio ${lotto.foglioCodice}` : ""}
        </p>
        {interno ? (
          <p className="mt-2 break-all text-xs text-sky-800">
            QR pubblico: {publicUrl}
          </p>
        ) : null}
      </header>
      <ol className="space-y-3">
        {eventi.map((e, i) => (
          <li
            key={`${e.key}-${i}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {VISIBILITA_LABEL[e.key]}
              {e.pending ? " · in arrivo" : ""}
            </p>
            <p className="font-medium">{e.titolo}</p>
            <p className="text-sm leading-6 text-slate-700">{e.dettaglio}</p>
            {e.at ? (
              <p className="text-xs tabular-nums text-[var(--muted)]">
                {new Date(e.at).toLocaleString("it-IT")}
              </p>
            ) : null}
            {interno && e.interno ? (
              <p className="mt-1 font-mono text-xs text-slate-500">
                {e.interno}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
