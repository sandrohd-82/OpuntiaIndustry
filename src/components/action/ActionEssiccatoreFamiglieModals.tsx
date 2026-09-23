"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  annullaAzioneProgrammataAction,
  createAzioneProgrammataAction,
  createAzioneRegistrataAction,
  createProcessoAction,
  eseguiAzioneProgrammataAction,
  listAzioniProgrammateAction,
  listAzioniRegistrateAction,
  listProcessiAction,
  softDeleteAzioneRegistrataAction,
  softDeleteProcessoAction,
} from "@/app/actions/action-essiccatore-catalogo";
import {
  TEMP_BRUCIATORE_DEFAULT_C,
  TEMP_BRUCIATORE_MAX_C,
  TEMP_BRUCIATORE_MIN_C,
} from "@/lib/action/azioni-immediate";
import {
  formatEseguiAt,
  PROGRAMMATA_STATO_LABEL,
  type AzioneProgrammata,
  type AzioneRegistrata,
  type ProcessoAzione,
} from "@/lib/action/azioni-catalogo";
import type { ActionEssiccatore } from "@/lib/action/essiccatori";

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <p className="text-sm text-[var(--muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActionEssiccatoreRegistrateModal({
  essiccatore,
  onClose,
}: {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AzioneRegistrata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("Avvio");
  const [temp, setTemp] = useState(TEMP_BRUCIATORE_DEFAULT_C);
  const [vent, setVent] = useState(70);

  function reload() {
    void listAzioniRegistrateAction({ essiccatoreId: essiccatore.id }).then(
      (res) => {
        if (!res.success) setError(res.error);
        else {
          setItems(res.items);
          setError(null);
        }
      }
    );
  }

  useEffect(() => {
    reload();
  }, [essiccatore.id]);

  return (
    <Shell
      title="Azioni registrate"
      subtitle={`${essiccatore.nome} · catalogo riutilizzabile`}
      onClose={onClose}
    >
      <p className="text-xs text-[var(--muted)]">
        Un’azione registrata è un Avvio salvato (temperatura e ventilazione).
        Programmate e processi usano solo queste.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <form
        className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createAzioneRegistrataAction({
              essiccatoreId: essiccatore.id,
              nome,
              tempBruciatoreC: temp,
              percVentilazione: vent,
            });
            if (!res.success) {
              setError(res.error);
              return;
            }
            setNome("Avvio");
            reload();
          });
        }}
      >
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            Temperatura ({TEMP_BRUCIATORE_MIN_C}–{TEMP_BRUCIATORE_MAX_C} °C)
          </span>
          <input
            type="number"
            min={TEMP_BRUCIATORE_MIN_C}
            max={TEMP_BRUCIATORE_MAX_C}
            value={temp}
            onChange={(e) => setTemp(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Ventilazione %</span>
          <input
            type="number"
            min={0}
            max={100}
            value={vent}
            onChange={(e) => setVent(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Registra azione
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Nessuna azione registrata.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{item.nome}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Avvio · {item.tempBruciatoreC}°C · ventola {item.percVentilazione}% · v
                  {item.versione} · {item.documentoStato}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await softDeleteAzioneRegistrataAction({
                      id: item.id,
                    });
                    if (!res.success) setError(res.error);
                    else reload();
                  })
                }
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Archivia
              </button>
            </li>
          ))
        )}
      </ul>
    </Shell>
  );
}

export function ActionEssiccatoreProgrammateModal({
  essiccatore,
  onClose,
  onEseguita,
}: {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
  onEseguita?: () => void;
}) {
  const [regs, setRegs] = useState<AzioneRegistrata[]>([]);
  const [items, setItems] = useState<AzioneProgrammata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [registrataId, setRegistrataId] = useState("");
  const [eseguiAt, setEseguiAt] = useState(toLocalInput());

  function reload() {
    void Promise.all([
      listAzioniRegistrateAction({ essiccatoreId: essiccatore.id }),
      listAzioniProgrammateAction({ essiccatoreId: essiccatore.id }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        setRegs(a.items);
        if (!registrataId && a.items[0]) setRegistrataId(a.items[0].id);
      }
      if (!b.success) setError(b.error);
      else setItems(b.items);
    });
  }

  useEffect(() => {
    reload();
  }, [essiccatore.id]);

  return (
    <Shell
      title="Azioni programmate"
      subtitle={`${essiccatore.nome} · esegui una registrata a data/ora`}
      onClose={onClose}
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {regs.length === 0 ? (
        <p className="text-sm text-amber-800">
          Prima registra un’azione in «Azioni registrate».
        </p>
      ) : (
        <form
          className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createAzioneProgrammataAction({
                essiccatoreId: essiccatore.id,
                registrataId,
                eseguiAt,
              });
              if (!res.success) {
                setError(res.error);
                return;
              }
              reload();
            });
          }}
        >
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Azione registrata</span>
            <select
              value={registrataId}
              onChange={(e) => setRegistrataId(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              {regs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} · {r.tempBruciatoreC}°C · {r.percVentilazione}%
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Esegui il</span>
            <input
              type="datetime-local"
              value={eseguiAt}
              onChange={(e) => setEseguiAt(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Programma
            </button>
          </div>
        </form>
      )}
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Nessuna programmazione.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{item.registrataNome}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {formatEseguiAt(item.eseguiAt)} ·{" "}
                  {PROGRAMMATA_STATO_LABEL[item.stato]}
                </span>
              </span>
              {item.stato === "programmata" ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await eseguiAzioneProgrammataAction({
                          id: item.id,
                        });
                        if (!res.success) setError(res.error);
                        else {
                          reload();
                          onEseguita?.();
                        }
                      })
                    }
                    className="text-xs font-medium text-sky-800 hover:underline"
                  >
                    Esegui ora
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await annullaAzioneProgrammataAction({
                          id: item.id,
                        });
                        if (!res.success) setError(res.error);
                        else reload();
                      })
                    }
                    className="text-xs font-medium text-red-700 hover:underline"
                  >
                    Annulla
                  </button>
                </span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </Shell>
  );
}

export function ActionEssiccatoreProcessiModal({
  essiccatore,
  onClose,
}: {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
}) {
  const [regs, setRegs] = useState<AzioneRegistrata[]>([]);
  const [items, setItems] = useState<ProcessoAzione[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [passi, setPassi] = useState<string[]>(["", ""]);

  function reload() {
    void Promise.all([
      listAzioniRegistrateAction({ essiccatoreId: essiccatore.id }),
      listProcessiAction({ essiccatoreId: essiccatore.id }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        setRegs(a.items);
        setPassi((prev) =>
          prev.map((id, i) => id || a.items[i]?.id || a.items[0]?.id || "")
        );
      }
      if (!b.success) setError(b.error);
      else setItems(b.items);
    });
  }

  useEffect(() => {
    reload();
  }, [essiccatore.id]);

  return (
    <Shell
      title="Processi"
      subtitle={`${essiccatore.nome} · insieme di azioni registrate`}
      onClose={onClose}
    >
      <p className="text-xs text-[var(--muted)]">
        Un processo è una sequenza di almeno due azioni registrate.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {regs.length < 2 ? (
        <p className="text-sm text-amber-800">
          Servono almeno due azioni registrate per creare un processo.
        </p>
      ) : (
        <form
          className="space-y-3 rounded-lg border border-[var(--border)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createProcessoAction({
                essiccatoreId: essiccatore.id,
                nome,
                registrataIds: passi.filter(Boolean),
              });
              if (!res.success) {
                setError(res.error);
                return;
              }
              setNome("");
              reload();
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome processo</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          {passi.map((id, i) => (
            <label key={i} className="block text-sm">
              <span className="mb-1 block font-medium">Passo {i + 1}</span>
              <select
                value={id}
                onChange={(e) =>
                  setPassi((prev) =>
                    prev.map((x, j) => (j === i ? e.target.value : x))
                  )
                }
                required
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
              >
                {regs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome} · {r.tempBruciatoreC}°C · {r.percVentilazione}%
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setPassi((prev) => [...prev, regs[0]?.id ?? ""])
              }
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              Aggiungi passo
            </button>
            {passi.length > 2 ? (
              <button
                type="button"
                onClick={() => setPassi((prev) => prev.slice(0, -1))}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                Rimuovi ultimo
              </button>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Salva processo
            </button>
          </div>
        </form>
      )}
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Nessun processo.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{item.nome}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {item.passi
                    .map((p, i) => `${i + 1}. ${p.registrataNome}`)
                    .join(" → ")}{" "}
                  · v{item.versione}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await softDeleteProcessoAction({ id: item.id });
                    if (!res.success) setError(res.error);
                    else reload();
                  })
                }
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Archivia
              </button>
            </li>
          ))
        )}
      </ul>
    </Shell>
  );
}
