"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { getEventoLineaApertoAction } from "@/app/actions/produzione-macchinari";
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
  eventoLineaLabel,
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
  const { fogliAperti, ready } = useFogliLavorazione();

  function patchMacchina(item: ProduzioneMacchinario) {
    setArea((prev) =>
      prev
        ? {
            ...prev,
            macchinari: (prev.macchinari ?? []).map((m) =>
              m.id === item.id ? item : m
            ),
          }
        : prev
    );
    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
  }

  useEffect(() => {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
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
            <button
              type="button"
              onClick={() => setEventoOpen(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              {evento ? "Riprendi evento di linea" : "Avvia evento di linea"}
            </button>
          </div>
          {evento ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Evento in corso: {evento.tipoNome || eventoLineaLabel(evento.tipo)}.
              Spegnere le macchine richieste per chiuderlo.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {(area.macchinari ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`${base}/macchinari/${m.codice}`}
                    className="text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    {m.nome}
                  </Link>
                  <div className="mt-0.5">
                    <IotStatusDot stato={m.statoIot} size="sm" />
                  </div>
                </div>
                <MachinePowerToggle
                  macchina={m}
                  origine="panoramica"
                  size="sm"
                  onError={setError}
                  onChanged={patchMacchina}
                />
              </li>
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

      <EventiLineaCatalogoList />

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
