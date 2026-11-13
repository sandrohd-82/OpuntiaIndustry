"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confermaPresaVisioneHaccpAction } from "@/app/actions/haccp-linee-guida";
import { paragrafiGuida } from "@/lib/produzione/haccp";
import type { GuidaRicevuta, NotificaStatoGuida } from "@/lib/produzione/haccp-versioni";

function dataIt(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function etichettaNotifica(stato: NotificaStatoGuida): string {
  if (stato === "inviata") return "Avviso email consegnato";
  if (stato === "fallita") return "Avviso email non consegnato: il testo è comunque qui";
  return "Avviso email non ancora inviato: il testo è comunque qui";
}

export function LineeGuidaFornitore({ guide }: { guide: GuidaRicevuta[] }) {
  const router = useRouter();
  const [aperta, setAperta] = useState<string | null>(guide[0]?.versioni[0]?.id ?? null);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function conferma(versioneId: string) {
    setOccupato(true);
    setErrore(null);
    const res = await confermaPresaVisioneHaccpAction({ versioneId });
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    router.refresh();
  }

  if (guide.length === 0) {
    return (
      <p className="max-w-xl text-sm text-slate-600">
        Nessun documento è stato destinato alla tua azienda.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <p className="text-sm leading-6 text-slate-600">
        Leggi la versione ricevuta e conferma la presa visione. La conferma resta
        sul tuo utente e su quella versione. Non è una firma elettronica qualificata
        e non dichiara la rappresentanza legale dell&apos;azienda.
      </p>
      {guide.map((guida) => (
        <article key={guida.documentoId} className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-serif text-2xl text-slate-900">{guida.titolo}</h2>
          <ul className="mt-4 space-y-3">
            {guida.versioni.map((versione) => {
              const apertaQui = aperta === versione.id;
              return (
                <li key={versione.id} className="rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAperta(apertaQui ? null : versione.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      Versione {versione.numero}
                      {versione.pubblicataAt ? ` · ${dataIt(versione.pubblicataAt)}` : ""}
                    </span>
                    <span className="text-xs text-slate-500">
                      {versione.miaPresaAt
                        ? `Presa visione ${dataIt(versione.miaPresaAt)}`
                        : "Presa visione da confermare"}
                    </span>
                  </button>
                  {apertaQui ? (
                    <div className="border-t border-slate-200 px-4 py-4">
                      <div className="space-y-3 font-serif text-[17px] leading-7 text-slate-800">
                        {paragrafiGuida(versione.corpo).map((paragrafo, index) => (
                          <p key={`${versione.id}-${index}`}>{paragrafo}</p>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-slate-500">
                        Registrata il {dataIt(versione.registrataAt)}. {etichettaNotifica(versione.notificaStato)}
                      </p>
                      {versione.preseAzienda.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-sm text-slate-700">
                          {versione.preseAzienda.map((presa) => (
                            <li key={`${presa.profileId}-${presa.confermataAt}`}>
                              {presa.nome} ha confermato il {dataIt(presa.confermataAt)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {versione.miaPresaAt ? (
                        <p className="mt-3 text-sm text-emerald-800">
                          La tua presa visione di questa versione è registrata.
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={occupato}
                          onClick={() => void conferma(versione.id)}
                          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Confermo di aver letto questa versione
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
    </div>
  );
}
