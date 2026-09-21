import {
  nodiToBlocchi,
  type ConfezionamentoDraft,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  occupaPostoSchema,
  type OccupaPostoInput,
  type PostoPesoModo,
} from "@/lib/magazzino/posto-occupazione";

function numPos(v: number | "" | null | undefined): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function mappaBloccoPianta(draft: ConfezionamentoDraft):
  | {
      ok: true;
      movimentazioneVoceId: string;
      elementoVoceId: string;
      quantita: number;
    }
  | { ok: false; error: string } {
  const blocchi = nodiToBlocchi(draft.nodi);
  const completi = blocchi.filter(
    (b) =>
      Boolean(b.movimentazione?.catalogoId) &&
      Boolean(b.confezionamento?.catalogoId || b.isolamento?.catalogoId)
  );
  if (completi.length === 0) {
    return {
      ok: false,
      error:
        "Per occupare il posto in pianta serve un blocco con movimentazione (es. pallet) e confezione o isolamento.",
    };
  }
  if (completi.length > 1) {
    return {
      ok: false,
      error:
        "Con un posto selezionato usa un solo blocco, come in pianta: una movimentazione e gli elementi sopra.",
    };
  }
  const b = completi[0]!;
  const el = b.confezionamento?.catalogoId
    ? b.confezionamento
    : b.isolamento!;
  const q =
    typeof el.quantita === "number" && el.quantita >= 1
      ? Math.floor(el.quantita)
      : 0;
  if (q < 1) {
    return {
      ok: false,
      error:
        "Indica il numero di elementi (confezioni o isolamenti) da mettere sul posto.",
    };
  }
  return {
    ok: true,
    movimentazioneVoceId: b.movimentazione!.catalogoId!,
    elementoVoceId: el.catalogoId!,
    quantita: Math.min(200, q),
  };
}

export function qtyElementiPianta(draft: ConfezionamentoDraft): number {
  const m = mappaBloccoPianta(draft);
  return m.ok ? m.quantita : 0;
}

export function pesiAllineatiAQty(
  qty: number,
  esistenti: Array<number | ""> | undefined,
  kgTotale: number
): Array<number | ""> {
  const n = Math.max(0, Math.min(200, Math.floor(qty)));
  const prev = esistenti ?? [];
  const filled = prev.filter(
    (p): p is number => typeof p === "number" && p > 0
  );
  const defaultEach =
    n > 0 && kgTotale > 0
      ? Math.round((kgTotale / n) * 1000) / 1000
      : ("" as const);
  const out: Array<number | ""> = [];
  for (let i = 0; i < n; i += 1) {
    const cur = prev[i];
    if (typeof cur === "number" && cur > 0) out.push(cur);
    else if (filled.length === 0 && defaultEach !== "") out.push(defaultEach);
    else out.push(cur ?? defaultEach);
  }
  return out;
}

export function occupazioneInputDaCarico(input: {
  ubicazioneId: string;
  prodottoId: string;
  lottoInternoCodice: string;
  lottoEsternoId?: string | null;
  draft: ConfezionamentoDraft;
  note?: string;
}): { ok: true; occupa: OccupaPostoInput } | { ok: false; error: string } {
  const blocco = mappaBloccoPianta(input.draft);
  if (!blocco.ok) return blocco;
  const pesoModo: PostoPesoModo =
    input.draft.pesoModo === "complessivo" ? "complessivo" : "per_elemento";
  let pesiElementiKg: number[] | undefined;
  let pesoComplessivoKg: number | null | undefined;
  let pesoMotivazione: string | undefined;
  if (pesoModo === "per_elemento") {
    const raw = input.draft.pesiElementiKg ?? [];
    pesiElementiKg = [];
    for (let i = 0; i < blocco.quantita; i += 1) {
      const n = numPos(raw[i]);
      if (n == null) {
        return {
          ok: false,
          error: `Indica il peso dell'elemento ${i + 1} (kg), come in pianta.`,
        };
      }
      pesiElementiKg.push(n);
    }
  } else {
    pesoComplessivoKg = numPos(input.draft.pesoComplessivoKg);
    if (pesoComplessivoKg == null) {
      return {
        ok: false,
        error: "Indica il peso complessivo della movimentazione (kg).",
      };
    }
    pesoMotivazione = (input.draft.pesoMotivazione ?? "").trim();
    if (!pesoMotivazione) {
      return {
        ok: false,
        error:
          "La motivazione del peso complessivo è obbligatoria, come in pianta.",
      };
    }
  }
  const occupa: OccupaPostoInput = {
    ubicazioneId: input.ubicazioneId,
    movimentazioneVoceId: blocco.movimentazioneVoceId,
    elementoVoceId: blocco.elementoVoceId,
    quantitaElementi: blocco.quantita,
    pesoModo,
    pesiElementiKg,
    pesoComplessivoKg,
    pesoMotivazione,
    prodottoId: input.prodottoId,
    lottoInternoCodice: input.lottoInternoCodice.trim(),
    lottoEsternoId: input.lottoEsternoId?.trim() || null,
    note: input.note,
  };
  const parsed = occupaPostoSchema.safeParse(occupa);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dati occupazione non validi.",
    };
  }
  return { ok: true, occupa: parsed.data };
}
