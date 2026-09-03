"use client";

import { useEffect, useState } from "react";
import { FaPlus, FaVideo } from "react-icons/fa6";
import { getCameraPanelAction } from "@/app/actions/produzione-camere";
import { LiveCameraModal } from "@/components/produzione/LiveCameraModal";
import { RegistraCameraWizard } from "@/components/produzione/RegistraCameraWizard";
import type { CameraPublic, CameraTargetKind } from "@/lib/produzione/camera";

type Props = {
  targetKind: CameraTargetKind;
  areaCodice: string;
  postoCodice?: string | null;
  compact?: boolean;
  className?: string;
};

export function WorkcenterCameraBar({
  targetKind,
  areaCodice,
  postoCodice,
  compact = false,
  className = "",
}: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [camera, setCamera] = useState<CameraPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [live, setLive] = useState(false);

  function load() {
    void getCameraPanelAction({ targetKind, areaCodice, postoCodice }).then(
      (res) => {
        if (!res.success) {
          setError(res.error);
          setIsAdmin(Boolean(res.isAdmin));
          return;
        }
        setError(null);
        setIsAdmin(res.isAdmin);
        setCamera(res.camera);
      }
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKind, areaCodice, postoCodice]);

  if (!isAdmin) {
    return null;
  }

  if (!camera) {
    return error ? (
      <p className="px-6 pt-2 text-xs text-red-700">{error}</p>
    ) : null;
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] ${
        compact ? "px-3 py-2" : "px-4 py-3"
      } ${className}`}
    >
      <div>
        <p className="text-sm font-medium">
          Telecamera {camera.hasCamera ? camera.label : labelFallback(targetKind)}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {camera.hasCamera
            ? `ieGeek · ${camera.cameraIp} · ${camera.cameraRtspPath}`
            : "Nessuna ieGeek registrata su questo centro."}
        </p>
        {error ? (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {camera.hasCamera ? (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
          >
            <FaVideo size={14} />
            Guarda Live Postazione
          </button>
        ) : null}
        <button
          type="button"
          title="Aggiungi o modifica telecamera (solo admin)"
          onClick={() => setWizard(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--primary)] hover:bg-slate-50"
        >
          <FaPlus size={14} />
          <span className="sr-only">Aggiungi telecamera</span>
        </button>
      </div>

      {wizard ? (
        <RegistraCameraWizard
          targetKind={targetKind}
          targetId={camera.targetId}
          label={camera.label}
          initial={camera}
          onClose={() => setWizard(false)}
          onSaved={(next) => {
            setCamera(next);
            setWizard(false);
          }}
        />
      ) : null}
      {live ? (
        <LiveCameraModal
          targetKind={targetKind}
          areaCodice={areaCodice}
          postoCodice={postoCodice}
          onClose={() => setLive(false)}
        />
      ) : null}
    </div>
  );
}

function labelFallback(kind: CameraTargetKind) {
  return kind === "area" ? "area" : "postazione";
}
