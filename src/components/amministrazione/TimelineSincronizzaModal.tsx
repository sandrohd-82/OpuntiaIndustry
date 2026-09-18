"use client";

import { useEffect, useState, useTransition } from "react";
import {
  previewAziendaTimelineSyncAction,
  runAziendaTimelineSyncAction,
  type AziendaTimelineSyncPreview,
} from "@/app/actions/azienda-timeline";
import type { AziendaTimelineTipo } from "@/lib/amministrazione/azienda-timeline";

type Props = {
  open: boolean;
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  onClose: () => void;
  onDone: (info: string) => void;
};

export function TimelineSincronizzaModal({
  open,
  aziendaTipo,
  aziendaId,
  onClose,
  onDone,
}: Props) {
  const [preview, setPreview] = useState<AziendaTimelineSyncPreview | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState(true);
  const [pn, setPn] = useState(true);
  const [documenti, setDocumenti] = useState(true);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError(null);
    setMail(true);
    setPn(true);
    setDocumenti(true);
    startTransition(async () => {
      const res = await previewAziendaTimelineSyncAction({
        aziendaTipo,
        aziendaId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
      setMail(res.preview.mailNuove > 0);
      setPn(res.preview.pnNuove > 0);
      setDocumenti(true);
    });
  }, [open, aziendaTipo, aziendaId]);

  if (!open) return null;

  const loading = pending && !preview && !error;
  const canRun =
    Boolean(preview) &&
    !running &&
    (mail || pn || documenti);

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={running ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Sincronizza timeline"
        className="w-full max-w-lg rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Sincronizza timeline</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Scegli cosa collegare a questa scheda. Le mail già assegnate ad
          un’altra anagrafica non vengono spostate.
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Controllo mail, note e documenti…
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        {preview ? (
          <fieldset className="mt-3 space-y-2" disabled={running}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={mail}
                onChange={(e) => setMail(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">Mail</span>
                <span className="text-xs text-[var(--muted)]">
                  {preview.mailNuove} da collegare
                  {preview.mailGiaCollegate
                    ? ` · ${preview.mailGiaCollegate} già in timeline`
                    : ""}
                  {preview.mailAltroProfilo
                    ? ` · ${preview.mailAltroProfilo} su altri profili (non toccate)`
                    : ""}
                  {preview.emailsUsate
                    ? ` · ${preview.emailsUsate} indirizzi scheda`
                    : ""}
                </span>
                {preview.mailEsempi.length > 0 ? (
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Es. {preview.mailEsempi.join(" · ")}
                  </span>
                ) : null}
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={pn}
                onChange={(e) => setPn(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">
                  Note, attività e promemoria
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {preview.pnNuove} da copiare
                  {preview.pnGia ? ` · ${preview.pnGia} già presenti` : ""}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={documenti}
                onChange={(e) => setDocumenti(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">
                  Ordini, campionature e fatture
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {preview.documenti} già collegati alla scheda (si
                  ricalcolano in elenco)
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={running}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!canRun}
            onClick={() => {
              setRunning(true);
              setError(null);
              void runAziendaTimelineSyncAction({
                aziendaTipo,
                aziendaId,
                mail,
                pn,
                documenti,
              }).then((res) => {
                setRunning(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                const bits = [
                  mail ? `${res.linkedMail} mail` : null,
                  pn ? `${res.copiedPn} note/PN` : null,
                  documenti ? `${res.documenti} documenti` : null,
                ].filter(Boolean);
                onDone(`Sincronizzazione completata: ${bits.join(", ")}.`);
                onClose();
              });
            }}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? "Sincronizzo…" : "Sincronizza"}
          </button>
        </div>
      </div>
    </div>
  );
}
