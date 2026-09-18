"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaChevronDown, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import { checkAnagraficaDuplicatiAction } from "@/app/actions/anagrafica-duplicati";
import { listEntityReferentiAction } from "@/app/actions/rubrica";
import { AnagraficaDuplicatiBlockModal } from "@/components/amministrazione/AnagraficaDuplicatiBlockModal";
import type { AnagraficaDuplicatoHit } from "@/lib/amministrazione/anagrafica-duplicati";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import {
  AnagraficaBrandEditor,
  brandsToInput,
  uploadPendingBrandLogos,
  validateBrandDrafts,
  type AnagraficaBrandDraft,
} from "@/components/amministrazione/AnagraficaBrandEditor";
import {
  AnagraficaSediEditor,
  draftsFromLegacy,
  draftsFromSedi,
  sediToInput,
  validateSediDrafts,
  type AnagraficaSedeDraft,
} from "@/components/amministrazione/AnagraficaSediEditor";
import { loadAnagraficaExtraAction } from "@/app/actions/anagrafica-extra";
import { firstSedeOfTipo } from "@/lib/amministrazione/anagrafica-extra";
import { ReferentiPickerField } from "@/components/amministrazione/ReferentiPickerField";
import { CommercialeAssignField } from "@/components/amministrazione/CommercialeAssignField";
import { AnagraficaContattiGenericiFields } from "@/components/amministrazione/AnagraficaContattiGenericiFields";
import { CanaleInputRow } from "@/components/amministrazione/CanaleAttenzioneControls";
import { CONTATTI_GENERICI_MAX_ITEMS } from "@/lib/amministrazione/contatti-generici";
import {
  emptyConsegnaAltraAzienda,
  type ClienteInput,
  type ConsegnaAltraAzienda,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";
import { parseTrattativa } from "@/lib/promemorie-e-note/trattativa";
import { TrattativaSelectField } from "@/components/amministrazione/TrattativaSelectField";
import type { RubricaContatto } from "@/lib/rubrica/types";

type Props = {
  mode?: "create" | "edit";
  initial?: ClientePossibile | null;
  onClose: () => void;
  onSave: (
    values: ClienteInput & { referenteIds: string[] }
  ) =>
    | boolean
    | { id: string }
    | Promise<boolean | { id: string }>;
  stackTop?: boolean;
};

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
  stackTop = false,
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
  const [emailExtra, setEmailExtra] = useState(initial?.emailGeneriche ?? []);
  const [telefonoExtra, setTelefonoExtra] = useState(
    initial?.telefoniGenerici ?? []
  );
  const [sitoExtra, setSitoExtra] = useState(initial?.sitiWebGenerici ?? []);
  const [reminderTick, setReminderTick] = useState(0);
  const [sedi, setSedi] = useState<AnagraficaSedeDraft[]>(() =>
    draftsFromLegacy(
      {
        sedeAmministrativa: initial?.sedeAmministrativa,
        sedeMagazzino: initial?.sedeMagazzino,
      },
      { openAmm: Boolean(initial && !isSedeEmpty(initial.sedeAmministrativa)) }
    )
  );
  const [brand, setBrand] = useState<AnagraficaBrandDraft[]>([]);
  const [extraReady, setExtraReady] = useState(!initial?.id);
  const [consegneOpen, setConsegneOpen] = useState(
    Boolean(initial?.consegneAltraAzienda?.length)
  );
  const [consegne, setConsegne] = useState<ConsegnaAltraAzienda[]>(
    initial?.consegneAltraAzienda?.length
      ? initial.consegneAltraAzienda
      : []
  );
  const [referenti, setReferenti] = useState<RubricaContatto[]>([]);
  const [commercialeId, setCommercialeId] = useState<string | null>(
    initial?.commercialeId ?? null
  );
  const [canAssignCommerciale, setCanAssignCommerciale] = useState(false);
  const [trattativa, setTrattativa] = useState(() =>
    parseTrattativa(initial?.trattativa)
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicati, setDuplicati] = useState<AnagraficaDuplicatoHit[] | null>(
    null
  );

  useEffect(() => {
    if (!initial?.id) return;
    void listEntityReferentiAction({
      tipo: "cliente_possibile",
      entityId: initial.id,
    }).then((res) => {
      if (res.success) setReferenti(res.items);
    });
    void loadAnagraficaExtraAction({
      ownerKind: "cliente_possibile",
      ownerId: initial.id,
    })
      .then((res) => {
        if (res.success) {
          if (res.sedi.length) setSedi(draftsFromSedi(res.sedi));
          setBrand(res.brand);
        }
      })
      .finally(() => setExtraReady(true));
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
    const sediErr = validateSediDrafts(sedi, { requireAmministrativa: false });
    if (sediErr) {
      setFormError(sediErr);
      return null;
    }
    const brandErr = validateBrandDrafts(brand);
    if (brandErr) {
      setFormError(brandErr);
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
      emailGeneriche: emailExtra,
      telefoniGenerici: telefonoExtra,
      sitiWebGenerici: sitoExtra,
      sedeAmministrativa: firstSedeOfTipo(sedi, "amministrativa"),
      sedeMagazzino: firstSedeOfTipo(sedi, "magazzino"),
      consegneAltraAzienda: consegneOpen ? consegne : [],
      prodottiAcquistati: [],
      referenteIds: referenti.map((r) => r.id),
      trattativa,
      sedi: sediToInput(sedi),
      brand: brandsToInput(brand),
      ...(isEdit && canAssignCommerciale ? { commercialeId } : {}),
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !extraReady) return;
    const values = buildValues();
    if (!values) return;
    setSaving(true);
    try {
      if (!isEdit) {
        const dup = await checkAnagraficaDuplicatiAction(values);
        if (!dup.success) {
          setFormError(dup.error);
          return;
        }
        if (dup.matches.length > 0) {
          setDuplicati(dup.matches);
          setFormError(
            "Creazione bloccata: esiste già una scheda uguale o simile almeno all’85%."
          );
          return;
        }
      }
      const result = await onSave(values);
      const ok =
        result === true ||
        (typeof result === "object" && result !== null && "id" in result);
      if (!ok) {
        setFormError("Salvataggio non riuscito. Controlla i dati.");
        return;
      }
      const entityId =
        (typeof result === "object" && result && "id" in result
          ? result.id
          : null) || initial?.id;
      if (entityId) {
        const logoErr = await uploadPendingBrandLogos({
          ownerKind: "cliente_possibile",
          ownerId: entityId,
          brands: brand,
        });
        if (logoErr) {
          setFormError(logoErr);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <div
      data-cliente-modal-root="true"
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 ${
        stackTop ? "z-[110]" : "z-[90]"
      }`}
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
            {isEdit ? (
              <CommercialeAssignField
                value={commercialeId}
                onChange={setCommercialeId}
                onCanAssign={setCanAssignCommerciale}
              />
            ) : null}
            <TrattativaSelectField
              value={trattativa}
              onChange={setTrattativa}
            />
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
            <AnagraficaContattiGenericiFields
              email={email}
              onEmailChange={setEmail}
              emailExtra={emailExtra}
              onEmailExtraChange={setEmailExtra}
              telefono={telefono}
              onTelefonoChange={setTelefono}
              telefonoExtra={telefonoExtra}
              onTelefonoExtraChange={setTelefonoExtra}
              sitoWeb={sitoWeb}
              onSitoWebChange={setSitoWeb}
              sitoExtra={sitoExtra}
              onSitoExtraChange={setSitoExtra}
              reminderTick={reminderTick}
              onAdd={(kind) => {
                setReminderTick((t) => t + 1);
                if (kind === "mail") {
                  setEmailExtra((prev) =>
                    prev.length >= CONTATTI_GENERICI_MAX_ITEMS
                      ? prev
                      : [...prev, ""]
                  );
                  return;
                }
                if (kind === "telefono") {
                  setTelefonoExtra((prev) =>
                    prev.length >= CONTATTI_GENERICI_MAX_ITEMS
                      ? prev
                      : [...prev, ""]
                  );
                  return;
                }
                setSitoExtra((prev) =>
                  prev.length >= CONTATTI_GENERICI_MAX_ITEMS
                    ? prev
                    : [...prev, ""]
                );
              }}
              afterTelefono={
                <div className="grid gap-3 sm:grid-cols-2">
                  <CanaleInputRow
                    label="PEC"
                    canale="email"
                    type="email"
                    inputMode="email"
                    value={pec}
                    onChange={setPec}
                  />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">SDI</span>
                    <input
                      value={sdiCode}
                      onChange={(e) => setSdiCode(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                    />
                  </label>
                </div>
              }
            />
          </div>

          <AnagraficaSediEditor value={sedi} onChange={setSedi} />

          <AnagraficaBrandEditor
            value={brand}
            onChange={setBrand}
            referenti={referenti}
          />

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
            defaultAziendaId={initial?.id ?? ""}
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
              disabled={saving || !extraReady}
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
  return (
    <>
      {createPortal(dialog, document.body)}
      {duplicati ? (
        <AnagraficaDuplicatiBlockModal
          matches={duplicati}
          onClose={() => setDuplicati(null)}
        />
      ) : null}
    </>
  );
}
