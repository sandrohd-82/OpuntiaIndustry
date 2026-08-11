"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FaChevronDown, FaPlus, FaTrash } from "react-icons/fa6";
import { findAnagraficaArchivioByVatAction } from "@/app/actions/anagrafiche-archivio";
import { previewNextCodiceTargaClienteAction } from "@/app/actions/clienti";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { ProdottiAcquistatiTags } from "@/components/amministrazione/ProdottiAcquistatiTags";
import {
  emptyConsegnaAltraAzienda,
  emptySede,
  type Cliente,
  type ClienteInput,
  type ConsegnaAltraAzienda,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";

const PRODOTTI_PROPRI_NUOVO_PATH =
  "/app/amministrazione/schede/prodotti-propri?nuovo=1";

type Props = {
  mode: "create" | "edit";
  initial?: Cliente | null;
  onClose: () => void;
  /** Restituisce true se il salvataggio è andato a buon fine. */
  onSave: (values: ClienteInput) => boolean | Promise<boolean>;
  /** Sopra un’altra modale (es. ordine storico). */
  elevated?: boolean;
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

export function ClienteFormModal({
  mode,
  initial,
  onClose,
  onSave,
  elevated = false,
}: Props) {
  const router = useRouter();
  const titleId = useId();
  const isEdit = mode === "edit";
  const [codiceTarga, setCodiceTarga] = useState(initial?.codiceTarga ?? "");
  const [codiceError, setCodiceError] = useState<string | null>(null);
  const [codiceLoading, setCodiceLoading] = useState(!isEdit);
  const [ragioneSociale, setRagioneSociale] = useState(
    initial?.ragioneSociale ?? ""
  );
  const [partitaIva, setPartitaIva] = useState(initial?.partitaIva ?? "");
  const [archivioId, setArchivioId] = useState<string | null>(null);
  const [archivioHint, setArchivioHint] = useState<string | null>(null);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [pec, setPec] = useState(initial?.pec ?? "");
  const [sdiCode, setSdiCode] = useState(initial?.sdiCode ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [sedeAmministrativa, setSedeAmministrativa] = useState(
    initial?.sedeAmministrativa ?? emptySede()
  );
  const [sedeMagazzino, setSedeMagazzino] = useState(
    initial?.sedeMagazzino ?? emptySede()
  );
  const initialStessaSede = Boolean(
    initial &&
      !isSedeEmpty(initial.sedeMagazzino) &&
      sameSede(initial.sedeAmministrativa, initial.sedeMagazzino)
  );
  const [stessaSede, setStessaSede] = useState(initialStessaSede);
  const [magazzinoOpen, setMagazzinoOpen] = useState(
    Boolean(
      initial &&
        (!isSedeEmpty(initial.sedeMagazzino) ||
          sameSede(initial.sedeAmministrativa, initial.sedeMagazzino))
    )
  );
  const [consegneEnabled, setConsegneEnabled] = useState(
    Boolean(initial?.consegneAltraAzienda?.length)
  );
  const [consegne, setConsegne] = useState<ConsegnaAltraAzienda[]>(
    initial?.consegneAltraAzienda?.length
      ? initial.consegneAltraAzienda
      : []
  );
  const [prodotti, setProdotti] = useState<string[]>(
    initial?.prodottiAcquistati ?? []
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateConsegna(index: number, next: ConsegnaAltraAzienda) {
    setConsegne((prev) => prev.map((item, i) => (i === index ? next : item)));
  }

  function addConsegna() {
    setConsegneEnabled(true);
    setConsegne((prev) => [...prev, emptyConsegnaAltraAzienda()]);
  }

  function removeConsegna(index: number) {
    setConsegne((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setConsegneEnabled(false);
      return next;
    });
  }

  function buildValues(): ClienteInput | null {
    const codice = codiceTarga.trim().toUpperCase();
    if (!ragioneSociale.trim() || !partitaIva.trim()) {
      setFormError("Compila ragione sociale e partita IVA prima di continuare.");
      return null;
    }
    if (!isSedeFilled(sedeAmministrativa)) {
      setFormError("Completa la sede amministrativa prima di continuare.");
      return null;
    }
    if (
      magazzinoOpen &&
      !stessaSede &&
      !isSedeEmpty(sedeMagazzino) &&
      !isSedeFilled(sedeMagazzino)
    ) {
      setFormError(
        "Completa tutti i campi della sede magazzino, oppure chiudila / azzerala."
      );
      return null;
    }
    if (consegneEnabled) {
      if (consegne.length === 0) {
        setFormError(
          "Aggiungi almeno una consegna presso altra azienda, oppure disattiva l’opzione."
        );
        return null;
      }
      for (let i = 0; i < consegne.length; i++) {
        const c = consegne[i];
        if (!c.ragioneSociale.trim()) {
          setFormError(
            `Inserisci la ragione sociale della consegna #${i + 1}.`
          );
          return null;
        }
        if (!isSedeFilled(c)) {
          setFormError(
            `Completa l’indirizzo della consegna #${i + 1} presso altra azienda.`
          );
          return null;
        }
      }
    }
    if (!/^C[0-9A-F]{3}$/.test(codice) || codice === "C000") {
      setCodiceError(
        "Il codice cliente deve essere C + 3 esadecimali (C001–CFFF)."
      );
      setFormError("Codice cliente non valido.");
      return null;
    }
    setFormError(null);
    setCodiceError(null);
    return {
      codiceTarga: codice,
      ragioneSociale: ragioneSociale.trim(),
      partitaIva: partitaIva.trim(),
      email: email.trim(),
      pec: pec.trim(),
      sdiCode: sdiCode.trim(),
      telefono: telefono.trim(),
      sedeAmministrativa,
      sedeMagazzino: !magazzinoOpen
        ? emptySede()
        : stessaSede
          ? sedeAmministrativa
          : sedeMagazzino,
      consegneAltraAzienda: consegneEnabled ? consegne : [],
      prodottiAcquistati: prodotti,
      archivioId,
    };
  }

  async function checkArchivioByVat(vat: string) {
    if (isEdit || !vat.trim()) {
      setArchivioId(null);
      setArchivioHint(null);
      return;
    }
    const result = await findAnagraficaArchivioByVatAction("cliente", vat);
    if (!result.success || !result.hit) {
      setArchivioId(null);
      setArchivioHint(null);
      return;
    }
    const hit = result.hit;
    setArchivioId(hit.id);
    setArchivioHint(
      `Trovata in archivio come scartata/eliminata: ${hit.ragioneSociale}. I dati sono stati riproposti: valuta e salva (ripesca) oppure chiudi.`
    );
    setRagioneSociale(hit.draft.ragioneSociale || ragioneSociale);
    setPartitaIva(hit.draft.partitaIva || vat);
    setEmail(hit.draft.email);
    setPec(hit.draft.pec);
    setSdiCode(hit.draft.sdiCode);
    setTelefono(hit.draft.telefono);
    setSedeAmministrativa(hit.draft.sedeAmministrativa);
    if (
      hit.draft.sedeMagazzino.indirizzo ||
      hit.draft.sedeMagazzino.citta
    ) {
      setMagazzinoOpen(true);
      setSedeMagazzino(hit.draft.sedeMagazzino);
    }
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
    if (isEdit) return;
    if (initial?.codiceTarga) {
      setCodiceTarga(initial.codiceTarga);
      setCodiceLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setCodiceLoading(true);
      const result = await previewNextCodiceTargaClienteAction();
      if (cancelled) return;
      if (result.success) {
        setCodiceTarga(result.codiceTarga);
        setCodiceError(null);
      } else {
        setCodiceTarga("");
        setCodiceError(result.error);
      }
      setCodiceLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, initial?.codiceTarga]);

  async function persist(values: ClienteInput): Promise<boolean> {
    setSaving(true);
    try {
      return Boolean(await onSave(values));
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving || codiceLoading) return;
    const values = buildValues();
    if (!values) return;
    const ok = await persist(values);
    if (!ok) {
      setFormError("Salvataggio non riuscito. Controlla i dati e riprova.");
    }
  }

  async function saveAndOpenNuovoProdotto() {
    if (saving || codiceLoading) return;
    const values = buildValues();
    if (!values) return;
    const ok = await persist(values);
    if (!ok) {
      setFormError("Salvataggio non riuscito. Controlla i dati e riprova.");
      return;
    }
    router.push(PRODOTTI_PROPRI_NUOVO_PATH);
  }

  const dialog = (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14 ${
        elevated ? "z-[70]" : "z-[60]"
      }`}
      role="presentation"
      onClick={onClose}
      data-cliente-modal-root="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-elevated={elevated ? "true" : undefined}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {isEdit ? "Modifica scheda cliente" : "Nuovo cliente"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isEdit
            ? "Puoi modificare tutti i dati della scheda. La targa non è modificabile."
            : "Compila i dati anagrafici e i prodotti acquistati."}
        </p>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Codice azienda
          </p>
          <div className="mt-2">
            <CodiceTargaBadge
              code={codiceTarga}
              size="lg"
              loading={codiceLoading}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {isEdit
              ? "Targa assegnata in modo permanente: non modificabile."
              : "Anteprima sequenziale con prefisso C: associata al salvataggio e non sarà più modificabile."}
          </p>
          {codiceError && (
            <p className="mt-1 text-xs text-red-600">{codiceError}</p>
          )}
        </div>

        <form
          onSubmit={submit}
          onClick={(e) => e.stopPropagation()}
          className="mt-5 space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">R. Sociale</span>
              <input
                value={ragioneSociale}
                onChange={(e) => setRagioneSociale(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">P. IVA</span>
              <input
                value={partitaIva}
                onChange={(e) => {
                  setPartitaIva(e.target.value);
                  setArchivioHint(null);
                  setArchivioId(null);
                }}
                onBlur={() => void checkArchivioByVat(partitaIva)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
              {archivioHint ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {archivioHint}
                </p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Telefono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">PEC</span>
              <input
                type="email"
                value={pec}
                onChange={(e) => setPec(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">SDI</span>
              <input
                value={sdiCode}
                onChange={(e) => setSdiCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <AddressSedeFields
            title="Sede Amministrativa"
            value={sedeAmministrativa}
            onChange={(next) => {
              setSedeAmministrativa(next);
              if (magazzinoOpen && stessaSede) setSedeMagazzino(next);
            }}
          />

          <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Sede Magazzino</p>
              <button
                type="button"
                onClick={() => {
                  setMagazzinoOpen((open) => {
                    const next = !open;
                    if (!next) {
                      setStessaSede(false);
                      setSedeMagazzino(emptySede());
                    }
                    return next;
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                aria-expanded={magazzinoOpen}
              >
                {magazzinoOpen ? "Chiudi" : "Apri"}
                <FaChevronDown
                  size={11}
                  className={`text-[var(--muted)] transition-transform ${
                    magazzinoOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Opzionale: puoi lasciarla chiusa se non serve.
            </p>

            {magazzinoOpen && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stessaSede}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setStessaSede(checked);
                      if (checked) setSedeMagazzino(sedeAmministrativa);
                    }}
                    className="rounded border-[var(--border)]"
                  />
                  Uguale alla sede amministrativa
                </label>

                {!stessaSede && (
                  <AddressSedeFields
                    title="Indirizzo magazzino"
                    value={sedeMagazzino}
                    onChange={setSedeMagazzino}
                    requiredFields={false}
                  />
                )}
              </div>
            )}
          </div>

          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-semibold">
              Consegne presso altre aziende
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consegneEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConsegneEnabled(checked);
                  if (checked && consegne.length === 0) {
                    setConsegne([emptyConsegnaAltraAzienda()]);
                  }
                  if (!checked) setConsegne([]);
                }}
                className="mt-0.5 rounded border-[var(--border)]"
              />
              <span>
                Attiva consegne presso altra azienda
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Stesso form indirizzo, con ragione sociale. Puoi aggiungerne
                  più di una; la sede magazzino resta comunque disponibile.
                </span>
              </span>
            </label>

            {consegneEnabled && (
              <div className="space-y-4">
                {consegne.map((consegna, index) => (
                  <div
                    key={`consegna-${index}`}
                    className="space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-slate-50/50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        Consegna #{index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeConsegna(index)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <FaTrash size={11} />
                        Rimuovi
                      </button>
                    </div>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">
                        Ragione sociale
                      </span>
                      <input
                        value={consegna.ragioneSociale}
                        onChange={(e) =>
                          updateConsegna(index, {
                            ...consegna,
                            ragioneSociale: e.target.value,
                          })
                        }
                        required={consegneEnabled}
                        placeholder="Azienda presso cui consegnare"
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
                      />
                    </label>
                    <AddressSedeFields
                      title="Indirizzo di consegna"
                      value={consegna}
                      onChange={(next) =>
                        updateConsegna(index, {
                          ...next,
                          ragioneSociale: consegna.ragioneSociale,
                        })
                      }
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addConsegna}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  <FaPlus size={12} />
                  Aggiungi indirizzo di consegna
                </button>
              </div>
            )}
          </fieldset>

          <ProdottiAcquistatiTags
            value={prodotti}
            onChange={setProdotti}
            onNuovoProdotto={saveAndOpenNuovoProdotto}
            nuovoProdottoBusy={saving}
          />

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || codiceLoading || codiceTarga.length !== 4}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving
                ? "Salvataggio…"
                : isEdit
                  ? "Salva modifiche"
                  : "Salva cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
