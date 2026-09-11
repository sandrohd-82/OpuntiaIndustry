"use client";

import { useEffect, useState, useTransition } from "react";
import { FaBolt, FaClock, FaDiagramProject, FaFlag } from "react-icons/fa6";
import {
  listActionEssiccatoreSensoriAction,
  moveActionEssiccatoreSensoreAction,
  renameActionEssiccatoreSensoreAction,
} from "@/app/actions/action-essiccatore-sensori";
import { ActionEssiccatoreSensorFlags } from "@/components/action/ActionEssiccatoreSensorFlags";
import { PdfFirstPageImage } from "@/components/action/PdfFirstPageImage";
import { InfoHint } from "@/components/ui/InfoHint";
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
  onMove,
  onCommit,
  onRename,
}: {
  item: ActionEssiccatore;
  sensors: ActionEssiccatoreSensore[];
  setting: boolean;
  onMove: (id: string, xPct: number, yPct: number) => void;
  onCommit: (id: string, xPct: number, yPct: number) => void;
  onRename: (id: string, nome: string) => void;
}) {
  return (
    <article className="relative flex flex-col overflow-visible rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="absolute right-3 top-3 z-10">
        <InfoHint
          title={item.nome}
          wide
          buttonClassName="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sky-700 shadow-sm ring-1 ring-slate-200 hover:bg-sky-50"
        >
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-slate-500">Targa</dt>
              <dd className="font-mono font-medium">{item.codice}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Capacità max</dt>
              <dd className="font-medium tabular-nums">
                {formatCapacitaKg(item.capacitaMaxKg)}{" "}
                <span className="font-normal text-slate-500">
                  ({CARICO_TIPO_LABELS[item.caricoTipo]})
                </span>
              </dd>
            </div>
            {item.note ? (
              <div>
                <dt className="text-xs text-slate-500">Carico</dt>
                <dd>{item.note}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-slate-500">Stato</dt>
              <dd>Installato in azienda</dd>
            </div>
          </dl>
        </InfoHint>
      </div>
      <header className="px-5 pb-2 pt-4 pr-12">
        <h2 className="text-lg font-semibold leading-tight">{item.nome}</h2>
      </header>
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-50">
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
        />
      </div>
      <div className="flex items-center justify-end px-3 py-2">
        <EssiccatoreCommandIcons nome={item.nome} />
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
              ? "Setting attivo: trascina i badge sul disegno. Il nome appare al passaggio del mouse."
              : "Attiva il setting per posizionare i badge dei sensori."}
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
            onMove={patchLocal}
            onCommit={commitMove}
            onRename={rename}
          />
        ))}
      </div>
    </div>
  );
}
