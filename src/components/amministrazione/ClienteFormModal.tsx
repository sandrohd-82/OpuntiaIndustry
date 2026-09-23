"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FaPlus, FaTrash } from "react-icons/fa6";
import { checkAnagraficaDuplicatiAction } from "@/app/actions/anagrafica-duplicati";
import { findAnagraficaArchivioByVatAction } from "@/app/actions/anagrafiche-archivio";
import { AnagraficaDuplicatiBlockModal } from "@/components/amministrazione/AnagraficaDuplicatiBlockModal";
import type { AnagraficaDuplicatoHit } from "@/lib/amministrazione/anagrafica-duplicati";
import { previewNextCodiceTargaClienteAction } from "@/app/actions/clienti";
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
  applyLegacySedeToDrafts,
  draftsFromLegacy,
  draftsFromSedi,
  sediToInput,
  validateSediDrafts,
  type AnagraficaSedeDraft,
} from "@/components/amministrazione/AnagraficaSediEditor";
import { loadAnagraficaExtraAction } from "@/app/actions/anagrafica-extra";
import {
  firstSedeOfTipo,
  primarySedeAddress,
} from "@/lib/amministrazione/anagrafica-extra";
import { ApriFatturaFicActions } from "@/components/amministrazione/ApriFatturaFicButton";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { ProdottiAcquistatiTags } from "@/components/amministrazione/ProdottiAcquistatiTags";
import { ReferentiPickerField } from "@/components/amministrazione/ReferentiPickerField";
import { CommercialeAssignField } from "@/components/amministrazione/CommercialeAssignField";
import { AnagraficaContattiGenericiFields } from "@/components/amministrazione/AnagraficaContattiGenericiFields";
import { CanaleInputRow } from "@/components/amministrazione/CanaleAttenzioneControls";
import { CONTATTI_GENERICI_MAX_ITEMS } from "@/lib/amministrazione/contatti-generici";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import {
  emptyConsegnaAltraAzienda,
  type Cliente,
  type ClienteInput,
  type ConsegnaAltraAzienda,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import {
  useActionAccess,
  useAnagraficaPrivileges,
} from "@/components/layout/ActionAccessProvider";
import { isCommercialOwnRecord } from "@/lib/auth/commerciale";
import { parseTrattativa } from "@/lib/promemorie-e-note/trattativa";
import { TrattativaSelectField } from "@/components/amministrazione/TrattativaSelectField";
import {
  listEntityReferentiAction,
  syncEntityReferentiAction,
} from "@/app/actions/rubrica";
import type { RubricaContatto } from "@/lib/rubrica/types";
const PRODOTTI_PROPRI_NUOVO_PATH =
  "/app/amministrazione/schede/prodotti-propri?nuovo=1";

type Props = {
  mode: "create" | "edit";
  initial?: Cliente | null;
  onClose: () => void;
  /**
   * true = ok; oppure `{ id }` dopo create per collegare i referenti.
   */
  onSave: (
    values: ClienteInput
  ) =>
    | boolean
    | { id: string }
    | Promise<boolean | { id: string }>;
  /** Sopra un’altra modale (es. ordine storico). */
  elevated?: boolean;
  /** Sopra una seconda modale (es. destinatario preventivo). */
  stackTop?: boolean;
  /** Documento FiC da consultare durante la sync (PDF + XML). */
  ficDocument?: { kind: FatturaKind; ficId: number } | null;
  /**
   * `possibile` = lead senza targa; etichetta prodotti «interessati».
   * Default: scheda cliente normale.
   */
  variant?: "cliente" | "possibile";
  /** Per i privilegi di eliminazione (scheda propria / area commerciale). */
  lineageIds?: string[];
  /** Prenota (cliente) o elimina (possibile). Solo in modifica. */
  onRequestDelete?: () => void;
  /** Super Admin: conferma cancellazione prenotata del cliente. */
  onConfirmCancellazione?: () => void;
  /** Super Admin: rifiuta la prenotazione. */
  onRifiutaCancellazione?: () => void;
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

export function ClienteFormModal({
  mode,
  initial,
  onClose,
  onSave,
  elevated = false,
  stackTop = false,
  ficDocument = null,
  variant = "cliente",
  lineageIds = [],
  onRequestDelete,
  onConfirmCancellazione,
  onRifiutaCancellazione,
}: Props) {
  const isPossibile = variant === "possibile";
  const isEdit = mode === "edit";
  const router = useRouter();
  const { bypassPrivileges } = useActionAccess();
  const priv = useAnagraficaPrivileges(
    isPossibile ? "cliente_possibile" : "cliente"
  );
  const treatAsOwn = isCommercialOwnRecord({
    userId: priv.userId,
    createdBy: initial?.createdBy,
    commercialeId: initial?.commercialeId,
    lineageIds,
  });
  const canDeleteRecord = priv.canDelete(initial?.createdBy, treatAsOwn);
  const prenotata = Boolean(initial?.cancellazionePrenotata);
  const showEliminaPossibile =
    isEdit && isPossibile && Boolean(onRequestDelete) && canDeleteRecord;
  const showPrenotaCliente =
    isEdit &&
    !isPossibile &&
    Boolean(onRequestDelete) &&
    canDeleteRecord &&
    !prenotata;
  const showConfermaCliente =
    isEdit &&
    !isPossibile &&
    prenotata &&
    bypassPrivileges &&
    Boolean(onConfirmCancellazione);
  const showAttesaCliente =
    isEdit && !isPossibile && prenotata && !bypassPrivileges;
  const titleId = useId();
  const [codiceTarga, setCodiceTarga] = useState(initial?.codiceTarga ?? "");
  const [codiceError, setCodiceError] = useState<string | null>(null);
  const [codiceLoading, setCodiceLoading] = useState(!isEdit && !isPossibile);
  const [ragioneSociale, setRagioneSociale] = useState(
    initial?.ragioneSociale ?? ""
  );
  const [isPrivato, setIsPrivato] = useState(initial?.isPrivato ?? false);
  const [partitaIva, setPartitaIva] = useState(initial?.partitaIva ?? "");
  const [codiceFiscale, setCodiceFiscale] = useState(
    initial?.codiceFiscale ?? ""
  );
  const [archivioId, setArchivioId] = useState<string | null>(null);
  const [archivioHint, setArchivioHint] = useState<string | null>(null);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [pec, setPec] = useState(initial?.pec ?? "");
  const [sdiCode, setSdiCode] = useState(initial?.sdiCode ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
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
      { openPrimary: true }
    )
  );
  const [brand, setBrand] = useState<AnagraficaBrandDraft[]>([]);
  const [extraReady, setExtraReady] = useState(!initial?.id);
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
      tipo: isPossibile ? "cliente_possibile" : "cliente",
      entityId: initial.id,
    }).then((res) => {
      if (res.success) setReferenti(res.items);
    });
    void loadAnagraficaExtraAction({
      ownerKind: isPossibile ? "cliente_possibile" : "cliente",
      ownerId: initial.id,
    })
      .then((res) => {
        if (res.success) {
          if (res.sedi.length) setSedi(draftsFromSedi(res.sedi));
          setBrand(res.brand);
        }
      })
      .finally(() => setExtraReady(true));
  }, [isPossibile, initial?.id]);

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
    if (!ragioneSociale.trim()) {
      setFormError("Compila la ragione sociale prima di continuare.");
      return null;
    }
    if (!isPrivato && !partitaIva.trim()) {
      setFormError("La partita IVA è obbligatoria per i clienti azienda.");
      return null;
    }
    if (!isPrivato && !codiceFiscale.trim()) {
      setFormError("Il codice fiscale è obbligatorio per i clienti azienda.");
      return null;
    }
    const sediErr = validateSediDrafts(sedi, {
      requireLegale: !isPossibile,
    });
    if (sediErr) {
      setFormError(sediErr);
      return null;
    }
    const brandErr = validateBrandDrafts(brand);
    if (brandErr) {
      setFormError(brandErr);
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
    if (!isPossibile) {
      if (!/^C[0-9A-F]{3}$/.test(codice) || codice === "C000") {
        setCodiceError(
          "Il codice cliente deve essere C + 3 esadecimali (C001–CFFF)."
        );
        setFormError("Codice cliente non valido.");
        return null;
      }
    }
    setFormError(null);
    setCodiceError(null);
    return {
      codiceTarga: isPossibile ? undefined : codice,
      ragioneSociale: ragioneSociale.trim(),
      partitaIva: isPrivato ? "" : partitaIva.trim(),
      codiceFiscale: codiceFiscale.trim(),
      isPrivato,
      email: email.trim(),
      pec: pec.trim(),
      sdiCode: sdiCode.trim(),
      telefono: telefono.trim(),
      sitoWeb: sitoWeb.trim(),
      emailGeneriche: emailExtra,
      telefoniGenerici: telefonoExtra,
      sitiWebGenerici: sitoExtra,
      sedeAmministrativa: primarySedeAddress(sedi),
      sedeMagazzino: firstSedeOfTipo(sedi, "magazzino"),
      consegneAltraAzienda: consegneEnabled ? consegne : [],
      prodottiAcquistati: prodotti,
      archivioId: isPossibile ? null : archivioId,
      sedi: sediToInput(sedi),
      brand: brandsToInput(brand),
      ...(isEdit && canAssignCommerciale ? { commercialeId } : {}),
      ...(isPossibile ? { trattativa } : {}),
    };
  }

  async function checkArchivioByVat(vat: string) {
    if (isEdit || isPossibile || !vat.trim()) {
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
    if (!codiceFiscale.trim()) {
      setCodiceFiscale(hit.draft.partitaIva || vat);
    }
    setEmail(hit.draft.email);
    setPec(hit.draft.pec);
    setSdiCode(hit.draft.sdiCode);
    setTelefono(hit.draft.telefono);
    setSitoWeb(hit.draft.sitoWeb);
    setSedi((prev) => {
      let next = applyLegacySedeToDrafts(
        prev,
        "legale",
        hit.draft.sedeAmministrativa
      );
      if (hit.draft.sedeMagazzino.indirizzo || hit.draft.sedeMagazzino.citta) {
        next = applyLegacySedeToDrafts(
          next,
          "magazzino",
          hit.draft.sedeMagazzino
        );
      }
      return next;
    });
  }

  useEffect(() => {
    // Escape non chiude la scheda (evita perdita dati): solo Annulla / Salva.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (isPossibile) {
      setCodiceTarga("");
      setCodiceLoading(false);
      setCodiceError(null);
      return;
    }
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
  }, [isEdit, isPossibile, initial?.codiceTarga]);

  async function persist(values: ClienteInput): Promise<boolean> {
    setSaving(true);
    try {
      if (isPossibile && !isEdit) {
        const dup = await checkAnagraficaDuplicatiAction(values);
        if (!dup.success) {
          setFormError(dup.error);
          return false;
        }
        if (dup.matches.length > 0) {
          setDuplicati(dup.matches);
          setFormError(
            "Creazione bloccata: esiste già una scheda uguale o simile almeno all’85%."
          );
          return false;
        }
      }
      const result = await onSave(values);
      const ok =
        result === true ||
        (typeof result === "object" && result !== null && "id" in result);
      if (!ok) return false;
      const entityId =
        (typeof result === "object" && result && "id" in result
          ? result.id
          : null) || initial?.id;
      if (entityId) {
        await syncEntityReferentiAction({
          tipo: isPossibile ? "cliente_possibile" : "cliente",
          entityId,
          entityLabel: values.ragioneSociale,
          contattoIds: referenti.map((r) => r.id),
        });
        const logoErr = await uploadPendingBrandLogos({
          ownerKind: isPossibile ? "cliente_possibile" : "cliente",
          ownerId: entityId,
          brands: brand,
        });
        if (logoErr) {
          setFormError(logoErr);
          return false;
        }
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving || !extraReady || (!isPossibile && codiceLoading)) return;
    const values = buildValues();
    if (!values) return;
    const ok = await persist(values);
    if (!ok) {
      setFormError("Salvataggio non riuscito. Controlla i dati e riprova.");
    }
  }

  async function saveAndOpenNuovoProdotto() {
    if (saving || !extraReady || (!isPossibile && codiceLoading)) return;
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
      data-nested-modal={elevated || stackTop ? "cliente" : undefined}
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14 ${
        stackTop ? "z-[140]" : elevated ? "z-[90]" : "z-[60]"
      }`}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
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
          {isPossibile
            ? isEdit
              ? "Modifica possibile cliente"
              : "Nuovo possibile cliente"
            : isEdit
              ? "Modifica scheda cliente"
              : "Nuovo cliente"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isPossibile
            ? isEdit
              ? "Aggiorna i dati del lead. La targa verrà assegnata solo in conversione a cliente."
              : "Stessi campi del cliente: i prodotti sono «interessati», non ancora acquistati. Nessuna targa finché non converti."
            : isEdit
              ? "Puoi modificare tutti i dati della scheda. La targa non è modificabile."
              : "Compila i dati anagrafici e i prodotti acquistati."}
        </p>
        {ficDocument ? (
          <div className="mt-3">
            <ApriFatturaFicActions
              kind={ficDocument.kind}
              ficId={ficDocument.ficId}
              variant="button"
            />
          </div>
        ) : null}

        {!isPossibile ? (
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
        ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Lead senza codice targa. La targa C… verrà assegnata solo quando
          convertirai questo possibile cliente in cliente.
        </div>
        )}

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
            {isEdit ? (
              <CommercialeAssignField
                value={commercialeId}
                onChange={setCommercialeId}
                onCanAssign={setCanAssignCommerciale}
              />
            ) : null}
            {isPossibile ? (
              <TrattativaSelectField
                value={trattativa}
                onChange={setTrattativa}
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={isPrivato}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIsPrivato(next);
                  if (next) {
                    setPartitaIva("");
                    setArchivioHint(null);
                    setArchivioId(null);
                  }
                }}
                className="rounded border-[var(--border)]"
              />
              <span className="font-medium">Cliente privato</span>
              <span className="text-xs text-[var(--muted)]">
                (P. IVA non compilabile; codice fiscale facoltativo)
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                P. IVA{isPrivato ? "" : " *"}
              </span>
              <input
                value={partitaIva}
                onChange={(e) => {
                  setPartitaIva(e.target.value);
                  setArchivioHint(null);
                  setArchivioId(null);
                }}
                onBlur={() => void checkArchivioByVat(partitaIva)}
                required={!isPrivato}
                disabled={isPrivato}
                placeholder={
                  isPrivato ? "Non applicabile al cliente privato" : undefined
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-[var(--muted)]"
              />
              {archivioHint ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {archivioHint}
                </p>
              ) : null}
            </label>
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Codice fiscale{isPrivato ? " (facoltativo)" : " *"}
                </span>
                <input
                  value={codiceFiscale}
                  onChange={(e) => setCodiceFiscale(e.target.value)}
                  required={!isPrivato}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              {!isPrivato ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!partitaIva.trim()) {
                      setFormError(
                        "Inserisci prima la partita IVA per copiarla nel codice fiscale."
                      );
                      return;
                    }
                    setCodiceFiscale(partitaIva.trim());
                    setFormError(null);
                  }}
                  className="text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  Copia P.IVA in Codice Fiscale
                </button>
              ) : null}
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
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                </div>
              }
            />
          </div>

          <AnagraficaSediEditor
            value={sedi}
            onChange={setSedi}
            requireLegale={!isPossibile}
          />

          <AnagraficaBrandEditor
            value={brand}
            onChange={setBrand}
            referenti={referenti}
          />

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
            title={isPossibile ? "Prodotti interessati" : "Prodotti Acquistati"}
            hint={
              isPossibile
                ? "Prodotti di interesse per questo lead (non ancora acquistati)."
                : "Seleziona i prodotti dall'elenco di Prodotti propri."
            }
          />

          <ReferentiPickerField
            value={referenti}
            onChange={setReferenti}
            defaultAziendaTipo={isPossibile ? "cliente_possibile" : "cliente"}
            defaultAziendaLabel={ragioneSociale}
            defaultAziendaId={initial?.id ?? ""}
          />

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          {showEliminaPossibile ||
          showPrenotaCliente ||
          showConfermaCliente ||
          showAttesaCliente ? (
            <div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                {isPossibile ? "Eliminazione lead" : "Cancellazione cliente"}
              </p>
              {showEliminaPossibile ? (
                <>
                  <p className="mt-1 text-xs text-red-900">
                    Soft delete ISO 9001: la scheda esce dall’elenco e va in
                    archivio. Nessun delete fisico.
                  </p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onRequestDelete}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-700 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    <FaTrash size={11} />
                    Elimina possibile cliente
                  </button>
                </>
              ) : null}
              {showPrenotaCliente ? (
                <>
                  <p className="mt-1 text-xs text-red-900">
                    Non elimina ora: si prenota la cancellazione. Solo un Super
                    Admin può confermarla. Soft delete ISO 9001, nessun delete
                    fisico.
                  </p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onRequestDelete}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-700 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    <FaTrash size={11} />
                    Prenota cancellazione
                  </button>
                </>
              ) : null}
              {showAttesaCliente ? (
                <p className="mt-1 text-xs text-amber-950">
                  Cancellazione già prenotata. In attesa di conferma o rifiuto
                  da Super Admin.
                </p>
              ) : null}
              {showConfermaCliente ? (
                <>
                  <p className="mt-1 text-xs text-red-900">
                    Prenotazione in attesa. Confermi da Super Admin (soft
                    delete) oppure rifiuti.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={onConfirmCancellazione}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      Conferma cancellazione
                    </button>
                    {onRifiutaCancellazione ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={onRifiutaCancellazione}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Rifiuta prenotazione
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

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
              disabled={
                saving ||
                !extraReady ||
                (!isPossibile && (codiceLoading || codiceTarga.length !== 4))
              }
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving
                ? "Salvataggio…"
                : isPossibile
                  ? isEdit
                    ? "Salva lead"
                    : "Salva possibile cliente"
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
