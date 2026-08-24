"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  completePromemoriaAction,
  createAttivitaPnAction,
  createNotaPnAction,
  createPromemoriaAction,
  listAttivitaPnAction,
  listNotePnAction,
  listPromemoriaAction,
} from "@/app/actions/promemorie-e-note";
import { listPeerCandidates } from "@/lib/chat/queries";
import {
  EMPTY_NOTA_EXTRAS,
  NotaFormExtras,
  type NotaExtrasValue,
} from "@/components/promemorie-e-note/NotaFormExtras";
import {
  dayKeyFromIso,
  monthKeyFromIso,
  type PnAttivita,
  type PnNota,
  type PnPromemoria,
} from "@/lib/promemorie-e-note/types";
import { createClient } from "@/lib/supabase/client";

type Kind = "promemoria" | "attivita" | "note";
type Mode = "nuova" | "elenco" | "calendario";

type Props = {
  kind: Kind;
  mode: Mode;
  userId: string;
};

function toLocalInputValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const NOTE_COLORS: Record<PnNota["colore"], string> = {
  giallo: "bg-amber-100 border-amber-300",
  verde: "bg-emerald-100 border-emerald-300",
  blu: "bg-sky-100 border-sky-300",
  rosa: "bg-pink-100 border-pink-300",
  grigio: "bg-slate-100 border-slate-300",
};

export function PromemorieENoteBoard({ kind, mode, userId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [promemoria, setPromemoria] = useState<PnPromemoria[]>([]);
  const [attivita, setAttivita] = useState<PnAttivita[]>([]);
  const [note, setNote] = useState<PnNota[]>([]);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [month, setMonth] = useState(() => monthKeyFromIso(new Date().toISOString()));

  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [luogo, setLuogo] = useState("");
  const [dueAt, setDueAt] = useState(toLocalInputValue());
  const [body, setBody] = useState("");
  const [colore, setColore] = useState<PnNota["colore"]>("giallo");
  const [notaExtras, setNotaExtras] =
    useState<NotaExtrasValue>(EMPTY_NOTA_EXTRAS);

  function reload() {
    startTransition(async () => {
      if (kind === "promemoria") {
        const res = await listPromemoriaAction();
        if (!res.success) setError(res.error);
        else {
          setError(null);
          setPromemoria(res.items);
        }
      } else if (kind === "attivita") {
        const res = await listAttivitaPnAction();
        if (!res.success) setError(res.error);
        else {
          setError(null);
          setAttivita(res.items);
        }
      } else {
        const res = await listNotePnAction();
        if (!res.success) setError(res.error);
        else {
          setError(null);
          setNote(res.items);
        }
      }
    });
  }

  useEffect(() => {
    if (mode !== "nuova") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, mode]);

  useEffect(() => {
    if (kind !== "attivita") return;
    const supabase = createClient();
    void listPeerCandidates(supabase, userId).then((p) =>
      setPeers(p.map((x) => ({ id: x.id, name: x.name })))
    );
  }, [kind, userId]);

  function create() {
    setOk(null);
    startTransition(async () => {
      const dueIso = new Date(dueAt).toISOString();
      if (kind === "promemoria") {
        const res = await createPromemoriaAction({
          titolo,
          descrizione,
          dueAt: dueIso,
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setOk("Promemoria creato.");
      } else if (kind === "attivita") {
        const res = await createAttivitaPnAction({
          titolo,
          descrizione,
          luogo,
          dueAt: dueIso,
          peers,
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setOk("Attività creata.");
      } else {
        const res = await createNotaPnAction({
          titolo,
          body,
          colore,
          dueAt: notaExtras.dueAt,
          createPromemoria: notaExtras.createPromemoria,
          createAttivita: notaExtras.createAttivita,
          linkedPromemoriaId: notaExtras.linkedPromemoriaId,
          linkedAttivitaId: notaExtras.linkedAttivitaId,
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setOk("Nota creata.");
        setNotaExtras(EMPTY_NOTA_EXTRAS);
      }
      setError(null);
      setTitolo("");
      setDescrizione("");
      setLuogo("");
      setBody("");
    });
  }

  const calendarItems = useMemo(() => {
    if (kind === "promemoria") {
      return promemoria
        .filter((x) => monthKeyFromIso(x.dueAt) === month)
        .map((x) => ({ id: x.id, title: x.titolo, when: x.dueAt }));
    }
    if (kind === "attivita") {
      return attivita
        .filter((x) => monthKeyFromIso(x.dueAt) === month)
        .map((x) => ({ id: x.id, title: x.titolo, when: x.dueAt }));
    }
    return note
      .filter((x) => x.dueAt && monthKeyFromIso(x.dueAt) === month)
      .map((x) => ({
        id: x.id,
        title: x.titolo || x.body.slice(0, 40),
        when: x.dueAt!,
      }));
  }, [kind, promemoria, attivita, note, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof calendarItems>();
    for (const it of calendarItems) {
      const k = dayKeyFromIso(it.when);
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [calendarItems]);

  if (mode === "nuova") {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {ok}
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <label className="block text-xs font-medium">
            {kind === "note" ? "Titolo (opz.)" : "Titolo"}
          </label>
          <input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value.slice(0, 200))}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            placeholder={
              kind === "promemoria" ? "Es. Chiamare Mario" : "Titolo"
            }
          />
          {kind === "note" ? (
            <>
              <label className="block text-xs font-medium">Testo nota</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <label className="block text-xs font-medium">Colore</label>
              <select
                value={colore}
                onChange={(e) =>
                  setColore(e.target.value as PnNota["colore"])
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="giallo">Giallo</option>
                <option value="verde">Verde</option>
                <option value="blu">Blu</option>
                <option value="rosa">Rosa</option>
                <option value="grigio">Grigio</option>
              </select>
              <NotaFormExtras value={notaExtras} onChange={setNotaExtras} />
            </>
          ) : (
            <>
              <label className="block text-xs font-medium">Descrizione</label>
              <textarea
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                placeholder={
                  kind === "attivita"
                    ? "Dettagli… usa @Nome per collegare utenti"
                    : ""
                }
              />
            </>
          )}
          {kind === "attivita" ? (
            <>
              <label className="block text-xs font-medium">Luogo</label>
              <input
                value={luogo}
                onChange={(e) => setLuogo(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </>
          ) : null}
          {kind !== "note" ? (
            <>
              <label className="block text-xs font-medium">Data / ora</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </>
          ) : null}
          <button
            type="button"
            disabled={
              pending ||
              (kind === "note" ? !body.trim() : !titolo.trim())
            }
            onClick={create}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Crea"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "calendario") {
    return (
      <div className="space-y-3">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">Mese</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </div>
        {byDay.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nessun elemento in questo mese.
          </p>
        ) : (
          <ul className="space-y-3">
            {byDay.map(([day, items]) => (
              <li
                key={day}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <p className="text-xs font-bold uppercase text-[var(--muted)]">
                  {new Date(day + "T12:00:00").toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <ul className="mt-2 space-y-1">
                  {items.map((it) => (
                    <li key={it.id} className="text-sm">
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {formatWhen(it.when)}
                      </span>{" "}
                      · {it.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // elenco
  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {kind === "promemoria" ? (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {promemoria.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.titolo}</p>
                <p className="text-xs text-[var(--muted)]">
                  {formatWhen(p.dueAt)} · {p.stato}
                </p>
                {p.descrizione ? (
                  <p className="mt-1 text-sm text-slate-700">{p.descrizione}</p>
                ) : null}
              </div>
              {p.stato === "attivo" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await completePromemoriaAction(p.id);
                      if (!res.success) setError(res.error);
                      else reload();
                    });
                  }}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                >
                  Completa
                </button>
              ) : null}
            </li>
          ))}
          {promemoria.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nessun promemoria.
            </li>
          ) : null}
        </ul>
      ) : null}

      {kind === "attivita" ? (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {attivita.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <p className="font-medium">{a.titolo}</p>
              <p className="text-xs text-[var(--muted)]">
                {formatWhen(a.dueAt)}
                {a.luogo ? ` · ${a.luogo}` : ""} · {a.stato}
              </p>
              {a.descrizione ? (
                <p className="mt-1 text-sm whitespace-pre-wrap">{a.descrizione}</p>
              ) : null}
              {a.mentionUserIds.length > 0 ? (
                <p className="mt-1 text-xs text-sky-800">
                  Utenti:{" "}
                  {a.mentionUserIds
                    .map((id) => {
                      const p = peers.find((x) => x.id === id);
                      return p ? `@${p.name}` : id.slice(0, 6);
                    })
                    .join(", ")}
                </p>
              ) : null}
            </li>
          ))}
          {attivita.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nessuna attività.
            </li>
          ) : null}
        </ul>
      ) : null}

      {kind === "note" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {note.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-3 shadow-sm ${NOTE_COLORS[n.colore]}`}
            >
              {n.titolo ? (
                <p className="text-sm font-semibold">{n.titolo}</p>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-2 text-[10px] text-slate-600">
                {formatWhen(n.createdAt)}
                {n.entityLabel
                  ? ` · collegata a ${n.entityLabel}`
                  : n.entityType
                    ? ` · ${n.entityType}`
                    : ""}
              </p>
            </li>
          ))}
          {note.length === 0 ? (
            <li className="col-span-full py-8 text-center text-sm text-[var(--muted)]">
              Nessuna nota.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
