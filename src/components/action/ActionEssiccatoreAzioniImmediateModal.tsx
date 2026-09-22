"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { FaBolt, FaFan, FaFire } from "react-icons/fa6";
import {
  avviaEssiccatoreAction,
  listMlCampioniAction,
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
import {
  APPRENDIMENTO_FINESTRA_MIN,
  CAMPIONI_DIDATTICI,
  ricettaInizialeAvvio,
  type MlCampione,
} from "@/lib/action/essiccatore-apprendimento";
import type { ActionEssiccatore } from "@/lib/action/essiccatori";

type Props = {
  essiccatore: ActionEssiccatore;
  onClose: () => void;
  onAvvioRegistrato: (azione: ActionEssiccatoreAzione) => void;
};

function ConsentSwitch({
  checked,
  onChange,
  label,
  onColorClass,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onColorClass: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-slate-800">{label}</span>
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
    </div>
  );
}

export function ActionEssiccatoreAzioniImmediateModal({
  essiccatore,
  onClose,
  onAvvioRegistrato,
}: Props) {
  const titleId = useId();
  const [campioni, setCampioni] = useState<MlCampione[]>(CAMPIONI_DIDATTICI);
  const [consensoBruciatore, setConsensoBruciatore] = useState(false);
  const [tempBruciatoreC, setTempBruciatoreC] = useState(50);
  const [tempImpostata, setTempImpostata] = useState(true);
  const [consensoVentola, setConsensoVentola] = useState(false);
  const [percVentilazione, setPercVentilazione] = useState(40);
  const [ventImpostata, setVentImpostata] = useState(true);
  const [kgProdotto, setKgProdotto] = useState(0);
  const [tempAmbienteC, setTempAmbienteC] = useState(20);
  const [umiditaAmbientePct, setUmiditaAmbientePct] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ricetta = ricettaInizialeAvvio(
    {
      essiccatoreId: essiccatore.id,
      kgProdotto,
      tempAmbienteC,
      umiditaAmbientePct,
      percVentilazione,
      tempObiettivoC: tempBruciatoreC,
    },
    campioni
  );

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
    void listMlCampioniAction(essiccatore.id).then((res) => {
      if (res.success && res.items.length) setCampioni(res.items);
    });
  }, [essiccatore.id]);

  const consensiSbloccati = tempImpostata && ventImpostata;
  const canAvvia =
    consensiSbloccati && consensoBruciatore && consensoVentola && !pending;

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

  function submitAvvio() {
    setError(null);
    startTransition(async () => {
      const res = await avviaEssiccatoreAction({
        essiccatoreId: essiccatore.id,
        consensoBruciatore,
        tempBruciatoreC,
        consensoVentola,
        percVentilazione,
        kgProdotto,
        tempAmbienteC,
        umiditaAmbientePct,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onAvvioRegistrato(res.item);
    });
  }

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

          <p className="text-sm text-[var(--muted)]">
            Kg e clima cambiano la % bruciatore di partenza. Invio: ventola,
            attesa, On ventola, temperatura, apertura stimata, On bruciatore.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">
                Carico in essiccatore (kg)
              </span>
              <input
                type="number"
                min={0}
                max={8000}
                value={kgProdotto}
                onChange={(e) => setKgProdotto(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">
                Aria ingresso (°C)
              </span>
              <input
                type="number"
                min={-15}
                max={55}
                step={0.5}
                value={tempAmbienteC}
                onChange={(e) => setTempAmbienteC(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">
                Umidità ingresso (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={umiditaAmbientePct}
                onChange={(e) =>
                  setUmiditaAmbientePct(Number(e.target.value) || 0)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2.5 text-sm text-violet-950">
            <p className="font-semibold">Partenza stimata · apprendimento A+</p>
            <p className="mt-1 text-xs leading-5 text-violet-900">
              {kgProdotto === 0
                ? "Scarico libero (vuoto)."
                : `Effetto tappo da ${kgProdotto.toLocaleString("it-IT")} kg.`}{" "}
              Aria {tempAmbienteC}°C / {umiditaAmbientePct}% UR · ventola{" "}
              {percVentilazione}% · obiettivo {tempBruciatoreC}°C · apertura{" "}
              <span className="font-semibold">
                {ricetta.percBruciatorePrevista}%
              </span>
              . {ricetta.stima.spiegazione} Dopo {APPRENDIMENTO_FINESTRA_MIN}{" "}
              minuti si misura la temperatura tenuta e si affina.
            </p>
          </div>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
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
                  />
                </section>

                <section className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
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
                  />
                </section>
              </div>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              {!consensiSbloccati ? (
                <p className="text-sm text-amber-800">
                  Imposta prima Temperatura e Ventilazione (sopra 0%). Poi
                  potrai mettere On entrambi i consensi.
                </p>
              ) : !consensoBruciatore || !consensoVentola ? (
                <p className="text-sm text-amber-800">
                  Porta a On entrambi i consensi per avviare.
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
                <button
                  type="button"
                  disabled={!canAvvia}
                  onClick={submitAvvio}
                  className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Registrazione…" : "Avvia essiccatore"}
                </button>
              </div>
        </div>
      </div>
    </div>
  );
}
