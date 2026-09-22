"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaBan,
  FaCircleCheck,
  FaHourglassHalf,
  FaInbox,
  FaMinus,
  FaPaperPlane,
  FaXmark,
} from "react-icons/fa6";
import { BusySpinner } from "@/components/ui/BusyIndicator";
import {
  ackSimulato,
  esitoDaFineSessione,
  MEX_COMMS_SIM,
  ventolaOnConfermata,
  type MexCommsEsitoAvviso,
  type MexCommsFase,
  type MexCommsPasso,
  type MexCommsSessione,
} from "@/lib/action/iot-mex-comms";

type Props = {
  sessione: MexCommsSessione;
  onChiudi: () => void;
  onFine: (esito: MexCommsEsitoAvviso) => void;
};

type SottoFase = "invio" | "attesa";
type StringaStato = "spenta" | "focus" | "eseguita" | "blocco";
type Verso = "out" | "in";

function statoStringhe(
  i: number,
  index: number,
  fase: MexCommsFase,
  sottoFase: SottoFase
): { out: StringaStato; inn: StringaStato } {
  if (fase === "completato") return { out: "eseguita", inn: "eseguita" };
  if (i < index) return { out: "eseguita", inn: "eseguita" };
  if (i > index) return { out: "spenta", inn: "spenta" };
  if (fase === "blocco_sicurezza") {
    if (sottoFase === "invio") return { out: "blocco", inn: "spenta" };
    return { out: "eseguita", inn: "blocco" };
  }
  if (fase === "confermato") return { out: "eseguita", inn: "eseguita" };
  if (sottoFase === "invio") return { out: "focus", inn: "spenta" };
  return { out: "eseguita", inn: "focus" };
}

function etichetta(verso: Verso, stato: StringaStato): string {
  if (verso === "out") {
    if (stato === "focus") return "Invio messaggio";
    if (stato === "eseguita") return "Inviato";
    if (stato === "blocco") return "Invio bloccato";
    return "Invio";
  }
  if (stato === "focus") return "Attesa ricezione";
  if (stato === "eseguita") return "Ricevuto";
  if (stato === "blocco") return "Ricezione bloccata";
  return "Ricezione";
}

function IconaStringa({ verso, stato }: { verso: Verso; stato: StringaStato }) {
  const pulse = stato === "focus" ? "mex-string-focus-icon" : "";
  if (stato === "blocco") {
    return <FaBan className={`text-red-600 ${pulse}`} size={13} />;
  }
  if (verso === "out") {
    if (stato === "eseguita") {
      return <FaCircleCheck className="text-sky-600" size={14} />;
    }
    return (
      <FaPaperPlane
        className={stato === "focus" ? `text-sky-600 ${pulse}` : "text-slate-300"}
        size={13}
      />
    );
  }
  if (stato === "eseguita") {
    return <FaCircleCheck className="text-emerald-600" size={14} />;
  }
  if (stato === "focus") {
    return <FaHourglassHalf className={`text-amber-600 ${pulse}`} size={13} />;
  }
  return <FaInbox className="text-slate-300" size={13} />;
}

function classiStringa(stato: StringaStato, verso: Verso): string {
  if (stato === "spenta") {
    return "border-slate-100 bg-slate-50/70 text-slate-400 opacity-45";
  }
  if (stato === "blocco") {
    return "mex-string-focus border-red-300 bg-red-50 text-red-950";
  }
  if (stato === "focus") {
    return verso === "out"
      ? "mex-string-focus border-sky-300 bg-sky-50 text-sky-950"
      : "mex-string-focus border-amber-300 bg-amber-50 text-amber-950";
  }
  return verso === "out"
    ? "mex-string-on border-sky-300 bg-sky-100 text-sky-950"
    : "mex-string-on border-emerald-300 bg-emerald-100 text-emerald-950";
}

function MexStringa({
  verso,
  stato,
  titolo,
  hex,
  extra,
  compatto,
  focused,
  focusRef,
}: {
  verso: Verso;
  stato: StringaStato;
  titolo: string;
  hex: string;
  extra?: string;
  compatto?: boolean;
  focused?: boolean;
  focusRef?: (el: HTMLLIElement | null) => void;
}) {
  return (
    <li
      ref={focused ? focusRef : undefined}
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${classiStringa(
        stato,
        verso
      )}`}
    >
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          stato === "spenta"
            ? "bg-slate-100"
            : verso === "out"
              ? "bg-sky-200/80"
              : stato === "focus"
                ? "bg-amber-200/80"
                : "bg-emerald-200/80"
        }`}
      >
        <IconaStringa verso={verso} stato={stato} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`text-[10px] font-bold uppercase tracking-wide ${
              stato === "spenta"
                ? "text-slate-400"
                : verso === "out"
                  ? "text-sky-800"
                  : stato === "focus"
                    ? "text-amber-800"
                    : "text-emerald-800"
            }`}
          >
            {etichetta(verso, stato)}
          </span>
          <span
            className={`truncate text-sm ${
              stato === "spenta" ? "font-normal" : "font-semibold"
            }`}
          >
            {titolo}
          </span>
          {extra ? (
            <span className="ml-auto font-mono text-[11px] tabular-nums">
              {extra}
            </span>
          ) : null}
        </div>
        {compatto ? null : (
          <p
            className={`mt-0.5 break-all font-mono text-[10px] leading-4 tracking-wide ${
              stato === "spenta" ? "text-slate-400" : "text-slate-700"
            }`}
          >
            {hex}
          </p>
        )}
      </div>
    </li>
  );
}

function stringaInFocus(
  passi: MexCommsPasso[],
  index: number,
  fase: MexCommsFase,
  sottoFase: SottoFase,
  restaLabel: string
): {
  verso: Verso;
  stato: StringaStato;
  titolo: string;
  hex: string;
  extra?: string;
} | null {
  const passo = passi[index] ?? passi[passi.length - 1];
  if (!passo) return null;
  const st = statoStringhe(index, index, fase, sottoFase);
  const ack = ackSimulato(passo.frame);
  if (st.out === "focus" || st.out === "blocco") {
    return {
      verso: "out",
      stato: st.out,
      titolo: passo.titolo,
      hex: passo.frame.hexSpaced,
    };
  }
  if (st.inn === "focus" || st.inn === "blocco") {
    return {
      verso: "in",
      stato: st.inn,
      titolo: ack.titolo,
      hex: ack.frame.hexSpaced,
      extra: fase === "attesa" ? restaLabel : undefined,
    };
  }
  return {
    verso: "in",
    stato: st.inn === "eseguita" ? "eseguita" : st.out,
    titolo: st.inn === "eseguita" ? ack.titolo : passo.titolo,
    hex: st.inn === "eseguita" ? ack.frame.hexSpaced : passo.frame.hexSpaced,
  };
}

function ProcessoStringhe({
  passi,
  index,
  fase,
  sottoFase,
  restaLabel,
  compatto,
  focusRef,
}: {
  passi: MexCommsPasso[];
  index: number;
  fase: MexCommsFase;
  sottoFase: SottoFase;
  restaLabel: string;
  compatto?: boolean;
  focusRef: (el: HTMLLIElement | null) => void;
}) {
  return (
    <ol className={`space-y-3 ${compatto ? "space-y-2" : ""}`}>
      {passi.map((passo, i) => {
        const st = statoStringhe(i, index, fase, sottoFase);
        const ack = ackSimulato(passo.frame);
        const extraIn =
          st.inn === "focus" && fase === "attesa" ? restaLabel : undefined;
        return (
          <li key={passo.id} className="space-y-1">
            <p
              className={`px-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                i < index || fase === "completato"
                  ? "text-emerald-700"
                  : i === index
                    ? "text-slate-700"
                    : "text-slate-400"
              }`}
            >
              Fase {i + 1} di {passi.length}
              {i < index || fase === "completato" || fase === "confermato"
                ? " · eseguita"
                : i === index
                  ? " · in corso"
                  : ""}
            </p>
            <ol className="space-y-1">
              <MexStringa
                verso="out"
                stato={st.out}
                titolo={passo.titolo}
                hex={passo.frame.hexSpaced}
                compatto={compatto}
                focused={st.out === "focus" || st.out === "blocco"}
                focusRef={focusRef}
              />
              <MexStringa
                verso="in"
                stato={st.inn}
                titolo={ack.titolo}
                hex={ack.frame.hexSpaced}
                extra={extraIn}
                compatto={compatto}
                focused={st.inn === "focus" || st.inn === "blocco"}
                focusRef={focusRef}
              />
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

export function IotMexCommsPanel({ sessione, onChiudi, onFine }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const focusRowRef = useRef<HTMLLIElement | null>(null);

  function bindPanel(el: HTMLElement | null) {
    panelRef.current = el;
  }
  const ignoreOutsideUntil = useRef(0);
  const [ready, setReady] = useState(false);
  const [docked, setDocked] = useState(false);
  const [index, setIndex] = useState(0);
  const [fase, setFase] = useState<MexCommsFase>("attesa");
  const [sottoFase, setSottoFase] = useState<SottoFase>("invio");
  const [restaSec, setRestaSec] = useState(
    Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000)
  );

  const passi = sessione.passi;
  const visibile = passi[index] ?? passi[passi.length - 1];

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    ignoreOutsideUntil.current = Date.now() + 400;
    setDocked(false);
    setIndex(0);
    setFase("attesa");
    setSottoFase("invio");
    setRestaSec(Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000));
  }, [sessione.id]);

  useEffect(() => {
    setSottoFase("invio");
    const t = window.setTimeout(() => setSottoFase("attesa"), 1400);
    return () => window.clearTimeout(t);
  }, [index, sessione.id]);

  useEffect(() => {
    if (fase !== "attesa") return;
    setRestaSec(Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000));
    const t = window.setInterval(() => {
      setRestaSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [fase, index, sessione.id]);

  useEffect(() => {
    if (!passi.length) return;
    let cancelled = false;
    const timers: number[] = [];

    function later(ms: number, fn: () => void) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    }

    function avanza(i: number) {
      const passo = passi[i];
      if (passo?.richiedeVentolaOn && !ventolaOnConfermata(passi, i)) {
        setFase("blocco_sicurezza");
        return;
      }
      later(MEX_COMMS_SIM.attesaConfermaMs, () => {
        setFase("confermato");
        later(MEX_COMMS_SIM.mostraConfermaMs, () => {
          if (i + 1 >= passi.length) {
            setFase("completato");
            return;
          }
          const prossimo = passi[i + 1];
          if (
            prossimo?.richiedeVentolaOn &&
            !ventolaOnConfermata(passi, i + 1)
          ) {
            setFase("blocco_sicurezza");
            return;
          }
          setIndex(i + 1);
          setFase("attesa");
          avanza(i + 1);
        });
      });
    }

    avanza(0);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [sessione.id, passi]);

  useEffect(() => {
    if (fase !== "completato" && fase !== "blocco_sicurezza") return;
    const esito = esitoDaFineSessione(
      fase,
      passi,
      sessione.essiccatoreNome
    );
    if (!esito) return;
    const t = window.setTimeout(() => onFine(esito), 280);
    return () => window.clearTimeout(t);
  }, [fase, passi, sessione.essiccatoreNome, onFine]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (Date.now() < ignoreOutsideUntil.current) return;
      const el = panelRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setDocked(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDocked(true);
    }
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    focusRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index, sottoFase, fase, docked]);

  if (!ready || !visibile) return null;

  const inAttesa = fase === "attesa";
  const blocco = fase === "blocco_sicurezza";
  const fatto = fase === "completato";
  const passoN = Math.min(index + 1, passi.length);
  const mm = String(Math.floor(restaSec / 60)).padStart(2, "0");
  const ss = String(restaSec % 60).padStart(2, "0");
  const restaLabel = `${mm}:${ss}`;

  const statoRiga = blocco
    ? "Blocco sicurezza"
    : inAttesa && sottoFase === "invio"
      ? "Invio messaggio"
      : inAttesa
        ? "Attesa ricezione"
        : fatto
          ? "Scambio completato"
          : "Ricevuto";

  const processo = (
    <ProcessoStringhe
      passi={passi}
      index={index}
      fase={fase}
      sottoFase={sottoFase}
      restaLabel={restaLabel}
      focusRef={(el) => {
        focusRowRef.current = el;
      }}
    />
  );
  const focus = stringaInFocus(passi, index, fase, sottoFase, restaLabel);

  const node = docked ? (
    <button
      ref={bindPanel}
      type="button"
      aria-label="Espandi scambio Mex"
      className="fixed bottom-0 left-1/2 z-[85] w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-t-[2rem] border border-b-0 border-slate-200 bg-white px-3 pb-2.5 pt-2 text-left shadow-[0_-10px_28px_rgba(15,23,42,0.18)] print:hidden"
      onClick={() => setDocked(false)}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Mex · {passoN}/{passi.length} · {statoRiga}
        </p>
        {inAttesa && sottoFase === "invio" ? (
          <FaPaperPlane className="mex-string-focus-icon shrink-0 text-sky-600" size={12} />
        ) : inAttesa ? (
          <span className="font-mono text-[11px] tabular-nums text-amber-800">
            {restaLabel}
          </span>
        ) : blocco ? (
          <FaBan className="shrink-0 text-red-600" size={12} />
        ) : (
          <FaCircleCheck className="shrink-0 text-emerald-600" size={12} />
        )}
      </div>
      {focus ? (
        <ol className="pointer-events-none">
          <MexStringa
            verso={focus.verso}
            stato={focus.stato}
            titolo={focus.titolo}
            hex={focus.hex}
            extra={focus.extra}
            compatto
          />
        </ol>
      ) : null}
    </button>
  ) : (
    <div
      ref={bindPanel}
      role="dialog"
      aria-modal="false"
      aria-label="Scambio Mex"
      className="fixed left-1/2 top-1/2 z-[85] flex max-h-[90vh] w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl print:hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Scambio Mex</p>
          <p className="text-xs text-slate-500">{sessione.essiccatoreNome}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
            Simulazione
          </span>
          <button
            type="button"
            title="Riduci a banner in basso"
            aria-label="Riduci a banner"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() => setDocked(true)}
          >
            <FaMinus size={12} />
          </button>
          <button
            type="button"
            title="Chiudi"
            aria-label="Chiudi scambio Mex"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={onChiudi}
          >
            <FaXmark size={13} />
          </button>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Cadenza: ventola → On ventola → temperatura → apertura → On
            bruciatore.
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-800">
            {passoN}/{passi.length}
          </span>
        </div>

        {processo}

        <div
          className="flex items-center gap-2 text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          {inAttesa && sottoFase === "invio" ? (
            <>
              <FaPaperPlane className="mex-string-focus-icon text-sky-600" size={14} />
              <span className="text-sky-900">Invio messaggio in corso</span>
            </>
          ) : inAttesa ? (
            <>
              <BusySpinner className="h-4 w-4 border-[2.5px]" />
              <span className="text-amber-900">
                In attesa conferma device {restaLabel}
              </span>
            </>
          ) : blocco ? (
            <>
              <FaBan className="text-red-600" size={14} />
              <span className="text-red-800">{statoRiga}</span>
            </>
          ) : (
            <>
              <FaCircleCheck className="text-emerald-600" size={14} />
              <span className="text-emerald-900">{statoRiga}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
