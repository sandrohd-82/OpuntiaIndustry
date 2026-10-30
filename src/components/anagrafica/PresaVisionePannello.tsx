"use client";

import { useEffect, useState } from "react";
import type { BloccoDocumento } from "@/lib/anagrafica/presa-visione-testi";

function formato(secondi: number): string {
  const minuti = Math.floor(secondi / 60);
  const resto = secondi % 60;
  return `${minuti}:${String(resto).padStart(2, "0")}`;
}

export function PresaVisionePannello({
  token,
  documento,
  titolo,
  avanzamento,
  email,
  firmatarioIniziale,
  blocchi,
  onFirmato,
}: {
  token: string;
  documento: "privacy" | "condizioni";
  titolo: string;
  avanzamento: string;
  email: string;
  firmatarioIniziale: string;
  blocchi: BloccoDocumento[];
  onFirmato: (passo: "condizioni" | "completato") => void;
}) {
  const [firmatario, setFirmatario] = useState(firmatarioIniziale);
  const [accetto, setAccetto] = useState(false);
  const [marketing, setMarketing] = useState<"presto" | "nego" | "">("");
  const [scadeAt, setScadeAt] = useState<string | null>(null);
  const [secondi, setSecondi] = useState(0);
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const nomeOk = firmatario.trim().length >= 5 && firmatario.trim().includes(" ");
  const scelteOk = documento === "privacy" ? accetto && marketing !== "" : accetto;
  const mancaPerOtp = !email
    ? "Manca l'e-mail a cui inviare il codice."
    : (!nomeOk
        ? "Scrivi nome e cognome di chi firma."
        : (!scelteOk
            ? (documento === "privacy"
                ? "Spunta Accetto e scegli se prestare o negare il consenso."
                : "Spunta l'accettazione delle condizioni.")
            : ""));

  useEffect(() => {
    if (!scadeAt) return;
    const tick = () => {
      setSecondi(Math.max(0, Math.ceil((Date.parse(scadeAt) - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [scadeAt]);

  async function chiedi() {
    setErrore("");
    if (!nomeOk) {
      setErrore("Indica nome e cognome di chi firma.");
      return;
    }
    if (!scelteOk) {
      setErrore("Spunta le voci richieste prima di chiedere il codice.");
      return;
    }
    if (!email) {
      setErrore("Non c'è un'e-mail registrata a cui inviare il codice.");
      return;
    }
    setOccupato(true);
    const risposta = await fetch("/api/public/request-data/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, documento }),
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
      body: JSON.stringify({
        token,
        email,
        codice,
        documento,
        firmatario: firmatario.trim(),
        accettoInformativa: documento === "privacy" ? accetto : undefined,
        consensoMarketing: documento === "privacy" ? marketing : undefined,
        accettoCondizioni: documento === "condizioni" ? accetto : undefined,
      }),
    });
    const corpo = (await risposta.json()) as { errore?: string; passo?: string };
    setOccupato(false);
    if (!risposta.ok) {
      setErrore(corpo.errore || "Firma non riuscita.");
      return;
    }
    onFirmato(corpo.passo === "completato" ? "completato" : "condizioni");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{avanzamento}</p>
      <h1 className="mt-1 text-xl font-semibold">{titolo}</h1>
      <p className="mt-2 text-sm text-slate-700">
        Leggete il documento. La firma è una presa visione: in calce restano la data e il nome di chi firma.
      </p>
      <article className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {blocchi.map((blocco) => (
          <section key={blocco.titolo ?? blocco.testo.slice(0, 24)}>
            {blocco.titolo ? <h2 className="font-semibold">{blocco.titolo}</h2> : null}
            <p className={blocco.titolo ? "mt-1" : ""}>{blocco.testo}</p>
          </section>
        ))}
      </article>
      <section className="mt-4 space-y-3 rounded-xl border border-slate-300 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nome e cognome di chi firma</span>
          <input
            value={firmatario}
            onChange={(event) => setFirmatario(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {documento === "privacy" ? (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={accetto}
                onChange={(event) => setAccetto(event.target.checked)}
              />
              <span>Accetto Informativa Privacy</span>
            </label>
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium text-slate-700">
                Trattamento per finalità di marketing
              </legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="marketing"
                  checked={marketing === "presto"}
                  onChange={() => setMarketing("presto")}
                />
                Presto il consenso
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="marketing"
                  checked={marketing === "nego"}
                  onChange={() => setMarketing("nego")}
                />
                Nego il consenso
              </label>
            </fieldset>
          </>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={accetto}
              onChange={(event) => setAccetto(event.target.checked)}
            />
            <span>Accetto Condizioni generali di vendita</span>
          </label>
        )}
        <p className="text-sm text-slate-700">
          Il codice arriva all&apos;e-mail registrata{email ? `: ${email}` : ""}.
        </p>
        <button
          type="button"
          disabled={occupato || !nomeOk || !scelteOk || !email}
          onClick={() => void chiedi()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Richiedi Codice OTP per Firmare
        </button>
        {mancaPerOtp && !scadeAt ? <p className="text-sm text-slate-600">{mancaPerOtp}</p> : null}
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
        {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      </section>
    </main>
  );
}
