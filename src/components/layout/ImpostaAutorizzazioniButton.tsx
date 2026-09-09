"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActionAccessAction } from "@/app/actions/page-access";
import {
  lockLockedAreaAction,
  setCommercialistaAction,
  setDataScopeAction,
  unlockLockedAreaAction,
} from "@/app/actions/data-scope";
import {
  ACTION_ACCESS_CATALOG,
  groupActionCatalog,
  toneForAction,
} from "@/lib/auth/action-access";
import {
  FISCALE_VIEW_SCOPES,
  SENSITIVE_SCOPE_GROUPS,
  type DataScopeMap,
  type DataScopeMode,
  type ProfileAuthSettings,
} from "@/lib/auth/data-scope";
import type { AccessTone, PageAccessMap } from "@/lib/auth/page-access";

type Props = {
  actionAccess: PageAccessMap;
  dataScopes: DataScopeMap;
  authSettings: ProfileAuthSettings;
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

function ScopeRadios({
  name,
  modes,
  value,
  pending,
  required,
  onChange,
}: {
  name: string;
  modes: ReadonlyArray<{ value: DataScopeMode; label: string }>;
  value: DataScopeMode | undefined;
  pending: boolean;
  required?: boolean;
  onChange: (mode: DataScopeMode) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {required && !value ? (
        <p className="text-xs font-semibold text-red-600">
          Obbligatoria — scegli un’opzione
        </p>
      ) : null}
      {modes.map((mode) => {
        const selected = value === mode.value;
        return (
          <label
            key={mode.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-2.5 text-sm ${
              selected
                ? "border-amber-500 bg-amber-50"
                : "border-slate-200 bg-white hover:border-amber-300"
            }`}
          >
            <input
              type="radio"
              name={name}
              className="mt-0.5 h-4 w-4 accent-amber-600"
              checked={selected}
              disabled={pending}
              onChange={() => onChange(mode.value)}
            />
            <span className="font-semibold text-slate-900">{mode.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function ImpostaAutorizzazioniButton({
  actionAccess,
  dataScopes,
  authSettings,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ambiti" | "azioni">("ambiti");
  const [localActions, setLocalActions] = useState<PageAccessMap>({});
  const [localScopes, setLocalScopes] = useState<DataScopeMap>({});
  const [localSettings, setLocalSettings] =
    useState<ProfileAuthSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [fiscaleUnlockStep, setFiscaleUnlockStep] = useState<0 | 1 | 2 | 3>(0);
  const [rsUnlockStep, setRsUnlockStep] = useState<0 | 1 | 2>(0);
  const [showFiscaleTable, setShowFiscaleTable] = useState(false);
  const [pending, startTransition] = useTransition();

  const settings = localSettings ?? authSettings;
  const scopes = useMemo(
    () => ({ ...dataScopes, ...localScopes }),
    [dataScopes, localScopes]
  );
  const actionMap = useMemo(
    () => ({ ...actionAccess, ...localActions }),
    [actionAccess, localActions]
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
  const missingMandatory = SENSITIVE_SCOPE_GROUPS.filter(
    (g) => g.required && !scopes[g.key]
  );

  function run(
    key: string,
    fn: () => Promise<{ success: true } | { success: false; error: string }>,
    onOk?: () => void
  ) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const res = await fn();
      setPendingKey(null);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function setVisibile(actionKey: string, visibile: boolean) {
    run(`action:${actionKey}`, () => setActionAccessAction(actionKey, visibile), () => {
      setLocalActions((prev) => ({ ...prev, [actionKey]: visibile }));
    });
  }

  function setScope(scopeKey: string, mode: DataScopeMode) {
    run(`scope:${scopeKey}`, () => setDataScopeAction(scopeKey, mode), () => {
      setLocalScopes((prev) => ({ ...prev, [scopeKey]: mode }));
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
            className="flex max-h-[min(90vh,56rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
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
                  Ambiti sui dati sensibili, aree blindate e azioni di creazione.
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
            <div className="flex gap-2 border-b border-slate-100 px-4 py-2">
              <button
                type="button"
                onClick={() => setTab("ambiti")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tab === "ambiti"
                    ? "bg-amber-100 text-amber-900"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                Ambiti dati e aree riservate
              </button>
              <button
                type="button"
                onClick={() => setTab("azioni")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  tab === "azioni"
                    ? "bg-slate-800 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                Azioni di creazione
              </button>
            </div>
            {error ? (
              <p className="px-4 pt-2 text-xs text-red-600">{error}</p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {tab === "ambiti" ? (
                <div className="space-y-4">
                  {missingMandatory.length > 0 ? (
                    <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <strong>Scelte obbligatorie mancanti:</strong>{" "}
                      {missingMandatory.map((g) => g.title).join(" · ")}
                    </div>
                  ) : null}

                  {SENSITIVE_SCOPE_GROUPS.map((group) => (
                    <section
                      key={group.key}
                      className="rounded-xl border-2 border-amber-300 bg-amber-50/60 p-4"
                    >
                      <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">
                        {group.title}
                      </h3>
                      <p className="mt-1 text-xs text-amber-800">{group.hint}</p>
                      <ScopeRadios
                        name={`scope-${group.key}`}
                        modes={group.modes}
                        value={scopes[group.key]}
                        required={group.required}
                        pending={pending && pendingKey === `scope:${group.key}`}
                        onChange={(mode) => setScope(group.key, mode)}
                      />
                    </section>
                  ))}

                  <section className="rounded-xl border-2 border-slate-800 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                      Ricerca e sviluppo — blindata
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Non accessibile a nessuno finché non la sblocchi con doppia
                      conferma.
                    </p>
                    {settings.rsUnlocked ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Sbloccata
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run("lock-rs", () => lockLockedAreaAction("rs"), () => {
                              setLocalSettings({
                                ...settings,
                                rsUnlocked: false,
                              });
                              setRsUnlockStep(0);
                            })
                          }
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          Blocca di nuovo
                        </button>
                      </div>
                    ) : rsUnlockStep === 0 ? (
                      <button
                        type="button"
                        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() => setRsUnlockStep(1)}
                      >
                        Sblocca area
                      </button>
                    ) : rsUnlockStep === 1 ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-slate-700">
                          Confermi di sbloccare Ricerca e sviluppo per questo
                          profilo?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            onClick={() => setRsUnlockStep(0)}
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => setRsUnlockStep(2)}
                          >
                            Confermo (1/2)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-slate-700">
                          Conferma definitiva: l’operazione viene registrata in
                          audit.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            onClick={() => setRsUnlockStep(0)}
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() =>
                              run(
                                "unlock-rs",
                                () =>
                                  unlockLockedAreaAction({
                                    area: "rs",
                                    confirm1: true,
                                    confirm2: true,
                                  }),
                                () => {
                                  setLocalSettings({
                                    ...settings,
                                    rsUnlocked: true,
                                  });
                                  setRsUnlockStep(0);
                                }
                              )
                            }
                          >
                            Conferma definitiva
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border-2 border-slate-800 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                      Area fiscale — blindata
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Non accessibile a nessuno finché non la sblocchi con doppia
                      conferma.
                    </p>
                    {settings.fiscaleUnlocked ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Sbloccata
                          </span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">
                            {settings.isCommercialista
                              ? "Profilo commercialista"
                              : "Non commercialista"}
                          </span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(
                                "lock-fiscale",
                                () => lockLockedAreaAction("fiscale"),
                                () => {
                                  setLocalSettings({
                                    ...settings,
                                    fiscaleUnlocked: false,
                                    isCommercialista: false,
                                  });
                                  setShowFiscaleTable(false);
                                  setFiscaleUnlockStep(0);
                                }
                              )
                            }
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                          >
                            Blocca di nuovo
                          </button>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold text-slate-700">
                            Il profilo è un commercialista?
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(
                                  "comm-yes",
                                  () => setCommercialistaAction(true),
                                  () =>
                                    setLocalSettings({
                                      ...settings,
                                      isCommercialista: true,
                                    })
                                )
                              }
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                settings.isCommercialista
                                  ? "bg-emerald-600 text-white"
                                  : "border border-slate-300 text-slate-700"
                              }`}
                            >
                              Sì
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(
                                  "comm-no",
                                  () => setCommercialistaAction(false),
                                  () => {
                                    setLocalSettings({
                                      ...settings,
                                      isCommercialista: false,
                                    });
                                    setShowFiscaleTable(true);
                                  }
                                )
                              }
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                !settings.isCommercialista
                                  ? "bg-slate-800 text-white"
                                  : "border border-slate-300 text-slate-700"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>
                        {settings.isCommercialista ? (
                          <p className="text-sm text-slate-600">
                            Area fiscale aperta, tranne <strong>Disponi bonifico</strong>{" "}
                            e <strong>Pagamenti dipendenti</strong>.
                          </p>
                        ) : (
                          <div>
                            <button
                              type="button"
                              onClick={() => setShowFiscaleTable((v) => !v)}
                              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                            >
                              Gestisci autorizzazioni
                            </button>
                            {showFiscaleTable ? (
                              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-left text-sm">
                                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2">Visualizzazione</th>
                                      <th className="px-3 py-2">Ambito</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {FISCALE_VIEW_SCOPES.map((row) => (
                                      <tr
                                        key={row.key}
                                        className="border-t border-slate-100 align-top"
                                      >
                                        <td className="px-3 py-3 font-medium text-slate-800">
                                          {row.label}
                                        </td>
                                        <td className="px-3 py-3">
                                          <ScopeRadios
                                            name={`fisc-${row.key}`}
                                            modes={row.modes}
                                            value={scopes[row.key]}
                                            pending={
                                              pending &&
                                              pendingKey === `scope:${row.key}`
                                            }
                                            onChange={(mode) =>
                                              setScope(row.key, mode)
                                            }
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : fiscaleUnlockStep === 0 ? (
                      <button
                        type="button"
                        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() => setFiscaleUnlockStep(1)}
                      >
                        Sblocca area
                      </button>
                    ) : fiscaleUnlockStep === 1 ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-slate-700">
                          Confermi di sbloccare l’Area fiscale per questo profilo?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            onClick={() => setFiscaleUnlockStep(0)}
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => setFiscaleUnlockStep(2)}
                          >
                            Confermo (1/2)
                          </button>
                        </div>
                      </div>
                    ) : fiscaleUnlockStep === 2 ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-slate-700">
                          Conferma definitiva: il profilo potrà accedere a dati
                          fiscali. L’operazione viene registrata in audit.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            onClick={() => setFiscaleUnlockStep(0)}
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => setFiscaleUnlockStep(3)}
                          >
                            Conferma definitiva
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-slate-700">
                          Il profilo è un <strong>commercialista</strong>?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() =>
                              run(
                                "unlock-fisc-yes",
                                () =>
                                  unlockLockedAreaAction({
                                    area: "fiscale",
                                    confirm1: true,
                                    confirm2: true,
                                    isCommercialista: true,
                                  }),
                                () => {
                                  setLocalSettings({
                                    ...settings,
                                    fiscaleUnlocked: true,
                                    isCommercialista: true,
                                  });
                                  setFiscaleUnlockStep(0);
                                }
                              )
                            }
                          >
                            Sì, è commercialista
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50"
                            onClick={() =>
                              run(
                                "unlock-fisc-no",
                                () =>
                                  unlockLockedAreaAction({
                                    area: "fiscale",
                                    confirm1: true,
                                    confirm2: true,
                                    isCommercialista: false,
                                  }),
                                () => {
                                  setLocalSettings({
                                    ...settings,
                                    fiscaleUnlocked: true,
                                    isCommercialista: false,
                                  });
                                  setShowFiscaleTable(true);
                                  setFiscaleUnlockStep(0);
                                }
                              )
                            }
                          >
                            No, gestisci autorizzazioni
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cerca percorso o azione…"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
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
                            const tone = toneForAction(actionMap, row.key);
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
                                  pending={
                                    pending && pendingKey === `action:${row.key}`
                                  }
                                  onSet={(next) => setVisibile(row.key, next)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
