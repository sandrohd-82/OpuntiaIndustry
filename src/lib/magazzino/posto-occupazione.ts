import { z } from "zod";

export const POSTO_ELEMENTO_TIPI = ["isolamento", "confezione"] as const;
export type PostoElementoTipo = (typeof POSTO_ELEMENTO_TIPI)[number];

export const POSTO_ELEMENTO_TIPO_LABEL: Record<PostoElementoTipo, string> = {
  isolamento: "Sacchetto / isolamento",
  confezione: "Cartone / confezione",
};

export const POSTO_PESO_MODI = ["per_elemento", "complessivo"] as const;
export type PostoPesoModo = (typeof POSTO_PESO_MODI)[number];

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

export const occupaPostoSchema = z
  .object({
    ubicazioneId: z.string().uuid(),
    movimentazioneVoceId: z.string().uuid(),
    elementoVoceId: z.string().uuid(),
    quantitaElementi: z.number().int().min(1).max(200),
    pesoModo: z.enum(POSTO_PESO_MODI),
    pesiElementiKg: z.array(z.number().positive().max(100000)).max(200).optional(),
    pesoComplessivoKg: z.number().positive().max(100000).nullable().optional(),
    pesoMotivazione: z.string().trim().max(500).optional(),
    prodottoId: z.string().uuid().optional(),
    lottoInternoCodice: z.string().trim().max(120).nullable().optional(),
    lottoEsternoId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    const interno = v.lottoInternoCodice?.trim() || "";
    const esterno = v.lottoEsternoId?.trim() || "";
    if (!interno && !esterno) {
      ctx.addIssue({
        code: "custom",
        message: "Seleziona un lotto interno o esterno.",
      });
    }
    if (v.pesoModo === "per_elemento") {
      const pesi = v.pesiElementiKg ?? [];
      if (pesi.length !== v.quantitaElementi) {
        ctx.addIssue({
          code: "custom",
          message: "Indica il peso di ogni elemento.",
        });
      }
    } else {
      if (v.pesoComplessivoKg == null) {
        ctx.addIssue({
          code: "custom",
          message: "Indica il peso complessivo della movimentazione.",
        });
      }
      if (!(v.pesoMotivazione ?? "").trim()) {
        ctx.addIssue({
          code: "custom",
          message: "La motivazione è obbligatoria se usi il peso complessivo.",
        });
      }
    }
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
  movimentazioneVoceId: string | null;
  movimentazioneNome: string;
  imballaggioVoceId: string | null;
  imballaggioNome: string;
  quantitaElementi: number | null;
  codicePallet: string;
  pesoModo: PostoPesoModo;
  pesoComplessivoKg: number | null;
  pesoMotivazione: string;
  prodottoId: string | null;
  kgAllocati: number | null;
  lottoInternoCodice: string | null;
  lottoEsternoId: string | null;
  lottoEsternoCodice: string | null;
  note: string;
  elementi: PostoElemento[];
};

export type LottoDaSistemare = {
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  lottoInterno: string;
  lottoEsternoId: string | null;
  lottoEsternoCodice: string | null;
  kgCaricati: number;
  kgSistemati: number;
  kgDaSistemare: number;
};

export type ImballaggioPostoOpt = {
  id: string;
  codice: string;
  nome: string;
  stadio: "movimentazione" | "confezione" | "isolamento";
};

function formatKgRiepilogo(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const t = Number(n.toFixed(2));
  return Number.isInteger(t) ? String(t) : String(t);
}

/** Testo sull’area cliccata: 1 Pallet 5 sacchetti peso totale 550kg codice pallet … */
export function riepilogoOccupazionePosto(occ: PostoOccupazione): string {
  const nEl = occ.quantitaElementi ?? occ.elementi.length;
  const isolamento = occ.tipoElemento === "isolamento";
  const tipo =
    nEl === 1
      ? isolamento
        ? "sacchetto"
        : "cartone"
      : isolamento
        ? "sacchetti"
        : "cartoni";
  const pesoElementi = occ.elementi.reduce((s, e) => s + (e.pesoKg ?? 0), 0);
  const peso =
    occ.pesoModo === "complessivo" && occ.pesoComplessivoKg != null
      ? Number(occ.pesoComplessivoKg)
      : pesoElementi > 0
        ? pesoElementi
        : Number(occ.kgAllocati ?? 0);
  const parti = ["1 Pallet", `${Math.max(0, nEl)} ${tipo}`];
  const kg = formatKgRiepilogo(peso);
  if (kg) parti.push(`peso totale ${kg}kg`);
  const codice = occ.codicePallet.trim();
  if (codice) parti.push(`codice pallet ${codice}`);
  return parti.join(" ");
}

export function etichettaPayloadPallet(codicePallet: string): string {
  return `PLT:${codicePallet.trim().toUpperCase()}`;
}

export function etichettaPayloadElemento(
  codicePallet: string,
  numero: string
): string {
  return `EL:${codicePallet.trim().toUpperCase()}:${numero.trim().toUpperCase()}`;
}
