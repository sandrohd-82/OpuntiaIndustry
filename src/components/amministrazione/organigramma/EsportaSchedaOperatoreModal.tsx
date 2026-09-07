"use client";

import { useEffect, useId, useState } from "react";
import { FaFilePdf } from "react-icons/fa6";
import { preparePersonaSchedaExportAction } from "@/app/actions/organigramma";
import { downloadPersonaSchedaPdf } from "@/lib/amministrazione/organigramma-scheda-pdf";
import {
  defaultPersonaSchedaExport,
  personaLabel,
  type OrganigrammaPersona,
  type PersonaSchedaExportSelection,
} from "@/lib/amministrazione/organigramma";

type Props = {
  persona: OrganigrammaPersona;
  onClose: () => void;
};

export function EsportaSchedaOperatoreModal({ persona, onClose }: Props) {
  const titleId = useId();
  const [sel, setSel] = useState<Omit<PersonaSchedaExportSelection, "personaId">>(
    { ...defaultPersonaSchedaExport }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  function toggle(key: keyof typeof sel, value: boolean) {
    setSel((s) => ({ ...s, [key]: value }));
  }

  function applyElenchi() {
    setSel({
      ...defaultPersonaSchedaExport,
      identitaFile: false,
      certificatiFile: false,
      contrattiFile: false,
      busteFile: false,
    });
  }

  function applyElenchiEFile() {
    setSel({
      ...defaultPersonaSchedaExport,
      identitaFile: true,
      certificatiFile: true,
      contrattiFile: true,
      busteFile: true,
    });
  }

  async function conferma() {
    setBusy(true);
    setError(null);
    const res = await preparePersonaSchedaExportAction({
      personaId: persona.id,
      ...sel,
    });
    if (!res.success) {
      setBusy(false);
      setError(res.error);
      return;
    }
    try {
      await downloadPersonaSchedaPdf(res.payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generazione PDF fallita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-red-50 p-2 text-red-600">
            <FaFilePdf size={18} aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Esporta scheda PDF
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {personaLabel(persona)}. Scegli le sezioni. Per i documenti puoi
              stampare l’elenco, i file, o entrambi (i file vanno in coda alla
              scheda).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            onClick={applyElenchi}
          >
            Solo elenchi
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            onClick={applyElenchiEFile}
          >
            Elenchi e file
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sel.anagrafica}
              onChange={(e) => toggle("anagrafica", e.target.checked)}
            />
            Anagrafica
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sel.foto}
              onChange={(e) => toggle("foto", e.target.checked)}
            />
            Foto tessera
          </label>

          <DocDual
            title="Documenti di identità"
            elenco={sel.identitaElenco}
            file={sel.identitaFile}
            onElenco={(v) => toggle("identitaElenco", v)}
            onFile={(v) => toggle("identitaFile", v)}
          />
          <DocDual
            title="Corsi e certificati"
            elenco={sel.certificatiElenco}
            file={sel.certificatiFile}
            onElenco={(v) => toggle("certificatiElenco", v)}
            onFile={(v) => toggle("certificatiFile", v)}
          />
          <DocDual
            title="Contratti"
            elenco={sel.contrattiElenco}
            file={sel.contrattiFile}
            onElenco={(v) => toggle("contrattiElenco", v)}
            onFile={(v) => toggle("contrattiFile", v)}
          />
          <DocDual
            title="Buste paga"
            elenco={sel.busteElenco}
            file={sel.busteFile}
            onElenco={(v) => toggle("busteElenco", v)}
            onFile={(v) => toggle("busteFile", v)}
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sel.autorizzazioni}
              onChange={(e) => toggle("autorizzazioni", e.target.checked)}
            />
            Autorizzazioni postazione
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sel.permessi}
              onChange={(e) => toggle("permessi", e.target.checked)}
            />
            Permessi / assenze
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void conferma()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Preparazione PDF…" : "Esporta PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocDual({
  title,
  elenco,
  file,
  onElenco,
  onFile,
}: {
  title: string;
  elenco: boolean;
  file: boolean;
  onElenco: (v: boolean) => void;
  onFile: (v: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={elenco}
            onChange={(e) => onElenco(e.target.checked)}
          />
          Elenco
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={file}
            onChange={(e) => onFile(e.target.checked)}
          />
          File (in coda alla scheda)
        </label>
      </div>
    </div>
  );
}
