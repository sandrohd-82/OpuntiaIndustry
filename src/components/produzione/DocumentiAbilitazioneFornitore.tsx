"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confermaAttoAbilitazioneAction } from "@/app/actions/requisiti-fornitore";
import type { DocumentoPortaleRiga } from "@/app/actions/requisiti-fornitore";
import { etichettaNaturaRequisito } from "@/lib/amministrazione/requisiti-fornitore";

export function DocumentiAbilitazioneFornitore({
  documenti,
}: {
  documenti: DocumentoPortaleRiga[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState<string | null>(documenti[0]?.versioneId ?? null);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function conferma(versioneId: string) {
    setOccupato(true);
    setErrore(null);
    const res = await confermaAttoAbilitazioneAction(versioneId);
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    router.refresh();
  }

  if (documenti.length === 0) {
    return (
      <p className="max-w-xl text-sm text-slate-600">
        Nessun documento di abilitazione è stato distribuito alla tua azienda.
        Le linee guida restano nella sezione dedicata.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm leading-6 text-slate-600">
        Leggi la versione ricevuta. Il consenso privacy e l&apos;accettazione
        contrattuale si confermano qui, sul tuo utente e su quella versione.
        Non sono una presa visione delle linee guida e non sono una firma.
      </p>
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      {documenti.map((documento) => (
        <article key={documento.versioneId} className="rounded-xl border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() =>
              setAperto((corrente) => (corrente === documento.versioneId ? null : documento.versioneId))
            }
            className="flex w-full items-center justify-between text-left"
          >
            <span className="font-medium text-slate-900">
              {documento.titolo} · versione {documento.numero}
            </span>
            <span className="text-xs text-slate-500">
              {etichettaNaturaRequisito(documento.natura)}
            </span>
          </button>
          {aperto === documento.versioneId ? (
            <div className="mt-3 space-y-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{documento.corpo}</p>
              {documento.confermataAt ? (
                <p className="text-sm text-emerald-800">
                  Conferma registrata il {new Date(documento.confermataAt).toLocaleString("it-IT")}.
                </p>
              ) : (
                <button
                  type="button"
                  disabled={occupato}
                  onClick={() => void conferma(documento.versioneId)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {documento.natura === "consenso_privacy"
                    ? "Confermo il consenso privacy"
                    : "Confermo l\u2019accettazione contrattuale"}
                </button>
              )}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
