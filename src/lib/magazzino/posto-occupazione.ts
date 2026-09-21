import { z } from "zod";
import { parseLottoAgrinsicilia } from "@/lib/magazzino/lotto-agrinsicilia";

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

export const rettificaOccupazionePostoSchema = z
  .object({
    occupazioneId: z.string().uuid(),
    giustificazione: z.string().trim().min(8).max(800),
    quantitaElementi: z.number().int().min(1).max(200),
    pesoModo: z.enum(POSTO_PESO_MODI),
    pesiElementiKg: z.array(z.number().positive().max(100000)).max(200).optional(),
    pesoComplessivoKg: z.number().positive().max(100000).nullable().optional(),
    note: z.string().trim().max(500).optional(),
    prodottoId: z.string().uuid().optional(),
    lottoInternoCodice: z.string().trim().max(120).nullable().optional(),
    lottoEsternoId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pesoModo === "per_elemento") {
      const pesi = v.pesiElementiKg ?? [];
      if (pesi.length !== v.quantitaElementi) {
        ctx.addIssue({
          code: "custom",
          message: "Indica il peso di ogni elemento.",
        });
      }
    } else if (v.pesoComplessivoKg == null) {
      ctx.addIssue({
        code: "custom",
        message: "Indica il peso complessivo della movimentazione.",
      });
    }
  });

export type RettificaOccupazionePostoInput = z.infer<
  typeof rettificaOccupazionePostoSchema
>;

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

export type ProdottoLottoElenco = {
  id: string;
  codice: string;
  nome: string;
};

export type DettaglioElencoPosto = {
  occupazione: PostoOccupazione | null;
  prodotto: ProdottoLottoElenco | null;
};

export type RiepilogoElencoPosto = {
  targa: string;
  quantitaTotaleKg: number | null;
  testo: string;
};

export type ConfezionamentoPiantaRiga = {
  elementoId: string;
  occupazioneId: string;
  ubicazioneId: string;
  postoCodice: string;
  postoNome: string;
  codiceElemento: string;
  codicePallet: string;
  pesoKg: number | null;
  tipoSacco: string;
  targa: string;
  lottoInterno: string;
  movimentazioneNome: string;
};

export type GruppoPostoPianta = {
  ubicazioneId: string;
  postoCodice: string;
  postoNome: string;
  movimentazione: string;
  pesoTotaleKg: number | null;
  righe: ConfezionamentoPiantaRiga[];
};

export function gruppiPostoDaRighe(
  righe: ConfezionamentoPiantaRiga[]
): GruppoPostoPianta[] {
  const map = new Map<string, GruppoPostoPianta>();
  for (const r of righe) {
    const key = r.ubicazioneId || r.occupazioneId;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        ubicazioneId: r.ubicazioneId,
        postoCodice: r.postoCodice,
        postoNome: r.postoNome,
        movimentazione: r.movimentazioneNome.trim(),
        pesoTotaleKg: null,
        righe: [r],
      });
      continue;
    }
    prev.righe.push(r);
    const mov = r.movimentazioneNome.trim();
    if (mov && !prev.movimentazione.split(", ").includes(mov)) {
      prev.movimentazione = prev.movimentazione
        ? `${prev.movimentazione}, ${mov}`
        : mov;
    }
  }
  const out = [...map.values()];
  for (const g of out) {
    const tot = g.righe.reduce((s, r) => s + (Number(r.pesoKg) || 0), 0);
    g.pesoTotaleKg = tot > 0 ? Math.round(tot * 1000) / 1000 : null;
  }
  return out.sort((a, b) =>
    (a.postoCodice || a.ubicazioneId).localeCompare(
      b.postoCodice || b.ubicazioneId,
      "it"
    )
  );
}

export type OccupazioneLottoPianta = {
  lottoInterno: string;
  prodottoId: string;
  prodottoCodice: string;
  riepilogo: string;
  palletCount: number;
  elementiCount: number;
  righe: ConfezionamentoPiantaRiga[];
};

export function etichettaPalletESacchi(
  palletCount: number,
  elementiCount: number,
  tipoElemento?: PostoElementoTipo | null
): string {
  const p = Math.max(0, palletCount);
  const n = Math.max(0, elementiCount);
  const isolamento = tipoElemento !== "confezione";
  const palletTxt = p === 1 ? "1 pallet" : `${p} pallet`;
  const elTxt =
    n === 1
      ? isolamento
        ? "1 sacco"
        : "1 cartone"
      : isolamento
        ? `${n} sacchi`
        : `${n} cartoni`;
  if (!p && !n) return "";
  if (!p) return elTxt;
  if (!n) return palletTxt;
  return `${palletTxt} e ${elTxt}`;
}

export function pesoOccupazioneKg(occ: PostoOccupazione): number | null {
  const pesoEl = occ.elementi.reduce((s, e) => s + (e.pesoKg ?? 0), 0);
  const n =
    occ.pesoModo === "complessivo" && occ.pesoComplessivoKg != null
      ? Number(occ.pesoComplessivoKg)
      : pesoEl > 0
        ? pesoEl
        : Number(occ.kgAllocati ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatKgIt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("it-IT")} kg`;
}

export function targaProdottoOccupazione(
  occ: PostoOccupazione,
  codiceProdotto?: string | null
): string {
  const daProdotto = (codiceProdotto ?? "").trim();
  if (daProdotto) return daProdotto;
  const daLotto = parseLottoAgrinsicilia(occ.lottoInternoCodice || "");
  return daLotto?.targaProdotto.trim() || "";
}

function formatKgRiepilogo(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const t = Number(n.toFixed(2));
  return Number.isInteger(t) ? String(t) : String(t);
}

/** Righe sul box cliccato: 1 pallet / 8 sacchetti / X kg tot. / Prod. NDRi */
export function righeOccupazionePosto(
  occ: PostoOccupazione,
  codiceProdotto?: string | null
): string[] {
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
  const peso = pesoOccupazioneKg(occ);
  const kg = peso != null ? formatKgRiepilogo(peso) : "";
  const targa = targaProdottoOccupazione(occ, codiceProdotto);
  const righe = ["1 pallet", `${Math.max(0, nEl)} ${tipo}`];
  if (kg) righe.push(`${kg} kg tot.`);
  if (targa) righe.push(`Prod. ${targa}`);
  return righe;
}

export function riepilogoOccupazionePosto(
  occ: PostoOccupazione,
  codiceProdotto?: string | null
): string {
  return righeOccupazionePosto(occ, codiceProdotto).join("\n");
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

async function fetchOccupazioneJson<T extends { success: boolean; error?: string }>(
  url: string,
  timeoutMs = 15000
): Promise<T | { success: false; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!data || !("success" in data)) {
      return { success: false, error: "Occupazione non disponibile." };
    }
    return data;
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      success: false,
      error: aborted
        ? "Lettura occupazione troppo lenta. Riprova."
        : "Occupazione non disponibile.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDettaglioOccupazionePosto(
  ubicazioneId: string
): Promise<
  | { success: true; dettaglio: DettaglioElencoPosto }
  | { success: false; error: string }
> {
  if (!ubicazioneId) {
    return { success: true, dettaglio: { occupazione: null, prodotto: null } };
  }
  const q = new URLSearchParams({ ubicazioneId });
  const data = await fetchOccupazioneJson<
    | { success: true; dettaglio: DettaglioElencoPosto }
    | { success: false; error?: string }
  >(`/api/magazzino/posto-occupazione?${q}`);
  if (!data.success) {
    return {
      success: false,
      error: data.error || "Occupazione non disponibile.",
    };
  }
  return data;
}

export async function fetchRiepilogoOccupazionePosti(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, RiepilogoElencoPosto> }
  | { success: false; error: string }
> {
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, RiepilogoElencoPosto> = {};
  if (!ids.length) return { success: true, perPosto };

  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const q = new URLSearchParams({ ids: chunk.join(",") });
    const data = await fetchOccupazioneJson<
      | { success: true; perPosto: Record<string, RiepilogoElencoPosto> }
      | { success: false; error?: string }
    >(`/api/magazzino/posto-occupazione?${q}`, 20000);
    if (!data.success) {
      return {
        success: false,
        error: data.error || "Occupazione non disponibile.",
      };
    }
    Object.assign(perPosto, data.perPosto);
  }
  return { success: true, perPosto };
}

export async function fetchOccupazioniPiantaProdotto(
  prodottoId: string,
  lotti: string[] = []
): Promise<
  | { success: true; perLotto: Record<string, OccupazioneLottoPianta> }
  | { success: false; error: string }
> {
  if (!prodottoId) return { success: true, perLotto: {} };
  const q = new URLSearchParams({ prodottoId });
  if (lotti.length) q.set("lotti", lotti.filter(Boolean).join(","));
  const data = await fetchOccupazioneJson<
    | { success: true; perLotto: Record<string, OccupazioneLottoPianta> }
    | { success: false; error?: string }
  >(`/api/magazzino/posto-occupazione?${q}`, 20000);
  if (!data.success) {
    return {
      success: false,
      error: data.error || "Occupazione non disponibile.",
    };
  }
  return data;
}
