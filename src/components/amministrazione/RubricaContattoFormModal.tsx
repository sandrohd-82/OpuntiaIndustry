"use client";

import { useEffect, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  createRubricaContattoAction,
  listAziendeRubricaPickerAction,
} from "@/app/actions/rubrica";
import {
  AZIENDA_TIPO_LABELS,
  RAPPORTO_LABELS,
  type RubricaAziendaTipo,
  type RubricaContatto,
  type RubricaRapporto,
} from "@/lib/rubrica/types";

type Props = {
  onClose: () => void;
  onCreated: (item: RubricaContatto) => void;
  /** Prefill azienda (es. da form possibile cliente) */
  defaultAziendaTipo?: RubricaAziendaTipo;
  defaultAziendaLabel?: string;
  elevated?: boolean;
};

export function RubricaContattoFormModal({
  onClose,
  onCreated,
  defaultAziendaTipo = "nessuna",
  defaultAziendaLabel = "",
  elevated = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [rapporto, setRapporto] = useState<RubricaRapporto>("referente");
  const [aziendaTipo, setAziendaTipo] =
    useState<RubricaAziendaTipo>(defaultAziendaTipo);
  const [aziendaId, setAziendaId] = useState<string>("");
  const [aziendaLabel, setAziendaLabel] = useState(
    defaultAziendaTipo === "agrinsicilia"
      ? "Agrinsicilia"
      : defaultAziendaLabel
  );
  const [mansione, setMansione] = useState("");
  const [note, setNote] = useState("");
  const [aziende, setAziende] = useState<{ id: string; label: string }[]>([]);

  const aziendaCollegata = aziendaTipo !== "nessuna";

  useEffect(() => {
    if (aziendaTipo === "nessuna") {
      setAziende([]);
      return;
    }
    void listAziendeRubricaPickerAction(aziendaTipo).then((res) => {
      if (res.success) setAziende(res.items);
      else setAziende([]);
    });
  }, [aziendaTipo]);

  function save() {
    if (!nome.trim() || !cognome.trim() || !telefono.trim() || !rapporto) {
      setError("Compila Nome, Cognome, Telefono e Referente.");
      return;
    }
    startTransition(async () => {
      const res = await createRubricaContattoAction({
        nome,
        cognome,
        telefono,
        email,
        rapporto,
        aziendaTipo,
        aziendaId:
          aziendaTipo === "agrinsicilia" || aziendaTipo === "nessuna"
            ? null
            : aziendaId || null,
        aziendaLabel:
          aziendaTipo === "agrinsicilia"
            ? "Agrinsicilia"
            : aziendaTipo === "nessuna"
              ? ""
              : aziendaLabel ||
                aziende.find((a) => a.id === aziendaId)?.label ||
                "",
        mansione,
        note,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onCreated(res.item);
    });
  }

  return (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 ${
        elevated ? "z-[95]" : "z-[80]"
      }`}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Nuovo contatto rubrica</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Obbligatori: Nome, Cognome, Telefono, Referente. Il resto si può
              completare dopo.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome *</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cognome *</span>
            <input
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Telefono *</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Referente *</span>
            <select
              value={rapporto}
              onChange={(e) => setRapporto(e.target.value as RubricaRapporto)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {(Object.keys(RAPPORTO_LABELS) as RubricaRapporto[]).map((k) => (
                <option key={k} value={k}>
                  {RAPPORTO_LABELS[k]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Tipo di rapporto (Referente / Dipendente / Altro).
            </span>
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Nota</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Es. conosciuto al Sana"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">
              {RAPPORTO_LABELS[rapporto]} → Azienda (facoltativo)
            </span>
            <select
              value={aziendaTipo}
              onChange={(e) => {
                const t = e.target.value as RubricaAziendaTipo;
                setAziendaTipo(t);
                setAziendaId("");
                setAziendaLabel(
                  t === "agrinsicilia"
                    ? "Agrinsicilia"
                    : t === "nessuna"
                      ? ""
                      : ""
                );
              }}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {(Object.keys(AZIENDA_TIPO_LABELS) as RubricaAziendaTipo[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {AZIENDA_TIPO_LABELS[k]}
                  </option>
                )
              )}
            </select>
          </label>

          {aziendaCollegata && aziendaTipo !== "agrinsicilia" ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Seleziona azienda (facoltativo)
              </span>
              <select
                value={aziendaId}
                onChange={(e) => {
                  setAziendaId(e.target.value);
                  const hit = aziende.find((a) => a.id === e.target.value);
                  setAziendaLabel(hit?.label ?? "");
                }}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">— scegli dopo —</option>
                {aziende.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {aziendaCollegata ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Mansione (facoltativa)</span>
              <input
                value={mansione}
                onChange={(e) => setMansione(e.target.value)}
                placeholder="Es. Responsabile acquisti"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={
              pending ||
              !nome.trim() ||
              !cognome.trim() ||
              !telefono.trim() ||
              !rapporto
            }
            onClick={save}
            className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Salva contatto"}
          </button>
        </div>
      </div>
    </div>
  );
}
