"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  apriAllegatoMailOrdineAction,
  elencoMailOrdineAction,
  inviaBozzaMailOrdineAction,
  type AllegatoVoceMail,
  type VoceMailOrdine,
} from "@/app/actions/ordine-mail-elenco";

function quando(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function etichetta(situazione: VoceMailOrdine["situazione"]): string {
  if (situazione === "inviata") return "Inviata";
  if (situazione === "prenotata") return "Prenotata";
  return "Non inviata";
}

export function OrdineMailElenco({ ordineId }: { ordineId: string }) {
  const [voci, setVoci] = useState<VoceMailOrdine[] | null>(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");
  const [aperta, setAperta] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    const res = await elencoMailOrdineAction(ordineId);
    if (!res.success) {
      setErrore(res.error);
      setVoci([]);
      return;
    }
    setErrore("");
    setVoci(res.voci);
  }, [ordineId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function apriAllegato(allegato: AllegatoVoceMail) {
    setBusy(true);
    setErrore("");
    const res = await apriAllegatoMailOrdineAction({
      ordineId,
      kind: allegato.kind,
      fatturaId: allegato.fatturaId,
      path: allegato.path,
      nome: allegato.nome,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    if (res.url) {
      window.open(res.url, "_blank", "noopener,noreferrer");
      return;
    }
    const binario = atob(res.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.contentType }));
    const finestra = window.open(url, "_blank", "noopener,noreferrer");
    if (!finestra) setErrore("Il browser ha bloccato l'apertura dell'allegato.");
  }

  async function invia(voce: VoceMailOrdine) {
    if (!voce.invio) return;
    setBusy(true);
    setEsito("");
    setErrore("");
    const res = await inviaBozzaMailOrdineAction({
      ordineId,
      tipo: voce.invio.tipo,
      fatturaId: voce.invio.fatturaId,
      prenotazioneId: voce.invio.prenotazioneId,
      accountId: voce.invio.accountId,
      to: voce.invio.to,
      subject: voce.invio.subject,
      bodyText: voce.invio.bodyText,
      conferma: true,
    });
    setBusy(false);
    setConferma(null);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setEsito("Mail inviata. Resta in elenco come inviata.");
    setAperta(null);
    await carica();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-800">Mail dell&apos;ordine</h3>
        <p className="text-xs text-[var(--muted)]">
          Inviate, bozze non inviate e mail prenotate.
        </p>
      </div>
      {errore ? (
        <p className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {esito ? (
        <p className="mx-3 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {esito}
        </p>
      ) : null}
      {voci === null ? (
        <p className="px-3 py-3 text-sm text-[var(--muted)]">Caricamento mail…</p>
      ) : voci.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[var(--muted)]">
          Nessuna mail per questo ordine.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {voci.map((voce) => {
            const apertaOra = aperta === voce.id;
            const confermaOra = conferma === voce.id;
            const tono =
              voce.situazione === "inviata"
                ? "bg-emerald-50 text-emerald-800"
                : voce.situazione === "prenotata"
                  ? "bg-sky-50 text-sky-800"
                  : "bg-amber-50 text-amber-900";
            return (
              <li key={voce.id} className="px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tono}`}>
                        {etichetta(voce.situazione)}
                      </span>
                      <span className="font-medium text-slate-800">{voce.tipologia}</span>
                      {quando(voce.quando) ? (
                        <span className="text-xs text-[var(--muted)]">
                          {quando(voce.quando)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-slate-700">{voce.oggetto}</p>
                    {voce.motivo ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{voce.motivo}</p>
                    ) : null}
                    {voce.allegati.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {voce.allegati.map((allegato) => (
                          <li key={`${allegato.kind}-${allegato.nome}-${allegato.path ?? allegato.fatturaId}`}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void apriAllegato(allegato)}
                              className="text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline disabled:opacity-60"
                            >
                              Vedi allegato: {allegato.nome}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {voce.situazione === "inviata" && voce.messaggioId && voce.accountId ? (
                      <Link
                        href={`/app/webmail/caselle/${voce.accountId}/inviati?m=${voce.messaggioId}`}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
                      >
                        Apri in Inviati
                      </Link>
                    ) : null}
                    {voce.corpo ? (
                      <button
                        type="button"
                        onClick={() => setAperta(apertaOra ? null : voce.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {apertaOra ? "Chiudi bozza" : "Vedi bozza"}
                      </button>
                    ) : null}
                    {voce.invio ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConferma(confermaOra ? null : voce.id)}
                        className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        Invia
                      </button>
                    ) : null}
                  </div>
                </div>
                {apertaOra && voce.corpo ? (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {voce.invio?.to ? (
                      <p className="mb-2 font-medium">Destinatario: {voce.invio.to}</p>
                    ) : null}
                    <pre className="whitespace-pre-wrap font-sans">{voce.corpo}</pre>
                  </div>
                ) : null}
                {confermaOra && voce.invio ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <p>
                      Confermi l&apos;invio di «{voce.tipologia}» al destinatario della bozza?
                      {voce.allegati.length > 0
                        ? ` Parte con ${voce.allegati.map((allegato) => allegato.nome).join(", ")}.`
                        : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void invia(voce)}
                        className="rounded-lg bg-amber-700 px-2.5 py-1 font-medium text-white disabled:opacity-60"
                      >
                        {busy ? "Invio…" : "Conferma invio"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConferma(null)}
                        className="rounded-lg border border-amber-300 px-2.5 py-1"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
