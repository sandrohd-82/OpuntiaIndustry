"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  closeEventoLineaAction,
  getEventoLineaApertoAction,
  listEventiLineaCatalogoAction,
  startEventoLineaAction,
} from "@/app/actions/produzione-macchinari";
import { MachinePowerToggle } from "@/components/produzione/MachinePowerToggle";
import {
  eventoStatoObiettivoLabel,
  macchinaIsOn,
  type EventoLinea,
  type EventoLineaCatalogo,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  areaId: string;
  areaNome: string;
  onClose: () => void;
  onMacchinaChanged?: (item: ProduzioneMacchinario) => void;
};

export function EventoLineaModal({
  areaId,
  areaNome,
  onClose,
  onMacchinaChanged,
}: Props) {
  const titleId = useId();
  const [pending, start] = useTransition();
  const [evento, setEvento] = useState<EventoLinea | null>(null);
  const [catalogo, setCatalogo] = useState<EventoLineaCatalogo[]>([]);
  const [catalogoId, setCatalogoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    start(async () => {
      const res = await getEventoLineaApertoAction(areaId);
      if (!res.success) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setError(null);
      setEvento((prev) => {
        if (prev && !res.evento) queueMicrotask(onClose);
        return res.evento;
      });
      setLoaded(true);
    });
  }

  useEffect(() => {
    start(async () => {
      const res = await listEventiLineaCatalogoAction(areaId);
      if (res.success) {
        setCatalogo(res.items);
        setCatalogoId((prev) => prev || res.items[0]?.id || "");
      }
    });
    refresh();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const pendingOff =
    evento?.macchine.filter((m) => m.richiesto && !m.confermatoAt) ?? [];
  const canClose = Boolean(evento) && pendingOff.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Evento di linea
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {areaNome}. Il responsabile avvia la pausa; ogni macchina richiesta
              va in Off (manuale o comando IoT).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] hover:underline"
          >
            Chiudi
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {!loaded ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Caricamento…</p>
        ) : !evento ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs text-[var(--muted)]">
              Tipo evento
              <select
                value={catalogoId}
                onChange={(e) => setCatalogoId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              >
                {catalogo.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.durataMinuti > 0 ? ` · ${t.durataMinuti} min` : ""}
                    {` · ${eventoStatoObiettivoLabel(t.statoObiettivo)}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending || !catalogoId}
              onClick={() =>
                start(async () => {
                  const res = await startEventoLineaAction({
                    areaId,
                    catalogoId,
                  });
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setError(null);
                  setEvento(res.evento);
                })
              }
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Avvia evento
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              In corso: <strong>{evento.tipoNome || evento.tipo}</strong>
              {evento.startedByNome ? ` · ${evento.startedByNome}` : ""}
              {" · "}
              {new Date(evento.startedAt).toLocaleString("it-IT")}
              {evento.durataMinuti > 0 ? ` · ${evento.durataMinuti} min` : ""}
              {" · "}
              {eventoStatoObiettivoLabel(evento.statoObiettivo)}
            </p>
            {evento.macchine.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {evento.statoObiettivo === "nessuno"
                  ? "Nessuna variazione richiesta sulle macchine. Puoi chiudere l’evento."
                  : "Nessuna macchina configurata per quest’area. Puoi chiudere l’evento."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {evento.macchine.map((m) => {
                  const atTarget =
                    evento.statoObiettivo === "on"
                      ? macchinaIsOn(m.statoIot)
                      : !macchinaIsOn(m.statoIot);
                  const done = Boolean(m.confermatoAt) || atTarget;
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.nome}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {m.iotCollegato
                            ? "IoT collegato — comando da inviare"
                            : "Dichiarazione operatore"}
                          {done
                            ? ` · ${eventoStatoObiettivoLabel(evento.statoObiettivo)} confermato`
                            : ` · richiesto ${eventoStatoObiettivoLabel(evento.statoObiettivo)}`}
                        </p>
                      </div>
                      <MachinePowerToggle
                        macchina={{
                          id: m.macchinarioId,
                          areaId: evento.areaId,
                          codice: m.codice,
                          nome: m.nome,
                          descrizione: "",
                          iotCollegato: m.iotCollegato,
                          statoIot: m.statoIot,
                          statoNote: "",
                          statoAt: null,
                          attivo: true,
                          sortOrder: 0,
                          note: "",
                        }}
                        origine="evento_linea"
                        eventoLineaId={evento.id}
                        forceOff={evento.statoObiettivo === "off"}
                        forceOn={evento.statoObiettivo === "on"}
                        size="sm"
                        onError={setError}
                        onChanged={(item) => {
                          onMacchinaChanged?.(item);
                          refresh();
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              disabled={pending || !canClose}
              onClick={() =>
                start(async () => {
                  const res = await closeEventoLineaAction(evento.id);
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setEvento(null);
                  onClose();
                })
              }
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Chiudi evento
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
