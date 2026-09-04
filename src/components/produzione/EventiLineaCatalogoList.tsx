"use client";

import { useEffect, useId, useState } from "react";
import {
  createEventoLineaCatalogoAction,
  listEventiLineaCatalogoAction,
  updateEventoLineaCatalogoSettingsAction,
} from "@/app/actions/produzione-macchinari";
import {
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
  "Un evento di linea è una procedura ufficiale (pausa, fine turno, ripresa o altre definite dall’amministratore). L’admin indica se l’evento ha una durata oppure è un processo senza tempo, poi sceglie le macchine coinvolte e lo stato On/Off di ciascuna. Il responsabile lo avvia dalla panoramica. Ogni avvio resta tracciato per ISO 9001.";

type Props = {
  areaId: string;
  macchinari: ProduzioneMacchinario[];
};

export function EventiLineaCatalogoList({ areaId, macchinari }: Props) {
  const infoId = useId();
  const [items, setItems] = useState<EventoLineaCatalogo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [nome, setNome] = useState("");
  const [sintesi, setSintesi] = useState("");
  const [haDurata, setHaDurata] = useState(false);
  const [durata, setDurata] = useState("15");

  async function load() {
    const res = await listEventiLineaCatalogoAction(areaId);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    setError(null);
    setItems(res.items);
    setIsAdmin(res.isAdmin);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listEventiLineaCatalogoAction(areaId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error);
          return;
        }
        setError(null);
        setItems(res.items);
        setIsAdmin(res.isAdmin);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Caricamento catalogo fallito.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [areaId]);

  async function handleCreate() {
    if (creating) return;
    const minuti = haDurata ? Math.round(Number(durata)) : 0;
    if (haDurata && (!Number.isFinite(minuti) || minuti < 1)) {
      setError("Indica una durata in minuti maggiore di zero.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await createEventoLineaCatalogoAction({
        nome: nome.trim(),
        sintesi: sintesi.trim(),
        durataMinuti: minuti,
        statoObiettivo: "off",
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNome("");
      setSintesi("");
      setHaDurata(false);
      setDurata("15");
      setFormOpen(false);
      setOpenId(res.item.id);
      setItems((prev) => {
        if (prev.some((x) => x.id === res.item.id)) return prev;
        return [...prev, res.item].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.nome.localeCompare(b.nome)
        );
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveSettings(payload: {
    catalogoId: string;
    areaId: string;
    durataMinuti: number;
    statoObiettivo: EventoStatoObiettivo;
    macchine: EventoLineaMacchinaConfig[];
  }) {
    if (savingSettings) return;
    setSavingSettings(true);
    setError(null);
    try {
      const res = await updateEventoLineaCatalogoSettingsAction(payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio impostazioni non riuscito.");
    } finally {
      setSavingSettings(false);
    }
  }

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
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={haDurata}
              onChange={(e) => {
                const on = e.target.checked;
                setHaDurata(on);
                if (on && (!durata || Number(durata) <= 0)) setDurata("15");
              }}
            />
            Ha una durata
          </label>
          {haDurata ? (
            <label className="block text-xs text-[var(--muted)]">
              Durata (minuti)
              <input
                type="number"
                min={1}
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
                className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Processo senza durata: resta aperto fino alla chiusura.
            </p>
          )}
          <button
            type="button"
            disabled={
              creating ||
              !nome.trim() ||
              !sintesi.trim() ||
              (haDurata && !(Number(durata) > 0))
            }
            onClick={() => void handleCreate()}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              creating
                ? "cursor-wait bg-slate-300 text-slate-600"
                : "bg-[var(--primary)] text-white disabled:opacity-50"
            }`}
          >
            {creating ? "Salvataggio…" : "Salva evento"}
          </button>
        </div>
      ) : null}

      <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-sm text-[var(--muted)]">
            {loading ? "Caricamento catalogo…" : "Nessun evento di linea in catalogo."}
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
                        : "Senza durata"}
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
                    pending={savingSettings}
                    onError={setError}
                    onSave={(payload) => void handleSaveSettings(payload)}
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
  const [haDurata, setHaDurata] = useState(item.durataMinuti > 0);
  const [durata, setDurata] = useState(
    item.durataMinuti > 0 ? String(item.durataMinuti) : "15"
  );
  const [ids, setIds] = useState<Set<string>>(() => new Set(item.macchineIds));
  const [stati, setStati] = useState<Record<string, EventoMacchinaStato>>(() =>
    Object.fromEntries(item.macchine.map((m) => [m.macchinarioId, m.statoObiettivo]))
  );
  const albero = nestMacchinari(macchinari);
  const foglie = foglieMacchinari(macchinari);
  const foglieIds = new Set(foglie.map((m) => m.id));
  const defaultStato: EventoMacchinaStato =
    item.statoObiettivo === "on" ? "on" : "off";
  const minutiCorrenti = haDurata ? Number(durata) : 0;
  const durataValida =
    !haDurata || (Number.isFinite(minutiCorrenti) && minutiCorrenti >= 1);
  const currentKey = [...ids]
    .filter((id) => foglieIds.has(id))
    .sort()
    .map((id) => `${id}:${stati[id] ?? defaultStato}`)
    .join("|");
  const savedKey = item.macchine
    .filter((m) => foglieIds.has(m.macchinarioId))
    .sort((a, b) => a.macchinarioId.localeCompare(b.macchinarioId))
    .map((m) => `${m.macchinarioId}:${m.statoObiettivo}`)
    .join("|");
  const dirty =
    durataValida &&
    (Math.round(minutiCorrenti) !== item.durataMinuti || currentKey !== savedKey);

  useEffect(() => {
    setHaDurata(item.durataMinuti > 0);
    setDurata(item.durataMinuti > 0 ? String(item.durataMinuti) : "15");
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

  function setStatoMany(machineIds: string[], stato: EventoMacchinaStato) {
    if (!isAdmin) return;
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of machineIds) next.add(id);
      return next;
    });
    setStati((s) => {
      const next = { ...s };
      for (const id of machineIds) next[id] = stato;
      return next;
    });
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-slate-50 px-3 py-3">
      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={haDurata}
          disabled={!isAdmin}
          onChange={(e) => {
            const on = e.target.checked;
            setHaDurata(on);
            if (on && (!durata || Number(durata) <= 0)) setDurata("15");
          }}
        />
        Ha una durata
      </label>
      {haDurata ? (
        <label className="block text-xs text-[var(--muted)]">
          Durata (minuti)
          <input
            type="number"
            min={1}
            value={durata}
            disabled={!isAdmin}
            onChange={(e) => setDurata(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
        </label>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Processo senza durata: resta aperto fino alla chiusura.
        </p>
      )}

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
                onStatoMany={setStatoMany}
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
          disabled={pending || !dirty}
          onClick={() => {
            const minuti = haDurata ? Math.round(Number(durata)) : 0;
            if (haDurata && (!Number.isFinite(minuti) || minuti < 1)) {
              onError("Indica una durata in minuti maggiore di zero.");
              return;
            }
            onSave({
              catalogoId: item.id,
              areaId,
              durataMinuti: Math.round(minuti),
              statoObiettivo: defaultStato,
              macchine: [...ids]
                .filter((id) => foglieIds.has(id))
                .map((id) => ({
                  macchinarioId: id,
                  statoObiettivo: stati[id] ?? defaultStato,
                })),
            });
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            dirty && !pending
              ? "bg-[var(--primary)] text-white"
              : "cursor-not-allowed bg-slate-300 text-slate-600"
          }`}
        >
          {pending ? "Salvataggio…" : "Salva impostazioni"}
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
  onStatoMany,
  nested = false,
}: {
  macchina: ProduzioneMacchinario;
  ids: Set<string>;
  stati: Record<string, EventoMacchinaStato>;
  isAdmin: boolean;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], selected: boolean) => void;
  onStato: (id: string, stato: EventoMacchinaStato) => void;
  onStatoMany: (ids: string[], stato: EventoMacchinaStato) => void;
  nested?: boolean;
}) {
  const figli = macchina.figli ?? [];
  const foglie = isInsieme(macchina)
    ? foglieMacchinari(figli)
    : [macchina];
  const allOn = foglie.length > 0 && foglie.every((f) => ids.has(f.id));
  const someOn = foglie.some((f) => ids.has(f.id));
  const coinvolta = isInsieme(macchina)
    ? foglie.length > 0 && foglie.every((f) => ids.has(f.id))
    : ids.has(macchina.id);
  const richiesto = isInsieme(macchina)
    ? foglie.length > 0 && foglie.every((f) => (stati[f.id] ?? "off") === "on")
      ? "on"
      : "off"
    : (stati[macchina.id] ?? "off");

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
        {isInsieme(macchina) || coinvolta ? (
          <button
            type="button"
            disabled={!isAdmin}
            title="Stato in cui la macchina deve trovarsi per questo evento"
            onClick={() => {
              const next = richiesto === "on" ? "off" : "on";
              if (isInsieme(macchina)) onStatoMany(foglie.map((f) => f.id), next);
              else onStato(macchina.id, next);
            }}
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
              onStatoMany={onStatoMany}
              nested
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
