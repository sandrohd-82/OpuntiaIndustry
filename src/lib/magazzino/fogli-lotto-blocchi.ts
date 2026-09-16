import type { ConfezionamentoNodoDraft } from "@/lib/amministrazione/imballaggi-spedizioni";

export type FoglioLottoStampaModo = "blocco" | "collo" | "libera";

export type FoglioLottoPagina = {
  titoloUnita: string;
  dettaglioUnita: string;
  composizione: string;
  indice: number;
  totale: number;
};

function qty(n: ConfezionamentoNodoDraft): number {
  return typeof n.quantita === "number" && n.quantita > 0
    ? Math.round(n.quantita)
    : 0;
}

function nome(n: ConfezionamentoNodoDraft): string {
  return (n.nome || n.stadio).trim();
}

function figliPackaging(
  n: ConfezionamentoNodoDraft
): ConfezionamentoNodoDraft[] {
  return n.children.filter((c) => c.stadio !== "prodotto_kg");
}

function descrizioneFigli(n: ConfezionamentoNodoDraft): string {
  const pack = figliPackaging(n);
  const kg = n.children.filter((c) => c.stadio === "prodotto_kg");
  const parts = [
    ...pack.map((c) => `${qty(c)} ${nome(c)}`),
    ...kg.map((c) => {
      const k = typeof c.kgProdotto === "number" ? c.kgProdotto : 0;
      return `${k.toLocaleString("it-IT")} kg`;
    }),
  ];
  return parts.join(" + ") || "—";
}

function colliSulPallet(root: ConfezionamentoNodoDraft): {
  tot: number;
  voci: string;
} {
  const pack = figliPackaging(root);
  if (!pack.length) {
    return { tot: 1, voci: nome(root) };
  }
  const tot = pack.reduce((s, c) => s + qty(c), 0);
  return {
    tot,
    voci: pack.map((c) => `${qty(c)} ${nome(c)}`).join(" + "),
  };
}

export function contaFogliBlocco(nodi: ConfezionamentoNodoDraft[]): number {
  return nodi.reduce((s, n) => s + Math.max(qty(n), 0), 0);
}

export function contaFogliCollo(nodi: ConfezionamentoNodoDraft[]): number {
  return pagineFogliPerCollo(nodi).length;
}

export function pagineFogliPerBlocco(
  nodi: ConfezionamentoNodoDraft[]
): FoglioLottoPagina[] {
  const totBlocchi = contaFogliBlocco(nodi);
  const out: FoglioLottoPagina[] = [];
  let global = 0;
  for (const root of nodi) {
    const n = Math.max(qty(root), 0);
    for (let i = 1; i <= n; i += 1) {
      global += 1;
      out.push({
        titoloUnita: `Blocco ${i} di ${n}`,
        dettaglioUnita: nome(root),
        composizione: descrizioneFigli(root),
        indice: global,
        totale: totBlocchi,
      });
    }
  }
  return out;
}

export function pagineFogliPerCollo(
  nodi: ConfezionamentoNodoDraft[]
): FoglioLottoPagina[] {
  const out: FoglioLottoPagina[] = [];
  for (const root of nodi) {
    const palletQ = Math.max(qty(root), 0);
    if (!palletQ) continue;
    const pack = figliPackaging(root);
    const { tot, voci } = colliSulPallet(root);
    for (let p = 1; p <= palletQ; p += 1) {
      const palletLabel =
        palletQ > 1 ? `${nome(root)} ${p} di ${palletQ}` : nome(root);
      if (!pack.length) {
        out.push({
          titoloUnita: `Collo 1 di 1`,
          dettaglioUnita: palletLabel,
          composizione: `Colli su questa unità: ${voci} (totale ${tot})`,
          indice: 0,
          totale: 0,
        });
        continue;
      }
      let collo = 0;
      for (const child of pack) {
        const cq = Math.max(qty(child), 0);
        for (let c = 1; c <= cq; c += 1) {
          collo += 1;
          out.push({
            titoloUnita: `Collo ${collo} di ${tot}`,
            dettaglioUnita: `${nome(child)} su ${palletLabel}`,
            composizione: `Colli su questo pallet: ${voci} (totale ${tot})`,
            indice: 0,
            totale: 0,
          });
        }
      }
    }
  }
  const totale = out.length;
  return out.map((p, i) => ({ ...p, indice: i + 1, totale }));
}

export function pagineFogliLiberi(copie: number): FoglioLottoPagina[] {
  const n = Math.max(1, Math.min(200, Math.round(copie)));
  return Array.from({ length: n }, (_, i) => ({
    titoloUnita: n > 1 ? `Copia ${i + 1} di ${n}` : "Foglio lotto",
    dettaglioUnita: "Stampa libera",
    composizione: "",
    indice: i + 1,
    totale: n,
  }));
}

export function pagineFogliLotto(
  modo: FoglioLottoStampaModo,
  nodi: ConfezionamentoNodoDraft[],
  copieLibere: number
): FoglioLottoPagina[] {
  if (modo === "blocco") return pagineFogliPerBlocco(nodi);
  if (modo === "collo") return pagineFogliPerCollo(nodi);
  return pagineFogliLiberi(copieLibere);
}
