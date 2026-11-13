"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creaHaccpLineaGuidaAction,
  pubblicaHaccpLineaGuidaAction,
  riprovaNotificaHaccpLineaGuidaAction,
  salvaBozzaHaccpLineaGuidaAction,
  salvaDestinatariHaccpLineaGuidaAction,
} from "@/app/actions/haccp-linee-guida";
import { paragrafiGuida } from "@/lib/produzione/haccp";
import type {
  AmbitoLineaGuida,
  FornitoreDestinatario,
  NotificaStatoGuida,
  SezioneLineaGuida,
  VersioneGuida,
} from "@/lib/produzione/haccp-versioni";

function dataIt(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function etichettaNotifica(stato: NotificaStatoGuida): string {
  if (stato === "inviata") return "Notifica consegnata";
  if (stato === "fallita") return "Notifica non consegnata";
  return "Notifica non inviata";
}

function ultimaPubblicata(versioni: VersioneGuida[]): VersioneGuida | null {
  return versioni.reduce<VersioneGuida | null>((trovata, versione) => {
    if (versione.stato !== "pubblicata") return trovata;
    if (!trovata || versione.numero > trovata.numero) return versione;
    return trovata;
  }, null);
}

export function HaccpLineeGuida({
  sezioni,
  fornitori,
}: {
  sezioni: SezioneLineaGuida[];
  fornitori: FornitoreDestinatario[];
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function esegui(lavoro: () => Promise<{ success: boolean; error?: string; messaggio?: string }>) {
    setOccupato(true);
    setErrore(null);
    setAvviso(null);
    const esito = await lavoro();
    setOccupato(false);
    if (!esito.success) {
      setErrore(esito.error ?? "Operazione non riuscita.");
      return;
    }
    if (esito.messaggio) setAvviso(esito.messaggio);
    router.refresh();
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="h-fit lg:sticky lg:top-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Indice
        </p>
        <ol className="mt-3 space-y-1.5 text-sm">
          {sezioni.map((sezione) => (
            <li key={sezione.id}>
              <a href={`#${sezione.slug}`} className="text-sky-800 hover:underline">
                {sezione.titolo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
        <header className="border-b border-slate-300 pb-4">
          <h1 className="font-serif text-4xl text-slate-900">Controlli e HACCP</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Le bozze si correggono. Una versione pubblicata resta nello storico e
            non si riscrive. I documenti interni non partono verso i fornitori.
          </p>
        </header>

        {sezioni.map((sezione) => (
          <SezioneEditor
            key={sezione.id}
            sezione={sezione}
            fornitori={fornitori}
            occupato={occupato}
            onEsegui={esegui}
          />
        ))}

        <NuovaSezione occupato={occupato} onEsegui={esegui} />

        {avviso ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {avviso}
          </p>
        ) : null}
        {errore ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
      </article>
    </div>
  );
}

function SezioneEditor({
  sezione,
  fornitori,
  occupato,
  onEsegui,
}: {
  sezione: SezioneLineaGuida;
  fornitori: FornitoreDestinatario[];
  occupato: boolean;
  onEsegui: (
    lavoro: () => Promise<{ success: boolean; error?: string; messaggio?: string }>
  ) => Promise<void>;
}) {
  const pubblicata = ultimaPubblicata(sezione.versioni);
  const bozza = sezione.versioni.find((versione) => versione.stato === "bozza") ?? null;
  const lettura = pubblicata ?? bozza;
  const [aperto, setAperto] = useState(false);
  const [titolo, setTitolo] = useState(bozza?.titolo ?? lettura?.titolo ?? sezione.titolo);
  const [corpo, setCorpo] = useState(bozza?.corpo ?? lettura?.corpo ?? "");
  const [ambito, setAmbito] = useState<AmbitoLineaGuida>(sezione.ambito);
  const [scelti, setScelti] = useState<string[]>(sezione.destinatariIds);
  const [cerca, setCerca] = useState("");
  const [storico, setStorico] = useState<string | null>(null);

  const filtrati = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    if (!testo) return fornitori;
    return fornitori.filter((fornitore) =>
      fornitore.ragioneSociale.toLowerCase().includes(testo)
    );
  }, [cerca, fornitori]);

  function toggle(id: string) {
    setScelti((attuali) =>
      attuali.includes(id) ? attuali.filter((voce) => voce !== id) : [...attuali, id]
    );
  }

  return (
    <section id={sezione.slug} className="scroll-mt-6 border-b border-slate-200 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl text-slate-900">{sezione.titolo}</h2>
        <p className="text-xs text-slate-500">
          {sezione.ambito === "fornitori" ? "Destinato a fornitori scelti" : "Documento interno"}
          {pubblicata ? ` · Versione ${pubblicata.numero} pubblicata` : " · Nessuna versione pubblicata"}
          {bozza ? ` · Bozza ${bozza.numero} aperta` : ""}
        </p>
      </div>
      {lettura ? (
        <div className="mt-4 max-w-3xl space-y-3 font-serif text-[17px] leading-7 text-slate-800">
          {paragrafiGuida(lettura.corpo).map((paragrafo, index) => (
            <p key={`${sezione.id}-${index}`}>{paragrafo}</p>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Testo non ancora inserito.</p>
      )}

      <button
        type="button"
        onClick={() => setAperto((valore) => !valore)}
        className="mt-4 text-sm font-medium text-sky-800 hover:underline"
      >
        {aperto ? "Chiudi redazione" : "Modifica bozza e destinatari"}
      </button>

      {aperto ? (
        <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Titolo
            <input
              value={titolo}
              onChange={(event) => setTitolo(event.target.value)}
              maxLength={160}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Testo della bozza
            <textarea
              value={corpo}
              onChange={(event) => setCorpo(event.target.value)}
              rows={6}
              maxLength={20000}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={occupato}
              onClick={() =>
                void onEsegui(async () => salvaBozzaHaccpLineaGuidaAction({
                  documentoId: sezione.id,
                  titolo,
                  corpo,
                }))
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
            >
              Salva bozza
            </button>
            <button
              type="button"
              disabled={occupato}
              onClick={() =>
                void onEsegui(async () => {
                  const res = await pubblicaHaccpLineaGuidaAction({
                    documentoId: sezione.id,
                    titolo,
                    corpo,
                  });
                  if (!res.success) return res;
                  return {
                    success: true,
                    messaggio: `Versione pubblicata. Distribuzioni registrate: ${res.registrate}. Notifiche consegnate: ${res.inviate}. Non consegnate: ${res.nonConsegnate}.`,
                  };
                })
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Pubblica versione
            </button>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Destinatari</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`ambito-${sezione.id}`}
                checked={ambito === "interno"}
                onChange={() => setAmbito("interno")}
              />
              Interno, non si invia ai fornitori
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`ambito-${sezione.id}`}
                checked={ambito === "fornitori"}
                onChange={() => setAmbito("fornitori")}
              />
              Fornitori scelti, una volta per versione
            </label>
            {ambito === "fornitori" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <input
                  value={cerca}
                  onChange={(event) => setCerca(event.target.value)}
                  placeholder="Cerca fornitore"
                  className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {filtrati.map((fornitore) => (
                    <li key={fornitore.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={scelti.includes(fornitore.id)}
                          onChange={() => toggle(fornitore.id)}
                        />
                        <span>
                          {fornitore.ragioneSociale}
                          <span className="text-slate-500">
                            {fornitore.email.trim()
                              ? ` · ${fornitore.email}`
                              : " · senza email, la notifica risulterà non consegnata"}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              disabled={occupato}
              onClick={() =>
                void onEsegui(async () => {
                  const res = await salvaDestinatariHaccpLineaGuidaAction({
                    documentoId: sezione.id,
                    ambito,
                    fornitoreIds: ambito === "fornitori" ? scelti : [],
                  });
                  if (!res.success) return res;
                  return {
                    success: true,
                    messaggio: `Destinatari salvati. Nuove distribuzioni: ${res.registrate}. Notifiche consegnate: ${res.inviate}. Non consegnate: ${res.nonConsegnate}.`,
                  };
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
            >
              Salva destinatari
            </button>
          </fieldset>
        </div>
      ) : null}

      {sezione.versioni.some((versione) => versione.stato === "pubblicata") ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">Versioni pubblicate</h3>
          <ul className="mt-2 space-y-2">
            {sezione.versioni
              .filter((versione) => versione.stato === "pubblicata")
              .slice()
              .reverse()
              .map((versione) => (
                <li key={versione.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setStorico((attuale) => (attuale === versione.id ? null : versione.id))
                    }
                    className="text-left text-sm font-medium text-slate-800"
                  >
                    Versione {versione.numero}
                    {versione.pubblicataAt ? ` · ${dataIt(versione.pubblicataAt)}` : ""}
                    {versione.pubblicataDa ? ` · ${versione.pubblicataDa}` : ""}
                  </button>
                  {storico === versione.id ? (
                    <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                      {paragrafiGuida(versione.corpo).map((paragrafo, index) => (
                        <p key={`${versione.id}-${index}`}>{paragrafo}</p>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {sezione.distribuzioni.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">Distribuzioni</h3>
          <ul className="mt-2 space-y-2">
            {sezione.distribuzioni.map((voce) => (
              <li key={voce.id} className="text-sm text-slate-700">
                Versione {voce.versioneNumero} · {voce.ragioneSociale} · registrata{" "}
                {dataIt(voce.registrataAt)} · {etichettaNotifica(voce.notificaStato)} · prese
                visione {voce.prese}
                {voce.notificaStato !== "inviata" ? (
                  <button
                    type="button"
                    disabled={occupato}
                    onClick={() =>
                      void onEsegui(async () => {
                        const res = await riprovaNotificaHaccpLineaGuidaAction(voce.id);
                        if (!res.success) return res;
                        return { success: true, messaggio: "Notifica aggiornata." };
                      })
                    }
                    className="ml-2 text-sky-800 hover:underline disabled:opacity-60"
                  >
                    Riprova notifica
                  </button>
                ) : null}
                {voce.notificaErrore ? (
                  <span className="mt-1 block text-xs text-slate-500">{voce.notificaErrore}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NuovaSezione({
  occupato,
  onEsegui,
}: {
  occupato: boolean;
  onEsegui: (
    lavoro: () => Promise<{ success: boolean; error?: string; messaggio?: string }>
  ) => Promise<void>;
}) {
  const [titolo, setTitolo] = useState("");
  const [corpo, setCorpo] = useState("");

  return (
    <section className="pt-8">
      <h2 className="font-serif text-2xl text-slate-900">Nuova sezione</h2>
      <p className="mt-2 text-sm text-slate-600">
        Nasce come bozza interna. Diventa visibile ai fornitori solo se la destini e la pubblichi.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onEsegui(async () => creaHaccpLineaGuidaAction({ titolo, corpo }));
        }}
      >
        <input
          value={titolo}
          onChange={(event) => setTitolo(event.target.value)}
          required
          maxLength={160}
          placeholder="Titolo"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={corpo}
          onChange={(event) => setCorpo(event.target.value)}
          required
          rows={4}
          maxLength={20000}
          placeholder="Testo"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={occupato}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Crea bozza interna
        </button>
      </form>
    </section>
  );
}
