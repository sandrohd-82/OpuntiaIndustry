"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { FaChevronDown, FaChevronRight, FaLink, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  listActionIotAlberoAction,
  softDeleteActionIotCollegamentoAction,
  softDeleteActionIotComponenteAction,
  softDeleteActionIotMacchinaAction,
  softDeleteActionIotModuloAction,
  upsertActionIotCollegamentoAction,
  upsertActionIotComponenteAction,
  upsertActionIotMacchinaAction,
  upsertActionIotModuloAction,
} from "@/app/actions/action-iot-componenti";
import { ACTION_ESSICCATORI } from "@/lib/action/essiccatori";
import {
  defaultRangeForTipo,
  IOT_ATTUATORE_LABEL,
  IOT_ATTUATORE_TIPI,
  IOT_CANALE_RUOLO_LABEL,
  IOT_LINK_RUOLO_LABEL,
  IOT_LINK_RUOLI,
  IOT_MACCHINA_TIPO_LABEL,
  IOT_MACCHINA_TIPI,
  IOT_PRECONDIZIONE_LABEL,
  IOT_PRECONDIZIONI,
  labelTipoCanale,
  type ActionIotAlbero,
  type ActionIotAlberoMacchina,
  type ActionIotAlberoModulo,
  type ActionIotComponente,
  type ActionIotMacchina,
  type ActionIotModulo,
  type IotAttuatoreTipo,
  type IotCanaleRuolo,
  type IotLinkRuolo,
  type IotMacchinaTipo,
  type IotPrecondizione,
} from "@/lib/action/iot-componenti";

type FormState =
  | { kind: "macchina"; editing: ActionIotMacchina | null }
  | { kind: "modulo"; macchina: ActionIotMacchina; editing: ActionIotModulo | null }
  | {
      kind: "canale";
      macchina: ActionIotMacchina;
      modulo: ActionIotAlberoModulo | null;
      ruolo: IotCanaleRuolo;
      editing: ActionIotComponente | null;
    }
  | { kind: "link"; macchina: ActionIotAlberoMacchina; sensore: ActionIotComponente };

const emptyAlbero: ActionIotAlbero = { macchine: [], collegamenti: [] };

function ruoloBadgeClass(ruolo: IotCanaleRuolo): string {
  if (ruolo === "attuatore") return "bg-sky-50 text-sky-800";
  if (ruolo === "regolatore") return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-800";
}

export function ActionIotComponentiBoard() {
  const [albero, setAlbero] = useState<ActionIotAlbero>(emptyAlbero);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<FormState | null>(null);
  const [openMac, setOpenMac] = useState<Record<string, boolean>>({});
  const [openMod, setOpenMod] = useState<Record<string, boolean>>({});

  function reload() {
    void listActionIotAlberoAction().then((res) => {
      if (!res.success) setError(res.error);
      else {
        setAlbero(res.albero);
        setError(null);
      }
    });
  }

  useEffect(() => {
    reload();
  }, []);

  const azioniPerMacchina = useMemo(() => {
    const map = new Map<string, ActionIotComponente[]>();
    for (const m of albero.macchine) {
      const list = [
        ...m.moduli.flatMap((mo) =>
          mo.canali.filter((c) => c.ruolo === "attuatore" || c.ruolo === "regolatore")
        ),
      ];
      map.set(m.id, list);
    }
    return map;
  }, [albero]);

  const linksBySensore = useMemo(() => {
    const map = new Map<string, typeof albero.collegamenti>();
    for (const l of albero.collegamenti) {
      const list = map.get(l.sensoreId) ?? [];
      list.push(l);
      map.set(l.sensoreId, list);
    }
    return map;
  }, [albero.collegamenti]);

  const linksByCanale = useMemo(() => {
    const map = new Map<string, typeof albero.collegamenti>();
    for (const l of albero.collegamenti) {
      const list = map.get(l.canaleId) ?? [];
      list.push(l);
      map.set(l.canaleId, list);
    }
    return map;
  }, [albero.collegamenti]);

  function macOpen(id: string): boolean {
    return openMac[id] !== false;
  }
  function modOpen(id: string): boolean {
    return openMod[id] !== false;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Albero madre-figlio: macchina → componente → attuatori, regolatori e
          sensori. I sensori di macchina si collegano alle azioni dei componenti.
        </p>
        <button
          type="button"
          onClick={() => setForm({ kind: "macchina", editing: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuova macchina
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {form ? (
        <CatalogForm
          form={form}
          pending={pending}
          azioni={
            form.kind === "link"
              ? azioniPerMacchina.get(form.macchina.id) ?? []
              : []
          }
          onCancel={() => setForm(null)}
          onError={setError}
          onSaved={() => {
            setForm(null);
            reload();
          }}
          start={start}
        />
      ) : null}

      <div className="space-y-3">
        {albero.macchine.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuna macchina in catalogo.</p>
        ) : null}
        {albero.macchine.map((m) => (
          <section
            key={m.id}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() =>
                  setOpenMac((prev) => ({ ...prev, [m.id]: !macOpen(m.id) }))
                }
              >
                {macOpen(m.id) ? (
                  <FaChevronDown className="shrink-0 text-slate-400" size={12} />
                ) : (
                  <FaChevronRight className="shrink-0 text-slate-400" size={12} />
                )}
                <span>
                  <span className="font-semibold">{m.nome}</span>
                  <span className="ml-2 font-mono text-[11px] text-slate-500">
                    {m.codice}
                  </span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {IOT_MACCHINA_TIPO_LABEL[m.tipoMacchina]}
                    {m.essiccatoreId
                      ? ` · ${ACTION_ESSICCATORI.find((e) => e.id === m.essiccatoreId)?.nome ?? m.essiccatoreId}`
                      : ""}
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap gap-1">
                <IconBtn
                  title="Nuovo componente"
                  onClick={() => setForm({ kind: "modulo", macchina: m, editing: null })}
                >
                  <FaPlus size={11} /> Componente
                </IconBtn>
                <IconBtn
                  title="Sensore di macchina"
                  onClick={() =>
                    setForm({
                      kind: "canale",
                      macchina: m,
                      modulo: null,
                      ruolo: "sensore",
                      editing: null,
                    })
                  }
                >
                  <FaPlus size={11} /> Sensore
                </IconBtn>
                <IconBtn
                  title="Modifica"
                  onClick={() => setForm({ kind: "macchina", editing: m })}
                >
                  <FaPen size={11} />
                </IconBtn>
                <IconBtn
                  title="Archivia"
                  danger
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await softDeleteActionIotMacchinaAction(m.id);
                      if (!res.success) setError(res.error);
                      else reload();
                    })
                  }
                >
                  <FaTrash size={11} />
                </IconBtn>
              </div>
            </header>
            {macOpen(m.id) ? (
              <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
                {m.moduli.map((mo) => (
                  <div
                    key={mo.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left text-sm font-medium"
                        onClick={() =>
                          setOpenMod((prev) => ({
                            ...prev,
                            [mo.id]: !modOpen(mo.id),
                          }))
                        }
                      >
                        {modOpen(mo.id) ? (
                          <FaChevronDown className="text-slate-400" size={11} />
                        ) : (
                          <FaChevronRight className="text-slate-400" size={11} />
                        )}
                        {mo.nome}
                        <span className="font-mono text-[11px] font-normal text-slate-500">
                          {mo.codice}
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ["attuatore", "Attuatore"],
                            ["regolatore", "Regolatore"],
                            ["sensore", "Sensore"],
                          ] as const
                        ).map(([ruolo, label]) => (
                          <IconBtn
                            key={ruolo}
                            title={`Aggiungi ${label.toLowerCase()}`}
                            onClick={() =>
                              setForm({
                                kind: "canale",
                                macchina: m,
                                modulo: mo,
                                ruolo,
                                editing: null,
                              })
                            }
                          >
                            <FaPlus size={10} /> {label}
                          </IconBtn>
                        ))}
                        <IconBtn
                          title="Modifica"
                          onClick={() =>
                            setForm({ kind: "modulo", macchina: m, editing: mo })
                          }
                        >
                          <FaPen size={11} />
                        </IconBtn>
                        <IconBtn
                          title="Archivia"
                          danger
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await softDeleteActionIotModuloAction(mo.id);
                              if (!res.success) setError(res.error);
                              else reload();
                            })
                          }
                        >
                          <FaTrash size={11} />
                        </IconBtn>
                      </div>
                    </div>
                    {modOpen(mo.id) ? (
                      <ul className="space-y-1 border-t border-slate-200 px-3 py-2">
                        {mo.canali.length === 0 ? (
                          <li className="text-xs text-[var(--muted)]">
                            Nessun attuatore, regolatore o sensore.
                          </li>
                        ) : null}
                        {mo.canali.map((c) => (
                          <CanaleRow
                            key={c.id}
                            canale={c}
                            pending={pending}
                            links={
                              c.ruolo === "sensore"
                                ? linksBySensore.get(c.id) ?? []
                                : linksByCanale.get(c.id) ?? []
                            }
                            onEdit={() =>
                              setForm({
                                kind: "canale",
                                macchina: m,
                                modulo: mo,
                                ruolo: c.ruolo,
                                editing: c,
                              })
                            }
                            onLink={
                              c.ruolo === "sensore"
                                ? () => setForm({ kind: "link", macchina: m, sensore: c })
                                : undefined
                            }
                            onDelete={() =>
                              start(async () => {
                                const res = await softDeleteActionIotComponenteAction(
                                  c.id
                                );
                                if (!res.success) setError(res.error);
                                else reload();
                              })
                            }
                            onUnlink={(linkId) =>
                              start(async () => {
                                const res =
                                  await softDeleteActionIotCollegamentoAction(linkId);
                                if (!res.success) setError(res.error);
                                else reload();
                              })
                            }
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}

                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sensori di macchina
                  </p>
                  {m.sensoriMacchina.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      Nessun sensore di impianto. Non appartengono a un componente.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {m.sensoriMacchina.map((c) => (
                        <CanaleRow
                          key={c.id}
                          canale={c}
                          pending={pending}
                          links={linksBySensore.get(c.id) ?? []}
                          onEdit={() =>
                            setForm({
                              kind: "canale",
                              macchina: m,
                              modulo: null,
                              ruolo: "sensore",
                              editing: c,
                            })
                          }
                          onLink={() =>
                            setForm({ kind: "link", macchina: m, sensore: c })
                          }
                          onDelete={() =>
                            start(async () => {
                              const res = await softDeleteActionIotComponenteAction(
                                c.id
                              );
                              if (!res.success) setError(res.error);
                              else reload();
                            })
                          }
                          onUnlink={(linkId) =>
                            start(async () => {
                              const res =
                                await softDeleteActionIotCollegamentoAction(linkId);
                              if (!res.success) setError(res.error);
                              else reload();
                            })
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] disabled:opacity-50 ${
        danger
          ? "text-red-700 hover:bg-red-50"
          : "text-slate-600 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function CanaleRow({
  canale,
  links,
  pending,
  onEdit,
  onLink,
  onDelete,
  onUnlink,
}: {
  canale: ActionIotComponente;
  links: ActionIotAlbero["collegamenti"];
  pending: boolean;
  onEdit: () => void;
  onLink?: () => void;
  onDelete: () => void;
  onUnlink: (id: string) => void;
}) {
  return (
    <li className="rounded-md bg-white px-2 py-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ruoloBadgeClass(canale.ruolo)}`}
            >
              {IOT_CANALE_RUOLO_LABEL[canale.ruolo]}
            </span>
            <span className="text-sm font-medium">{canale.nome}</span>
            <span className="font-mono text-[11px] text-slate-500">{canale.codice}</span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {labelTipoCanale(canale)}
            {canale.unita ? ` · ${canale.unita}` : ""}
            {canale.mexCmd != null ? ` · Mex ${canale.mexCmd}` : ""}
            {` · V${canale.versione} ${canale.documentoStato}`}
          </p>
          {links.length ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700"
                >
                  {canale.ruolo === "sensore"
                    ? `${IOT_LINK_RUOLO_LABEL[l.ruoloLink]} → ${l.canaleNome}`
                    : `${IOT_LINK_RUOLO_LABEL[l.ruoloLink]} ← ${l.sensoreNome}`}
                  <button
                    type="button"
                    title="Archivia collegamento"
                    className="text-red-600"
                    disabled={pending}
                    onClick={() => onUnlink(l.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex gap-1">
          {onLink ? (
            <IconBtn title="Collega a un'azione" onClick={onLink}>
              <FaLink size={11} />
            </IconBtn>
          ) : null}
          <IconBtn title="Modifica" onClick={onEdit}>
            <FaPen size={11} />
          </IconBtn>
          <IconBtn title="Archivia" danger disabled={pending} onClick={onDelete}>
            <FaTrash size={11} />
          </IconBtn>
        </div>
      </div>
    </li>
  );
}

function CatalogForm({
  form,
  pending,
  azioni,
  onCancel,
  onError,
  onSaved,
  start,
}: {
  form: FormState;
  pending: boolean;
  azioni: ActionIotComponente[];
  onCancel: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  start: (fn: () => Promise<void>) => void;
}) {
  if (form.kind === "macchina") {
    return (
      <MacchinaForm
        editing={form.editing}
        pending={pending}
        onCancel={onCancel}
        onError={onError}
        onSaved={onSaved}
        start={start}
      />
    );
  }
  if (form.kind === "modulo") {
    return (
      <ModuloForm
        macchina={form.macchina}
        editing={form.editing}
        pending={pending}
        onCancel={onCancel}
        onError={onError}
        onSaved={onSaved}
        start={start}
      />
    );
  }
  if (form.kind === "link") {
    return (
      <LinkForm
        sensore={form.sensore}
        azioni={azioni}
        pending={pending}
        onCancel={onCancel}
        onError={onError}
        onSaved={onSaved}
        start={start}
      />
    );
  }
  return (
    <CanaleForm
      macchina={form.macchina}
      modulo={form.modulo}
      ruolo={form.ruolo}
      editing={form.editing}
      pending={pending}
      onCancel={onCancel}
      onError={onError}
      onSaved={onSaved}
      start={start}
    />
  );
}

function fieldClass() {
  return "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2";
}

function MacchinaForm({
  editing,
  pending,
  onCancel,
  onError,
  onSaved,
  start,
}: {
  editing: ActionIotMacchina | null;
  pending: boolean;
  onCancel: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [codice, setCodice] = useState(editing?.codice ?? "");
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [tipo, setTipo] = useState<IotMacchinaTipo>(
    editing?.tipoMacchina ?? "essiccatore"
  );
  const [essId, setEssId] = useState(editing?.essiccatoreId ?? "");

  return (
    <form
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsertActionIotMacchinaAction({
            id: editing?.id,
            codice,
            nome,
            descrizione,
            tipoMacchina: tipo,
            essiccatoreId: essId || null,
          });
          if (!res.success) onError(res.error);
          else onSaved();
        });
      }}
    >
      <p className="sm:col-span-2 text-sm font-semibold">
        {editing ? `Macchina ${editing.nome} · V${editing.versione}` : "Nuova macchina"}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Codice</span>
        <input required value={codice} onChange={(e) => setCodice(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nome</span>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tipo</span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as IotMacchinaTipo)}
          className={fieldClass()}
        >
          {IOT_MACCHINA_TIPI.map((t) => (
            <option key={t} value={t}>
              {IOT_MACCHINA_TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Impianto Action (opzionale)</span>
        <select value={essId} onChange={(e) => setEssId(e.target.value)} className={fieldClass()}>
          <option value="">Nessuno</option>
          {ACTION_ESSICCATORI.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">Descrizione</span>
        <textarea
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          rows={2}
          className={fieldClass()}
        />
      </label>
      <FormActions pending={pending} editing={Boolean(editing)} onCancel={onCancel} />
    </form>
  );
}

function ModuloForm({
  macchina,
  editing,
  pending,
  onCancel,
  onError,
  onSaved,
  start,
}: {
  macchina: ActionIotMacchina;
  editing: ActionIotModulo | null;
  pending: boolean;
  onCancel: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [codice, setCodice] = useState(editing?.codice ?? "");
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [sortOrder, setSortOrder] = useState(editing?.sortOrder ?? 0);

  return (
    <form
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsertActionIotModuloAction({
            id: editing?.id,
            macchinaId: macchina.id,
            codice,
            nome,
            descrizione,
            sortOrder,
          });
          if (!res.success) onError(res.error);
          else onSaved();
        });
      }}
    >
      <p className="sm:col-span-2 text-sm font-semibold">
        {macchina.nome} →{" "}
        {editing ? `Componente ${editing.nome} · V${editing.versione}` : "Nuovo componente"}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Codice</span>
        <input required value={codice} onChange={(e) => setCodice(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nome</span>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Ordine</span>
        <input
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={fieldClass()}
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">Descrizione</span>
        <textarea
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          rows={2}
          className={fieldClass()}
        />
      </label>
      <FormActions pending={pending} editing={Boolean(editing)} onCancel={onCancel} />
    </form>
  );
}

function CanaleForm({
  macchina,
  modulo,
  ruolo,
  editing,
  pending,
  onCancel,
  onError,
  onSaved,
  start,
}: {
  macchina: ActionIotMacchina;
  modulo: ActionIotAlberoModulo | null;
  ruolo: IotCanaleRuolo;
  editing: ActionIotComponente | null;
  pending: boolean;
  onCancel: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [codice, setCodice] = useState(editing?.codice ?? "");
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [tipo, setTipo] = useState<IotAttuatoreTipo>(
    editing?.tipoAttuatore ?? (ruolo === "regolatore" ? "setpoint_temperatura" : "on_off")
  );
  const [precondizione, setPrecondizione] = useState<IotPrecondizione>(
    editing?.precondizione ?? "nessuna"
  );
  const [mexCmd, setMexCmd] = useState<number | "">(editing?.mexCmd ?? "");
  const [impulso, setImpulso] = useState<number | "">(
    editing?.durataImpulsoDefaultSec ?? ""
  );
  const [unita, setUnita] = useState(editing?.unita ?? "");
  const range = defaultRangeForTipo(tipo);
  const isSensore = ruolo === "sensore";
  const parent = modulo ? `${macchina.nome} → ${modulo.nome}` : `${macchina.nome} → sensori macchina`;

  return (
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
            ruolo,
            tipoAttuatore: isSensore ? null : tipo,
            macchinaId: macchina.id,
            moduloId: modulo?.id ?? null,
            essiccatoreId: macchina.essiccatoreId,
            precondizione,
            mexCmd: mexCmd === "" ? null : Number(mexCmd),
            durataImpulsoDefaultSec: impulso === "" ? null : Number(impulso),
            valoreMin: isSensore ? 0 : range.min,
            valoreMax: isSensore ? 0 : range.max,
            valoreDefault: isSensore ? 0 : range.def,
            unita: isSensore ? unita : range.unita,
          });
          if (!res.success) onError(res.error);
          else onSaved();
        });
      }}
    >
      <p className="sm:col-span-2 text-sm font-semibold">
        {parent} →{" "}
        {editing
          ? `${IOT_CANALE_RUOLO_LABEL[ruolo]} ${editing.nome} · V${editing.versione}`
          : `Nuovo ${IOT_CANALE_RUOLO_LABEL[ruolo].toLowerCase()}`}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Codice</span>
        <input required value={codice} onChange={(e) => setCodice(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nome</span>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={fieldClass()} />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">Descrizione</span>
        <textarea
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          rows={2}
          className={fieldClass()}
        />
      </label>
      {isSensore ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Unità</span>
          <input value={unita} onChange={(e) => setUnita(e.target.value)} className={fieldClass()} />
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as IotAttuatoreTipo)}
            className={fieldClass()}
          >
            {IOT_ATTUATORE_TIPI.map((t) => (
              <option key={t} value={t}>
                {IOT_ATTUATORE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Precondizione</span>
        <select
          value={precondizione}
          onChange={(e) => setPrecondizione(e.target.value as IotPrecondizione)}
          className={fieldClass()}
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
          onChange={(e) => setMexCmd(e.target.value === "" ? "" : Number(e.target.value))}
          className={fieldClass()}
          placeholder="vuoto = automatico"
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          Vuoto: il sistema assegna il primo libero sulla macchina (1–255).
        </span>
      </label>
      {!isSensore && tipo === "on_off_temporizzato" ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Impulso default (secondi)</span>
          <input
            type="number"
            min={1}
            value={impulso}
            onChange={(e) =>
              setImpulso(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={fieldClass()}
          />
        </label>
      ) : null}
      {!isSensore ? (
        <p className="sm:col-span-2 text-xs text-[var(--muted)]">
          Range scheda: {range.min}–{range.max} {range.unita || "On/Off"}
        </p>
      ) : null}
      <FormActions pending={pending} editing={Boolean(editing)} onCancel={onCancel} />
    </form>
  );
}

function LinkForm({
  sensore,
  azioni,
  pending,
  onCancel,
  onError,
  onSaved,
  start,
}: {
  sensore: ActionIotComponente;
  azioni: ActionIotComponente[];
  pending: boolean;
  onCancel: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [canaleId, setCanaleId] = useState(azioni[0]?.id ?? "");
  const [ruoloLink, setRuoloLink] = useState<IotLinkRuolo>("feedback");
  const [note, setNote] = useState("");

  return (
    <form
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsertActionIotCollegamentoAction({
            sensoreId: sensore.id,
            canaleId,
            ruoloLink,
            note,
          });
          if (!res.success) onError(res.error);
          else onSaved();
        });
      }}
    >
      <p className="sm:col-span-2 text-sm font-semibold">
        Collega sensore «{sensore.nome}» a un&apos;azione del componente
      </p>
      {azioni.length === 0 ? (
        <p className="sm:col-span-2 text-sm text-amber-800">
          Nessun attuatore o regolatore su questa macchina.
        </p>
      ) : (
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Azione (attuatore / regolatore)</span>
          <select
            required
            value={canaleId}
            onChange={(e) => setCanaleId(e.target.value)}
            className={fieldClass()}
          >
            {azioni.map((a) => (
              <option key={a.id} value={a.id}>
                {a.moduloNome ? `${a.moduloNome} · ` : ""}
                {a.nome} · {labelTipoCanale(a)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Ruolo collegamento</span>
        <select
          value={ruoloLink}
          onChange={(e) => setRuoloLink(e.target.value as IotLinkRuolo)}
          className={fieldClass()}
        >
          {IOT_LINK_RUOLI.map((r) => (
            <option key={r} value={r}>
              {IOT_LINK_RUOLO_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass()} />
      </label>
      <FormActions
        pending={pending || azioni.length === 0}
        editing={false}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormActions({
  pending,
  editing,
  onCancel,
}: {
  pending: boolean;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="sm:col-span-2 flex gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {editing ? "Salva scheda (V+1)" : "Crea scheda"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm">
        Annulla
      </button>
    </div>
  );
}
