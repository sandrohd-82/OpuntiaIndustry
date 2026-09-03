"use client";

import { useEffect, useId, useState } from "react";
import { startCameraLiveAction } from "@/app/actions/produzione-camere";
import { CameraStreamPlayer } from "@/components/produzione/CameraStreamPlayer";
import type { CameraTargetKind } from "@/lib/produzione/camera";

type Props = {
  targetKind: CameraTargetKind;
  areaCodice: string;
  postoCodice?: string | null;
  onClose: () => void;
};

export function LiveCameraModal({
  targetKind,
  areaCodice,
  postoCodice,
  onClose,
}: Props) {
  const titleId = useId();
  const [whepUrl, setWhepUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("Postazione");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void startCameraLiveAction({ targetKind, areaCodice, postoCodice }).then(
      (res) => {
        if (cancelled) return;
        setLoading(false);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setWhepUrl(res.whepUrl);
        setLabel(res.label);
        setWarning(res.warning ?? null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [targetKind, areaCodice, postoCodice]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            Live postazione
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Alla chiusura lo stream si interrompe (MediaMTX on-demand).
        </p>
        {loading ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Collegamento al gateway…</p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {warning ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {warning}
          </p>
        ) : null}
        {whepUrl ? (
          <div className="mt-4">
            <CameraStreamPlayer whepUrl={whepUrl} label={label} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
