"use client";

import { useEffect, useState, useTransition } from "react";
import {
  FaBolt,
  FaClock,
  FaDiagramProject,
  FaFlag,
  FaClipboardList,
} from "react-icons/fa6";
import {
  listActionEssiccatoreSensoriAction,
  moveActionEssiccatoreSensoreAction,
  renameActionEssiccatoreSensoreAction,
} from "@/app/actions/action-essiccatore-sensori";
import { ActionEssiccatoreAzioniImmediateModal } from "@/components/action/ActionEssiccatoreAzioniImmediateModal";
import {
  ActionEssiccatoreProcessiModal,
  ActionEssiccatoreProgrammateModal,
} from "@/components/action/ActionEssiccatoreFamiglieModals";
import { ActionSequenzeModal } from "@/components/action/ActionSequenzeModal";
import { useIotMexComms } from "@/components/action/IotMexCommsProvider";
import { ActionEssiccatoreSensorFlags } from "@/components/action/ActionEssiccatoreSensorFlags";
import { PdfFirstPageImage } from "@/components/action/PdfFirstPageImage";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  ACTION_ESSICCATORI,
  CARICO_TIPO_LABELS,
  formatCapacitaKg,
  type ActionEssiccatore,
} from "@/lib/action/essiccatori";
import { createSessioneAvvioComms } from "@/lib/action/iot-mex-comms";
import type { ActionEssiccatoreSensore } from "@/lib/action/sensori";

const familyBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50";

function EssiccatoreCommandIcons({
  nome,
  onImmediate,
  onProgrammate,
  onRegistrate,
  onProcessi,
}: {
  nome: string;
  onImmediate: () => void;
  onProgrammate: () => void;
  onRegistrate: () => void;
  onProcessi: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5 px-3 py-2">
      <button
        type="button"
        className={familyBtn}
        aria-label={`Azioni immediate su ${nome}`}
        onClick={onImmediate}
      >
        <FaBolt size={12} />
        Azioni immediate
      </button>
      <button
        type="button"
        className={familyBtn}
        aria-label={`Azioni programmate su ${nome}`}
        onClick={onProgrammate}
      >
        <FaClock size={12} />
        Azioni programmate
      </button>
      <button
        type="button"
        className={familyBtn}
        aria-label={`Sequenze su ${nome}`}
        onClick={onRegistrate}
      >
        <FaClipboardList size={12} />
        Sequenze
      </button>
      <button
        type="button"
        className={familyBtn}
        aria-label={`Processi su ${nome}`}
        onClick={onProcessi}
      >
        <FaDiagramProject size={12} />
        Processi
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
  onImmediate,
  onProgrammate,
  onRegistrate,
  onProcessi,
}: {
  item: ActionEssiccatore;
  sensors: ActionEssiccatoreSensore[];
  setting: boolean;
  onMove: (id: string, xPct: number, yPct: number) => void;
  onCommit: (id: string, xPct: number, yPct: number) => void;
  onRename: (id: string, nome: string) => void;
  onImmediate: () => void;
  onProgrammate: () => void;
  onRegistrate: () => void;
  onProcessi: () => void;
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
        <EssiccatoreCommandIcons
          nome={item.nome}
          onImmediate={onImmediate}
          onProgrammate={onProgrammate}
          onRegistrate={onRegistrate}
          onProcessi={onProcessi}
        />
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
  const [immediateFor, setImmediateFor] = useState<ActionEssiccatore | null>(
    null
  );
  const [familyFor, setFamilyFor] = useState<{
    item: ActionEssiccatore;
    kind: "programmate" | "registrate" | "processi";
  } | null>(null);
  const { avviaSessione } = useIotMexComms();

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
            onImmediate={() => setImmediateFor(item)}
            onProgrammate={() =>
              setFamilyFor({ item, kind: "programmate" })
            }
            onRegistrate={() => setFamilyFor({ item, kind: "registrate" })}
            onProcessi={() => setFamilyFor({ item, kind: "processi" })}
          />
        ))}
      </div>
      {immediateFor ? (
        <ActionEssiccatoreAzioniImmediateModal
          essiccatore={immediateFor}
          onClose={() => setImmediateFor(null)}
          onAvvioRegistrato={(azione) => {
            const nome = immediateFor.nome;
            setImmediateFor(null);
            avviaSessione(createSessioneAvvioComms(azione, nome));
          }}
        />
      ) : null}
      {familyFor?.kind === "registrate" ? (
        <ActionSequenzeModal
          essiccatore={familyFor.item}
          onClose={() => setFamilyFor(null)}
        />
      ) : null}
      {familyFor?.kind === "programmate" ? (
        <ActionEssiccatoreProgrammateModal
          essiccatore={familyFor.item}
          onClose={() => setFamilyFor(null)}
        />
      ) : null}
      {familyFor?.kind === "processi" ? (
        <ActionEssiccatoreProcessiModal
          essiccatore={familyFor.item}
          onClose={() => setFamilyFor(null)}
        />
      ) : null}
    </div>
  );
}
