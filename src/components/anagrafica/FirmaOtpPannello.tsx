"use client";

import { useEffect, useState } from "react";
import { emailRegistrateAnagrafica, MESSAGGIO_DATI_OBBLIGATORI } from "@/lib/anagrafica/richiesta-form";
import type { AnagraficaFormPayload } from "@/lib/anagrafica/richiesta-form";

function formato(secondi: number): string {
  const minuti = Math.floor(secondi / 60);
  const resto = secondi % 60;
  return `${minuti}:${String(resto).padStart(2, "0")}`;
}

export function FirmaOtpPannello({
  token,
  form,
  emailInvio,
  pronto,
  modifica,
  onModifica,
  onMancanti,
  onConsenso,
  onFirmato,
}: {
  token: string;
  form: AnagraficaFormPayload;
  emailInvio: string;
  pronto: boolean;
  modifica: number;
  onModifica?: () => void;
  onMancanti?: () => void;
  onConsenso: (valore: boolean) => Promise<string | null>;
  onFirmato: () => void;
}) {
  const email = emailRegistrateAnagrafica(emailInvio, form);
  const [scelta, setScelta] = useState(email[0] ?? "");
  const [scadeAt, setScadeAt] = useState<string | null>(null);
  const [secondi, setSecondi] = useState(0);
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState("");
  const [erroreAllaModifica, setErroreAllaModifica] = useState(-1);
  const [occupato, setOccupato] = useState(false);
  const [consenso, setConsenso] = useState(form.consensoTrattamento);
  const erroreVisibile =
    (errore === MESSAGGIO_DATI_OBBLIGATORI && modifica !== erroreAllaModifica) ? "" : errore;

  useEffect(() => {
    if (!scelta && email[0]) setScelta(email[0]);
  }, [email, scelta]);

  useEffect(() => {
    if (!scadeAt) return;
    const tick = () => {
      const resta = Math.max(0, Math.ceil((Date.parse(scadeAt) - Date.now()) / 1000));
      setSecondi(resta);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [scadeAt]);

  async function chiedi() {
    setErrore("");
    if (!pronto) {
      onMancanti?.();
      setErroreAllaModifica(modifica);
      setErrore(MESSAGGIO_DATI_OBBLIGATORI);
      return;
    }
    if (!scelta) {
      setErrore("Non c'è un'e-mail registrata a cui inviare il codice.");
      return;
    }
    setOccupato(true);
    const salvato = await onConsenso(true);
    if (salvato) {
      setOccupato(false);
      setErrore(salvato);
      return;
    }
    setConsenso(true);
    const risposta = await fetch("/api/public/request-data/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: scelta }),
    });
    const corpo = (await risposta.json()) as { scadeAt?: string; errore?: string };
    setOccupato(false);
    if (!risposta.ok || !corpo.scadeAt) {
      setErrore(corpo.errore || "Il codice non è stato inviato.");
      return;
    }
    setScadeAt(corpo.scadeAt);
    setCodice("");
  }

  async function firma() {
    setErrore("");
    if (secondi <= 0) {
      setErrore("Il codice è scaduto. Richiedine uno nuovo.");
      return;
    }
    setOccupato(true);
    const risposta = await fetch("/api/public/request-data/firma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: scelta, codice }),
    });
    const corpo = (await risposta.json()) as { errore?: string };
    setOccupato(false);
    if (!risposta.ok) {
      setErrore(corpo.errore || "Firma non riuscita.");
      return;
    }
    onFirmato();
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
      <h2 className="text-sm font-semibold">Firma con codice OTP</h2>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consenso}
          onChange={(event) => {
            const acceso = event.target.checked;
            setConsenso(acceso);
            void onConsenso(acceso);
          }}
        />
        <span>
          Accetto i termini e il consenso al trattamento dei dati ai sensi del Regolamento UE 2016/679 e della legge 196/2003, per i fini dichiarati in questa anagrafica.
        </span>
      </label>
      {email.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">E-mail registrata</span>
          <select
            value={scelta}
            onChange={(event) => {
              onModifica?.();
              setScelta(event.target.value);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {email.map((voce) => (
              <option key={voce} value={voce}>
                {voce}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-slate-700">
          Il codice arriva all&apos;e-mail registrata{scelta ? `: ${scelta}` : ""}.
        </p>
      )}
      <button
        type="button"
        disabled={occupato || !consenso || !scelta}
        onClick={() => void chiedi()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Richiedi Codice OTP per Firmare
      </button>
      {scadeAt ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            {secondi > 0
              ? `Codice valido per ${formato(secondi)}.`
              : "Il codice è scaduto. Richiedine uno nuovo."}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Codice a 6 cifre</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codice}
              onChange={(event) => setCodice(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 font-mono tracking-widest"
            />
          </label>
          <button
            type="button"
            disabled={occupato || codice.length !== 6 || secondi <= 0}
            onClick={() => void firma()}
            className="rounded-lg border border-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Firma il documento
          </button>
        </div>
      ) : null}
      {erroreVisibile ? <p className="text-sm text-red-700">{erroreVisibile}</p> : null}
    </section>
  );
}
