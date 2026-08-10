"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { previewNextCodiceTargaAction } from "@/app/actions/fornitori";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { BioCertificatoPdfField } from "@/components/amministrazione/BioCertificatoPdfField";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FornitoreDiTags } from "@/components/amministrazione/FornitoreDiTags";
import {
  emptySede,
  type Fornitore,
  type FornitoreInput,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";

type Props = {
  mode: "create" | "edit";
  initial?: Fornitore | null;
  onClose: () => void;
  onSave: (
    values: FornitoreInput,
    bioPdf?: File | null
  ) => void | Promise<void>;
};

function sameSede(a: SedeFornitore, b: SedeFornitore) {
  return (
    a.nazione === b.nazione &&
    a.provincia === b.provincia &&
    a.citta === b.citta &&
    a.cap === b.cap &&
    a.indirizzo === b.indirizzo
  );
}

function isSedeEmpty(sede: SedeFornitore): boolean {
  return !(
    sede.nazione.trim() ||
    sede.provincia.trim() ||
    sede.citta.trim() ||
    sede.cap.trim() ||
    sede.indirizzo.trim()
  );
}

export function FornitoreFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const isEdit = mode === "edit";
  const [codiceTarga, setCodiceTarga] = useState(initial?.codiceTarga ?? "");
  const [codiceError, setCodiceError] = useState<string | null>(null);
  const [codiceLoading, setCodiceLoading] = useState(!isEdit);
  const [ragioneSociale, setRagioneSociale] = useState(
    initial?.ragioneSociale ?? ""
  );
  const [partitaIva, setPartitaIva] = useState(initial?.partitaIva ?? "");
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
  const [ritiroOpen, setRitiroOpen] = useState(
    Boolean(
      initial &&
        (!isSedeEmpty(initial.sedeMagazzino) ||
          sameSede(initial.sedeAmministrativa, initial.sedeMagazzino))
    )
  );
  const [prodotti, setProdotti] = useState<string[]>(
    initial?.prodottiAcquistati ?? []
  );
  const [bioCodice, setBioCodice] = useState(initial?.bioCodice ?? "");
  const [bioPdf, setBioPdf] = useState<File | null>(null);
  const [removeBioPdf, setRemoveBioPdf] = useState(false);
  const [saving, setSaving] = useState(false);

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
    let cancelled = false;
    void (async () => {
      setCodiceLoading(true);
      const result = await previewNextCodiceTargaAction();
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
  }, [isEdit]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const codice = codiceTarga.trim().toUpperCase();
    if (!ragioneSociale.trim() || !partitaIva.trim() || saving) return;
    if (!/^F[0-9A-F]{3}$/.test(codice) || codice === "F000") {
      setCodiceError("Il codice fornitore deve essere F + 3 esadecimali (F001–FFFF).");
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          codiceTarga: codice,
          ragioneSociale: ragioneSociale.trim(),
          partitaIva: partitaIva.trim(),
          email: email.trim(),
          pec: pec.trim(),
          sdiCode: sdiCode.trim(),
          telefono: telefono.trim(),
          sedeAmministrativa,
          sedeMagazzino: !ritiroOpen
            ? emptySede()
            : stessaSede
              ? sedeAmministrativa
              : sedeMagazzino,
          prodottiAcquistati: prodotti,
          bioCertificatoPath: initial?.bioCertificatoPath ?? "",
          bioCodice: bioCodice.trim(),
          removeBioCertificato: removeBioPdf && !bioPdf,
        },
        bioPdf
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {isEdit ? "Modifica scheda fornitore" : "Nuovo fornitore"}
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
              : "Anteprima sequenziale: verrà associata solo al salvataggio e non sarà più modificabile."}
          </p>
          {codiceError && (
            <p className="mt-1 text-xs text-red-600">{codiceError}</p>
          )}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
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
                onChange={(e) => setPartitaIva(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
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
              if (ritiroOpen && stessaSede) setSedeMagazzino(next);
            }}
          />

          <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Sede ritiro</p>
              <button
                type="button"
                onClick={() => {
                  setRitiroOpen((open) => {
                    const next = !open;
                    if (!next) {
                      setStessaSede(false);
                      setSedeMagazzino(emptySede());
                    }
                    return next;
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                aria-expanded={ritiroOpen}
              >
                {ritiroOpen ? "Chiudi" : "Apri"}
                <FaChevronDown
                  size={11}
                  className={`text-[var(--muted)] transition-transform ${
                    ritiroOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Opzionale: puoi lasciarla chiusa se non serve.
            </p>

            {ritiroOpen && (
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
                    title="Indirizzo ritiro"
                    value={sedeMagazzino}
                    onChange={setSedeMagazzino}
                    requiredFields={false}
                  />
                )}
              </div>
            )}
          </div>

          <FornitoreDiTags
            value={prodotti}
            onChange={setProdotti}
            bioCertificatoPath={
              removeBioPdf && !bioPdf
                ? ""
                : initial?.bioCertificatoPath || (bioPdf ? "__local__" : "")
            }
            bioCodice={bioCodice}
            hasLocalBioPdf={Boolean(bioPdf)}
          />

          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-medium">Bio</legend>
            <p className="text-xs text-[var(--muted)]">
              Inserisci il codice bio e carica il PDF del certificato. Quando
              selezioni una materia prima biologica in “Fornitore di”, vengono
              applicati automaticamente.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Codice bio</span>
              <input
                value={bioCodice}
                onChange={(e) => setBioCodice(e.target.value)}
                placeholder="Es. IT-BIO-xxx"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <BioCertificatoPdfField
              existingPath={initial?.bioCertificatoPath ?? ""}
              file={bioPdf}
              onFileChange={setBioPdf}
              markedForRemoval={removeBioPdf}
              onMarkedForRemovalChange={setRemoveBioPdf}
            />
          </fieldset>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
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
                  : "Salva fornitore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
