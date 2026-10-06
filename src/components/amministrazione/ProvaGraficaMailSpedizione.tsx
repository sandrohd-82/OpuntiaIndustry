"use client";

import { useState } from "react";
import { provaGraficaMailSpedizioneAction } from "@/app/actions/spedizione-mail";

const PROVA_MAIL = "sandrohd@gmail.com";

type Props = {
  accountId: string;
  subject: string;
  bodyText: string;
  trackingUrl: string;
  prenotazioneId?: string;
};

export function ProvaGraficaMailSpedizione({
  accountId,
  subject,
  bodyText,
  trackingUrl,
  prenotazioneId,
}: Props) {
  const [indirizzo, setIndirizzo] = useState(PROVA_MAIL);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function prova() {
    setErrore(null);
    setInfo(null);
    if (indirizzo.trim().toLowerCase() !== PROVA_MAIL) {
      setErrore(
        "La prova si invia solo a sandrohd@gmail.com. Al cliente non parte nulla."
      );
      return;
    }
    if (!accountId) {
      setErrore("Seleziona la casella mittente per la prova.");
      return;
    }
    if (!trackingUrl.trim()) {
      setErrore("Inserisci il tracking per provare la mail.");
      return;
    }
    setBusy(true);
    const res = await provaGraficaMailSpedizioneAction({
      accountId,
      subject: subject.trim() || "Spedizione",
      bodyText: bodyText.trim() || "Cordiali saluti",
      trackingUrl: trackingUrl.trim(),
      prenotazioneId,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setInfo(
      "Prova inviata solo a sandrohd@gmail.com. Il cliente non ha ricevuto nulla e questa schermata resta aperta."
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
      <p className="text-sm font-medium text-amber-950">
        Prova grafica, solo temporanea
      </p>
      <p className="text-xs text-amber-900">
        Il clic manda la mail soltanto a sandrohd@gmail.com, per vedere come la
        leggerà il cliente. Non chiude la schermata e non avvisa il cliente.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Indirizzo mail</span>
        <input
          type="email"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void prova()}
        className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
      >
        {busy ? "Invio prova…" : "Prova risultato"}
      </button>
      {errore ? (
        <p className="text-sm text-red-700">{errore}</p>
      ) : null}
      {info ? <p className="text-sm text-emerald-800">{info}</p> : null}
    </div>
  );
}
