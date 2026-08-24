"use client";

import { useEffect, useState, useTransition } from "react";
import {
  archiveContrattoFiscaleAction,
  createContrattoFiscaleAction,
  getContrattoAllegatoUrlAction,
  listContrattiFiscaliAction,
  uploadContrattoAllegatoAction,
} from "@/app/actions/contratti-fiscali";
import {
  PERIODICITA_LABEL,
  STATO_LABEL,
  TIPOLOGIA_LABEL,
  type ContrattoFiscale,
  type ContrattoPeriodicita,
  type ContrattoTipologia,
} from "@/lib/amministrazione/contratti-fiscali";

type Props = {
  mode: "nuovo" | "elenco" | "archivio";
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function ContrattiFiscaliBoard({ mode }: Props) {
  const [items, setItems] = useState<ContrattoFiscale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [tipologia, setTipologia] = useState<ContrattoTipologia>("affitto");
  const [oggetto, setOggetto] = useState("");
  const [controparte, setControparte] = useState("");
  const [importo, setImporto] = useState("");
  const [periodicita, setPeriodicita] =
    useState<ContrattoPeriodicita>("mensile");
  const [iva, setIva] = useState("");
  const [haPeriodo, setHaPeriodo] = useState(true);
  const [dataInizio, setDataInizio] = useState(todayIso);
  const [dataFine, setDataFine] = useState("");
  const [indeterminato, setIndeterminato] = useState(false);
  const [fatturaMode, setFatturaMode] = useState<"sostituisce" | "soggetto">(
    "soggetto"
  );
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function reload() {
    startTransition(async () => {
      const res = await listContrattiFiscaliAction({
        archivio: mode === "archivio",
      });
      if (!res.success) {
        setError(res.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    if (mode !== "nuovo") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function create() {
    setOk(null);
    const importoNum = Number(String(importo).replace(",", "."));
    startTransition(async () => {
      const res = await createContrattoFiscaleAction({
        tipologia,
        oggetto,
        controparteNome: controparte,
        importo: importoNum,
        periodicita,
        ivaPercentuale: iva.trim() ? Number(iva.replace(",", ".")) : null,
        haPeriodo,
        dataInizio: haPeriodo ? dataInizio : null,
        dataFine: haPeriodo && !indeterminato ? dataFine || null : null,
        aTempoIndeterminato: indeterminato,
        sostituisceFattura: fatturaMode === "sostituisce",
        pagamentoSoggettoAFattura: fatturaMode === "soggetto",
        note,
        stato: "attivo",
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result ?? "");
            const i = result.indexOf(",");
            resolve(i >= 0 ? result.slice(i + 1) : result);
          };
          reader.onerror = () => reject(reader.error ?? new Error("read"));
          reader.readAsDataURL(file);
        });
        const up = await uploadContrattoAllegatoAction({
          contrattoId: res.item.id,
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64,
        });
        if (!up.success) {
          setError(`Contratto creato, allegato fallito: ${up.error}`);
          setOk(null);
          return;
        }
      }
      setError(null);
      setOk("Contratto registrato.");
      setOggetto("");
      setControparte("");
      setImporto("");
      setNote("");
      setFile(null);
    });
  }

  if (mode === "nuovo") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {ok}
          </p>
        ) : null}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">Nuovo contratto</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Tipologia</label>
              <select
                value={tipologia}
                onChange={(e) =>
                  setTipologia(e.target.value as ContrattoTipologia)
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                {(Object.keys(TIPOLOGIA_LABEL) as ContrattoTipologia[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {TIPOLOGIA_LABEL[k]}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Periodicità importo</label>
              <select
                value={periodicita}
                onChange={(e) =>
                  setPeriodicita(e.target.value as ContrattoPeriodicita)
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                {(
                  Object.keys(PERIODICITA_LABEL) as ContrattoPeriodicita[]
                ).map((k) => (
                  <option key={k} value={k}>
                    {PERIODICITA_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Oggetto</label>
            <input
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value.slice(0, 300))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Es. Affitto capannone Via Roma"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Controparte</label>
            <input
              value={controparte}
              onChange={(e) => setControparte(e.target.value.slice(0, 200))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Ragione sociale / nome"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Importo (€)</label>
              <input
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium">IVA % (opz.)</label>
              <input
                value={iva}
                onChange={(e) => setIva(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                placeholder="22"
              />
            </div>
          </div>

          <fieldset className="rounded-lg border border-[var(--border)] p-3">
            <legend className="px-1 text-xs font-semibold">
              Periodo temporale
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={haPeriodo}
                onChange={(e) => setHaPeriodo(e.target.checked)}
              />
              Contratto con periodo definito
            </label>
            {haPeriodo ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs">Data inizio</label>
                  <input
                    type="date"
                    value={dataInizio}
                    onChange={(e) => setDataInizio(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs">Data fine</label>
                  <input
                    type="date"
                    value={dataFine}
                    disabled={indeterminato}
                    onChange={(e) => setDataFine(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm disabled:opacity-50"
                  />
                </div>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={indeterminato}
                    onChange={(e) => {
                      setIndeterminato(e.target.checked);
                      if (e.target.checked) setDataFine("");
                    }}
                  />
                  A tempo indeterminato
                </label>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="rounded-lg border border-[var(--border)] p-3">
            <legend className="px-1 text-xs font-semibold">
              Rapporto con fattura
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="fatturaMode"
                checked={fatturaMode === "sostituisce"}
                onChange={() => setFatturaMode("sostituisce")}
                className="mt-1"
              />
              <span>
                Il contratto <strong>sostituisce la fattura</strong>
              </span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="fatturaMode"
                checked={fatturaMode === "soggetto"}
                onChange={() => setFatturaMode("soggetto")}
                className="mt-1"
              />
              <span>
                Il pagamento sarà <strong>sottoposto a fattura</strong>
              </span>
            </label>
          </fieldset>

          <div>
            <label className="text-xs font-medium">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 5000))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Allegato (PDF/doc opz.)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs"
            />
          </div>

          <button
            type="button"
            disabled={pending || !oggetto.trim() || !importo.trim()}
            onClick={create}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Registra contratto"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {pending && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : null}
      {items.length === 0 && !pending ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nessun contratto in questa sezione.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {items.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{c.oggetto}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {TIPOLOGIA_LABEL[c.tipologia]} ·{" "}
                    {PERIODICITA_LABEL[c.periodicita]} ·{" "}
                    {formatEuro(c.importo)}
                    {c.controparteNome ? ` · ${c.controparteNome}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {STATO_LABEL[c.stato]} · v{c.versione}
                    {c.haPeriodo
                      ? ` · ${c.dataInizio ?? "?"}${
                          c.aTempoIndeterminato
                            ? " → indeterminato"
                            : ` → ${c.dataFine ?? "?"}`
                        }`
                      : " · senza periodo"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-700">
                    {c.sostituisceFattura
                      ? "Sostituisce fattura"
                      : "Pagamento soggetto a fattura"}
                  </p>
                  {c.allegatoPath ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-sky-800 underline"
                      onClick={() => {
                        void getContrattoAllegatoUrlAction(c.allegatoPath!).then(
                          (res) => {
                            if (res.success) window.open(res.url, "_blank");
                            else setError(res.error);
                          }
                        );
                      }}
                    >
                      Allegato: {c.allegatoNome ?? "file"}
                    </button>
                  ) : null}
                </div>
                {mode === "elenco" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await archiveContrattoFiscaleAction(c.id);
                        if (!res.success) setError(res.error);
                        else reload();
                      });
                    }}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-slate-50"
                  >
                    Archivia
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
