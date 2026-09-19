"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  getAziendaTimelineSyncStateAction,
  pauseAziendaTimelineSyncAction,
  resumeAziendaTimelineSyncAction,
  runAziendaTimelineSyncAction,
} from "@/app/actions/azienda-timeline";
import { TimelineSincronizzaModal } from "@/components/amministrazione/TimelineSincronizzaModal";
import type { AziendaTimelineTipo } from "@/lib/amministrazione/azienda-timeline";

const btnSm =
  "rounded px-2 py-0.5 text-[10px] font-medium leading-tight disabled:opacity-60";

export function AnagraficaTimelineSyncBar({
  aziendaTipo,
  aziendaId,
  aziendaLabel,
  onSynced,
}: {
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  aziendaLabel: string;
  onSynced?: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attiva, setAttiva] = useState(true);
  const [frase, setFrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [pauseStep, setPauseStep] = useState<0 | 1 | 2>(0);
  const [fraseInput, setFraseInput] = useState("");
  const [pending, startTransition] = useTransition();
  const autoKey = useRef("");

  function reloadState() {
    return getAziendaTimelineSyncStateAction({ aziendaTipo, aziendaId }).then(
      (res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }
        setAttiva(res.state.attiva);
        setFrase(res.state.frasePausa);
      }
    );
  }

  useEffect(() => {
    setError(null);
    setInfo(null);
    setPauseStep(0);
    setFraseInput("");
    void reloadState();
  }, [aziendaTipo, aziendaId]);

  useEffect(() => {
    const key = `${aziendaTipo}:${aziendaId}`;
    if (!attiva) return;
    if (autoKey.current === key) return;
    autoKey.current = key;
    startTransition(async () => {
      const res = await runAziendaTimelineSyncAction({
        aziendaTipo,
        aziendaId,
        mail: true,
        pn: true,
        documenti: true,
        cercaImap: false,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (res.linkedMail > 0 || res.copiedPn > 0) {
        setInfo(
          `Sincronizzazione automatica: ${res.linkedMail} mail, ${res.copiedPn} note/PN.`
        );
        onSynced?.();
        return;
      }
      if (res.emailsUsate > 0) {
        setInfo(
          `Mantieni sincronizzato è attivo (${res.emailsUsate} indirizzi). In archivio non ci sono ancora mail: usa «Forza nuova sincronizzazione» per cercarle nelle caselle IMAP.`
        );
      }
    });
  }, [attiva, aziendaTipo, aziendaId, onSynced]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSettingsOpen(true);
          setError(null);
        }}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-950 hover:bg-emerald-100"
        title="Impostazioni sincronizzazione"
      >
        Sincronizzazione
      </button>

      {settingsOpen ? (
        <div
          data-nested-modal
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4"
          onClick={() => {
            if (!pending && pauseStep === 0) setSettingsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-label="Impostazioni sincronizzazione"
            className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-emerald-950">
                Impostazioni sincronizzazione
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className={`${btnSm} border border-slate-200 text-slate-600 hover:bg-slate-50`}
              >
                Chiudi
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              {attiva
                ? "Attivo: mail, promemoria, attività e documenti si collegano alla scheda. Solo Super Admin può disattivarlo."
                : "In pausa: le nuove mail non si collegano da sole."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={attiva}
                disabled={pending}
                onClick={() => {
                  setError(null);
                  if (attiva) {
                    setPauseStep(1);
                    return;
                  }
                  startTransition(async () => {
                    const res = await resumeAziendaTimelineSyncAction({
                      aziendaTipo,
                      aziendaId,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    autoKey.current = "";
                    setAttiva(true);
                    setInfo("Sincronizzazione continua riattivata.");
                  });
                }}
                className={`${btnSm} ${
                  attiva
                    ? "bg-emerald-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {attiva
                  ? "Mantieni sincronizzato"
                  : "Sincronizzazione disattivata"}
              </button>
              <button
                type="button"
                onClick={() => setForceOpen(true)}
                className={`${btnSm} border border-emerald-800 bg-white text-emerald-950 hover:bg-emerald-50`}
              >
                Forza nuova sincronizzazione
              </button>
            </div>
            {info ? (
              <p className="mt-2 text-[11px] text-emerald-900">{info}</p>
            ) : null}
            {error ? (
              <p className="mt-2 text-[11px] text-red-800">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {pauseStep > 0 ? (
        <div
          data-nested-modal
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4"
          onClick={() => !pending && setPauseStep(0)}
        >
          <div
            role="dialog"
            aria-modal
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-red-800">
              Disattiva sincronizzazione continua
            </h2>
            {pauseStep === 1 ? (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  Prima conferma: le mail e i promemoria non si collegheranno
                  più da soli a «{aziendaLabel}». Serve il consenso Super Admin.
                </p>
                <div className="mt-4 flex justify-end gap-1.5">
                  <button
                    type="button"
                    className={`${btnSm} border border-slate-300`}
                    onClick={() => setPauseStep(0)}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    className={`${btnSm} bg-red-600 text-white`}
                    onClick={() => setPauseStep(2)}
                  >
                    Continua
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  Seconda conferma: copia la frase
                </p>
                <p className="mt-1 rounded bg-slate-100 px-2 py-1 font-mono text-xs">
                  {frase}
                </p>
                <input
                  value={fraseInput}
                  onChange={(e) => setFraseInput(e.target.value)}
                  className="mt-2 w-full rounded-lg border px-2 py-1.5 text-sm"
                  placeholder="Incolla la frase"
                />
                <div className="mt-4 flex justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    className={`${btnSm} border border-slate-300`}
                    onClick={() => setPauseStep(0)}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={pending || fraseInput.trim() !== frase}
                    className={`${btnSm} bg-red-600 text-white disabled:opacity-50`}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await pauseAziendaTimelineSyncAction({
                          aziendaTipo,
                          aziendaId,
                          conferma1: true,
                          frase: fraseInput,
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setAttiva(false);
                        setPauseStep(0);
                        setInfo("Sincronizzazione continua disattivata.");
                      });
                    }}
                  >
                    {pending ? "Disattivo…" : "Disattiva"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <TimelineSincronizzaModal
        open={forceOpen}
        aziendaTipo={aziendaTipo}
        aziendaId={aziendaId}
        onClose={() => setForceOpen(false)}
        onDone={(msg) => {
          setInfo(msg);
          onSynced?.();
        }}
      />
    </>
  );
}
