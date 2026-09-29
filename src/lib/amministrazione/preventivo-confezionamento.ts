import type { PreventivoScontisticaRiga } from "@/lib/amministrazione/preventivi";

/** Scelta di sistema: ripartizione che applica lo sconto di listino più alto. */
export const CONFEZIONE_SISTEMA = "__sistema__";

export type PezzoConfezione = {
  imballaggioVoceId: string;
  kg: number;
  pezzi: number;
  etichetta: string;
};

export type PianoConfezionamento = {
  modo: string;
  pezzi: PezzoConfezione[];
  restoKg: number;
  scontoPct: number;
  targa: string;
  testo: string;
  /** True se l’operatore ha forzato una sola confezione, non la proposta. */
  manuale: boolean;
};

type Pack = {
  imballaggioVoceId: string;
  kg: number;
  etichetta: string;
};

function milli(n: number) {
  return Math.round(n * 1000);
}

function fmtKg(n: number) {
  return (Math.round(n * 1000) / 1000).toLocaleString("it-IT", {
    maximumFractionDigits: 3,
  });
}

export function etichettaImballaggio(c: {
  imballaggioCodice?: string;
  imballaggioNome?: string;
  imballaggioLabel: string;
}): string {
  const codice = (c.imballaggioCodice ?? "").trim();
  const nome = (c.imballaggioNome ?? "").trim() || c.imballaggioLabel.trim();
  return [codice, nome].filter(Boolean).join(" ");
}

function packsDaCondizioni(condizioni: PreventivoScontisticaRiga[]): Pack[] {
  const map = new Map<string, Pack>();
  for (const c of condizioni) {
    if (!(c.kgConfezione > 0) || !c.imballaggioVoceId) continue;
    const prev = map.get(c.imballaggioVoceId);
    if (prev && prev.kg >= c.kgConfezione) continue;
    map.set(c.imballaggioVoceId, {
      imballaggioVoceId: c.imballaggioVoceId,
      kg: c.kgConfezione,
      etichetta: etichettaImballaggio(c),
    });
  }
  return [...map.values()].sort((a, b) => b.kg - a.kg);
}

export function confezioniListinoDistinte(
  condizioni: PreventivoScontisticaRiga[]
): Pack[] {
  return packsDaCondizioni(condizioni);
}

export function modoConfezioneApplicato(modo: string, ids: string[]) {
  if (!modo || modo === CONFEZIONE_SISTEMA) return CONFEZIONE_SISTEMA;
  if (ids.includes(modo)) return modo;
  return CONFEZIONE_SISTEMA;
}

function inFascia(c: PreventivoScontisticaRiga, qty: number) {
  if (qty < c.qtyDa - 0.0001) return false;
  if (c.qtyA != null && qty > c.qtyA + 0.0001) return false;
  return true;
}

function scontoMigliore(
  condizioni: PreventivoScontisticaRiga[],
  qty: number,
  ids: Set<string>
): { scontoPct: number; targa: string } {
  let best: PreventivoScontisticaRiga | null = null;
  for (const c of condizioni) {
    if (!ids.has(c.imballaggioVoceId) || !inFascia(c, qty)) continue;
    if (!best || c.scontoPct > best.scontoPct) best = c;
    else if (
      c.scontoPct === best.scontoPct &&
      c.kgConfezione > best.kgConfezione
    ) {
      best = c;
    }
  }
  if (!best || !(best.scontoPct > 0)) return { scontoPct: 0, targa: "" };
  return { scontoPct: best.scontoPct, targa: best.targa || "" };
}

function testoPezzi(pezzi: PezzoConfezione[], restoKg: number) {
  const parti = pezzi.map((p) => {
    const nome = p.pezzi === 1 ? "1 confezione" : `${p.pezzi} confezioni`;
    return `${nome} da ${fmtKg(p.kg)} kg Confezione "${p.etichetta}"`;
  });
  if (restoKg > 0.0001) {
    parti.push(`${fmtKg(restoKg)} kg restano fuori dalle confezioni`);
  }
  return parti.join(" + ") || "Nessuna confezione di listino copre questa quantità";
}

export function pianoConfezionamento(input: {
  quantita: number;
  condizioni: PreventivoScontisticaRiga[];
  modo: string;
}): PianoConfezionamento {
  const qty = Number.isFinite(input.quantita) ? input.quantita : 0;
  const packs = packsDaCondizioni(input.condizioni);
  const manuale = input.modo !== CONFEZIONE_SISTEMA && input.modo !== "";
  const ordine = manuale
    ? packs.filter((p) => p.imballaggioVoceId === input.modo)
    : packs;
  let rest = milli(Math.max(0, qty));
  const pezzi: PezzoConfezione[] = [];
  for (const p of ordine) {
    const kg = milli(p.kg);
    if (kg <= 0 || rest < kg) continue;
    const n = Math.floor(rest / kg);
    if (n <= 0) continue;
    pezzi.push({ ...p, pezzi: n });
    rest -= n * kg;
  }
  const restoKg = rest / 1000;
  const ids = new Set(
    manuale ? [input.modo] : pezzi.map((p) => p.imballaggioVoceId)
  );
  const sconto = scontoMigliore(input.condizioni, qty, ids);
  return {
    modo: manuale ? input.modo : CONFEZIONE_SISTEMA,
    pezzi,
    restoKg,
    scontoPct: sconto.scontoPct,
    targa: sconto.targa,
    testo: testoPezzi(pezzi, restoKg),
    manuale,
  };
}
