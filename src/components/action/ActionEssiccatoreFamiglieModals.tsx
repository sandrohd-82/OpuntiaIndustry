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
  arrestaAzioneRegistrataAction,
  avviaAzioneRegistrataAction,
  createAzioneProgrammataAction,
  createAzioneRegistrataAction,
  createProcessoAction,
  eseguiAzioneProgrammataAction,
  listAzioniProgrammateAction,
  listAzioniRegistrateAction,
  listProcessiAction,
  softDeleteAzioneRegistrataAction,
  softDeleteProcessoAction,
  updateAzioneRegistrataAction,
} from "@/app/actions/action-essiccatore-catalogo";
import {
  FaFan,
  FaFire,
  FaPen,
  FaPlay,
  FaStop,
  FaTrash,
} from "react-icons/fa6";
import type { ActionEssiccatoreAzione } from "@/lib/action/azioni-immediate";
import {
  BURNER_FROM,
  BURNER_TO,
  ClockArcPercentGauge,
  VENT_FROM,
  VENT_TO,
} from "@/components/action/ClockArcPercentGauge";
import {
  TEMP_BRUCIATORE_DEFAULT_C,
  TEMP_BRUCIATORE_MAX_C,
  TEMP_BRUCIATORE_MIN_C,
} from "@/lib/action/azioni-immediate";
import {
  durataToMinuti,
  formatDurataMinuti,
  formatEseguiAt,
  PROGRAMMATA_STATO_LABEL,
  type AzioneProgrammata,
  type AzioneRegistrata,
  type DurataUnita,
  type ProcessoAzione,
} from "@/lib/action/azioni-catalogo";
import { listSequenzeAction } from "@/app/actions/action-sequenze";
import {
  SEQUENZA_TIPO_LABEL,
  type ActionSequenza,
} from "@/lib/action/sequenze";
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
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
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

const REG_ESEC_EVENT = "opuntia.action-registrata-esec";

function RegistrataSetpointFields({
  temp,
  setTemp,
  vent,
  setVent,
}: {
  temp: number;
  setTemp: (n: number) => void;
  vent: number;
  setVent: (n: number) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-orange-950">
          <FaFire className="text-orange-600" />
          Bruciatore
        </div>
        <ClockArcPercentGauge
          label="Temperatura"
          value={temp}
          onChange={setTemp}
          min={TEMP_BRUCIATORE_MIN_C}
          max={TEMP_BRUCIATORE_MAX_C}
          unit="°C"
          ticks={[35, 45, 55, 65, 70]}
          fromColor={BURNER_FROM}
          toColor={BURNER_TO}
        />
      </section>
      <section className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-950">
          <FaFan className="text-sky-600" />
          Ventola
        </div>
        <ClockArcPercentGauge
          label="Ventilazione"
          value={vent}
          onChange={setVent}
          fromColor={VENT_FROM}
          toColor={VENT_TO}
        />
      </section>
    </div>
  );
}

function RegistrataDurataFields({
  infinito,
  setInfinito,
  valore,
  setValore,
  unita,
  setUnita,
}: {
  infinito: boolean;
  setInfinito: (v: boolean) => void;
  valore: number;
  setValore: (n: number) => void;
  unita: DurataUnita;
  setUnita: (u: DurataUnita) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-[var(--border)] p-3">
      <legend className="px-1 text-sm font-medium">Durata</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={infinito}
          onChange={(e) => setInfinito(e.target.checked)}
        />
        Infinito (non impostata)
      </label>
      {infinito ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          L’azione resta attiva finché non viene fermata.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Valore</span>
            <input
              type="number"
              min={1}
              max={unita === "ore" ? 24 * 30 : 60 * 24 * 30}
              value={valore}
              onChange={(e) => setValore(Number(e.target.value))}
              required
              className="w-28 rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Unità</span>
            <select
              value={unita}
              onChange={(e) => setUnita(e.target.value as DurataUnita)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="minuti">minuti</option>
              <option value="ore">ore</option>
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function ActionEssiccatoreRegistrateModal({
  essiccatore,
  onClose,
  onAvvioRegistrato,
  onArrestoRegistrato,
}: {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
  onAvvioRegistrato?: (azione: ActionEssiccatoreAzione) => void;
  onArrestoRegistrato?: (
    azione: ActionEssiccatoreAzione,
    registrataId: string
  ) => void;
}) {
  const [items, setItems] = useState<AzioneRegistrata[]>([]);
  const [stops, setStops] = useState<AzioneRegistrata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [creaOpen, setCreaOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [temp, setTemp] = useState(TEMP_BRUCIATORE_DEFAULT_C);
  const [vent, setVent] = useState(70);
  const [durataInfinito, setDurataInfinito] = useState(true);
  const [durataValore, setDurataValore] = useState(60);
  const [durataUnita, setDurataUnita] = useState<DurataUnita>("minuti");
  const [note, setNote] = useState("");
  const [spegnimentoMode, setSpegnimentoMode] = useState<"crea" | "collega">(
    "crea"
  );
  const [collegaId, setCollegaId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editTemp, setEditTemp] = useState(TEMP_BRUCIATORE_DEFAULT_C);
  const [editVent, setEditVent] = useState(70);
  const [editInfinito, setEditInfinito] = useState(true);
  const [editDurataValore, setEditDurataValore] = useState(60);
  const [editDurataUnita, setEditDurataUnita] = useState<DurataUnita>("minuti");
  const [editStopId, setEditStopId] = useState("");
  const [editStopTemp, setEditStopTemp] = useState(TEMP_BRUCIATORE_MIN_C);
  const [editStopVent, setEditStopVent] = useState(70);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);

  function reload() {
    void Promise.all([
      listAzioniRegistrateAction({ essiccatoreId: essiccatore.id }),
      listAzioniRegistrateAction({
        essiccatoreId: essiccatore.id,
        ruolo: "spegnimento",
      }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        setItems(a.items);
        setError(null);
      }
      if (b.success) {
        setStops(b.items);
        if (!collegaId && b.items[0]) setCollegaId(b.items[0].id);
      }
    });
  }

  useEffect(() => {
    reload();
  }, [essiccatore.id]);

  useEffect(() => {
    function onEsec() {
      reload();
    }
    window.addEventListener(REG_ESEC_EVENT, onEsec);
    return () => window.removeEventListener(REG_ESEC_EVENT, onEsec);
  }, [essiccatore.id]);

  function openEdit(item: AzioneRegistrata) {
    setEditId(item.id);
    setDeleteId(null);
    setEditNome(item.nome);
    setEditNote(item.descrizione);
    setEditTemp(item.tempBruciatoreC);
    setEditVent(item.percVentilazione);
    setEditInfinito(item.durataMinuti == null);
    setEditDurataValore(
      item.durataMinuti != null && item.durataMinuti % 60 === 0
        ? item.durataMinuti / 60
        : item.durataMinuti ?? 60
    );
    setEditDurataUnita(
      item.durataMinuti != null && item.durataMinuti % 60 === 0
        ? "ore"
        : "minuti"
    );
    setEditStopId(item.programmaSpegnimentoId ?? "");
    const stop = stops.find((s) => s.id === item.programmaSpegnimentoId);
    setEditStopTemp(stop?.tempBruciatoreC ?? TEMP_BRUCIATORE_MIN_C);
    setEditStopVent(stop?.percVentilazione ?? 70);
  }

  const altroInCorso = items.some((i) => i.esecuzioneStato === "in_corso");

  return (
    <Shell
      title="Azioni registrate"
      subtitle={`${essiccatore.nome} · catalogo riutilizzabile`}
      onClose={onClose}
    >
      <p className="text-xs text-[var(--muted)]">
        Ogni programma di avvio ha un contro-programma di spegnimento. Avvia
        lancia la messaggistica; Arresta esegue lo spegnimento collegato.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--border)]">
        <button
          type="button"
          aria-expanded={creaOpen}
          onClick={() => setCreaOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium hover:bg-slate-50"
        >
          Crea nuova
          <span
            className={`text-xs text-[var(--muted)] transition-transform ${
              creaOpen ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
        </button>
        {creaOpen ? (
          <form
            className="space-y-4 border-t border-[var(--border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const minuti = durataInfinito
                ? null
                : durataToMinuti(durataValore, durataUnita);
              if (!durataInfinito && (!minuti || minuti < 1)) {
                setError("Imposta una durata valida oppure scegli Infinito.");
                return;
              }
              start(async () => {
                const res = await createAzioneRegistrataAction({
                  essiccatoreId: essiccatore.id,
                  nome,
                  tempBruciatoreC: temp,
                  percVentilazione: vent,
                  durataMinuti: minuti,
                  descrizione: note,
                  spegnimentoMode,
                  programmaSpegnimentoId:
                    spegnimentoMode === "collega" ? collegaId : null,
                });
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                setNome("");
                setNote("");
                setDurataInfinito(true);
                setDurataValore(60);
                setDurataUnita("minuti");
                setSpegnimentoMode("crea");
                setCreaOpen(false);
                reload();
              });
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                minLength={2}
                placeholder="Nome dell’azione"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Spiegazione dell’azione: scopo, quando usarla, avvertenze…"
                className="w-full resize-y rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <RegistrataSetpointFields
              temp={temp}
              setTemp={setTemp}
              vent={vent}
              setVent={setVent}
            />
            <RegistrataDurataFields
              infinito={durataInfinito}
              setInfinito={setDurataInfinito}
              valore={durataValore}
              setValore={setDurataValore}
              unita={durataUnita}
              setUnita={setDurataUnita}
            />
            <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-sm font-medium">
                Programma di spegnimento
              </legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="spegnimento-mode"
                  checked={spegnimentoMode === "crea"}
                  onChange={() => setSpegnimentoMode("crea")}
                />
                <span>
                  Crea il contro-programma (bruciatore Off, ventola On)
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="spegnimento-mode"
                  checked={spegnimentoMode === "collega"}
                  onChange={() => setSpegnimentoMode("collega")}
                />
                <span>Collega un programma di spegnimento già creato</span>
              </label>
              {spegnimentoMode === "collega" ? (
                stops.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Non ci sono ancora programmi di spegnimento. Usa la
                    creazione automatica.
                  </p>
                ) : (
                  <select
                    value={collegaId}
                    onChange={(e) => setCollegaId(e.target.value)}
                    required
                    className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                  >
                    {stops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome} · {s.percVentilazione}% ventola
                      </option>
                    ))}
                  </select>
                )
              ) : null}
            </fieldset>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Registra azione
            </button>
          </form>
        ) : null}
      </div>

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            Nessuna azione registrata.
          </li>
        ) : (
          items.map((item) => {
            const inCorso = item.esecuzioneStato === "in_corso";
            const canStart = !inCorso && !altroInCorso;
            return (
              <li
                key={item.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  inCorso
                    ? "border-emerald-400 bg-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{item.nome}</span>
                    {inCorso ? (
                      <span className="ml-2 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Acceso
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {item.tempBruciatoreC}°C · ventola {item.percVentilazione}%
                      · {formatDurataMinuti(item.durataMinuti)} · v
                      {item.versione}
                    </span>
                    {item.programmaSpegnimentoNome ? (
                      <span className="mt-0.5 block text-xs text-slate-600">
                        Spegnimento: {item.programmaSpegnimentoNome}
                      </span>
                    ) : null}
                    {item.descrizione.trim() ? (
                      <span className="mt-1 block text-xs text-slate-700">
                        {item.descrizione}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {inCorso ? (
                      <button
                        type="button"
                        disabled={pending}
                        title="Arresta"
                        onClick={() =>
                          start(async () => {
                            const res = await arrestaAzioneRegistrataAction({
                              id: item.id,
                            });
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            onArrestoRegistrato?.(res.item, item.id);
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <FaStop size={10} />
                        Arresta
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending || !canStart}
                        title={
                          altroInCorso
                            ? "Arresta il programma in corso prima di avviarne un altro"
                            : "Avvia"
                        }
                        onClick={() =>
                          start(async () => {
                            const res = await avviaAzioneRegistrataAction({
                              id: item.id,
                            });
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            reload();
                            onAvvioRegistrato?.(res.item);
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <FaPlay size={10} />
                        Avvia
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending || inCorso}
                      title="Modifica"
                      aria-label={`Modifica ${item.nome}`}
                      onClick={() =>
                        editId === item.id ? setEditId(null) : openEdit(item)
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <FaPen size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={pending || inCorso}
                      title="Elimina"
                      aria-label={`Elimina ${item.nome}`}
                      onClick={() => {
                        setEditId(null);
                        setDeleteId(item.id);
                        setDeleteStep(1);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
                    >
                      <FaTrash size={12} />
                    </button>
                  </div>
                </div>

                {deleteId === item.id ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                    {deleteStep === 1 ? (
                      <>
                        <p className="font-medium">Prima conferma</p>
                        <p className="mt-0.5">
                          Vuoi archiviare «{item.nome}»? Il dato non viene
                          cancellato fisicamente.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteId(null)}
                            className="rounded border border-red-200 bg-white px-2 py-1"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteStep(2)}
                            className="rounded bg-red-700 px-2 py-1 font-medium text-white"
                          >
                            Continua
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Seconda conferma</p>
                        <p className="mt-0.5">
                          Conferma definitiva: archivia il programma e il
                          contro-spegnimento se non è usato da altri.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteId(null)}
                            className="rounded border border-red-200 bg-white px-2 py-1"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const res =
                                  await softDeleteAzioneRegistrataAction({
                                    id: item.id,
                                  });
                                if (!res.success) setError(res.error);
                                else {
                                  setDeleteId(null);
                                  reload();
                                }
                              })
                            }
                            className="rounded bg-red-800 px-2 py-1 font-medium text-white disabled:opacity-50"
                          >
                            Archivia
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {editId === item.id ? (
                  <form
                    className="mt-3 space-y-3 border-t border-[var(--border)] pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const minuti = editInfinito
                        ? null
                        : durataToMinuti(editDurataValore, editDurataUnita);
                      if (!editInfinito && (!minuti || minuti < 1)) {
                        setError("Imposta una durata valida oppure Infinito.");
                        return;
                      }
                      start(async () => {
                        const res = await updateAzioneRegistrataAction({
                          id: item.id,
                          nome: editNome,
                          descrizione: editNote,
                          tempBruciatoreC: editTemp,
                          percVentilazione: editVent,
                          durataMinuti: minuti,
                          programmaSpegnimentoId: editStopId || null,
                          spegnimentoTempC: editStopTemp,
                          spegnimentoVent: editStopVent,
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setEditId(null);
                        reload();
                      });
                    }}
                  >
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Nome</span>
                      <input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        required
                        minLength={2}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Note</span>
                      <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        className="w-full resize-y rounded-lg border border-[var(--border)] px-3 py-2"
                      />
                    </label>
                    <RegistrataSetpointFields
                      temp={editTemp}
                      setTemp={setEditTemp}
                      vent={editVent}
                      setVent={setEditVent}
                    />
                    <RegistrataDurataFields
                      infinito={editInfinito}
                      setInfinito={setEditInfinito}
                      valore={editDurataValore}
                      setValore={setEditDurataValore}
                      unita={editDurataUnita}
                      setUnita={setEditDurataUnita}
                    />
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">
                        Programma di spegnimento
                      </span>
                      <select
                        value={editStopId}
                        onChange={(e) => {
                          setEditStopId(e.target.value);
                          const s = stops.find((x) => x.id === e.target.value);
                          if (s) {
                            setEditStopTemp(s.tempBruciatoreC);
                            setEditStopVent(s.percVentilazione);
                          }
                        }}
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      >
                        {stops.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs font-medium text-slate-600">
                      Setpoint dello spegnimento (bruciatore Off in esecuzione)
                    </p>
                    <RegistrataSetpointFields
                      temp={editStopTemp}
                      setTemp={setEditStopTemp}
                      vent={editStopVent}
                      setVent={setEditStopVent}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Salva
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                      >
                        Annulla
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })
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
  const [seqs, setSeqs] = useState<ActionSequenza[]>([]);
  const [items, setItems] = useState<AzioneProgrammata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sequenzaId, setSequenzaId] = useState("");
  const [eseguiAt, setEseguiAt] = useState(toLocalInput());

  function reload() {
    void Promise.all([
      listSequenzeAction({ essiccatoreId: essiccatore.id }),
      listAzioniProgrammateAction({ essiccatoreId: essiccatore.id }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        const ok = a.items.filter((s) => s.documentoStato === "approvato");
        setSeqs(ok);
        if (!sequenzaId && ok[0]) setSequenzaId(ok[0].id);
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
      subtitle={`${essiccatore.nome} · esegui una sequenza a data/ora`}
      onClose={onClose}
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {seqs.length === 0 ? (
        <p className="text-sm text-amber-800">
          Prima crea e approva una sequenza in «Sequenze».
        </p>
      ) : (
        <form
          className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createAzioneProgrammataAction({
                essiccatoreId: essiccatore.id,
                sequenzaId,
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
            <span className="mb-1 block font-medium">Sequenza</span>
            <select
              value={sequenzaId}
              onChange={(e) => setSequenzaId(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              {seqs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} · {SEQUENZA_TIPO_LABEL[r.tipo]} · {r.passi.length}{" "}
                  Action
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
  const [seqs, setSeqs] = useState<ActionSequenza[]>([]);
  const [items, setItems] = useState<ProcessoAzione[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [passi, setPassi] = useState<string[]>(["", ""]);

  function reload() {
    void Promise.all([
      listSequenzeAction({ essiccatoreId: essiccatore.id }),
      listProcessiAction({ essiccatoreId: essiccatore.id }),
    ]).then(([a, b]) => {
      if (!a.success) setError(a.error);
      else {
        const ok = a.items.filter((s) => s.documentoStato === "approvato");
        setSeqs(ok);
        setPassi((prev) =>
          prev.map((id, i) => id || ok[i]?.id || ok[0]?.id || "")
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
      subtitle={`${essiccatore.nome} · insieme di sequenze`}
      onClose={onClose}
    >
      <p className="text-xs text-[var(--muted)]">
        Un processo è un insieme di almeno due sequenze approvate.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {seqs.length < 2 ? (
        <p className="text-sm text-amber-800">
          Servono almeno due sequenze approvate per creare un processo.
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
                sequenzaIds: passi.filter(Boolean),
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
                {seqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome} · {SEQUENZA_TIPO_LABEL[r.tipo]} · {r.passi.length}{" "}
                    Action
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setPassi((prev) => [...prev, seqs[0]?.id ?? ""])
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
