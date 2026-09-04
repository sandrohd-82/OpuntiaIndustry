"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  getEventoLineaApertoAction,
  setMacchinarioParentAction,
} from "@/app/actions/produzione-macchinari";
import { EventiLineaCatalogoList } from "@/components/produzione/EventiLineaCatalogoList";
import { EventoLineaModal } from "@/components/produzione/EventoLineaModal";
import { FoglioBilancioPanel } from "@/components/produzione/FoglioBilancioPanel";
import { IotStatusDot } from "@/components/produzione/IotStatusDot";
import { MachinePowerToggle } from "@/components/produzione/MachinePowerToggle";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import { useFogliLavorazione } from "@/hooks/useFogliLavorazione";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  applyMacchinaPatch,
  eventoLineaLabel,
  isInsieme,
  nestMacchinari,
  type EventoLinea,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  areaCodice: string;
};

export function GestioneAreaBoard({ areaCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evento, setEvento] = useState<EventoLinea | null>(null);
  const [eventoOpen, setEventoOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [organizza, setOrganizza] = useState(false);
  const { fogliAperti, ready } = useFogliLavorazione();

  function patchMacchina(item: ProduzioneMacchinario) {
    setArea((prev) =>
      prev
        ? { ...prev, macchinari: applyMacchinaPatch(prev.macchinari ?? [], item) }
        : prev
    );
    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
  }

  function loadArea() {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setIsAdmin(res.isAdmin);
      const found = res.items.find((a) => a.codice === areaCodice) ?? null;
      setArea(found);
      if (found) {
        const ev = await getEventoLineaApertoAction(found.id);
        if (ev.success && ev.evento) {
          setEvento(ev.evento);
          setEventoOpen(true);
        } else {
          setEvento(null);
        }
      }
    });
  }

  useEffect(() => {
    loadArea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodice]);

  if (pending && !area && !error) {
    return <p className="text-sm text-[var(--muted)]">Caricamento area…</p>;
  }
  if (!area) {
    return (
      <p className="text-sm text-red-700">
        {error ?? "Area non trovata. Verifica il catalogo aree."}
      </p>
    );
  }

  const allarmi = (area.macchinari ?? []).filter((m) => m.statoIot === "arresto");
  const base = `/app/produzione/gestione-aree/${area.codice}`;

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <WorkcenterCameraBar targetKind="area" areaCodice={area.codice} />

      <p className="text-sm text-[var(--muted)]">
        {area.descrizione} Questa panoramica riassume stato impianti, postazioni
        e videosorveglianza.
        {area.richiedeBilancioMassa
          ? " Quest’area richiede il bilancio di massa sul foglio giornaliero."
          : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`${base}/macchinari`}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-slate-50"
        >
          <p className="text-xs uppercase text-[var(--muted)]">Macchinari</p>
          <p className="mt-1 text-2xl font-semibold">
            {(area.macchinari ?? []).length}
          </p>
          {allarmi.length ? (
            <p className="mt-1 text-xs text-red-700">
              {allarmi.length} in arresto
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">Nessun allarme IoT</p>
          )}
        </Link>
        <Link
          href={`${base}/postazioni`}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-slate-50"
        >
          <p className="text-xs uppercase text-[var(--muted)]">Postazioni</p>
          <p className="mt-1 text-2xl font-semibold">{area.posti.length}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Posti lavoro attivi</p>
        </Link>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Fogli aperti</p>
          <p className="mt-1 text-2xl font-semibold">
            {ready ? fogliAperti.length : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">Lavorazione in corso</p>
        </div>
      </div>

      {(area.macchinari ?? []).length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Stato impianti</h3>
            <div className="flex flex-wrap gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setOrganizza((v) => !v)}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  {organizza ? "Chiudi organizzazione" : "Organizza impianti"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEventoOpen(true)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                {evento ? "Riprendi evento di linea" : "Avvia evento di linea"}
              </button>
            </div>
          </div>
          {organizza ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Sposta un macchinario a primo livello oppure sotto un insieme
              (come nella vasca di lavaggio). Lo spostamento vale solo in
              quest’area.
            </p>
          ) : null}
          {evento ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Evento in corso: {evento.tipoNome || eventoLineaLabel(evento.tipo)}.
              Spegnere le macchine richieste per chiuderlo.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {nestMacchinari(area.macchinari ?? []).map((m) => (
              <MacchinaStatoNodo
                key={m.id}
                macchina={m}
                base={base}
                roots={nestMacchinari(area.macchinari ?? [])}
                organizza={organizza}
                onError={setError}
                onChanged={patchMacchina}
                onMoved={() => {
                  window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                  loadArea();
                }}
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <button
            type="button"
            onClick={() => setEventoOpen(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Avvia evento di linea
          </button>
        </div>
      )}

      <EventiLineaCatalogoList
        areaId={area.id}
        macchinari={area.macchinari ?? []}
      />

      {eventoOpen ? (
        <EventoLineaModal
          areaId={area.id}
          areaNome={area.nome}
          onMacchinaChanged={patchMacchina}
          onClose={() => {
            setEventoOpen(false);
            start(async () => {
              const ev = await getEventoLineaApertoAction(area.id);
              setEvento(ev.success ? ev.evento : null);
            });
          }}
        />
      ) : null}

      {area.richiedeBilancioMassa && ready ? (
        fogliAperti.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nessun foglio aperto. Crea un foglio di lavorazione per registrare
            i kg versati / essiccatori / non conformi.
          </p>
        ) : (
          <div className="space-y-3">
            {fogliAperti.map((f) => (
              <FoglioBilancioPanel
                key={f.id}
                foglioId={f.id}
                foglioLabel={f.label}
                areaId={area.id}
                areaNome={area.nome}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function MacchinaStatoNodo({
  macchina,
  base,
  roots,
  organizza,
  nested = false,
  onError,
  onChanged,
  onMoved,
}: {
  macchina: ProduzioneMacchinario;
  base: string;
  roots: ProduzioneMacchinario[];
  organizza: boolean;
  nested?: boolean;
  onError: (message: string) => void;
  onChanged: (item: ProduzioneMacchinario) => void;
  onMoved: () => void;
}) {
  const figli = macchina.figli ?? [];
  const bloccoSotto =
    isInsieme(macchina) || figli.length > 0 || macchina.codice === "vasca-lavaggio";
  return (
    <li className={nested ? "border-l border-[var(--border)] pl-3" : ""}>
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <Link
            href={`${base}/macchinari/${macchina.codice}`}
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            {macchina.nome}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <IotStatusDot stato={macchina.statoIot} size="sm" />
            {isInsieme(macchina) ? (
              <span className="text-[10px] uppercase text-[var(--muted)]">
                Insieme
              </span>
            ) : null}
          </div>
          {organizza ? (
            <label className="mt-2 block text-[11px] text-[var(--muted)]">
              Posizione
              <select
                value={macchina.parentId ?? ""}
                disabled={bloccoSotto && !macchina.parentId}
                onChange={async (e) => {
                  const next = e.target.value || null;
                  const res = await setMacchinarioParentAction({
                    macchinarioId: macchina.id,
                    parentId: next,
                  });
                  if (!res.success) {
                    onError(res.error);
                    return;
                  }
                  onMoved();
                }}
                className="mt-0.5 block w-56 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs"
              >
                <option value="">Macchinario solo (primo livello)</option>
                {roots
                  .filter((r) => r.id !== macchina.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Sotto {r.nome}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </div>
        <MachinePowerToggle
          macchina={macchina}
          origine={isInsieme(macchina) ? "insieme" : "panoramica"}
          size="sm"
          onError={onError}
          onChanged={onChanged}
        />
      </div>
      {figli.length ? (
        <ul className="mb-1 ml-2 divide-y divide-[var(--border)]">
          {figli.map((f) => (
            <MacchinaStatoNodo
              key={f.id}
              macchina={f}
              base={base}
              roots={roots}
              organizza={organizza}
              nested
              onError={onError}
              onChanged={onChanged}
              onMoved={onMoved}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
