"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type AzioniTest = {
  attiva: boolean;
  alterna: () => void;
  annulla: () => void;
  elimina: () => void;
};

const Registra = createContext<((azioni: AzioniTest | null) => void) | null>(null);
const Leggi = createContext<AzioniTest | null>(null);

export function CalendarioTestProvider({ children }: { children: ReactNode }) {
  const [azioni, setAzioni] = useState<AzioniTest | null>(null);
  return (
    <Registra.Provider value={setAzioni}>
      <Leggi.Provider value={azioni}>{children}</Leggi.Provider>
    </Registra.Provider>
  );
}

export function useRegistraAzioniTest(azioni: AzioniTest) {
  const setAzioni = useContext(Registra);
  const ref = useRef(azioni);
  ref.current = azioni;
  useEffect(() => {
    setAzioni?.({
      attiva: azioni.attiva,
      alterna: () => ref.current.alterna(),
      annulla: () => ref.current.annulla(),
      elimina: () => ref.current.elimina(),
    });
  }, [azioni.attiva, setAzioni]);
  useEffect(() => {
    return () => setAzioni?.(null);
  }, [setAzioni]);
}

export function CalendarioTestAzioni() {
  const azioni = useContext(Leggi);
  if (!azioni) return null;
  return (
    <>
      <button
        type="button"
        onClick={azioni.alterna}
        className={`rounded-lg border px-3 py-1.5 text-sm ${azioni.attiva ? "border-amber-700 bg-amber-100" : "border-slate-300"}`}
      >
        {azioni.attiva ? "Modalità test attiva" : "Modalità test"}
      </button>
      <button
        type="button"
        onClick={azioni.annulla}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-800"
      >
        Annulla test
      </button>
      {azioni.attiva ? (
        <button
          type="button"
          onClick={azioni.elimina}
          className="rounded-lg border border-red-700 bg-red-50 px-3 py-1.5 text-sm text-red-900"
        >
          Elimina dati test
        </button>
      ) : null}
    </>
  );
}
