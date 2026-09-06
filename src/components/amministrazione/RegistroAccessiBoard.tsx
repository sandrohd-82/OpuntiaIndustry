"use client";

import { useEffect, useMemo, useState } from "react";
import { listRegistroAccessiAction } from "@/app/actions/registro-accessi";
import {
  REGISTRO_ACCESSI_EVENTI,
  defaultDateFrom,
  esitoAccessoLabel,
  eventoAccessoLabel,
  formatAccessoDataOra,
  metodo2faLabel,
  type RegistroAccesso,
  type RegistroAccessoEsito,
  type RegistroAccessoEvento,
} from "@/lib/amministrazione/registro-accessi";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

type Props = {
  vista: "timeline" | "elenco";
};

export function RegistroAccessiBoard({ vista }: Props) {
  const [items, setItems] = useState<RegistroAccesso[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState("");
  const [email, setEmail] = useState("");
  const [evento, setEvento] = useState<"" | RegistroAccessoEvento>("");
  const [esito, setEsito] = useState<"" | RegistroAccessoEsito>("");

  async function load(offset = 0, append = false) {
    setBusy(true);
    const res = await listRegistroAccessiAction({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      email: email.trim() || undefined,
      evento: evento || undefined,
      esito: esito || undefined,
      offset,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      if (!append) setItems([]);
      return;
    }
    setError(null);
    setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    setHasMore(res.hasMore);
  }

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, RegistroAccesso[]>();
    for (const row of items) {
      const key = formatAccessoDataOra(row.occurredAt).data;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Accessi al gestionale: email, data, ora ed esito. Il registro è
        immutabile. Periodo predefinito: ultimi 30 giorni.
      </p>

      <form
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0, false);
        }}
      >
        <label className="text-xs font-medium text-slate-600">
          Dal
          <input
            type="date"
            className={inputCls}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Al
          <input
            type="date"
            className={inputCls}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Email
          <input
            type="search"
            className={inputCls}
            placeholder="cerca@…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Evento
          <select
            className={inputCls}
            value={evento}
            onChange={(e) =>
              setEvento(e.target.value as "" | RegistroAccessoEvento)
            }
          >
            <option value="">Tutti</option>
            {REGISTRO_ACCESSI_EVENTI.map((ev) => (
              <option key={ev} value={ev}>
                {eventoAccessoLabel(ev)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Esito
          <select
            className={inputCls}
            value={esito}
            onChange={(e) =>
              setEsito(e.target.value as "" | RegistroAccessoEsito)
            }
          >
            <option value="">Tutti</option>
            <option value="successo">OK</option>
            <option value="fallito">Fallito</option>
          </select>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-6">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Caricamento…" : "Applica filtri"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {items.length === 0 && !error ? (
        <p className="text-sm text-[var(--muted)]">
          Nessun accesso nel periodo selezionato.
        </p>
      ) : vista === "timeline" ? (
        <ol className="space-y-6">
          {grouped.map(([giorno, rows]) => (
            <li key={giorno}>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                {giorno}
              </h3>
              <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
                {rows.map((row) => (
                  <li key={row.id} className="relative">
                    <span
                      className={`absolute -left-[1.65rem] top-1.5 h-3 w-3 rounded-full border-2 bg-white ${dotClass(row)}`}
                    />
                    <p className="text-sm font-semibold text-slate-900">
                      {formatAccessoDataOra(row.occurredAt).ora} ·{" "}
                      {eventoAccessoLabel(row.evento)}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(row.esito)}`}
                      >
                        {esitoAccessoLabel(row.esito)}
                      </span>
                    </p>
                    <p className="text-sm text-slate-800">
                      {row.email}
                      {row.nome ? (
                        <span className="text-[var(--muted)]"> · {row.nome}</span>
                      ) : null}
                    </p>
                    <p
                      className="text-xs text-[var(--muted)]"
                      title={row.userAgent ?? undefined}
                    >
                      {metodo2faLabel(row.metodo2fa)}
                      {row.ip ? ` · IP ${row.ip}` : ""}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Ora</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Evento</th>
                <th className="px-3 py-2 font-medium">Esito</th>
                <th className="px-3 py-2 font-medium">2FA</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const { data, ora } = formatAccessoDataOra(row.occurredAt);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2">{data}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {ora}
                    </td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {row.nome || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {eventoAccessoLabel(row.evento)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(row.esito)}`}
                      >
                        {esitoAccessoLabel(row.esito)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {metodo2faLabel(row.metodo2fa)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {row.ip || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          onClick={() => void load(items.length, true)}
        >
          Carica altri
        </button>
      ) : null}
    </div>
  );
}

function badgeClass(esito: RegistroAccessoEsito): string {
  return esito === "successo"
    ? "bg-emerald-50 text-emerald-800"
    : "bg-red-50 text-red-800";
}

function dotClass(row: RegistroAccesso): string {
  if (row.esito === "fallito") return "border-red-500";
  if (row.evento === "logout") return "border-slate-400";
  return "border-emerald-500";
}
