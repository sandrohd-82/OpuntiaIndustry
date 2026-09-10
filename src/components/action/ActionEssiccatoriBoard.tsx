"use client";

import { useEffect, useState, useTransition } from "react";
import { FaBolt, FaClock, FaDiagramProject, FaFlag, FaPlus } from "react-icons/fa6";
import {
  createActionEssiccatoreSensoreAction,
  listActionEssiccatoreSensoriAction,
  moveActionEssiccatoreSensoreAction,
  renameActionEssiccatoreSensoreAction,
  softDeleteActionEssiccatoreSensoreAction,
} from "@/app/actions/action-essiccatore-sensori";
import { ActionEssiccatoreSensorFlags } from "@/components/action/ActionEssiccatoreSensorFlags";
import { PdfFirstPageImage } from "@/components/action/PdfFirstPageImage";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  ACTION_ESSICCATORI,
  CARICO_TIPO_LABELS,
  formatCapacitaKg,
  type ActionEssiccatore,
} from "@/lib/action/essiccatori";
import type { ActionEssiccatoreSensore } from "@/lib/action/sensori";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900";

function EssiccatoreCommandIcons({ nome }: { nome: string }) {
  return (
    <div className="flex justify-end gap-1 px-3 py-2">
      <button
        type="button"
        className={iconBtn}
        title="Azione — comando immediato"
        aria-label={`Azione immediata su ${nome}`}
      >
        <FaBolt size={16} />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Programma — esegui fra X oppure alle ore X"
        aria-label={`Programma su ${nome}`}
      >
        <FaClock size={16} />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Processo — serie di azioni in sequenza, in parallelo o su evento"
        aria-label={`Processo su ${nome}`}
      >
        <FaDiagramProject size={16} />
      </button>
    </div>
  );
}

function EssiccatoreBox({
  item,
  sensors,
  setting,
  onAdd,
  onMove,
  onCommit,
  onRename,
  onDelete,
}: {
  item: ActionEssiccatore;
  sensors: ActionEssiccatoreSensore[];
  setting: boolean;
  onAdd: (essiccatoreId: string) => void;
  onMove: (id: string, xPct: number, yPct: number) => void;
  onCommit: (id: string, xPct: number, yPct: number) => void;
  onRename: (id: string, nome: string) => void;
  onDelete: (sensor: ActionEssiccatoreSensore) => void;
}) {
  return (
    <article className="flex flex-col overflow-visible rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="relative aspect-[16/10] overflow-hidden rounded-t-xl bg-slate-50">
        <PdfFirstPageImage
          src={item.imageSrc}
          alt={item.nome}
          className="h-full w-full object-contain"
        />
        <ActionEssiccatoreSensorFlags
          sensors={sensors}
          setting={setting}
          onMove={onMove}
          onCommit={onCommit}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {setting ? (
          <button
            type="button"
            onClick={() => onAdd(item.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <FaPlus size={10} />
            Bandiera
          </button>
        ) : (
          <span />
        )}
        <EssiccatoreCommandIcons nome={item.nome} />
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          {item.codice}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{item.nome}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Capacità max</dt>
            <dd className="font-medium tabular-nums">
              {formatCapacitaKg(item.capacitaMaxKg)}{" "}
              <span className="font-normal text-[var(--muted)]">
                ({CARICO_TIPO_LABELS[item.caricoTipo]})
              </span>
            </dd>
          </div>
          {item.note ? (
            <div>
              <dt className="text-[var(--muted)]">Carico</dt>
              <dd>{item.note}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 text-xs text-[var(--muted)]">Installato in azienda</p>
      </div>
    </article>
  );
}

type Props = {
  canPosition?: boolean;
};

export function ActionEssiccatoriBoard({ canPosition = false }: Props) {
  const [setting, setSetting] = useState(false);
  const [sensors, setSensors] = useState<ActionEssiccatoreSensore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<ActionEssiccatoreSensore | null>(
    null
  );

  useEffect(() => {
    void listActionEssiccatoreSensoriAction().then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSensors(res.items);
    });
  }, []);

  function patchLocal(id: string, xPct: number, yPct: number) {
    setSensors((prev) =>
      prev.map((s) => (s.id === id ? { ...s, xPct, yPct } : s))
    );
  }

  function commitMove(id: string, xPct: number, yPct: number) {
    patchLocal(id, xPct, yPct);
    startTransition(async () => {
      const res = await moveActionEssiccatoreSensoreAction({ id, xPct, yPct });
      if (!res.success) setError(res.error);
      else {
        setSensors((prev) => prev.map((s) => (s.id === id ? res.item : s)));
        setError(null);
      }
    });
  }

  function addFlag(essiccatoreId: string) {
    startTransition(async () => {
      const res = await createActionEssiccatoreSensoreAction({
        essiccatoreId,
        nome: "Nuovo sensore",
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSensors((prev) => [...prev, res.item]);
      setError(null);
    });
  }

  function rename(id: string, nome: string) {
    startTransition(async () => {
      const res = await renameActionEssiccatoreSensoreAction({ id, nome });
      if (!res.success) setError(res.error);
      else {
        setSensors((prev) => prev.map((s) => (s.id === id ? res.item : s)));
        setError(null);
      }
    });
  }

  return (
    <div>
      {canPosition ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            {setting
              ? "Setting attivo: trascina le bandiere sul disegno. Doppio clic per rinominare."
              : "Attiva il setting per posizionare le bandiere dei sensori."}
          </p>
          <button
            type="button"
            onClick={() => setSetting((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              setting
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            <FaFlag size={12} />
            {setting ? "Chiudi setting" : "Posiziona sensori"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div
        className={`grid gap-5 md:grid-cols-2 xl:grid-cols-3 ${
          pending ? "opacity-90" : ""
        }`}
      >
        {ACTION_ESSICCATORI.map((item) => (
          <EssiccatoreBox
            key={item.id}
            item={item}
            sensors={sensors.filter((s) => s.essiccatoreId === item.id)}
            setting={setting && canPosition}
            onAdd={addFlag}
            onMove={patchLocal}
            onCommit={commitMove}
            onRename={rename}
            onDelete={setDeleting}
          />
        ))}
      </div>
      {deleting ? (
        <SoftDeleteConfirmModal
          entityLabel={`bandiera ${deleting.nome}`}
          confirmCode={deleting.codice}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const res = await softDeleteActionEssiccatoreSensoreAction({
              id: deleting.id,
              confermaTestuale,
            });
            if (!res.success) throw new Error(res.error);
            setSensors((prev) => prev.filter((s) => s.id !== deleting.id));
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
