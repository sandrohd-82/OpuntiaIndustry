"use client";

import { useId, useState, type FormEvent } from "react";
import { createReferenteRicezioneMerceAction } from "@/app/actions/campionature";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { formatIndirizzoSede } from "@/lib/amministrazione/campionature";
import { emptySede } from "@/lib/amministrazione/fornitori";

type Props = {
  clienteId: string;
  clienteLabel: string;
  onClose: () => void;
  onSaved: (result: {
    referenteId: string;
    destinatario: string;
    indirizzo: string;
    isPrivato: boolean;
    label: string;
  }) => void;
};

export function CampionaturaAltroPostoModal({
  clienteId,
  clienteLabel,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [isPrivato, setIsPrivato] = useState(false);
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [sede, setSede] = useState(emptySede());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const indirizzo = formatIndirizzoSede(sede);
    if (!indirizzo) {
      setError("Compila l’indirizzo di spedizione.");
      return;
    }
    if (!isPrivato && !ragioneSociale.trim()) {
      setError("Indica la ragione sociale del destinatario.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createReferenteRicezioneMerceAction({
      clienteId,
      clienteLabel,
      isPrivato,
      ragioneSociale,
      nome,
      cognome,
      telefono,
      email,
      indirizzo,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved({
      referenteId: result.id,
      destinatario: result.destinatario,
      indirizzo,
      isPrivato,
      label: result.label,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold">
          Spedisci in altro posto
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          I dati vengono salvati come referente «Ricezione merce» sull’azienda
          selezionata.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsPrivato(false)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                !isPrivato
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              Azienda
            </button>
            <button
              type="button"
              onClick={() => setIsPrivato(true)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                isPrivato
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              Privato
            </button>
          </div>

          {!isPrivato ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ragione sociale</span>
              <input
                required
                value={ragioneSociale}
                onChange={(e) => setRagioneSociale(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {isPrivato ? "Nome" : "Referente sul citofono — nome"}
              </span>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {isPrivato ? "Cognome" : "Cognome"}
              </span>
              <input
                required
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Cellulare{" "}
                <span className="font-normal text-[var(--muted)]">
                  (consigliato)
                </span>
              </span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Email{" "}
                <span className="font-normal text-[var(--muted)]">
                  (consigliata)
                </span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <AddressSedeFields
            title="Indirizzo di spedizione"
            value={sede}
            onChange={setSede}
            requiredFields
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Salva destinatario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
