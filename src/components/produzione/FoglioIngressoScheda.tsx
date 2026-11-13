"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confermaPresaVisioneHaccpAction } from "@/app/actions/haccp-linee-guida";
import {
  chiudiFoglioIngressoAction,
  registraArrivoFoglioAction,
  riprendiFoglioIngressoAction,
  salvaRispostaFoglioAction,
  sospendiFoglioIngressoAction,
  type FoglioIngressoDettaglio,
  type RispostaFoglioRiga,
} from "@/app/actions/foglio-ingresso";
import { paragrafiGuida } from "@/lib/produzione/haccp";
import {
  ETICHETTA_FUNZIONE,
  processoControlloBySlug,
} from "@/lib/produzione/controllo-processi";
import {
  motivoVoceNonAttiva,
  voceCompilabile,
  type ValoreRispostaFoglio,
  type VistaFoglio,
} from "@/lib/produzione/foglio-ingresso";

function dataIt(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function testoValore(valore: ValoreRispostaFoglio): string {
  if (valore.tipo === "controllo") {
    return `${valore.esito === "conforme" ? "Conforme" : "Non conforme"}${valore.nota ? ` — ${valore.nota}` : ""}`;
  }
  if (valore.tipo === "dato_testo") return valore.testo;
  if (valore.tipo === "dato_numero") {
    return valore.unita === "kg" ? `${valore.valore} kg` : String(valore.valore);
  }
  if (valore.tipo === "segnalazione") {
    return valore.presente ? `Materiale da rimuovere: ${valore.nota}` : "Nessun materiale da rimuovere";
  }
  if (valore.tipo === "contatto") {
    return `${valore.esito === "in_attesa" ? "In attesa del responsabile" : "Carico possibile"} — ${valore.nota}`;
  }
  return valore.codice;
}

export function FoglioIngressoScheda({
  vista,
  foglio,
}: {
  vista: VistaFoglio;
  foglio: FoglioIngressoDettaglio;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const processo = processoControlloBySlug("materiale-in-ingresso");
  const elenco = vista === "produzione"
    ? "/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso"
    : "/app/area-fornitori/materiale-in-ingresso";
  const daLeggere = foglio.attore === "fornitore"
    ? foglio.versioni.filter((versione) => !versione.confermataDaMe)
    : [];
  const compilabile =
    daLeggere.length === 0 &&
    (foglio.stato === "aperto" || foglio.stato === "in_compilazione");
  const perVoce = new Map<string, RispostaFoglioRiga[]>();
  for (const risposta of foglio.risposte) {
    const lista = perVoce.get(risposta.voceCodice) ?? [];
    lista.push(risposta);
    perVoce.set(risposta.voceCodice, lista);
  }

  async function esegui(lavoro: () => Promise<{ success: boolean; error?: string }>) {
    setOccupato(true);
    setErrore(null);
    const esito = await lavoro();
    setOccupato(false);
    if (!esito.success) {
      setErrore(esito.error ?? "Operazione non riuscita.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <a href={elenco} className="text-sm text-sky-800 hover:underline">
        Torna all&apos;elenco
      </a>
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">{foglio.codice}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {foglio.ragioneSociale} · {foglio.stato.replaceAll("_", " ")} · aperto{" "}
          {dataIt(foglio.openedAt)}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Voci compilabili ancora vuote: {foglio.incomplete.length}
          {foglio.incomplete.length > 0 ? ` (${foglio.incomplete.join(", ")})` : ""}.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Linee guida applicabili all&apos;apertura
        </h3>
        {foglio.versioni.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Nessuna versione distribuita a questo fornitore. Non è richiesta una nuova presa visione.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {foglio.versioni.map((versione) => (
              <li key={versione.versioneId} className="text-sm text-slate-700">
                <p className="font-medium">
                  {versione.titolo}, versione {versione.numero}
                  {versione.confermataDaAzienda
                    ? " · presa visione già registrata"
                    : " · presa visione mancante"}
                </p>
                {foglio.attore === "fornitore" && !versione.confermataDaMe ? (
                  <div className="mt-2 space-y-2">
                    {paragrafiGuida(versione.corpo).map((paragrafo, index) => (
                      <p key={`${versione.versioneId}-${index}`}>{paragrafo}</p>
                    ))}
                    <button
                      type="button"
                      disabled={occupato}
                      onClick={() =>
                        void esegui(() =>
                          confermaPresaVisioneHaccpAction({ versioneId: versione.versioneId })
                        )
                      }
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Confermo di aver letto questa versione
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {compilabile ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={() => void esegui(() => sospendiFoglioIngressoAction(foglio.id))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Sospendi
          </button>
        </div>
      ) : null}
      {foglio.stato === "in_attesa" ? (
        <button
          type="button"
          disabled={occupato}
          onClick={() => void esegui(() => riprendiFoglioIngressoAction(foglio.id))}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Riprendi compilazione
        </button>
      ) : null}

      {processo?.gruppi.map((gruppo) => {
        const voci = gruppo.voci.filter((voce) => vista === "produzione" || voce.latoFornitore);
        if (voci.length === 0) return null;
        return (
          <section key={gruppo.codice} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              {gruppo.titolo}
            </h3>
            {voci.map((voce) => (
              <VoceScheda
                key={voce.codice}
                codice={voce.codice}
                titolo={voce.titolo}
                testo={voce.testo}
                funzione={ETICHETTA_FUNZIONE[voce.funzione]}
                riferimento={voce.riferimento}
                foglioId={foglio.id}
                attore={foglio.attore}
                compilabile={compilabile}
                storia={perVoce.get(voce.codice) ?? []}
                occupato={occupato}
                onEsegui={esegui}
                mostraArrivo={vista === "produzione" && voce.codice === "q"}
              />
            ))}
          </section>
        );
      })}

      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
    </div>
  );
}

function VoceScheda({
  codice,
  titolo,
  testo,
  funzione,
  riferimento,
  foglioId,
  attore,
  compilabile,
  storia,
  occupato,
  onEsegui,
  mostraArrivo,
}: {
  codice: string;
  titolo: string;
  testo: string;
  funzione: string;
  riferimento?: string;
  foglioId: string;
  attore: "interno" | "fornitore";
  compilabile: boolean;
  storia: RispostaFoglioRiga[];
  occupato: boolean;
  onEsegui: (lavoro: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
  mostraArrivo: boolean;
}) {
  const attuale = storia[0] ?? null;
  const attiva = voceCompilabile(codice);
  const puoScrivere =
    compilabile && attiva && (attore === "fornitore" || attuale != null);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-sm font-semibold">
        <span className="font-mono text-xs text-slate-500">{codice}</span> {titolo}
      </p>
      <p className="mt-1 text-sm text-slate-700">{testo}</p>
      <p className="mt-2 text-xs text-slate-500">
        {funzione}
        {riferimento ? ` · richiama ${riferimento}` : ""}
      </p>
      {attuale ? (
        <p className="mt-3 text-sm text-slate-800">
          {testoValore(attuale.valore)}
          <span className="mt-1 block text-xs text-slate-500">
            {attuale.autore} · {dataIt(attuale.confermataAt)}
            {attuale.motivazione ? ` · correzione: ${attuale.motivazione}` : ""}
          </span>
        </p>
      ) : null}
      {storia.length > 1 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {storia.slice(1).map((voce) => (
            <li key={voce.id}>
              {dataIt(voce.confermataAt)} · {voce.autore}: {testoValore(voce.valore)}
              {voce.motivazione ? ` · ${voce.motivazione}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {!attiva ? (
        <p className="mt-3 text-sm text-amber-900">{motivoVoceNonAttiva(codice)}</p>
      ) : null}
      {puoScrivere ? (
        <ModuloVoce
          codice={codice}
          foglioId={foglioId}
          correzione={attuale != null}
          occupato={occupato}
          onEsegui={onEsegui}
        />
      ) : null}
      {mostraArrivo ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={() => void onEsegui(() => registraArrivoFoglioAction())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Registra arrivo
          </button>
          <button
            type="button"
            disabled={occupato}
            onClick={() => void onEsegui(() => chiudiFoglioIngressoAction())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Chiudi foglio
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ModuloVoce({
  codice,
  foglioId,
  correzione,
  occupato,
  onEsegui,
}: {
  codice: string;
  foglioId: string;
  correzione: boolean;
  occupato: boolean;
  onEsegui: (lavoro: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const [testo, setTesto] = useState("");
  const [nota, setNota] = useState("");
  const [esito, setEsito] = useState("conforme");
  const [presente, setPresente] = useState(false);
  const [contatto, setContatto] = useState("carico_possibile");
  const [numero, setNumero] = useState("");
  const [motivazione, setMotivazione] = useState("");

  function valore(): unknown {
    if (["mezzo", "1e", "2b", "2g", "2h"].includes(codice)) {
      return { esito, nota };
    }
    if (codice === "2a" || codice === "2c") return { testo };
    if (codice === "2d" || codice === "2i" || codice === "2l") return { valore: Number(numero) };
    if (codice === "2e") return { codice: testo };
    if (codice === "1c") return { presente, nota };
    return { esito: contatto, nota };
  }

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onEsegui(() =>
          salvaRispostaFoglioAction({
            foglioId,
            voceCodice: codice,
            valore: valore(),
            motivazione: correzione ? motivazione : undefined,
          })
        );
      }}
    >
      {codice === "2a" || codice === "2c" || codice === "2e" ? (
        <input
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          required
          maxLength={codice === "2e" ? 40 : 500}
          placeholder={codice === "2e" ? "Codice lotto dichiarato" : "Dato"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      {codice === "2d" || codice === "2i" || codice === "2l" ? (
        <input
          value={numero}
          onChange={(event) => setNumero(event.target.value)}
          required
          type="number"
          min="0"
          step={codice === "2l" ? "0.01" : "1"}
          placeholder={codice === "2l" ? "Peso in kg" : "Numero contenitori"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      {["mezzo", "1e", "2b", "2g", "2h"].includes(codice) ? (
        <select
          value={esito}
          onChange={(event) => setEsito(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="conforme">Conforme</option>
          <option value="non_conforme">Non conforme</option>
        </select>
      ) : null}
      {codice === "1c" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={presente}
            onChange={(event) => setPresente(event.target.checked)}
          />
          C&apos;è materiale da rimuovere
        </label>
      ) : null}
      {codice === "1d" ? (
        <select
          value={contatto}
          onChange={(event) => setContatto(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="carico_possibile">Carico possibile</option>
          <option value="in_attesa">In attesa del responsabile</option>
        </select>
      ) : null}
      {codice === "1c" || codice === "1d" || ["mezzo", "1e", "2b", "2g", "2h"].includes(codice) ? (
        <textarea
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Nota"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      {correzione ? (
        <input
          value={motivazione}
          onChange={(event) => setMotivazione(event.target.value)}
          required
          minLength={3}
          maxLength={500}
          placeholder="Motivazione della correzione"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      <button
        type="submit"
        disabled={occupato}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {correzione ? "Registra correzione" : "Salva"}
      </button>
    </form>
  );
}
