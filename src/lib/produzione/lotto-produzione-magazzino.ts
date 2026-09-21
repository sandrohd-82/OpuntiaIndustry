/** Prelievo lotti da magazzino per inserimento in produzione (ISO 9001 §8.5.2). */

export type LottoMagazzinoPrelievo = {
  lottoInternoCodice: string;
  quantitaKg: number;
  ultimoAt: string;
  lottoEsternoId: string | null;
  lottoEsternoCodice: string | null;
};

export type LottoPrelievoUsato = LottoMagazzinoPrelievo & { usatoKg: number };

export type ModoLottoProduzione = "unico" | "singolo_copre" | "cumulativo";

export type SelezioneLottiProduzione = {
  selected: LottoPrelievoUsato[];
  mode: ModoLottoProduzione;
  copre: boolean;
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function withUsage(
  rows: LottoMagazzinoPrelievo[],
  richiestaKg: number
): LottoPrelievoUsato[] {
  let rest =
    richiestaKg > 1e-9
      ? richiestaKg
      : rows.reduce((s, r) => s + r.quantitaKg, 0);
  return rows.map((r) => {
    const usatoKg = Math.min(r.quantitaKg, Math.max(0, rest));
    rest = round3(rest - usatoKg);
    return { ...r, usatoKg: round3(usatoKg) };
  });
}

/**
 * Un lotto in giacenza, oppure uno solo che copre la richiesta (best-fit),
 * altrimenti FIFO cumulativo dei lotti necessari.
 */
export function selezionaLottiPerRichiesta(
  lotti: LottoMagazzinoPrelievo[],
  richiestaKg: number
): SelezioneLottiProduzione {
  const disponibili = lotti
    .filter((l) => l.quantitaKg > 1e-9)
    .slice()
    .sort(
      (a, b) =>
        a.ultimoAt.localeCompare(b.ultimoAt) ||
        a.lottoInternoCodice.localeCompare(b.lottoInternoCodice)
    );

  const need = Number.isFinite(richiestaKg) && richiestaKg > 0 ? richiestaKg : 0;

  if (disponibili.length === 0) {
    return { selected: [], mode: "unico", copre: false };
  }

  if (disponibili.length === 1 || need <= 0) {
    const one = [disponibili[0]!];
    const tot = one[0]!.quantitaKg;
    return {
      selected: withUsage(one, need),
      mode: disponibili.length === 1 ? "unico" : "singolo_copre",
      copre: need <= 0 || tot + 1e-9 >= need,
    };
  }

  const coprono = disponibili.filter((l) => l.quantitaKg + 1e-9 >= need);
  if (coprono.length > 0) {
    coprono.sort(
      (a, b) =>
        a.quantitaKg - b.quantitaKg || a.ultimoAt.localeCompare(b.ultimoAt)
    );
    return {
      selected: withUsage([coprono[0]!], need),
      mode: "singolo_copre",
      copre: true,
    };
  }

  const acc: LottoMagazzinoPrelievo[] = [];
  let rest = need;
  for (const l of disponibili) {
    acc.push(l);
    rest = round3(rest - l.quantitaKg);
    if (rest <= 1e-9) break;
  }
  const tot = acc.reduce((s, l) => s + l.quantitaKg, 0);
  return {
    selected: withUsage(acc, need),
    mode: acc.length <= 1 ? "singolo_copre" : "cumulativo",
    copre: tot + 1e-9 >= need,
  };
}

export function messaggioLottoProduzione(
  mode: ModoLottoProduzione,
  selected: LottoPrelievoUsato[],
  persistito: boolean
): string {
  const interni = selected
    .map(
      (l) =>
        `${l.lottoInternoCodice} (${l.usatoKg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg)`
    )
    .join(" + ");
  if (mode === "cumulativo") {
    return persistito
      ? `Lotto esterno cumulativo dei lotti interni ${interni}.`
      : `Servono più lotti interni (${interni}). Il lotto esterno cumulativo verrà registrato al salvataggio.`;
  }
  if (mode === "unico") {
    return `Un solo lotto in magazzino: ${interni}. Si usa il lotto esterno già associato.`;
  }
  return `La quantità è coperta da un solo lotto: ${interni}. Si usa il lotto esterno già associato.`;
}
