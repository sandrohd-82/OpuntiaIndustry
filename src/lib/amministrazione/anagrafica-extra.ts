import { z } from "zod";
import {
  emptySede,
  normalizeSede,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";

export type SedeCliente = SedeFornitore;

export const ANAGRAFICA_SEDE_TIPI = [
  "amministrativa",
  "magazzino",
  "produttiva",
  "legale",
] as const;
export type AnagraficaSedeTipo = (typeof ANAGRAFICA_SEDE_TIPI)[number];

export const ANAGRAFICA_SEDE_LABEL: Record<AnagraficaSedeTipo, string> = {
  amministrativa: "Sede Amministrativa",
  magazzino: "Sede Magazzino",
  produttiva: "Sede Produttiva",
  legale: "Sede Legale",
};

export const ANAGRAFICA_OWNER_KINDS = ["cliente", "cliente_possibile"] as const;
export type AnagraficaOwnerKind = (typeof ANAGRAFICA_OWNER_KINDS)[number];

export const ANAGRAFICA_BRAND_LOGO_BUCKET = "anagrafica-brand-loghi";

export type AnagraficaSede = {
  id: string;
  tipo: AnagraficaSedeTipo;
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
  sortOrder: number;
};

export type AnagraficaBrand = {
  id: string;
  nome: string;
  sitoWeb: string;
  email: string;
  telefono: string;
  referenteNome: string;
  referenteContattoId: string | null;
  logoPath: string;
  logoUrl?: string | null;
  sortOrder: number;
};

export const anagraficaSedeInputSchema = z.object({
  id: z.string().uuid().optional(),
  tipo: z.enum(ANAGRAFICA_SEDE_TIPI),
  nazione: z.string().trim().max(80).optional().default(""),
  provincia: z.string().trim().max(80).optional().default(""),
  citta: z.string().trim().max(120).optional().default(""),
  cap: z.string().trim().max(16).optional().default(""),
  indirizzo: z.string().trim().max(200).optional().default(""),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

export const anagraficaBrandInputSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(120),
  sitoWeb: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  telefono: z.string().trim().max(60).optional().default(""),
  referenteNome: z.string().trim().max(160).optional().default(""),
  referenteContattoId: z.string().uuid().nullable().optional().default(null),
  logoPath: z.string().trim().max(400).optional().default(""),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

export type AnagraficaSedeInput = z.infer<typeof anagraficaSedeInputSchema>;
export type AnagraficaBrandInput = z.infer<typeof anagraficaBrandInputSchema>;

export function emptyAnagraficaSede(
  tipo: AnagraficaSedeTipo,
  sortOrder = 0
): AnagraficaSede {
  return {
    id: crypto.randomUUID(),
    tipo,
    ...emptySede(),
    sortOrder,
  };
}

export function sedeFromAddress(
  tipo: AnagraficaSedeTipo,
  sede: SedeCliente,
  sortOrder = 0
): AnagraficaSede {
  const n = normalizeSede(sede);
  return {
    id: crypto.randomUUID(),
    tipo,
    ...n,
    sortOrder,
  };
}

export function isSedeAddressFilled(sede: Pick<AnagraficaSede, keyof SedeCliente>): boolean {
  return Boolean(
    sede.nazione.trim() &&
      sede.provincia.trim() &&
      sede.citta.trim() &&
      sede.cap.trim() &&
      sede.indirizzo.trim()
  );
}

export function isSedeAddressEmpty(sede: Pick<AnagraficaSede, keyof SedeCliente>): boolean {
  return !(
    sede.nazione.trim() ||
    sede.provincia.trim() ||
    sede.citta.trim() ||
    sede.cap.trim() ||
    sede.indirizzo.trim()
  );
}

export function firstSedeOfTipo(
  sedi: AnagraficaSede[],
  tipo: AnagraficaSedeTipo
): SedeCliente {
  const hit = sedi.find((s) => s.tipo === tipo);
  if (!hit) return emptySede();
  return normalizeSede({
    nazione: hit.nazione,
    provincia: hit.provincia,
    citta: hit.citta,
    cap: hit.cap,
    indirizzo: hit.indirizzo,
  });
}

export function sediFromLegacy(input: {
  sedeAmministrativa?: SedeCliente | null;
  sedeMagazzino?: SedeCliente | null;
}): AnagraficaSede[] {
  const out: AnagraficaSede[] = [];
  const amm = input.sedeAmministrativa ?? emptySede();
  out.push(sedeFromAddress("amministrativa", amm, 0));
  const mag = input.sedeMagazzino ?? emptySede();
  if (!isSedeAddressEmpty(mag)) {
    out.push(sedeFromAddress("magazzino", mag, 1));
  }
  return out;
}

export function emptyAnagraficaBrand(sortOrder = 0): AnagraficaBrand {
  return {
    id: crypto.randomUUID(),
    nome: "",
    sitoWeb: "",
    email: "",
    telefono: "",
    referenteNome: "",
    referenteContattoId: null,
    logoPath: "",
    logoUrl: null,
    sortOrder,
  };
}

export function normalizeSedeInput(s: AnagraficaSedeInput): AnagraficaSedeInput {
  return {
    id: s.id,
    tipo: s.tipo,
    ...normalizeSede({
      nazione: s.nazione ?? "",
      provincia: s.provincia ?? "",
      citta: s.citta ?? "",
      cap: s.cap ?? "",
      indirizzo: s.indirizzo ?? "",
    }),
    sortOrder: s.sortOrder ?? 0,
  };
}

export function normalizeBrandInput(b: AnagraficaBrandInput): AnagraficaBrandInput | null {
  const nome = b.nome.trim();
  if (!nome) return null;
  return {
    id: b.id,
    nome,
    sitoWeb: (b.sitoWeb ?? "").trim(),
    email: (b.email ?? "").trim(),
    telefono: (b.telefono ?? "").trim(),
    referenteNome: (b.referenteNome ?? "").trim(),
    referenteContattoId: b.referenteContattoId ?? null,
    logoPath: (b.logoPath ?? "").trim(),
    sortOrder: b.sortOrder ?? 0,
  };
}
