"use client";

import { useState } from "react";
import {
  cediOAffiancaAnagraficaAction,
  contestoCessioneAffiancamentoAction,
} from "@/app/actions/cliente-affiancamento";
import { InfoHint } from "@/components/ui/InfoHint";

type Destinatario = {
  id: string;
  nome: string;
  grado: "senior" | "professional" | "executive";
};

const GRADO: Record<Destinatario["grado"], string> = {
  senior: "Senior",
  professional: "Professional",
  executive: "Executive",
};

export function ClienteCediAffiancaFields({
  kind,
  recordId,
  onCommercialeCeduto,
  onChanged,
}: {
  kind: "cliente" | "possibile";
  recordId: string;
  onCommercialeCeduto?: (
    commercialeId: string,
    intermediarioAzzerato: boolean
  ) => void;
  onChanged?: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [puoAgire, setPuoAgire] = useState(false);
  const [destinatari, setDestinatari] = useState<Destinatario[]>([]);
  const [targetId, setTargetId] = useState("");
  const [affiancatoNome, setAffiancatoNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  async function carica(mantieniEsito: boolean) {
    setCaricando(true);
    if (!mantieniEsito) {
      setError(null);
      setNota(null);
    }
    try {
      const res = await contestoCessioneAffiancamentoAction({
        kind,
        id: recordId,
      });
      if (!res.success) {
        setPuoAgire(false);
        setDestinatari([]);
        setError(res.error);
        return;
      }
      setPuoAgire(res.puoAgire);
      setDestinatari(res.destinatari);
      setAffiancatoNome(res.affiancatoNome);
      setTargetId((cur) =>
        res.destinatari.some((d) => d.id === cur) ? cur : ""
      );
      if (!res.puoAgire && !mantieniEsito) {
        setError(
          res.destinatari.length === 0
            ? "Non ci sono commerciali Senior, Professional o Executive a cui passare questa scheda."
            : "Puoi cedere o affiancare solo le aziende della tua linea."
        );
      }
    } catch {
      setPuoAgire(false);
      setError("Non riesco a leggere la linea commerciale.");
    } finally {
      setCaricando(false);
    }
  }

  function apri() {
    setAperto(true);
    void carica(false);
  }

  async function esegui(mode: "cedi" | "affianca" | "togli") {
    setBusy(true);
    setError(null);
    setNota(null);
    const res = await cediOAffiancaAnagraficaAction({
      kind,
      id: recordId,
      mode,
      targetUserId: mode === "togli" ? null : targetId || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    if (mode === "cedi" && res.commercialeId) {
      onCommercialeCeduto?.(res.commercialeId, res.intermediarioAzzerato);
      setNota("Scheda ceduta. Il sottoposto è il commerciale.");
    } else if (mode === "affianca") {
      setNota("Affiancato. Il commerciale della scheda non cambia.");
    } else {
      setNota("Affiancamento tolto.");
    }
    onChanged?.();
    await carica(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => apri()}
        className="inline-flex items-center rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
      >
        Cedi o affianca
      </button>
      {aperto ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAperto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cedi o affianca"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">
                Cedi o affianca
              </h3>
              <button
                type="button"
                onClick={() => setAperto(false)}
                className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Chiudi
              </button>
            </div>
            {caricando ? (
              <p className="mt-3 text-sm text-[var(--muted)]">Caricamento…</p>
            ) : (
              <div className="mt-3 space-y-3">
                {affiancatoNome ? (
                  <p className="text-sm text-slate-800">
                    Affiancato:{" "}
                    <span className="font-medium">{affiancatoNome}</span>
                  </p>
                ) : null}
                {puoAgire && destinatari.length > 0 ? (
                  <>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
                    >
                      <option value="">Scegli un sottoposto</option>
                      {destinatari.map((d) => (
                        <option key={d.id} value={d.id}>
                          {GRADO[d.grado]} · {d.nome}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy || !targetId}
                          onClick={() => void esegui("cedi")}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Cedi
                        </button>
                        <InfoHint title="Cedi" overlayClassName="z-[220]">
                          Cedi assegna la scheda al sottoposto: da quel momento
                          è lui il commerciale. Tu la continui a vedere perché
                          sei sopra di lui. La provvigione non si sposta da
                          sola.
                        </InfoHint>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy || !targetId}
                          onClick={() => void esegui("affianca")}
                          className="rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-sm font-medium text-emerald-950 disabled:opacity-50"
                        >
                          Affianca
                        </button>
                        <InfoHint title="Affianca" overlayClassName="z-[220]">
                          Affianca lascia te come commerciale e aggiunge il
                          sottoposto. Entrambi vedete e lavorate la scheda. La
                          provvigione non cambia. Si può affiancare una sola
                          persona.
                        </InfoHint>
                      </span>
                    </div>
                  </>
                ) : null}
                {affiancatoNome ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void esegui("togli")}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    Togli affiancamento
                  </button>
                ) : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
                {nota ? (
                  <p className="text-sm text-emerald-800">{nota}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
