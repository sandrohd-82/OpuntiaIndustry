"use client";

import { useEffect, useState, useTransition } from "react";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  listActionIotComponentiAction,
  softDeleteActionIotComponenteAction,
  upsertActionIotComponenteAction,
} from "@/app/actions/action-iot-componenti";
import { ACTION_ESSICCATORI } from "@/lib/action/essiccatori";
import {
  defaultRangeForTipo,
  IOT_ATTUATORE_LABEL,
  IOT_ATTUATORE_TIPI,
  IOT_PRECONDIZIONE_LABEL,
  IOT_PRECONDIZIONI,
  type ActionIotComponente,
  type IotAttuatoreTipo,
  type IotPrecondizione,
} from "@/lib/action/iot-componenti";

export function ActionIotComponentiBoard() {
  const [items, setItems] = useState<ActionIotComponente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActionIotComponente | null>(null);
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [tipo, setTipo] = useState<IotAttuatoreTipo>("on_off");
  const [essId, setEssId] = useState<string>("");
  const [precondizione, setPrecondizione] =
    useState<IotPrecondizione>("nessuna");
  const [mexCmd, setMexCmd] = useState<number | "">("");
  const [impulso, setImpulso] = useState<number | "">("");

  function reload() {
    void listActionIotComponentiAction().then((res) => {
      if (!res.success) setError(res.error);
      else {
        setItems(res.items);
        setError(null);
      }
    });
  }

  useEffect(() => {
    reload();
  }, []);

  function startCreate() {
    setEditing(null);
    setCodice("");
    setNome("");
    setDescrizione("");
    setTipo("on_off");
    setEssId("");
    setPrecondizione("nessuna");
    setMexCmd("");
    setImpulso("");
    setOpen(true);
  }

  function startEdit(c: ActionIotComponente) {
    setEditing(c);
    setCodice(c.codice);
    setNome(c.nome);
    setDescrizione(c.descrizione);
    setTipo(c.tipoAttuatore);
    setEssId(c.essiccatoreId ?? "");
    setPrecondizione(c.precondizione);
    setMexCmd(c.mexCmd ?? "");
    setImpulso(c.durataImpulsoDefaultSec ?? "");
    setOpen(true);
  }

  const range = defaultRangeForTipo(tipo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Ogni componente ha una scheda: il tipo attuatore decide se in Sequenza
          compare On/Off, un grafico potenza % o un setpoint temperatura.
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuovo componente
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {open ? (
        <form
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await upsertActionIotComponenteAction({
                id: editing?.id,
                codice,
                nome,
                descrizione,
                tipoAttuatore: tipo,
                essiccatoreId: essId || null,
                precondizione,
                mexCmd: mexCmd === "" ? null : Number(mexCmd),
                durataImpulsoDefaultSec:
                  impulso === "" ? null : Number(impulso),
                valoreMin: range.min,
                valoreMax: range.max,
                valoreDefault: range.def,
                unita: range.unita,
              });
              if (!res.success) {
                setError(res.error);
                return;
              }
              setOpen(false);
              reload();
            });
          }}
        >
          <p className="sm:col-span-2 text-sm font-semibold">
            {editing ? `Scheda ${editing.nome} · V${editing.versione}` : "Nuova scheda"}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Codice</span>
            <input
              required
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Descrizione</span>
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tipo attuatore</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as IotAttuatoreTipo)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              {IOT_ATTUATORE_TIPI.map((t) => (
                <option key={t} value={t}>
                  {IOT_ATTUATORE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Impianto</span>
            <select
              value={essId}
              onChange={(e) => setEssId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">Comune (tutti)</option>
              {ACTION_ESSICCATORI.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Precondizione</span>
            <select
              value={precondizione}
              onChange={(e) =>
                setPrecondizione(e.target.value as IotPrecondizione)
              }
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              {IOT_PRECONDIZIONI.map((p) => (
                <option key={p} value={p}>
                  {IOT_PRECONDIZIONE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mex CMD (0–255)</span>
            <input
              type="number"
              min={0}
              max={255}
              value={mexCmd}
              onChange={(e) =>
                setMexCmd(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          {tipo === "on_off_temporizzato" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Impulso default (secondi)
              </span>
              <input
                type="number"
                min={1}
                value={impulso}
                onChange={(e) =>
                  setImpulso(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
          ) : null}
          <p className="sm:col-span-2 text-xs text-[var(--muted)]">
            Range scheda: {range.min}–{range.max} {range.unita || "On/Off"}
          </p>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {editing ? "Salva scheda (V+1)" : "Crea scheda"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm"
            >
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <article
            key={c.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] text-slate-500">{c.codice}</p>
                <h3 className="font-semibold">{c.nome}</h3>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Modifica"
                  onClick={() => startEdit(c)}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <FaPen size={12} />
                </button>
                <button
                  type="button"
                  title="Archivia"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await softDeleteActionIotComponenteAction(c.id);
                      if (!res.success) setError(res.error);
                      else reload();
                    })
                  }
                  className="rounded p-1.5 text-red-700 hover:bg-red-50"
                >
                  <FaTrash size={12} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {IOT_ATTUATORE_LABEL[c.tipoAttuatore]}
              {c.essiccatoreId
                ? ` · ${ACTION_ESSICCATORI.find((e) => e.id === c.essiccatoreId)?.nome ?? c.essiccatoreId}`
                : " · comune"}
            </p>
            {c.descrizione ? (
              <p className="mt-2 text-sm">{c.descrizione}</p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-[var(--muted)]">Precondizione</dt>
                <dd>{IOT_PRECONDIZIONE_LABEL[c.precondizione]}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Range</dt>
                <dd>
                  {c.valoreMin}–{c.valoreMax} {c.unita}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Mex CMD</dt>
                <dd>{c.mexCmd ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Scheda</dt>
                <dd>
                  V{c.versione} · {c.documentoStato}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
