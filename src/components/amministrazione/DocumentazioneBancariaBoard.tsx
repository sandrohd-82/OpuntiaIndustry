"use client";

import { useCallback, useEffect, useState } from "react";
import {
  caricaDocumentazioneBancariaAction,
  elencoDocumentazioneBancariaAction,
  urlDocumentazioneBancariaAction,
  type VoceDocumentazioneBancaria,
} from "@/app/actions/documentazione-bancaria";
import {
  GRUPPI_DOCUMENTAZIONE_BANCA,
  slotDocumentazioneBancaria,
} from "@/lib/amministrazione/documentazione-bancaria";
import { formatDateIt } from "@/lib/amministrazione/fatture";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

type Anteprima =
  | { kind: "pdf"; nome: string; url: string }
  | { kind: "csv"; nome: string; testo: string };

export function DocumentazioneBancariaBoard({
  anno,
  trimestre,
  solaLettura = false,
}: {
  anno: number;
  trimestre: TrimestreNumero;
  solaLettura?: boolean;
}) {
  const [voci, setVoci] = useState<VoceDocumentazioneBancaria[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [slotInCorso, setSlotInCorso] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);

  const carica = useCallback(async () => {
    setPronto(false);
    setErrore(null);
    const res = await elencoDocumentazioneBancariaAction({ anno, trimestre });
    if (!res.success) {
      setVoci([]);
      setErrore(res.error);
      setPronto(true);
      return;
    }
    setVoci(res.voci);
    setPronto(true);
  }, [anno, trimestre]);

  useEffect(() => {
    void carica();
  }, [carica]);

  useEffect(() => {
    if (!anteprima || anteprima.kind !== "pdf") return;
    const url = anteprima.url;
    return () => URL.revokeObjectURL(url);
  }, [anteprima]);

  async function onFile(voce: VoceDocumentazioneBancaria, file: File | null) {
    if (!file || solaLettura) return;
    if (voce.caricato) {
      const conferma = window.confirm(
        "Sostituire solo questo documento? Il file precedente resta nel registro e esce dall'elenco."
      );
      if (!conferma) return;
    }
    setErrore(null);
    setInfo(null);
    setSlotInCorso(voce.slot);
    const fd = new FormData();
    fd.set("anno", String(anno));
    fd.set("trimestre", String(trimestre));
    fd.set("slot", voce.slot);
    fd.set("file", file);
    const res = await caricaDocumentazioneBancariaAction(fd);
    setSlotInCorso(null);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setInfo(voce.caricato ? "Documento sostituito." : "Documento caricato.");
    await carica();
  }

  async function apri(voce: VoceDocumentazioneBancaria, modo: "mostra" | "scarica") {
    if (!voce.id) return;
    setErrore(null);
    setSlotInCorso(voce.slot);
    const res = await urlDocumentazioneBancariaAction({ id: voce.id, modo });
    setSlotInCorso(null);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const risposta = await fetch(res.url);
    if (!risposta.ok) {
      setErrore("Non riesco a leggere il file.");
      return;
    }
    const blob = await risposta.blob();
    if (modo === "scarica") {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    if (res.mime === "application/pdf" || res.fileName.toLowerCase().endsWith(".pdf")) {
      setAnteprima({
        kind: "pdf",
        nome: res.fileName,
        url: URL.createObjectURL(blob),
      });
      return;
    }
    if (res.mime === "text/csv" || res.fileName.toLowerCase().endsWith(".csv")) {
      const testo = (await blob.text()).slice(0, 200000);
      setAnteprima({ kind: "csv", nome: res.fileName, testo });
      return;
    }
    const url = URL.createObjectURL(blob);
    const aperto = window.open(url, "_blank", "noopener,noreferrer");
    if (!aperto) {
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <section
      id="documentazione-bancaria"
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="text-sm font-semibold text-slate-900">Documentazione Bancaria</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Documenti del trimestre selezionato. Il nome sotto ogni riga è quello con cui il file viene salvato.
      </p>
      {errore ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {info ? <p className="mt-2 text-xs text-slate-700">{info}</p> : null}
      {!pronto ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Caricamento documenti…</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {GRUPPI_DOCUMENTAZIONE_BANCA.map((gruppo) => (
            <div key={gruppo.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {gruppo.titolo}
              </h3>
              <ul className="mt-3 space-y-3">
                {voci
                  .filter((voce) => voce.gruppo === gruppo.id)
                  .map((voce) => {
                    const def = slotDocumentazioneBancaria(voce.slot);
                    let etichettaCarica = "Carica";
                    if (slotInCorso === voce.slot) etichettaCarica = "Salvataggio…";
                    else if (voce.caricato) etichettaCarica = "Sostituisci";
                    return (
                      <li key={voce.slot} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                        <p className="text-sm font-medium text-slate-900">{voce.nomeFile}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                          {voce.caricato
                            ? `Caricato il ${formatDateIt(voce.caricatoAt)} · versione ${voce.versione}`
                            : "Non ancora caricato"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {solaLettura ? null : (
                            <label className="cursor-pointer rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white">
                              {etichettaCarica}
                              <input
                                type="file"
                                accept={def ? `.${def.ext}` : undefined}
                                className="hidden"
                                disabled={slotInCorso !== null}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  e.target.value = "";
                                  void onFile(voce, file);
                                }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            disabled={!voce.caricato || slotInCorso !== null}
                            onClick={() => void apri(voce, "mostra")}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-40"
                          >
                            Mostra
                          </button>
                          <button
                            type="button"
                            disabled={!voce.caricato || slotInCorso !== null}
                            onClick={() => void apri(voce, "scarica")}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-40"
                          >
                            Scarica
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {anteprima ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-lg"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">{anteprima.nome}</p>
              <button
                type="button"
                onClick={() => setAnteprima(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Chiudi
              </button>
            </div>
            {anteprima.kind === "pdf" ? (
              <iframe title={anteprima.nome} src={anteprima.url} className="min-h-[70vh] w-full" />
            ) : (
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs text-slate-800">
                {anteprima.testo}
              </pre>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
