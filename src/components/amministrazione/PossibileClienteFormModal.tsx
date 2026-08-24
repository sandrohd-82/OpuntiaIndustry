"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaChevronDown, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import { listEntityReferentiAction } from "@/app/actions/rubrica";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { ReferentiPickerField } from "@/components/amministrazione/ReferentiPickerField";
import {
  emptyConsegnaAltraAzienda,
  emptySede,
  type ClienteInput,
  type ConsegnaAltraAzienda,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";
import type { RubricaContatto } from "@/lib/rubrica/types";

type Props = {
  mode?: "create" | "edit";
  initial?: ClientePossibile | null;
  onClose: () => void;
  onSave: (
    values: ClienteInput & { referenteIds: string[] }
  ) => boolean | Promise<boolean>;
};

function sameSede(a: SedeCliente, b: SedeCliente) {
  return (
    a.nazione === b.nazione &&
    a.provincia === b.provincia &&
    a.citta === b.citta &&
    a.cap === b.cap &&
    a.indirizzo === b.indirizzo
  );
}

function isSedeFilled(sede: SedeCliente): boolean {
  return Boolean(
    sede.nazione.trim() &&
      sede.provincia.trim() &&
      sede.citta.trim() &&
      sede.cap.trim() &&
      sede.indirizzo.trim()
  );
}

function isSedeEmpty(sede: SedeCliente): boolean {
  return !(
    sede.nazione.trim() ||
    sede.provincia.trim() ||
    sede.citta.trim() ||
    sede.cap.trim() ||
    sede.indirizzo.trim()
  );
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <span>{title}</span>
        <FaChevronDown
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          size={12}
        />
      </button>
      {open ? <div className="border-t border-[var(--border)] p-4">{children}</div> : null}
    </div>
  );
}

export function PossibileClienteFormModal({
  mode = "create",
  initial = null,
  onClose,
  onSave,
}: Props) {
  const isEdit = mode === "edit" && Boolean(initial);
  const titleId = useId();
  const [ragioneSociale, setRagioneSociale] = useState(
    initial?.ragioneSociale ?? ""
  );
  const [partitaIva, setPartitaIva] = useState(initial?.partitaIva ?? "");
  const [codiceFiscale, setCodiceFiscale] = useState(
    initial?.codiceFiscale ?? ""
  );
  const [email, setEmail] = useState(initial?.email ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [pec, setPec] = useState(initial?.pec ?? "");
  const [sdiCode, setSdiCode] = useState(initial?.sdiCode ?? "");
  const [sitoWeb, setSitoWeb] = useState(initial?.sitoWeb ?? "");
  const [sedeAmministrativa, setSedeAmministrativa] = useState(
    initial?.sedeAmministrativa ?? emptySede()
  );
  const [sedeMagazzino, setSedeMagazzino] = useState(
    initial?.sedeMagazzino ?? emptySede()
  );
  const [ammOpen, setAmmOpen] = useState(
    Boolean(initial && !isSedeEmpty(initial.sedeAmministrativa))
  );
  const [magOpen, setMagOpen] = useState(
    Boolean(initial && !isSedeEmpty(initial.sedeMagazzino))
  );
  const [stessaSede, setStessaSede] = useState(
    Boolean(
      initial &&
        !isSedeEmpty(initial.sedeMagazzino) &&
        sameSede(initial.sedeAmministrativa, initial.sedeMagazzino)
    )
  );
  const [consegneOpen, setConsegneOpen] = useState(
    Boolean(initial?.consegneAltraAzienda?.length)
  );
  const [consegne, setConsegne] = useState<ConsegnaAltraAzienda[]>(
    initial?.consegneAltraAzienda?.length
      ? initial.consegneAltraAzienda
      : []
  );
  const [referenti, setReferenti] = useState<RubricaContatto[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial?.id) return;
    void listEntityReferentiAction({
      tipo: "cliente_possibile",
      entityId: initial.id,
    }).then((res) => {
      if (res.success) setReferenti(res.items);
    });
  }, [initial?.id]);

  function buildValues(): (ClienteInput & { referenteIds: string[] }) | null {
    if (!ragioneSociale.trim()) {
      setFormError("Compila la ragione sociale.");
      return null;
    }
    if (!partitaIva.trim()) {
      setFormError("La partita IVA è obbligatoria.");
      return null;
    }
    if (!codiceFiscale.trim()) {
      setFormError("Il codice fiscale è obbligatorio.");
      return null;
    }
    if (ammOpen && !isSedeEmpty(sedeAmministrativa) && !isSedeFilled(sedeAmministrativa)) {
      setFormError("Completa la sede amministrativa oppure chiudila / azzerala.");
      return null;
    }
    if (magOpen && !stessaSede && !isSedeEmpty(sedeMagazzino) && !isSedeFilled(sedeMagazzino)) {
      setFormError("Completa la sede magazzino oppure chiudila / azzerala.");
      return null;
    }
    if (consegneOpen) {
      for (let i = 0; i < consegne.length; i++) {
        const c = consegne[i];
        if (!c.ragioneSociale.trim() || !isSedeFilled(c)) {
          setFormError(`Completa la consegna #${i + 1} oppure rimuovila.`);
          return null;
        }
      }
    }
    setFormError(null);
    return {
      ragioneSociale: ragioneSociale.trim(),
      partitaIva: partitaIva.trim(),
      codiceFiscale: codiceFiscale.trim(),
      isPrivato: false,
      email: email.trim(),
      pec: pec.trim(),
      sdiCode: sdiCode.trim(),
      telefono: telefono.trim(),
      sitoWeb: sitoWeb.trim(),
      sedeAmministrativa: ammOpen ? sedeAmministrativa : emptySede(),
      sedeMagazzino: !magOpen
        ? emptySede()
        : stessaSede
          ? sedeAmministrativa
          : sedeMagazzino,
      consegneAltraAzienda: consegneOpen ? consegne : [],
      prodottiAcquistati: [],
      referenteIds: referenti.map((r) => r.id),
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const values = buildValues();
    if (!values) return;
    setSaving(true);
    try {
      const ok = await onSave(values);
      if (!ok) setFormError("Salvataggio non riuscito. Controlla i dati.");
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {isEdit
                ? "Modifica possibile cliente"
                : "Nuovo possibile cliente"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Solo azienda (cliente privato = no). Sedi chiuse di default.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">R. Sociale *</span>
              <input
                value={ragioneSociale}
                onChange={(e) => setRagioneSociale(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <p className="sm:col-span-2 text-xs text-[var(--muted)]">
              Cliente privato: <strong>NO</strong>
            </p>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">P. IVA *</span>
              <input
                value={partitaIva}
                onChange={(e) => setPartitaIva(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Codice fiscale *</span>
                <input
                  value={codiceFiscale}
                  onChange={(e) => setCodiceFiscale(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setCodiceFiscale(partitaIva.trim())}
                className="text-sm font-medium text-[var(--primary)] hover:underline"
              >
                Copia P.IVA in Codice Fiscale
              </button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Telefono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">PEC</span>
              <input
                type="email"
                value={pec}
                onChange={(e) => setPec(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">SDI</span>
              <input
                value={sdiCode}
                onChange={(e) => setSdiCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Sito Web</span>
              <input
                value={sitoWeb}
                onChange={(e) => setSitoWeb(e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
          </div>

          <Collapsible
            title="Sede Amministrativa"
            open={ammOpen}
            onToggle={() => setAmmOpen((v) => !v)}
          >
            <AddressSedeFields
              title="Sede Amministrativa"
              value={sedeAmministrativa}
              requiredFields={false}
              onChange={(next) => {
                setSedeAmministrativa(next);
                if (magOpen && stessaSede) setSedeMagazzino(next);
              }}
            />
          </Collapsible>

          <Collapsible
            title="Sede Magazzino"
            open={magOpen}
            onToggle={() => setMagOpen((v) => !v)}
          >
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stessaSede}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setStessaSede(checked);
                  if (checked) setSedeMagazzino(sedeAmministrativa);
                }}
              />
              Uguale alla sede amministrativa
            </label>
            {!stessaSede ? (
              <AddressSedeFields
                title="Sede Magazzino"
                value={sedeMagazzino}
                requiredFields={false}
                onChange={setSedeMagazzino}
              />
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Verrà usata la sede amministrativa
                {sameSede(sedeAmministrativa, sedeMagazzino) ? "" : ""}.
              </p>
            )}
          </Collapsible>

          <Collapsible
            title="Consegne presso altre aziende"
            open={consegneOpen}
            onToggle={() => {
              setConsegneOpen((v) => {
                const next = !v;
                if (next && consegne.length === 0) {
                  setConsegne([emptyConsegnaAltraAzienda()]);
                }
                return next;
              });
            }}
          >
            <div className="space-y-4">
              {consegne.map((c, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-[var(--border)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Consegna #{index + 1}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setConsegne((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="text-[var(--muted)] hover:text-red-600"
                    >
                      <FaTrash size={12} />
                    </button>
                  </div>
                  <input
                    value={c.ragioneSociale}
                    onChange={(e) =>
                      setConsegne((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? { ...item, ragioneSociale: e.target.value }
                            : item
                        )
                      )
                    }
                    placeholder="Ragione sociale presso altra azienda"
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <AddressSedeFields
                    title="Indirizzo"
                    value={c}
                    requiredFields={false}
                    onChange={(next) =>
                      setConsegne((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, ...next } : item
                        )
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setConsegne((prev) => [...prev, emptyConsegnaAltraAzienda()])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <FaPlus size={12} />
                Aggiungi indirizzo di consegna
              </button>
            </div>
          </Collapsible>

          <ReferentiPickerField
            value={referenti}
            onChange={setReferenti}
            defaultAziendaTipo="cliente_possibile"
            defaultAziendaLabel={ragioneSociale}
          />

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving
                ? "Salvataggio…"
                : isEdit
                  ? "Salva modifiche"
                  : "Salva possibile cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
