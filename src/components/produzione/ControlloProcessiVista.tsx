import Link from "next/link";
import {
  ETICHETTA_FUNZIONE,
  ETICHETTA_SOGGETTO,
  PROCESSI_CONTROLLO,
  REGOLE_FOGLIO_CONTROLLO,
  type ProcessoControllo,
} from "@/lib/produzione/controllo-processi";

export function ControlloProcessiElenco() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Foglio di controllo
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {REGOLE_FOGLIO_CONTROLLO.map((regola) => (
            <li key={regola}>{regola}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--muted)]">
          La logica delle voci è salvata. Le funzioni si attivano una alla volta.
        </p>
      </section>
      <ul className="space-y-2">
        {PROCESSI_CONTROLLO.map((processo) => (
          <li key={processo.slug}>
            <Link
              href={`/app/produzione/controlli-haccp/controllo-processi/${processo.slug}`}
              className="block rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 hover:bg-slate-50"
            >
              <span className="block font-semibold">{processo.titolo}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">
                {processo.sintesi}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ControlloProcessoDettaglio({
  processo,
  soloFornitore = false,
}: {
  processo: ProcessoControllo;
  soloFornitore?: boolean;
}) {
  const gruppi = soloFornitore
    ? processo.gruppi
        .map((gruppo) => ({
          ...gruppo,
          voci: gruppo.voci.filter((voce) => voce.latoFornitore),
        }))
        .filter((gruppo) => gruppo.voci.length > 0)
    : processo.gruppi;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Logica salvata. Sul foglio si registrano i controlli e i dati già eseguibili.
        Foto, DDT, firme OTP, partenza, arrivo e chiusura non sono ancora attivi.
      </section>
      {soloFornitore ? (
        <p className="text-sm text-[var(--muted)]">
          Questa è la parte del fornitore, fino alla partenza. L&apos;arrivo in
          sede resta sul foglio di Agrinsicilia.
        </p>
      ) : processo.areaFornitore ? (
        <p className="text-sm text-[var(--muted)]">
          Il fornitore compilerà la propria parte da Gestionale fornitori, sulla
          stessa procedura.
        </p>
      ) : null}
      {gruppi.map((gruppo) => (
        <section
          key={gruppo.codice}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            {gruppo.titolo}
          </h2>
          <ol className="mt-3 space-y-3">
            {gruppo.voci.map((voce) => (
              <li
                key={voce.codice}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <p className="text-sm font-semibold">
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {voce.codice}
                  </span>{" "}
                  {voce.titolo}
                </p>
                <p className="mt-1 text-sm text-slate-700">{voce.testo}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {voce.soggetti.map((s) => ETICHETTA_SOGGETTO[s]).join(", ")}
                  {" · "}
                  {ETICHETTA_FUNZIONE[voce.funzione]}
                  {voce.riferimento ? ` · richiama ${voce.riferimento}` : ""}
                  {voce.attesaDopo ? " · poi il foglio può restare in attesa" : ""}
                </p>
                {voce.nota ? (
                  <p className="mt-1 text-xs text-amber-800">{voce.nota}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
