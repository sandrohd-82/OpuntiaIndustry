"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  listAllerteAziendaAction,
  type AziendaAllerta,
} from "@/app/actions/azienda-allerte";

type AziendaRef = {
  tipo: "cliente" | "cliente_possibile" | "fornitore";
  id: string;
};

type Props = {
  aziende?: AziendaRef[];
  emails?: string[];
  telefoni?: string[];
};

export function AziendaNoteBanner({
  aziende = [],
  emails = [],
  telefoni = [],
}: Props) {
  const [voci, setVoci] = useState<AziendaAllerta[]>([]);
  const [aperta, setAperta] = useState(false);
  const chiave = [
    aziende.map((a) => `${a.tipo}:${a.id}`).join(","),
    emails.join("|"),
    telefoni.join("|"),
  ].join("§");

  useEffect(() => {
    const utili = aziende.filter((a) => a.id);
    const mail = emails.map((e) => e.trim()).filter(Boolean);
    const tel = telefoni.map((t) => t.trim()).filter(Boolean);
    if (utili.length === 0 && mail.length === 0 && tel.length === 0) {
      setVoci([]);
      setAperta(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listAllerteAziendaAction({
        aziende: utili,
        emails: mail,
        telefoni: tel,
      }).then((res) => {
        if (cancelled || !res.success) return;
        setVoci(res.aziende);
        if (res.aziende.length === 0) setAperta(false);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chiave]);

  if (voci.length === 0 || typeof document === "undefined") return null;

  const conteggio = voci.reduce(
    (n, voce) => n + voce.note.length + voce.avvisi.length,
    0
  );
  const titolo =
    voci.length === 1 ? voci[0]?.etichetta ?? "Azienda" : `${voci.length} aziende`;

  const banner = (
    <button
      type="button"
      onClick={() => setAperta(true)}
      className="fixed bottom-0 left-1/2 z-[160] flex max-w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-2 rounded-t-[2rem] border border-b-0 border-slate-200 bg-white px-5 py-2.5 text-left shadow-[0_-10px_28px_rgba(15,23,42,0.18)] print:hidden"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Note
      </span>
      <span className="truncate text-sm font-semibold text-slate-900">{titolo}</span>
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
        {conteggio}
      </span>
    </button>
  );

  const finestra = aperta ? (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/40 p-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="azienda-note-titolo"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id="azienda-note-titolo" className="text-sm font-semibold text-slate-900">
            Note sull&apos;azienda
          </h2>
          <p className="text-xs text-slate-500">{titolo}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {voci.map((voce) => (
            <section key={`${voce.tipo}:${voce.id}`}>
              <p className="text-xs font-semibold text-slate-800">{voce.etichetta}</p>
              <ul className="mt-2 space-y-2">
                {voce.note.map((nota) => (
                  <li
                    key={nota.id}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide">
                      {nota.titolo}
                    </p>
                    {nota.testo ? (
                      <p className="mt-1 whitespace-pre-wrap">{nota.testo}</p>
                    ) : null}
                  </li>
                ))}
                {voce.avvisi.map((avviso) => (
                  <li
                    key={avviso.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide">
                      {avviso.canale} · {avviso.valore}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{avviso.testo}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setAperta(false)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return createPortal(
    <>
      {aperta ? null : banner}
      {finestra}
    </>,
    document.body
  );
}
