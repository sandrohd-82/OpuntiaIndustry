"use client";

import { useEffect, useState } from "react";
import {
  leggiLinguaIntercomunicazioneAction,
  traduciIntercomunicazioneAction,
} from "@/app/actions/traduci-intercomunicazione";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";

export type TestoTraducibile = {
  key: string;
  etichetta: string;
  text: string;
};

type Props = {
  tipo: "cliente" | "cliente_possibile";
  id: string;
  documento: "preventivo" | "fattura" | "mail";
  testi: TestoTraducibile[];
  /** In mail scrive la traduzione nella bozza. Senza callback la mostra soltanto. */
  onApplica?: (testi: Array<{ key: string; text: string }>) => void;
};

export function TraduciIntercomunicazione({
  tipo,
  id,
  documento,
  testi,
  onApplica,
}: Props) {
  const [lingua, setLingua] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copia, setCopia] = useState<TestoTraducibile[] | null>(null);
  const [origine, setOrigine] = useState<Array<{ key: string; text: string }> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    setLingua(null);
    setCopia(null);
    setOrigine(null);
    setError(null);
    setInfo(null);
    void (async () => {
      const res = await leggiLinguaIntercomunicazioneAction({ tipo, id });
      if (cancelled || !res.success) return;
      setLingua(res.lingua);
    })();
    return () => {
      cancelled = true;
    };
  }, [tipo, id]);

  if (!lingua || lingua === "it") return null;

  const nomeLingua = labelLingua(lingua);

  async function traduci() {
    setPending(true);
    setError(null);
    setInfo(null);
    const utili = testi.filter((item) => item.text.trim());
    const res = await traduciIntercomunicazioneAction({
      tipo,
      id,
      documento,
      testi: utili.map((item) => ({ key: item.key, text: item.text })),
    });
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    if (onApplica) {
      setOrigine(utili.map((item) => ({ key: item.key, text: item.text })));
      onApplica(res.testi);
      setCopia(null);
      setInfo(
        `Testo scritto nella bozza in ${nomeLingua}. Il documento italiano non è stato sostituito.`
      );
      return;
    }
    const byKey = new Map(res.testi.map((item) => [item.key, item.text]));
    setCopia(
      utili.map((item) => ({
        ...item,
        text: byKey.get(item.key) ?? item.text,
      }))
    );
    setInfo(null);
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        disabled={pending}
        onClick={() => void traduci()}
        className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-950 disabled:opacity-50"
      >
        {pending ? "Traduzione…" : `Traduci in ${nomeLingua}`}
      </button>
      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-2 text-sm text-slate-700">{info}</p>
      ) : null}
      {origine && onApplica ? (
        <button
          type="button"
          className="mt-2 block text-sm font-medium text-sky-900 underline"
          onClick={() => {
            onApplica(origine);
            setOrigine(null);
            setInfo("Bozza riportata al testo italiano.");
          }}
        >
          Torna al testo italiano
        </button>
      ) : null}
      {copia ? (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900">
          <p className="text-xs text-slate-500">
            Copia in {nomeLingua}. Il documento registrato resta in italiano.
          </p>
          {copia.map((item) => (
            <div key={item.key}>
              <p className="text-xs font-medium text-slate-500">
                {item.etichetta}
              </p>
              <p className="whitespace-pre-wrap">{item.text}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCopia(null)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>
      ) : null}
    </div>
  );
}
