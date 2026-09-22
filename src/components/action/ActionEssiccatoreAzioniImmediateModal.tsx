"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FaBolt, FaCheck, FaFan, FaFire, FaPencil } from "react-icons/fa6";
import {
  avviaEssiccatoreAction,
  getCondizioniAvvioAutoAction,
} from "@/app/actions/action-essiccatore-azioni";
import {
  ClockArcPercentGauge,
  BURNER_FROM,
  BURNER_TO,
  VENT_FROM,
  VENT_TO,
} from "@/components/action/ClockArcPercentGauge";
import {
  TEMP_BRUCIATORE_MAX_C,
  TEMP_BRUCIATORE_MIN_C,
  type ActionEssiccatoreAzione,
} from "@/lib/action/azioni-immediate";
import type { CondizioniAvvioAuto } from "@/lib/action/essiccatore-condizioni-auto";
import type { ActionEssiccatore } from "@/lib/action/essiccatori";

type Props = {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
  onAvvioRegistrato: (azione: ActionEssiccatoreAzione) => void;
};

type PassoAvvio =
  | "carico"
  | "temp"
  | "vent"
  | "on_ventola"
  | "on_bruciatore"
  | "avvia";

const HINT =
  "ring-2 ring-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.55)] animate-pulse";
const IDLE_MS = 5000;

function ConsentSwitch({
  checked,
  onChange,
  label,
  onColorClass,
  disabled = false,
  hint = false,
  onDisabledClick,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onColorClass: string;
  disabled?: boolean;
  hint?: boolean;
  onDisabledClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-1 py-1 ${
        hint ? HINT : ""
      }`}
    >
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <span
        className="relative inline-flex"
        onPointerDown={(e) => {
          if (!disabled) return;
          e.preventDefault();
          e.stopPropagation();
          onDisabledClick?.();
        }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onChange(!checked);
          }}
          className={`relative inline-flex h-9 w-[4.75rem] shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? onColorClass : "bg-slate-300"
          }`}
        >
          <span
            className={`pointer-events-none absolute text-xs font-semibold uppercase tracking-wide text-white transition-opacity ${
              checked ? "left-2 opacity-100" : "left-2 opacity-0"
            }`}
          >
            On
          </span>
          <span
            className={`pointer-events-none absolute text-xs font-semibold uppercase tracking-wide text-slate-600 transition-opacity ${
              checked ? "right-2 opacity-0" : "right-2.5 opacity-100"
            }`}
          >
            Off
          </span>
          <span
            className={`absolute top-0.5 h-8 w-8 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform duration-200 ${
              checked ? "translate-x-[2.45rem]" : "translate-x-0.5"
            }`}
          />
        </button>
      </span>
    </div>
  );
}

export function ActionEssiccatoreAzioniImmediateModal({
  essiccatore,
  onClose,
  onAvvioRegistrato,
}: Props) {
  const titleId = useId();
  const [consensoBruciatore, setConsensoBruciatore] = useState(false);
  const [tempBruciatoreC, setTempBruciatoreC] = useState(50);
  const [tempImpostata, setTempImpostata] = useState(true);
  const [consensoVentola, setConsensoVentola] = useState(false);
  const [percVentilazione, setPercVentilazione] = useState(40);
  const [ventImpostata, setVentImpostata] = useState(true);
  const [auto, setAuto] = useState<CondizioniAvvioAuto | null>(null);
  const [kgEdit, setKgEdit] = useState(false);
  const [kgManuale, setKgManuale] = useState<number | null>(null);
  const [kgManualeConfermato, setKgManualeConfermato] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintOn, setHintOn] = useState(true);
  const [pending, startTransition] = useTransition();
  const lastAct = useRef(Date.now());
  const kgInputRef = useRef<HTMLInputElement>(null);

  const kgDaFoglio = auto?.kgFonte === "foglio";
  const kgProdotto =
    kgManualeConfermato && kgManuale != null
      ? kgManuale
      : (auto?.kgProdotto ?? 0);
  const kgPronto = kgDaFoglio || kgManualeConfermato;
  const tempAmbienteC = auto?.tempAmbienteC ?? 20;
  const umiditaAmbientePct = auto?.umiditaAmbientePct ?? 50;

  const consensiSbloccati = tempImpostata && ventImpostata;
  const canAvvia =
    kgPronto &&
    consensiSbloccati &&
    consensoBruciatore &&
    consensoVentola &&
    !pending;

  const passo: PassoAvvio = !kgPronto
    ? "carico"
    : !tempImpostata
      ? "temp"
      : !ventImpostata
        ? "vent"
        : !consensoVentola
          ? "on_ventola"
          : !consensoBruciatore
            ? "on_bruciatore"
            : "avvia";

  function noteActivity() {
    lastAct.current = Date.now();
    setHintOn(false);
  }

  function pingHint() {
    setHintOn(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    void getCondizioniAvvioAutoAction(essiccatore.id).then((res) => {
      if (res.success) setAuto(res.condizioni);
    });
  }, [essiccatore.id]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (Date.now() - lastAct.current >= IDLE_MS) setHintOn(true);
    }, 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (kgEdit) kgInputRef.current?.focus();
  }, [kgEdit]);

  function impostaTemperatura(value: number) {
    setTempBruciatoreC(value);
    setTempImpostata(true);
  }

  function impostaVentilazione(value: number) {
    setPercVentilazione(value);
    if (value > 0) {
      setVentImpostata(true);
      return;
    }
    setVentImpostata(false);
    setConsensoVentola(false);
    setConsensoBruciatore(false);
  }

  function confermaKgManuale() {
    const n = kgManuale ?? 0;
    setKgManuale(n);
    setKgManualeConfermato(true);
    setKgEdit(false);
  }

  function confermaKgZero() {
    setKgManuale(0);
    setKgManualeConfermato(true);
    setKgEdit(false);
    setError(null);
  }

  function submitAvvio() {
    if (!kgPronto) {
      setError("Conferma 0 kg (visto verde) o modifica il carico (matita).");
      pingHint();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await avviaEssiccatoreAction({
        essiccatoreId: essiccatore.id,
        consensoBruciatore,
        tempBruciatoreC,
        consensoVentola,
        percVentilazione,
        ...(kgManualeConfermato && kgManuale != null
          ? { kgManuale }
          : {}),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onAvvioRegistrato(res.item);
    });
  }

  const hint = (p: PassoAvvio) => hintOn && passo === p;

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
        onPointerDown={noteActivity}
        onKeyDown={noteActivity}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Azioni immediate
            </h2>
            <p className="text-sm text-[var(--muted)]">{essiccatore.nome}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
              <FaBolt size={12} />
              Avvio essiccatore
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Carico cestone
                </p>
                <button
                  type="button"
                  title="Modifica carico"
                  aria-label="Modifica carico cestone"
                  onClick={() => {
                    setKgEdit(true);
                    setKgManuale(kgProdotto);
                  }}
                  className={`rounded p-1 hover:bg-white ${
                    kgEdit
                      ? "bg-white text-slate-800 ring-1 ring-slate-300"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FaPencil size={11} />
                </button>
              </div>
              {kgEdit ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={kgInputRef}
                    type="number"
                    min={0}
                    max={8000}
                    step={1}
                    value={kgManuale ?? 0}
                    onChange={(e) =>
                      setKgManuale(Number(e.target.value) || 0)
                    }
                    onBlur={confermaKgManuale}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confermaKgManuale();
                      }
                    }}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold tabular-nums"
                  />
                  <span className="text-xs text-slate-500">kg</span>
                </div>
              ) : (
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {kgProdotto.toLocaleString("it-IT")} kg
                </p>
              )}
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-[11px] leading-4 text-slate-500">
                  {kgManualeConfermato && kgManuale === 0
                    ? "0 kg confermati."
                    : kgManualeConfermato
                      ? "Carico immediato (manuale)."
                      : kgDaFoglio
                        ? auto?.kgNota
                        : "Visto verde = 0 kg. Matita = altra quantità."}
                </p>
                <button
                  type="button"
                  title="Conferma 0 kg"
                  aria-label="Conferma carico cestone 0 kg"
                  onClick={confermaKgZero}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                    kgManualeConfermato && kgManuale === 0 && !kgEdit
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : hint("carico")
                        ? `border-emerald-500 bg-emerald-50 text-emerald-700 ${HINT}`
                        : "border-emerald-400 bg-white text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  <FaCheck size={12} />
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Aria ingresso
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {tempAmbienteC}°C
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Sonda TEMP-AMB
                {auto?.climaLettoAt
                  ? ` · ${new Date(auto.climaLettoAt).toLocaleString("it-IT")}`
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Umidità
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {umiditaAmbientePct}%
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Sonda UMID-AMB · storico in DB
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section
              className={`rounded-xl border bg-orange-50/40 p-3 ${
                hint("temp")
                  ? `border-amber-400 ${HINT}`
                  : "border-orange-100"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-orange-950">
                <FaFire className="text-orange-600" />
                Bruciatore
              </div>
              <ClockArcPercentGauge
                label="Temperatura"
                value={tempBruciatoreC}
                onChange={impostaTemperatura}
                min={TEMP_BRUCIATORE_MIN_C}
                max={TEMP_BRUCIATORE_MAX_C}
                unit="°C"
                ticks={[35, 45, 55, 65, 70]}
                fromColor={BURNER_FROM}
                toColor={BURNER_TO}
              />
              <ConsentSwitch
                label="Consenso bruciatore"
                checked={consensoBruciatore}
                onChange={setConsensoBruciatore}
                onColorClass="bg-orange-500"
                disabled={!consensiSbloccati}
                hint={hint("on_bruciatore")}
                onDisabledClick={pingHint}
              />
            </section>

            <section
              className={`rounded-xl border bg-sky-50/40 p-3 ${
                hint("vent") ? `border-amber-400 ${HINT}` : "border-sky-100"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-950">
                <FaFan className="text-sky-600" />
                Ventola
              </div>
              <ClockArcPercentGauge
                label="Ventilazione"
                value={percVentilazione}
                onChange={impostaVentilazione}
                fromColor={VENT_FROM}
                toColor={VENT_TO}
              />
              <ConsentSwitch
                label="Consenso ventola"
                checked={consensoVentola}
                onChange={setConsensoVentola}
                onColorClass="bg-sky-500"
                disabled={!consensiSbloccati}
                hint={hint("on_ventola")}
                onDisabledClick={pingHint}
              />
            </section>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <span
              className="flex-1"
              onPointerDown={(e) => {
                if (canAvvia) return;
                e.preventDefault();
                e.stopPropagation();
                pingHint();
              }}
            >
              <button
                type="button"
                disabled={!canAvvia}
                onClick={submitAvvio}
                className={`w-full rounded-lg bg-amber-500 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                  hint("avvia") ? HINT : ""
                }`}
              >
                {pending ? "Registrazione…" : "Avvia essiccatore"}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
