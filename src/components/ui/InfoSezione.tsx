"use client";

import { useId, useState } from "react";
import { FaCircleInfo } from "react-icons/fa6";

type Props = {
  titolo: string;
  testo: string;
  disegno?: "confezioni" | "lotti";
};

export function spiegazionePagina(title: string, subtitle?: string): string {
  const nome = title.trim() || "questa pagina";
  const extra = subtitle?.trim();
  if (!extra) {
    return `Sei nella pagina «${nome}». Qui fai il lavoro di questa sezione. Leggi i titoli e compila solo quello che vedi.`;
  }
  return `Sei nella pagina «${nome}». A cosa serve: ${extra}`;
}

function Disegno({ tipo }: { tipo: "confezioni" | "lotti" }) {
  if (tipo === "lotti") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-2 font-medium">
          Scaffale
          <br />
          NGLi 15 lt
        </span>
        <span aria-hidden>→</span>
        <span className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-2 font-medium">
          Lo scegli
          <br />
          nel menù
        </span>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-slate-300 bg-white px-2 py-1">
          Prodotto A
        </span>
        <span className="rounded-md border border-slate-300 bg-white px-2 py-1">
          Prodotto B
        </span>
        <span aria-hidden>→</span>
        <span className="rounded-lg border-2 border-emerald-400 bg-emerald-50 px-2 py-2 font-medium">
          Confezione 1
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-slate-300 bg-white px-2 py-1">
          Prodotto C
        </span>
        <span aria-hidden>→</span>
        <span className="rounded-lg border-2 border-sky-400 bg-sky-50 px-2 py-2 font-medium">
          Confezione 2
        </span>
      </div>
    </div>
  );
}

export function InfoSezione({ titolo, testo, disegno }: Props) {
  const [aperta, setAperta] = useState(false);
  const titoloId = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={aperta}
        aria-controls={titoloId}
        onClick={() => setAperta((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-sky-600 bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-900 hover:bg-sky-100"
      >
        <FaCircleInfo size={16} aria-hidden />
        Info
      </button>
      {aperta ? (
        <span
          id={titoloId}
          role="note"
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,80vw)] rounded-xl border border-sky-200 bg-white p-3 text-left text-sm font-normal leading-relaxed text-slate-800 shadow-lg"
        >
          <span className="block font-semibold text-slate-900">{titolo}</span>
          <span className="mt-1 block">{testo}</span>
          {disegno ? <Disegno tipo={disegno} /> : null}
          <button
            type="button"
            onClick={() => setAperta(false)}
            className="mt-3 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Ho capito
          </button>
        </span>
      ) : null}
    </span>
  );
}
