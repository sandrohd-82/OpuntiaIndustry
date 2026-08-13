import type { Cliente, ClienteInput } from "@/lib/amministrazione/clienti";
import {
  emptySede,
  type Fornitore,
  type FornitoreInput,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";
import type { FicEntityNormalized } from "@/lib/fic";

export type AnagraficaSyncKind = "fornitore" | "cliente";

export type ContattiAnagrafica = {
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
};

export type AnagraficaSyncDraft = {
  ragioneSociale: string;
  partitaIva: string;
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
};

export type ChangedFieldKey =
  | "ragioneSociale"
  | "partitaIva"
  | "email"
  | "pec"
  | "sdiCode"
  | "telefono"
  | "sitoWeb"
  | "sedeAmministrativa"
  | "sedeMagazzino";

export type AnagraficaSyncReviewItem = {
  ficEntityId: number;
  kind: AnagraficaSyncKind;
  /** Targa proposta (nuova) o esistente. */
  codiceTarga: string;
  mode: "create" | "update";
  existingId: string | null;
  /** Valori già in archivio (se update). */
  current: AnagraficaSyncDraft | null;
  /** Valori proposti in modale. */
  proposed: AnagraficaSyncDraft;
  /** Campi diversi rispetto all’archivio. */
  changedFields: ChangedFieldKey[];
  /** Presente in clienti_archivio / fornitori_archivio o scarto sync. */
  fromArchivio?: boolean;
  archivioId?: string | null;
  motivoArchivio?: string | null;
};

function sedeFromEntity(entity: FicEntityNormalized): SedeFornitore {
  return {
    nazione: entity.country || "Italia",
    provincia: entity.province,
    citta: entity.city,
    cap: entity.postalCode,
    indirizzo: entity.street,
  };
}

function sedeMagFromEntity(entity: FicEntityNormalized): SedeFornitore {
  if (!entity.shippingAddress.trim()) return emptySede();
  return {
    nazione: entity.country || "Italia",
    provincia: "",
    citta: "",
    cap: "",
    indirizzo: entity.shippingAddress,
  };
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

function sameSede(a: SedeFornitore, b: SedeFornitore): boolean {
  return (
    a.nazione === b.nazione &&
    a.provincia === b.provincia &&
    a.citta === b.citta &&
    a.cap === b.cap &&
    a.indirizzo === b.indirizzo
  );
}

function pickFilled(local: string, incoming: string): string {
  return local.trim() ? local : incoming.trim();
}

function pickContact(local: string, incoming: string): string {
  // Contatti: se FiC ha un valore, proponilo (evidenziato se diverso)
  return incoming.trim() ? incoming.trim() : local.trim();
}

export function draftFromFicEntity(
  entity: FicEntityNormalized
): AnagraficaSyncDraft {
  return {
    ragioneSociale: entity.name,
    partitaIva: entity.vat,
    email: entity.email,
    pec: entity.pec,
    sdiCode: entity.sdi,
    telefono: entity.phone,
    sitoWeb: "",
    sedeAmministrativa: sedeFromEntity(entity),
    sedeMagazzino: sedeMagFromEntity(entity),
  };
}

export function draftFromFornitore(f: Fornitore): AnagraficaSyncDraft {
  return {
    ragioneSociale: f.ragioneSociale,
    partitaIva: f.partitaIva,
    email: f.email,
    pec: f.pec,
    sdiCode: f.sdiCode,
    telefono: f.telefono,
    sitoWeb: f.sitoWeb,
    sedeAmministrativa: f.sedeAmministrativa,
    sedeMagazzino: f.sedeMagazzino,
  };
}

export function draftFromCliente(c: Cliente): AnagraficaSyncDraft {
  return {
    ragioneSociale: c.ragioneSociale,
    partitaIva: c.partitaIva,
    email: c.email,
    pec: c.pec,
    sdiCode: c.sdiCode,
    telefono: c.telefono,
    sitoWeb: c.sitoWeb,
    sedeAmministrativa: c.sedeAmministrativa,
    sedeMagazzino: c.sedeMagazzino,
  };
}

/**
 * Merge A1: campi vuoti locali ← FiC; contatti ← FiC se presenti.
 * Evidenzia differenze rispetto all’archivio.
 */
export function mergeProposedDraft(
  incoming: AnagraficaSyncDraft,
  current: AnagraficaSyncDraft | null
): { proposed: AnagraficaSyncDraft; changedFields: ChangedFieldKey[] } {
  if (!current) {
    return {
      proposed: incoming,
      changedFields: [
        "ragioneSociale",
        "partitaIva",
        "email",
        "pec",
        "sdiCode",
        "telefono",
        "sitoWeb",
        "sedeAmministrativa",
        "sedeMagazzino",
      ].filter((k) => {
        const key = k as ChangedFieldKey;
        if (key === "sedeAmministrativa" || key === "sedeMagazzino") {
          return !isSedeEmpty(incoming[key]);
        }
        return Boolean(String(incoming[key] ?? "").trim());
      }) as ChangedFieldKey[],
    };
  }

  const proposed: AnagraficaSyncDraft = {
    ragioneSociale: pickFilled(current.ragioneSociale, incoming.ragioneSociale),
    partitaIva: pickFilled(current.partitaIva, incoming.partitaIva),
    email: pickContact(current.email, incoming.email),
    pec: pickContact(current.pec, incoming.pec),
    sdiCode: pickContact(current.sdiCode, incoming.sdiCode),
    telefono: pickContact(current.telefono, incoming.telefono),
    // Sito web non arriva da FiC: conserva sempre il valore locale.
    sitoWeb: pickFilled(current.sitoWeb, incoming.sitoWeb),
    sedeAmministrativa: isSedeEmpty(current.sedeAmministrativa)
      ? incoming.sedeAmministrativa
      : current.sedeAmministrativa,
    sedeMagazzino: isSedeEmpty(current.sedeMagazzino)
      ? incoming.sedeMagazzino
      : current.sedeMagazzino,
  };

  // Se sede mag locale vuota e FiC non ha shipping, resta vuota
  if (
    isSedeEmpty(proposed.sedeMagazzino) &&
    !isSedeEmpty(incoming.sedeMagazzino)
  ) {
    proposed.sedeMagazzino = incoming.sedeMagazzino;
  }

  const changedFields: ChangedFieldKey[] = [];
  const scalarKeys: Array<
    Exclude<ChangedFieldKey, "sedeAmministrativa" | "sedeMagazzino">
  > = [
    "ragioneSociale",
    "partitaIva",
    "email",
    "pec",
    "sdiCode",
    "telefono",
    "sitoWeb",
  ];
  for (const key of scalarKeys) {
    if ((proposed[key] ?? "").trim() !== (current[key] ?? "").trim()) {
      changedFields.push(key);
    }
  }
  if (!sameSede(proposed.sedeAmministrativa, current.sedeAmministrativa)) {
    changedFields.push("sedeAmministrativa");
  }
  if (!sameSede(proposed.sedeMagazzino, current.sedeMagazzino)) {
    changedFields.push("sedeMagazzino");
  }

  return { proposed, changedFields };
}

export function draftToFornitoreInput(
  draft: AnagraficaSyncDraft,
  codiceTarga?: string
): FornitoreInput {
  return {
    codiceTarga,
    ragioneSociale: draft.ragioneSociale,
    partitaIva: draft.partitaIva,
    email: draft.email,
    pec: draft.pec,
    sdiCode: draft.sdiCode,
    telefono: draft.telefono,
    sitoWeb: draft.sitoWeb,
    tipologie: [],
    serviziOfferti: [],
    prodottiFornitore: [],
    sedeAmministrativa: draft.sedeAmministrativa,
    sedeMagazzino: draft.sedeMagazzino,
    prodottiAcquistati: [],
  };
}

/** Anteprima Fornitore per aprire la modale fornitore da sync clienti. */
export function draftToFornitorePreview(
  draft: AnagraficaSyncDraft,
  codiceTarga: string
): Fornitore {
  return {
    id: "",
    codiceTarga,
    ragioneSociale: draft.ragioneSociale,
    partitaIva: draft.partitaIva,
    email: draft.email,
    pec: draft.pec,
    sdiCode: draft.sdiCode,
    telefono: draft.telefono,
    sitoWeb: draft.sitoWeb,
    tipologie: [],
    serviziOfferti: [],
    prodottiFornitore: [],
    sedeAmministrativa: draft.sedeAmministrativa,
    sedeMagazzino: draft.sedeMagazzino,
    prodottiAcquistati: [],
    bioCertificatoPath: "",
    bioCodice: "",
    createdAt: new Date().toISOString(),
  };
}

export function draftToClientePreview(
  draft: AnagraficaSyncDraft,
  codiceTarga: string
): Cliente {
  return {
    id: "",
    codiceTarga,
    ragioneSociale: draft.ragioneSociale,
    partitaIva: draft.partitaIva,
    codiceFiscale: draft.partitaIva,
    isPrivato: false,
    email: draft.email,
    pec: draft.pec,
    sdiCode: draft.sdiCode,
    telefono: draft.telefono,
    sitoWeb: draft.sitoWeb,
    sedeAmministrativa: draft.sedeAmministrativa,
    sedeMagazzino: draft.sedeMagazzino,
    consegneAltraAzienda: [],
    prodottiAcquistati: [],
    createdAt: new Date().toISOString(),
  };
}

export function draftToClienteInput(
  draft: AnagraficaSyncDraft,
  codiceTarga?: string
): ClienteInput {
  return {
    codiceTarga,
    ragioneSociale: draft.ragioneSociale,
    partitaIva: draft.partitaIva,
    codiceFiscale: draft.partitaIva,
    isPrivato: false,
    email: draft.email,
    pec: draft.pec,
    sdiCode: draft.sdiCode,
    telefono: draft.telefono,
    sitoWeb: draft.sitoWeb,
    sedeAmministrativa: draft.sedeAmministrativa,
    sedeMagazzino: draft.sedeMagazzino,
    consegneAltraAzienda: [],
    prodottiAcquistati: [],
  };
}

export function normalizeVatKey(vat: string): string {
  return vat.replace(/\s+/g, "").toUpperCase();
}
