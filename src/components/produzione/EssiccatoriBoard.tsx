"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CONDIZIONE_LABELS,
  FASE_LABELS,
  PRODOTTO_STIMA_PERCENT,
  prodottoStimatoDeltaKg,
  temperaturaTone,
  type Essiccatore,
  type EssiccatoreCondizione,
  type EssiccatorePower,
} from "@/lib/produzione/essiccatori";
import { TemperatureGaugeModal } from "@/components/produzione/TemperatureGaugeModal";
import { VentilationGaugeModal } from "@/components/produzione/VentilationGaugeModal";

type Props = {
  items: Essiccatore[];
};

function toneClasses(tone: EssiccatoreCondizione | null) {
  switch (tone) {
    case "regolare":
      return "text-emerald-600";
    case "hot":
      return "text-red-600";
    case "cold":
      return "text-sky-500";
    default:
      return "text-[var(--foreground)]";
  }
}

function toneBadgeClasses(tone: EssiccatoreCondizione) {
  switch (tone) {
    case "regolare":
      return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/35";
    case "hot":
      return "bg-red-500/15 text-red-700 ring-1 ring-red-500/35";
    case "cold":
      return "bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/35";
  }
}

function formatKg(value: number) {
  return `${value.toLocaleString("it-IT", {
    maximumFractionDigits: 1,
  })}kg`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function formatDuration(accesoDal: string | null, now: number) {
  if (!accesoDal) return "—";
  const start = new Date(accesoDal).getTime();
  if (Number.isNaN(start) || start > now) return "—";

  const totalMinutes = Math.floor((now - start) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}g ${hours} h ${minutes}m`;
  if (hours > 0) return `${hours} h ${minutes}m`;
  return `${minutes}m`;
}

function OnAirBadge({ power }: { power: EssiccatorePower }) {
  const on = power === "acceso";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        on
          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40"
          : "bg-slate-500/10 text-slate-500 ring-1 ring-slate-400/30"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {on && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            on ? "bg-emerald-500" : "bg-slate-400"
          }`}
        />
      </span>
      {on ? "Acceso" : "Spento"}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function useModalChrome(onClose: () => void) {
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
}

type ProceduraSalvata = {
  id: string;
  label: string;
};

const PROCEDURE_SALVATE_DEFAULT: ProceduraSalvata[] = [
  { id: "avvio", label: "Avvio" },
  { id: "essiccazione", label: "Essiccazione" },
  { id: "asciugatura-notturna", label: "Asciugatura notturna" },
  { id: "spegnimento", label: "Spegnimento" },
];

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ActionOptionBox({
  title,
  description,
  danger,
  onClick,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
        danger
          ? "border-red-200 bg-red-50 hover:bg-red-100"
          : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] hover:bg-slate-50"
      }`}
    >
      <p
        className={`text-sm font-semibold ${danger ? "text-red-700" : "text-[var(--foreground)]"}`}
      >
        {title}
      </p>
      {description && (
        <p className={`mt-1 text-xs ${danger ? "text-red-600/80" : "text-[var(--muted)]"}`}>
          {description}
        </p>
      )}
    </button>
  );
}

function PhotoModal({
  item,
  onClose,
}: {
  item: Essiccatore;
  onClose: () => void;
}) {
  const titleId = useId();
  useModalChrome(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {item.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        <div className="bg-slate-100 p-3">
          <img
            src={item.imageSrc}
            alt={`Foto ${item.name}`}
            className="max-h-[70vh] w-full rounded-lg object-cover"
          />
        </div>
      </div>
    </div>
  );
}

function ProcedureSettingsModal({
  procedures,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: {
  procedures: ProceduraSalvata[];
  onClose: () => void;
  onCreate: (label: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const titleId = useId();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  useModalChrome(onClose);

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    onCreate(label);
    setNewLabel("");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Impostazioni procedure
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Modifica, crea o elimina procedure salvate
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="space-y-4 p-4">
          <ul className="space-y-2">
            {procedures.map((proc) => (
              <li
                key={proc.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              >
                {editingId === proc.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = editingLabel.trim();
                      if (!label) return;
                      onRename(proc.id, label);
                      setEditingId(null);
                    }}
                  >
                    <input
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--primary)] px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs"
                    >
                      Annulla
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{proc.label}</span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(proc.id);
                          setEditingLabel(proc.label);
                        }}
                        className="rounded-md px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-100"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(proc.id)}
                        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={submitCreate} className="space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-semibold">Nuova procedura</p>
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Nome procedura"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <button
                type="submit"
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Crea
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function IntervieniModal({
  item,
  onClose,
  onSelect,
  onOpenVentilation,
  onOpenTemperature,
  procedures,
  onProceduresChange,
}: {
  item: Essiccatore;
  onClose: () => void;
  onSelect: (actionLabel: string) => void;
  onOpenVentilation: () => void;
  onOpenTemperature: () => void;
  procedures: ProceduraSalvata[];
  onProceduresChange: (next: ProceduraSalvata[]) => void;
}) {
  const titleId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (settingsOpen) return;
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
  }, [onClose, settingsOpen]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        role="presentation"
        onClick={() => {
          if (!settingsOpen) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                Intervieni
              </h2>
              <p className="text-sm text-[var(--muted)]">{item.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>

          <div className="space-y-3 p-4">
            <ActionOptionBox
              title="Regola ventilazione"
              description="Modifica la portata e la modalità di ventilazione"
              onClick={onOpenVentilation}
            />
            <ActionOptionBox
              title="Regola temperatura"
              description="Imposta il set-point di temperatura"
              onClick={onOpenTemperature}
            />
            <ActionOptionBox
              title="Attiva processo mescolata"
              description="Avvia il ciclo di mescolata del prodotto"
              onClick={() => onSelect("Attiva processo mescolata")}
            />

            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Procedure salvate</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Seleziona una procedura predefinita da eseguire
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex shrink-0 rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-slate-100 hover:text-[var(--foreground)]"
                  title="Impostazioni procedure salvate"
                  aria-label="Impostazioni procedure salvate"
                >
                  <GearIcon />
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {procedures.map((proc) => (
                  <button
                    key={proc.id}
                    type="button"
                    onClick={() => onSelect(`Procedura: ${proc.label}`)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-[var(--primary)] hover:bg-slate-50"
                  >
                    {proc.label}
                  </button>
                ))}
              </div>
            </div>

            <ActionOptionBox
              title="Arresto rapido"
              description="Interrompe immediatamente il ciclo in corso"
              danger
              onClick={() => onSelect("Arresto rapido")}
            />
          </div>
        </div>
      </div>

      {settingsOpen && (
        <ProcedureSettingsModal
          procedures={procedures}
          onClose={() => setSettingsOpen(false)}
          onCreate={(label) => {
            onProceduresChange([
              ...procedures,
              {
                id: `proc-${Date.now()}`,
                label,
              },
            ]);
          }}
          onRename={(id, label) => {
            onProceduresChange(
              procedures.map((p) => (p.id === id ? { ...p, label } : p))
            );
          }}
          onDelete={(id) => {
            onProceduresChange(procedures.filter((p) => p.id !== id));
          }}
        />
      )}
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
      {children}
    </p>
  );
}

function ParamBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      {children}
    </div>
  );
}

function EssiccatoreCard({
  item,
  now,
  onOpenPhoto,
  onIntervieni,
}: {
  item: Essiccatore;
  now: number;
  onOpenPhoto: (item: Essiccatore) => void;
  onIntervieni: (item: Essiccatore) => void;
}) {
  const tempTone = temperaturaTone(
    item.temperaturaImpostataC,
    item.temperaturaRilevataC
  );

  const impostata =
    item.temperaturaImpostataC === null
      ? "—"
      : `${item.temperaturaImpostataC.toLocaleString("it-IT")}°`;
  const rilevata =
    item.temperaturaRilevataC === null
      ? "—"
      : `${item.temperaturaRilevataC.toLocaleString("it-IT")}°`;

  const stimaDelta = prodottoStimatoDeltaKg(item.prodottoCaricatoKg);
  const stimaPercentLabel = PRODOTTO_STIMA_PERCENT.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <article className="flex min-h-[340px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{item.name}</h2>
          <button
            type="button"
            onClick={() => onOpenPhoto(item)}
            className="inline-flex shrink-0 rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-slate-100 hover:text-[var(--foreground)]"
            title={`Vedi foto ${item.name}`}
            aria-label={`Vedi foto ${item.name}`}
          >
            <EyeIcon />
          </button>
        </div>
        <OnAirBadge power={item.power} />
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-3">
        <ParamBox>
          <SectionLabel>Stato</SectionLabel>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <p className="text-lg font-semibold">{FASE_LABELS[item.fase]}</p>
            <span
              className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${toneBadgeClasses(item.condizione)}`}
            >
              {CONDIZIONE_LABELS[item.condizione]}
            </span>
          </div>
        </ParamBox>

        <ParamBox>
          <SectionLabel>Temperatura</SectionLabel>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <p className="text-base font-medium tabular-nums text-[var(--foreground)]">
              Imp. {impostata}
            </p>
            <div className="text-right">
              <p
                className={`text-lg font-semibold tabular-nums leading-tight ${toneClasses(tempTone)}`}
              >
                {rilevata}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatDateTime(item.temperaturaAggiornataIl)}
              </p>
            </div>
          </div>
        </ParamBox>

        <ParamBox>
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Ventilazione</SectionLabel>
            <p className="text-lg font-semibold tabular-nums">
              {Math.round(item.ventilazionePercent)}%
            </p>
          </div>
        </ParamBox>

        <ParamBox>
          <SectionLabel>Tempo di esercizio</SectionLabel>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">Inizio</p>
              <p className="text-base font-medium tabular-nums">
                {formatDateTime(item.accesoDal)}
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {formatDuration(item.accesoDal, now)}
            </p>
          </div>
        </ParamBox>

        <ParamBox>
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Prodotto caricato</SectionLabel>
            <p className="text-lg font-semibold tabular-nums">
              {formatKg(item.prodottoCaricatoKg)}
            </p>
          </div>
        </ParamBox>

        <ParamBox>
          <SectionLabel>Prodotto stimato</SectionLabel>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p className="text-base font-medium">± {stimaPercentLabel}%</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatKg(stimaDelta)}
            </p>
          </div>
        </ParamBox>
      </div>

      <button
        type="button"
        onClick={() => onIntervieni(item)}
        className="mt-5 w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Intervieni
      </button>
    </article>
  );
}

export function EssiccatoriBoard({ items }: Props) {
  const [localItems, setLocalItems] = useState(items);
  const [photoItem, setPhotoItem] = useState<Essiccatore | null>(null);
  const [intervieniItem, setIntervieniItem] = useState<Essiccatore | null>(null);
  const [ventilationItem, setVentilationItem] = useState<Essiccatore | null>(
    null
  );
  const [temperatureItem, setTemperatureItem] = useState<Essiccatore | null>(
    null
  );
  const [procedures, setProcedures] = useState<ProceduraSalvata[]>(
    PROCEDURE_SALVATE_DEFAULT
  );
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const list = useMemo(() => localItems, [localItems]);

  return (
    <>
      {feedback && (
        <p
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {feedback}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => (
          <EssiccatoreCard
            key={item.id}
            item={item}
            now={now}
            onOpenPhoto={setPhotoItem}
            onIntervieni={setIntervieniItem}
          />
        ))}
      </div>
      {photoItem && (
        <PhotoModal item={photoItem} onClose={() => setPhotoItem(null)} />
      )}
      {intervieniItem && !ventilationItem && !temperatureItem && (
        <IntervieniModal
          item={intervieniItem}
          procedures={procedures}
          onProceduresChange={setProcedures}
          onClose={() => setIntervieniItem(null)}
          onOpenVentilation={() => setVentilationItem(intervieniItem)}
          onOpenTemperature={() => setTemperatureItem(intervieniItem)}
          onSelect={(actionLabel) => {
            setFeedback(`${intervieniItem.name}: ${actionLabel}`);
            setIntervieniItem(null);
          }}
        />
      )}
      {ventilationItem && (
        <VentilationGaugeModal
          essiccatoreName={ventilationItem.name}
          currentPercent={ventilationItem.ventilazionePercent}
          onClose={() => setVentilationItem(null)}
          onApply={(percent) => {
            setLocalItems((prev) =>
              prev.map((ess) =>
                ess.id === ventilationItem.id
                  ? { ...ess, ventilazionePercent: percent }
                  : ess
              )
            );
            setFeedback(
              `${ventilationItem.name}: ventilazione impostata a ${percent}%`
            );
            setVentilationItem(null);
            setIntervieniItem(null);
          }}
        />
      )}
      {temperatureItem && (
        <TemperatureGaugeModal
          essiccatoreName={temperatureItem.name}
          currentTempC={temperatureItem.temperaturaImpostataC}
          onClose={() => setTemperatureItem(null)}
          onApply={(tempC) => {
            setLocalItems((prev) =>
              prev.map((ess) =>
                ess.id === temperatureItem.id
                  ? { ...ess, temperaturaImpostataC: tempC }
                  : ess
              )
            );
            setFeedback(
              `${temperatureItem.name}: temperatura impostata a ${tempC}°C`
            );
            setTemperatureItem(null);
            setIntervieniItem(null);
          }}
        />
      )}
    </>
  );
}
