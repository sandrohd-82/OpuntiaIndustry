"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  createEventoLineaCatalogoAction,
  listEventiLineaCatalogoAction,
  updateEventoLineaCatalogoSettingsAction,
} from "@/app/actions/produzione-macchinari";
import {
  EVENTO_STATI_OBIETTIVO,
  eventoStatoObiettivoLabel,
  foglieMacchinari,
  isInsieme,
  nestMacchinari,
  type EventoLineaCatalogo,
  type EventoLineaMacchinaConfig,
  type EventoMacchinaStato,
  type EventoStatoObiettivo,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

const INFO_TESTO =
  "Un evento di linea è una procedura ufficiale (pausa, fine turno, ripresa o altre definite dall’amministratore). L’admin imposta durata, macchine coinvolte in quest’area e lo stato richiesto (es. Passaggio in Off). Il responsabile lo avvia dalla panoramica: le macchine spuntate devono raggiungere quello stato. Ogni avvio resta tracciato per ISO 9001.";

type Props = {
  areaId: string;
  macchinari: ProduzioneMacchinario[];
};

export function EventiLineaCatalogoList({ areaId, macchinari }: Props) {
  const infoId = useId();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<EventoLineaCatalogo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [sintesi, setSintesi] = useState("");
  const [durata, setDurata] = useState("15");
  const [stato, setStato] = useState<EventoStatoObiettivo>("off");

  function load() {
    start(async () => {
      const res = await listEventiLineaCatalogoAction(areaId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
      setIsAdmin(res.isAdmin);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  useEffect(() => {
    if (!infoOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setInfoOpen(false);
    }
    function onDoc(e: MouseEvent) {
      const root = document.getElementById(infoId);
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setInfoOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [infoOpen, infoId]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Eventi di linea</h3>
          <div id={infoId} className="relative">
            <button
              type="button"
              aria-label="Che cosa sono gli eventi di linea"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((v) => !v)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              i
            </button>
            {infoOpen ? (
              <div
                role="tooltip"
                className="absolute left-0 top-7 z-20 w-80 max-w-[min(20rem,calc(100vw-3rem))] rounded-lg border border-[var(--border)] bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg"
              >
                {INFO_TESTO}
              </div>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            {formOpen ? "Annulla" : "Aggiungi evento"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isAdmin && formOpen ? (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-slate-50 p-3">
          <p className="text-xs text-[var(--muted)]">
            Nuovo evento ufficiale. Poi apri la riga per scegliere le macchine di
            quest’area.
          </p>
          <label className="block text-xs text-[var(--muted)]">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Riga riassuntiva
            <input
              value={sintesi}
              onChange={(e) => setSintesi(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-[var(--muted)]">
              Durata (minuti)
              <input
                type="number"
                min={0}
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Stato richiesto
              <select
                value={stato}
                onChange={(e) => setStato(e.target.value as EventoStatoObiettivo)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              >
                {EVENTO_STATI_OBIETTIVO.map((s) => (
                  <option key={s} value={s}>
                    {eventoStatoObiettivoLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={pending || !nome.trim() || !sintesi.trim()}
            onClick={() =>
              start(async () => {
                const res = await createEventoLineaCatalogoAction({
                  nome: nome.trim(),
                  sintesi: sintesi.trim(),
                  durataMinuti: Number(durata) || 0,
                  statoObiettivo: stato,
                });
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                setNome("");
                setSintesi("");
                setDurata("15");
                setStato("off");
                setFormOpen(false);
                setOpenId(res.item.id);
                load();
              })
            }
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva evento
          </button>
        </div>
      ) : null}

      <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-sm text-[var(--muted)]">
            {pending ? "Caricamento catalogo…" : "Nessun evento di linea in catalogo."}
          </li>
        ) : (
          items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.nome}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {item.sintesi}
                      {" · "}
                      {item.durataMinuti > 0
                        ? `${item.durataMinuti} min`
                        : "Durata non impostata"}
                      {" · "}
                      {item.macchineIds.length
                        ? `${item.macchineIds.length} macchine coinvolte`
                        : "Nessuna macchina coinvolta"}
                    </span>
                  </span>
                  <span className="mt-0.5 shrink-0 text-xs text-[var(--muted)]">
                    {open ? "▲" : "▼"}
                  </span>
                </button>
                {open ? (
                  <EventoCatalogoSettings
                    item={item}
                    areaId={areaId}
                    macchinari={macchinari}
                    isAdmin={isAdmin}
                    pending={pending}
                    onError={setError}
                    onSave={(payload) =>
                      start(async () => {
                        const res =
                          await updateEventoLineaCatalogoSettingsAction(payload);
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        load();
                      })
                    }
                  />
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function EventoCatalogoSettings({
  item,
  areaId,
  macchinari,
  isAdmin,
  pending,
  onError,
  onSave,
}: {
  item: EventoLineaCatalogo;
  areaId: string;
  macchinari: ProduzioneMacchinario[];
  isAdmin: boolean;
  pending: boolean;
  onError: (message: string) => void;
  onSave: (payload: {
    catalogoId: string;
    areaId: string;
    durataMinuti: number;
    statoObiettivo: EventoStatoObiettivo;
    macchine: EventoLineaMacchinaConfig[];
  }) => void;
}) {
  const [durata, setDurata] = useState(String(item.durataMinuti));
  const [ids, setIds] = useState<Set<string>>(() => new Set(item.macchineIds));
  const [stati, setStati] = useState<Record<string, EventoMacchinaStato>>(() =>
    Object.fromEntries(item.macchine.map((m) => [m.macchinarioId, m.statoObiettivo]))
  );
  const albero = nestMacchinari(macchinari);
  const foglie = foglieMacchinari(macchinari);
  const defaultStato: EventoMacchinaStato =
    item.statoObiettivo === "on" ? "on" : "off";

  useEffect(() => {
    setDurata(String(item.durataMinuti));
    setIds(new Set(item.macchineIds));
    setStati(
      Object.fromEntries(item.macchine.map((m) => [m.macchinarioId, m.statoObiettivo]))
    );
  }, [item.id, item.durataMinuti, item.macchine, item.macchineIds]);

  function toggle(id: string) {
    if (!isAdmin) return;
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        setStati((s) => ({ ...s, [id]: s[id] ?? defaultStato }));
      }
      return next;
    });
  }

  function toggleMany(machineIds: string[], selected: boolean) {
    if (!isAdmin) return;
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of machineIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    if (selected) {
      setStati((s) => {
        const next = { ...s };
        for (const id of machineIds) next[id] = next[id] ?? defaultStato;
        return next;
      });
    }
  }

  function setStatoMacchina(id: string, stato: EventoMacchinaStato) {
    if (!isAdmin) return;
    setStati((s) => ({ ...s, [id]: stato }));
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-slate-50 px-3 py-3">
      <label className="block text-xs text-[var(--muted)]">
        Durata (minuti)
        <input
          type="number"
          min={0}
          value={durata}
          disabled={!isAdmin}
          onChange={(e) => setDurata(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-700">
            Macchine coinvolte
            <span className="ml-1 font-normal text-[var(--muted)]">
              (check = partecipa; pulsante = stato richiesto)
            </span>
          </p>
          {isAdmin && foglie.length > 0 ? (
            <button
              type="button"
              className="text-xs text-[var(--primary)] hover:underline"
              onClick={() => {
                const all = foglie.every((m) => ids.has(m.id));
                toggleMany(
                  foglie.map((m) => m.id),
                  !all
                );
              }}
            >
              {foglie.every((m) => ids.has(m.id))
                ? "Deseleziona tutte"
                : "Seleziona tutte"}
            </button>
          ) : null}
        </div>
        {albero.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Nessun macchinario in quest’area.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {albero.map((m) => (
              <MacchinaCheckNodo
                key={m.id}
                macchina={m}
                ids={ids}
                stati={stati}
                isAdmin={isAdmin}
                onToggle={toggle}
                onToggleMany={toggleMany}
                onStato={setStatoMacchina}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Versione {item.versione} · {item.documentoStato}
        {!isAdmin
          ? " · Solo l’amministratore può modificare queste impostazioni."
          : ""}
      </p>
      {isAdmin ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const minuti = Number(durata);
            if (!Number.isFinite(minuti) || minuti < 0) {
              onError("Durata non valida.");
              return;
            }
            onSave({
              catalogoId: item.id,
              areaId,
              durataMinuti: Math.round(minuti),
              statoObiettivo: defaultStato,
              macchine: [...ids]
                .filter((id) => foglie.some((m) => m.id === id))
                .map((id) => ({
                  macchinarioId: id,
                  statoObiettivo: stati[id] ?? defaultStato,
                })),
            });
          }}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Salva impostazioni
        </button>
      ) : null}
    </div>
  );
}

function MacchinaCheckNodo({
  macchina,
  ids,
  stati,
  isAdmin,
  onToggle,
  onToggleMany,
  onStato,
  nested = false,
}: {
  macchina: ProduzioneMacchinario;
  ids: Set<string>;
  stati: Record<string, EventoMacchinaStato>;
  isAdmin: boolean;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], selected: boolean) => void;
  onStato: (id: string, stato: EventoMacchinaStato) => void;
  nested?: boolean;
}) {
  const figli = macchina.figli ?? [];
  const foglie = isInsieme(macchina)
    ? foglieMacchinari(figli)
    : [macchina];
  const allOn = foglie.length > 0 && foglie.every((f) => ids.has(f.id));
  const someOn = foglie.some((f) => ids.has(f.id));
  const coinvolta = !isInsieme(macchina) && ids.has(macchina.id);
  const richiesto = stati[macchina.id] ?? "off";

  return (
    <li className={nested ? "ml-4" : ""}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = !allOn && someOn;
            }}
            disabled={!isAdmin}
            onChange={() => {
              if (isInsieme(macchina)) onToggleMany(foglie.map((f) => f.id), !allOn);
              else onToggle(macchina.id);
            }}
          />
          <span>
            {macchina.nome}
            {isInsieme(macchina) ? (
              <span className="ml-1 text-[10px] uppercase text-[var(--muted)]">
                insieme
              </span>
            ) : null}
          </span>
        </label>
        {coinvolta ? (
          <button
            type="button"
            disabled={!isAdmin}
            title="Stato in cui la macchina deve trovarsi per questo evento"
            onClick={() => onStato(macchina.id, richiesto === "on" ? "off" : "on")}
            className={`inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2 text-[10px] font-semibold uppercase disabled:opacity-70 ${
              richiesto === "on"
                ? "bg-emerald-500 text-white"
                : "bg-slate-300 text-slate-700"
            }`}
          >
            {richiesto === "on" ? "On" : "Off"}
          </button>
        ) : null}
      </div>
      {figli.length ? (
        <ul className="mt-1 space-y-1">
          {figli.map((f) => (
            <MacchinaCheckNodo
              key={f.id}
              macchina={f}
              ids={ids}
              stati={stati}
              isAdmin={isAdmin}
              onToggle={onToggle}
              onToggleMany={onToggleMany}
              onStato={onStato}
              nested
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
