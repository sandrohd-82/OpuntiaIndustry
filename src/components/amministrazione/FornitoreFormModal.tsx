"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { findAnagraficaArchivioByVatAction } from "@/app/actions/anagrafiche-archivio";
import { previewNextCodiceTargaAction } from "@/app/actions/fornitori";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { BioCertificatoPdfField } from "@/components/amministrazione/BioCertificatoPdfField";
import { CatalogoOffertaTags } from "@/components/amministrazione/CatalogoOffertaTags";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FornitoreDiTags } from "@/components/amministrazione/FornitoreDiTags";
import { FORNITORE_TIPOLOGIE } from "@/lib/amministrazione/catalogo-offerta";
import {
  emptySede,
  type Fornitore,
  type FornitoreInput,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";
import type { FornitoreTipologia } from "@/types/database";

type Props = {
  mode: "create" | "edit";
  initial?: Fornitore | null;
  onClose: () => void;
  onSave: (
    values: FornitoreInput,
    bioPdf?: File | null
  ) => void | Promise<void>;
  /** Sopra un’altra modale (es. sync clienti → passa a fornitori). */
  elevated?: boolean;
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
  elevated = false,
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
  const [archivioId, setArchivioId] = useState<string | null>(null);
  const [archivioHint, setArchivioHint] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [pec, setPec] = useState(initial?.pec ?? "");
  const [sdiCode, setSdiCode] = useState(initial?.sdiCode ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [tipologie, setTipologie] = useState<FornitoreTipologia[]>(
    initial?.tipologie ?? []
  );
  const [servizi, setServizi] = useState<string[]>(
    initial?.serviziOfferti ?? []
  );
  const [prodottiFornitore, setProdottiFornitore] = useState<string[]>(
    initial?.prodottiFornitore ?? []
  );
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
    // Escape non chiude la scheda (evita perdita dati): solo Annulla / Salva.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
  }, [isEdit, initial?.codiceTarga]);

  async function checkArchivioByVat(vat: string) {
    if (isEdit || !vat.trim()) {
      setArchivioId(null);
      setArchivioHint(null);
      return;
    }
    const result = await findAnagraficaArchivioByVatAction("fornitore", vat);
    if (!result.success || !result.hit) {
      setArchivioId(null);
      setArchivioHint(null);
      return;
    }
    const hit = result.hit;
    setArchivioId(hit.id);
    setArchivioHint(
      `Trovata in archivio come scartata/eliminata: ${hit.ragioneSociale}. Dati riproposti: valuta e salva (ripesca) oppure chiudi.`
    );
    setRagioneSociale(hit.draft.ragioneSociale || ragioneSociale);
    setPartitaIva(hit.draft.partitaIva || vat);
    setEmail(hit.draft.email);
    setPec(hit.draft.pec);
    setSdiCode(hit.draft.sdiCode);
    setTelefono(hit.draft.telefono);
    setSedeAmministrativa(hit.draft.sedeAmministrativa);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const codice = codiceTarga.trim().toUpperCase();
    if (!ragioneSociale.trim() || !partitaIva.trim() || saving) {
      setFormError(
        "Ragione sociale e P. IVA sono obbligatorie. Salvataggio vuoto non consentito."
      );
      return;
    }
    if (!/^F[0-9A-F]{3}$/.test(codice) || codice === "F000") {
      setCodiceError("Il codice fornitore deve essere F + 3 esadecimali (F001–FFFF).");
      return;
    }
    setFormError(null);
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
          tipologie,
          serviziOfferti: tipologie.includes("servizio") ? servizi : [],
          prodottiFornitore: tipologie.includes("prodotto")
            ? prodottiFornitore
            : [],
          sedeAmministrativa,
          sedeMagazzino: !ritiroOpen
            ? emptySede()
            : stessaSede
              ? sedeAmministrativa
              : sedeMagazzino,
          prodottiAcquistati: tipologie.includes("materia_prima")
            ? prodotti
            : [],
          archivioId,
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

  function toggleTipologia(t: FornitoreTipologia) {
    setTipologie((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  return (
    <div
      data-nested-modal={elevated ? "fornitore" : undefined}
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14 ${
        elevated ? "z-[90]" : "z-[60]"
      }`}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
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
                onChange={(e) => {
                  setPartitaIva(e.target.value);
                  setArchivioHint(null);
                  setArchivioId(null);
                  setFormError(null);
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

          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-semibold">
              Cosa offre questo fornitore?
            </legend>
            <p className="text-xs text-[var(--muted)]">
              Puoi selezionare più voci (es. servizi + materia prima).
            </p>
            <div className="flex flex-wrap gap-3">
              {FORNITORE_TIPOLOGIE.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tipologie.includes(t.value)}
                    onChange={() => toggleTipologia(t.value)}
                    className="rounded border-[var(--border)]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>

          {tipologie.includes("servizio") ? (
            <CatalogoOffertaTags
              kind="servizio"
              title="Servizi offerti"
              value={servizi}
              onChange={setServizi}
            />
          ) : null}

          {tipologie.includes("prodotto") ? (
            <CatalogoOffertaTags
              kind="prodotto"
              title="Prodotti offerti"
              value={prodottiFornitore}
              onChange={setProdottiFornitore}
            />
          ) : null}

          {tipologie.includes("materia_prima") ? (
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
          ) : null}

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

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          ) : null}

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
              disabled={saving || codiceLoading || codiceTarga.length !== 4 || !ragioneSociale.trim() || !partitaIva.trim()}
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
