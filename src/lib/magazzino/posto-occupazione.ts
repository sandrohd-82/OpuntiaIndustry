import { z } from "zod";

export const POSTO_ELEMENTO_TIPI = ["isolamento", "confezione"] as const;
export type PostoElementoTipo = (typeof POSTO_ELEMENTO_TIPI)[number];

export const POSTO_ELEMENTO_TIPO_LABEL: Record<PostoElementoTipo, string> = {
  isolamento: "Isolamenti",
  confezione: "Confezioni",
};

const ALFABETO_NUMERO = "123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generaCodiceRandom(lunghezza: number): string {
  const n = Math.max(4, Math.min(12, lunghezza));
  let out = "";
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < n; i += 1) {
    out += ALFABETO_NUMERO[bytes[i]! % ALFABETO_NUMERO.length];
  }
  return out;
}

export const occupaPostoSchema = z.object({
  ubicazioneId: z.string().uuid(),
  tipoElemento: z.enum(POSTO_ELEMENTO_TIPI),
  imballaggioVoceId: z.string().uuid(),
  quantitaElementi: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  pesoKg: z.number().positive().max(100000).nullable().optional(),
  lottoInternoCodice: z.string().trim().max(80).nullable().optional(),
  lottoEsternoCodice: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export type OccupaPostoInput = z.infer<typeof occupaPostoSchema>;

export type PostoElemento = {
  id: string;
  numero: string;
  pesoKg: number | null;
  scanToken: string;
};

export type PostoOccupazione = {
  id: string;
  ubicazioneId: string;
  tipoElemento: PostoElementoTipo;
  imballaggioVoceId: string | null;
  imballaggioNome: string;
  quantitaElementi: number | null;
  codicePallet: string;
  lottoInternoCodice: string | null;
  lottoEsternoId: string | null;
  lottoEsternoCodice: string | null;
  note: string;
  elementi: PostoElemento[];
};

export function etichettaPayloadPallet(codicePallet: string): string {
  return `PLT:${codicePallet.trim().toUpperCase()}`;
}

export function etichettaPayloadElemento(
  codicePallet: string,
  numero: string
): string {
  return `EL:${codicePallet.trim().toUpperCase()}:${numero.trim().toUpperCase()}`;
}
