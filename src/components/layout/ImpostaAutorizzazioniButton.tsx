"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActionAccessAction } from "@/app/actions/page-access";
import {
  ACTION_ACCESS_CATALOG,
  groupActionCatalog,
  toneForAction,
} from "@/lib/auth/action-access";
import type { AccessTone, PageAccessMap } from "@/lib/auth/page-access";

type Props = {
  actionAccess: PageAccessMap;
};

function LightOnOff({
  tone,
  pending,
  onSet,
}: {
  tone: AccessTone;
  pending: boolean;
  onSet: (next: boolean) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold">
      <button
        type="button"
        disabled={pending}
        onClick={() => onSet(true)}
        className={`px-2.5 py-1 ${
          tone === "on"
            ? "bg-emerald-500 text-white"
            : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
        } disabled:opacity-50`}
      >
        On
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => onSet(false)}
        className={`px-2.5 py-1 ${
          tone === "off"
            ? "bg-red-500 text-white"
            : "text-slate-500 hover:bg-red-50 hover:text-red-700"
        } disabled:opacity-50`}
      >
        Off
      </button>
    </div>
  );
}

export function ImpostaAutorizzazioniButton({ actionAccess }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<PageAccessMap>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const map = useMemo(
    () => ({ ...actionAccess, ...local }),
    [actionAccess, local]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTION_ACCESS_CATALOG;
    return ACTION_ACCESS_CATALOG.filter(
      (row) =>
        row.path.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.area.toLowerCase().includes(q)
    );
  }, [query]);

  const groups = useMemo(() => groupActionCatalog(filtered), [filtered]);

  function setVisibile(actionKey: string, visibile: boolean) {
    setError(null);
    setPendingKey(actionKey);
    startTransition(async () => {
      const res = await setActionAccessAction(actionKey, visibile);
      setPendingKey(null);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setLocal((prev) => ({ ...prev, [actionKey]: visibile }));
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Imposta autorizzazioni
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="autorizzazioni-title"
            className="flex max-h-[min(88vh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2
                  id="autorizzazioni-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Imposta autorizzazioni
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Azioni di creazione sulle pagine. Off le nasconde in operativo.
                  Poi mi dirai se togliere qualche voce.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Chiudi
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 py-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca percorso o azione…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {error ? (
                <p className="mt-2 text-xs text-red-600">{error}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {groups.length === 0 ? (
                <p className="text-sm text-slate-500">Nessuna azione trovata.</p>
              ) : (
                groups.map((group) => (
                  <section key={group.area} className="mb-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                      {group.area}
                    </h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {group.items.map((row) => {
                        const tone = toneForAction(map, row.key);
                        return (
                          <li
                            key={row.key}
                            className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[11px] text-slate-500">
                                {row.path}
                              </p>
                              <p className="text-sm font-medium text-slate-800">
                                {row.label}
                              </p>
                            </div>
                            {tone === "unset" ? (
                              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                Non impostata
                              </span>
                            ) : null}
                            <LightOnOff
                              tone={tone}
                              pending={pending && pendingKey === row.key}
                              onSet={(next) => setVisibile(row.key, next)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
