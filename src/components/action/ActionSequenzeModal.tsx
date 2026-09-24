"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { FaPen, FaPlay, FaPlus, FaStop, FaTrash } from "react-icons/fa6";
import {
  addSequenzaPassoAction,
  approvaSequenzaAction,
  arrestaSequenzaAction,
  avviaSequenzaAction,
  chiudiEsecuzioneSequenzaAction,
  listSequenzeAction,
  softDeleteSequenzaAction,
  updateSequenzaPassoAction,
  upsertSequenzaTestataAction,
} from "@/app/actions/action-sequenze";
import { listActionIotComponentiAction } from "@/app/actions/action-iot-componenti";
import {
  BURNER_FROM,
  BURNER_TO,
  ClockArcPercentGauge,
  VENT_FROM,
  VENT_TO,
} from "@/components/action/ClockArcPercentGauge";
import {
  attuatoreHaDurataComando,
  attuatoreHaOnOff,
  attuatoreHaValore,
  defaultRangeForTipo,
  gaugeKindForCanale,
  IOT_PRECONDIZIONE_LABEL,
  labelTipoCanale,
  type ActionIotComponente,
} from "@/lib/action/iot-componenti";
import type { ActionEssiccatore } from "@/lib/action/essiccatori";
import {
  formatSecondi,
  formatStalloMinuti,
  labelComandoPasso,
  minutiDaSecondi,
  SEQUENZA_TIPO_LABEL,
  testoMexPasso,
  type ActionSequenza,
  type SequenzaComando,
  type SequenzaPasso,
  type SequenzaTipo,
  type TestoMexPasso,
} from "@/lib/action/sequenze";

export function ActionSequenzeModal({
  essiccatore,
  onClose,
}: {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
}) {
  const titleId = useId();
  const [items, setItems] = useState<ActionSequenza[]>([]);
  const [componenti, setComponenti] = useState<ActionIotComponente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<"lista" | "testata" | "azione">("lista");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [tipo, setTipo] = useState<SequenzaTipo>("azione");
  const [draftPassi, setDraftPassi] = useState<ActionSequenza["passi"]>([]);
  const [compId, setCompId] = useState("");
  const [comando, setComando] = useState<SequenzaComando>("on");
  const [valore, setValore] = useState(50);
  const [durataSec, setDurataSec] = useState<number | "">(10);
  const [stalloSi, setStalloSi] = useState(false);
  const [stalloMin, setStalloMin] = useState<number | "">(5);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [editingPassoId, setEditingPassoId] = useState<string | null>(null);

  const comp = componenti.find((c) => c.id === compId) ?? null;

  function reload() {
    void Promise.all([
      listSequenzeAction({ essiccatoreId: essiccatore.id }),
      listActionIotComponentiAction({
        essiccatoreId: essiccatore.id,
        soloAzioni: true,
      }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        setItems(a.items);
        setError(null);
      }
      if (b.success) {
        setComponenti(b.items);
        if (!compId && b.items[0]) setCompId(b.items[0].id);
      } else setError(b.error);
    });
  }

  useEffect(() => {
    reload();
  }, [essiccatore.id]);

  useEffect(() => {
    if (!comp || editingPassoId) return;
    const kind = gaugeKindForCanale(comp);
    if (kind === "temperatura") {
      const range = defaultRangeForTipo("setpoint_temperatura");
      const usaRangeScheda =
        comp.tipoAttuatore === "setpoint_temperatura" &&
        comp.valoreMax >= 30;
      setComando("setpoint");
      setValore(usaRangeScheda ? comp.valoreDefault : range.def);
    } else if (attuatoreHaValore(comp.tipoAttuatore)) {
      setComando("setpoint");
      setValore(comp.valoreDefault);
    } else {
      setComando("on");
    }
    if (comp.durataImpulsoDefaultSec) setDurataSec(comp.durataImpulsoDefaultSec);
  }, [comp?.id, editingPassoId]);

  function resetDraft() {
    setDraftId(null);
    setNome("");
    setDescrizione("");
    setTipo("azione");
    setDraftPassi([]);
    setEditingPassoId(null);
    setPhase("lista");
  }

  function openCreate() {
    setDraftId(null);
    setNome("");
    setDescrizione("");
    setTipo("azione");
    setDraftPassi([]);
    setEditingPassoId(null);
    setPhase("testata");
  }

  function fillPassoForm(p: SequenzaPasso) {
    setEditingPassoId(p.id);
    setCompId(p.componenteId);
    setComando(p.comando);
    setValore(p.valore ?? 50);
    setDurataSec(p.durataComandoSec ?? 10);
    setStalloSi(Boolean(p.stalloDopoSec));
    setStalloMin(p.stalloDopoSec ? minutiDaSecondi(p.stalloDopoSec) : 5);
  }

  function openEditPasso(item: ActionSequenza, p: SequenzaPasso) {
    setDraftId(item.id);
    setNome(item.nome);
    setDescrizione(item.descrizione);
    setTipo(item.tipo);
    setDraftPassi(item.passi);
    fillPassoForm(p);
    setPhase("azione");
  }

  function openContinue(item: ActionSequenza) {
    setDraftId(item.id);
    setNome(item.nome);
    setDescrizione(item.descrizione);
    setTipo(item.tipo);
    setDraftPassi(item.passi);
    setEditingPassoId(null);
    setPhase("testata");
  }

  const altroInCorso = items.some((i) => i.esecuzioneStato === "in_corso");

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
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Sequenze
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {essiccatore.nome} · Action su attuatori e regolatori dei componenti
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {phase === "lista" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <FaPlus size={11} />
              Crea sequenza
            </button>
            {items.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nessuna sequenza.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => {
                  const lit = item.esecuzioneStato === "in_corso";
                  return (
                    <li
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 ${
                        lit
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {item.nome}{" "}
                            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-700">
                              {SEQUENZA_TIPO_LABEL[item.tipo]}
                            </span>
                            {item.documentoStato === "bozza" ? (
                              <span className="ml-1 text-[10px] text-amber-800">
                                Bozza
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {item.passi.length} Action
                            {item.descrizione ? ` · ${item.descrizione}` : ""}
                          </p>
                          <ol className="mt-2 space-y-2">
                            {item.passi.map((p, i) => (
                              <PassoRiga
                                key={p.id}
                                index={i + 1}
                                passo={p}
                                essiccatoreId={essiccatore.id}
                                editDisabled={lit}
                                onEdit={() => openEditPasso(item, p)}
                              />
                            ))}
                          </ol>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {item.documentoStato === "approvato" ? (
                            lit ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  start(async () => {
                                    const res = await arrestaSequenzaAction({
                                      id: item.id,
                                    });
                                    if (!res.success) setError(res.error);
                                    else reload();
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white"
                              >
                                <FaStop size={10} />
                                Arresta
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending || altroInCorso}
                                onClick={() =>
                                  start(async () => {
                                    const res = await avviaSequenzaAction({
                                      id: item.id,
                                    });
                                    if (!res.success) {
                                      setError(res.error);
                                      return;
                                    }
                                    reload();
                                    window.setTimeout(() => {
                                      void chiudiEsecuzioneSequenzaAction({
                                        id: item.id,
                                      }).then(() => reload());
                                    }, 8000);
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                              >
                                <FaPlay size={10} />
                                Avvia
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => openContinue(item)}
                              className="text-xs font-medium text-sky-800 hover:underline"
                            >
                              Continua bozza
                            </button>
                          )}
                          <button
                            type="button"
                            title="Modifica"
                            onClick={() => openContinue(item)}
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <FaPen size={12} />
                          </button>
                          <button
                            type="button"
                            title="Elimina"
                            onClick={() => {
                              setDeleteId(item.id);
                              setDeleteStep(1);
                            }}
                            className="rounded p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <FaTrash size={12} />
                          </button>
                        </div>
                      </div>
                      {deleteId === item.id ? (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                          {deleteStep === 1
                            ? "Archiviare questa sequenza? (soft delete)"
                            : "Conferma definitiva: la sequenza sparisce dall’elenco."}
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                if (deleteStep === 1) {
                                  setDeleteStep(2);
                                  return;
                                }
                                start(async () => {
                                  const res = await softDeleteSequenzaAction(
                                    item.id
                                  );
                                  setDeleteId(null);
                                  if (!res.success) setError(res.error);
                                  else reload();
                                });
                              }}
                              className="rounded bg-red-700 px-2 py-1 font-medium text-white"
                            >
                              {deleteStep === 1 ? "Sì, continua" : "Archivia"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(null)}
                              className="rounded px-2 py-1"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {phase === "testata" ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Descrizione</span>
              <textarea
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <fieldset className="text-sm">
              <legend className="mb-1 font-medium">Tipo di sequenza</legend>
              <div className="flex flex-wrap gap-3">
                {(["chiusura", "azione", "sicurezza"] as SequenzaTipo[]).map(
                  (t) => (
                    <label key={t} className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="tipo-seq"
                        checked={tipo === t}
                        onChange={() => setTipo(t)}
                      />
                      {SEQUENZA_TIPO_LABEL[t]}
                    </label>
                  )
                )}
              </div>
            </fieldset>
            {draftPassi.length ? (
              <ol className="space-y-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
                {draftPassi.map((p, i) => (
                  <PassoRiga
                    key={p.id}
                    index={i + 1}
                    passo={p}
                    essiccatoreId={essiccatore.id}
                    onEdit={() => {
                      fillPassoForm(p);
                      setPhase("azione");
                    }}
                  />
                ))}
              </ol>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || nome.trim().length < 2}
                onClick={() =>
                  start(async () => {
                    const res = await upsertSequenzaTestataAction({
                      id: draftId ?? undefined,
                      essiccatoreId: essiccatore.id,
                      nome,
                      descrizione,
                      tipo,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setDraftId(res.item.id);
                    setDraftPassi(res.item.passi);
                    setEditingPassoId(null);
                    setPhase("azione");
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <FaPlus size={11} />
                Action
              </button>
              {draftId && draftPassi.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await approvaSequenzaAction(draftId);
                      if (!res.success) setError(res.error);
                      else {
                        resetDraft();
                        reload();
                      }
                    })
                  }
                  className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-800"
                >
                  Salva Sequenza
                </button>
              ) : null}
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-lg px-3 py-2 text-sm"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : null}

        {phase === "azione" && draftId ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Sequenza «{nome}» · {SEQUENZA_TIPO_LABEL[tipo]} ·{" "}
              {editingPassoId
                ? "modifica Action"
                : `passo ${draftPassi.length + 1}`}
            </p>
            {componenti.length === 0 ? (
              <p className="text-sm text-amber-800">
                Nessun componente. Aprili da Action → Elenco Componenti IoT.
              </p>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Componente → azione
                  </span>
                  <select
                    value={compId}
                    onChange={(e) => setCompId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                  >
                    {Array.from(
                      componenti.reduce((map, c) => {
                        const key = c.moduloNome || "Altri";
                        const list = map.get(key) ?? [];
                        list.push(c);
                        map.set(key, list);
                        return map;
                      }, new Map<string, ActionIotComponente[]>())
                    ).map(([gruppo, list]) => (
                      <optgroup key={gruppo} label={gruppo}>
                        {list.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} · {labelTipoCanale(c)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {comp ? (
                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <p className="text-xs text-[var(--muted)]">
                      {comp.descrizione || labelTipoCanale(comp)}
                      {comp.precondizione !== "nessuna"
                        ? ` · ${IOT_PRECONDIZIONE_LABEL[comp.precondizione]}`
                        : ""}
                    </p>
                    {attuatoreHaOnOff(comp.tipoAttuatore) ? (
                      <div className="mt-2 flex gap-3 text-sm">
                        {(["on", "off"] as const).map((c) => (
                          <label key={c} className="inline-flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={comando === c}
                              onChange={() => setComando(c)}
                            />
                            {c === "on" ? "On" : "Off"}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {attuatoreHaValore(comp.tipoAttuatore) ||
                    gaugeKindForCanale(comp) === "temperatura" ? (
                      <div className="mt-2">
                        <CanaleValoreGauge
                          comp={comp}
                          valore={valore}
                          onChange={setValore}
                        />
                      </div>
                    ) : null}
                    {attuatoreHaDurataComando(comp.tipoAttuatore) &&
                    comando === "on" ? (
                      <label className="mt-2 block text-sm">
                        <span className="mb-1 block font-medium">
                          Durata comando (secondi)
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={durataSec}
                          onChange={(e) =>
                            setDurataSec(
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                            )
                          }
                          className="w-32 rounded-lg border border-[var(--border)] px-3 py-2"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stalloSi}
                    onChange={(e) => setStalloSi(e.target.checked)}
                  />
                  Tempo di stallo prima della fase successiva
                </label>
                {stalloSi ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Stallo (minuti)</span>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={stalloMin}
                      onChange={(e) =>
                        setStalloMin(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="w-32 rounded-lg border border-[var(--border)] px-3 py-2"
                    />
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      attesa prima della Action successiva
                    </span>
                  </label>
                ) : null}
                {comp ? (
                  <MexPreviewBox
                    essiccatoreId={essiccatore.id}
                    mexCmd={comp.mexCmd}
                    tipoAttuatore={comp.tipoAttuatore}
                    comando={
                      attuatoreHaValore(comp.tipoAttuatore) ||
                      gaugeKindForCanale(comp) === "temperatura"
                        ? "setpoint"
                        : comando
                    }
                    valore={
                      attuatoreHaValore(comp.tipoAttuatore) ||
                      gaugeKindForCanale(comp) === "temperatura"
                        ? valore
                        : null
                    }
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending || !comp}
                    onClick={() =>
                      start(async () => {
                        if (!comp) return;
                        const payload = {
                          sequenzaId: draftId,
                          componenteId: comp.id,
                          comando:
                            attuatoreHaValore(comp.tipoAttuatore) ||
                            gaugeKindForCanale(comp) === "temperatura"
                              ? "setpoint"
                              : comando,
                          valore:
                            attuatoreHaValore(comp.tipoAttuatore) ||
                            gaugeKindForCanale(comp) === "temperatura"
                              ? valore
                              : null,
                          durataComandoSec:
                            attuatoreHaDurataComando(comp.tipoAttuatore) &&
                            comando === "on"
                              ? Number(durataSec) || null
                              : null,
                          stalloDopoSec: stalloSi
                            ? Math.round(Number(stalloMin) * 60) || null
                            : null,
                          precondizione: comp.precondizione,
                        };
                        const res = editingPassoId
                          ? await updateSequenzaPassoAction({
                              ...payload,
                              id: editingPassoId,
                            })
                          : await addSequenzaPassoAction(payload);
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setDraftPassi(res.item.passi);
                        setEditingPassoId(null);
                        setStalloSi(false);
                        setPhase("testata");
                        reload();
                      })
                    }
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {editingPassoId ? "Salva modifica" : "Salva questa Action"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase("testata")}
                    className="rounded-lg px-3 py-2 text-sm"
                  >
                    Indietro
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MexCoppiaTesto({ mex }: { mex: TestoMexPasso }) {
  return (
    <p className="mt-0.5 font-mono text-[10px] leading-4 text-slate-600">
      Invio {mex.out.corpo} · {mex.out.titolo}
      <br />
      {mex.out.hex}
      <br />
      Atteso {mex.ack.corpo} · {mex.ack.titolo}
      <br />
      {mex.ack.hex}
    </p>
  );
}

function PassoRiga({
  index,
  passo,
  essiccatoreId,
  onEdit,
  editDisabled,
}: {
  index: number;
  passo: SequenzaPasso;
  essiccatoreId: string;
  onEdit?: () => void;
  editDisabled?: boolean;
}) {
  const mex = testoMexPasso({
    essiccatoreId,
    mexCmd: passo.mexCmd,
    comando: passo.comando,
    valore: passo.valore,
    tipoAttuatore: typeof passo.componenteTipo === "string" ? passo.componenteTipo : null,
  });
  return (
    <li className="flex items-start justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-slate-800">
          <span className="mr-1.5 tabular-nums text-slate-500">{index}.</span>
          {passo.componenteNome} · {labelComandoPasso(passo)}
          {passo.durataComandoSec
            ? ` · ${formatSecondi(passo.durataComandoSec)}`
            : ""}
          {passo.stalloDopoSec
            ? ` · stallo ${formatStalloMinuti(passo.stalloDopoSec)}`
            : ""}
        </p>
        {mex ? (
          <MexCoppiaTesto mex={mex} />
        ) : (
          <p className="mt-0.5 text-[10px] text-amber-800">
            Mex CMD non impostato sul canale: messaggio non definito.
          </p>
        )}
      </div>
      {onEdit ? (
        <button
          type="button"
          title="Modifica Action"
          disabled={editDisabled}
          onClick={onEdit}
          className="shrink-0 rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <FaPen size={12} />
        </button>
      ) : null}
    </li>
  );
}

function MexPreviewBox({
  essiccatoreId,
  mexCmd,
  comando,
  valore,
  tipoAttuatore,
}: {
  essiccatoreId: string;
  mexCmd: number | null;
  comando: SequenzaComando;
  valore: number | null;
  tipoAttuatore?: string | null;
}) {
  const mex = testoMexPasso({
    essiccatoreId,
    mexCmd,
    comando,
    valore,
    tipoAttuatore,
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <p className="font-medium text-slate-700">Messaggi invio e conferma attesa</p>
      {mex ? (
        <MexCoppiaTesto mex={mex} />
      ) : (
        <p className="mt-1 text-amber-800">
          Imposta Mex CMD sul canale in Elenco Componenti IoT.
        </p>
      )}
    </div>
  );
}

function CanaleValoreGauge({
  comp,
  valore,
  onChange,
}: {
  comp: ActionIotComponente;
  valore: number;
  onChange: (n: number) => void;
}) {
  const kind = gaugeKindForCanale(comp);
  const tempRange = defaultRangeForTipo("setpoint_temperatura");
  const isTemp = kind === "temperatura";
  const min = isTemp
    ? comp.tipoAttuatore === "setpoint_temperatura" && comp.valoreMax >= 30
      ? comp.valoreMin
      : tempRange.min
    : comp.valoreMin;
  const max = isTemp
    ? comp.tipoAttuatore === "setpoint_temperatura" && comp.valoreMax >= 30
      ? comp.valoreMax
      : tempRange.max
    : comp.valoreMax;
  const label =
    kind === "temperatura"
      ? "Temperatura"
      : kind === "apertura_bruciatore"
        ? "Apertura bruciatore"
        : "Ventilazione";
  return (
    <ClockArcPercentGauge
      value={valore}
      onChange={onChange}
      min={min}
      max={max}
      unit={isTemp ? "°C" : "%"}
      label={label}
      ticks={isTemp ? [35, 45, 55, 65, 70] : undefined}
      fromColor={kind === "ventilazione" ? VENT_FROM : BURNER_FROM}
      toColor={kind === "ventilazione" ? VENT_TO : BURNER_TO}
    />
  );
}
