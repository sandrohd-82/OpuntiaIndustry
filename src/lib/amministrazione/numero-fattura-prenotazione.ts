import { isNumeroFatturaEmessa } from "@/lib/amministrazione/numero-fattura";

export type StatoPrenotazioneNumero =
  | "in_corso"
  | "aggiudicata"
  | "rilasciata"
  | "emessa";

export type PrenotazioneNumero = {
  id: string;
  numeroFattura: string;
  progressivo: number;
  anno: number;
  stato: StatoPrenotazioneNumero;
  incerto: boolean;
  numeroMin: string;
  numeroMax: string;
  altri: number;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function asObject(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (row == null) return null;
  if (typeof row === "string") {
    const parsed = JSON.parse(row) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  }
  if (typeof row === "object") return row as Record<string, unknown>;
  return null;
}

export function parsePrenotazioneNumero(data: unknown): PrenotazioneNumero {
  const obj = asObject(data);
  const id = String(obj?.id ?? "").trim();
  const numeroFattura = String(obj?.numero_fattura ?? "").trim();
  const stato = String(obj?.stato ?? "") as StatoPrenotazioneNumero;
  if (!id || !numeroFattura) {
    throw new Error("Prenotazione numero non valida.");
  }
  if (
    stato !== "in_corso" &&
    stato !== "aggiudicata" &&
    stato !== "rilasciata" &&
    stato !== "emessa"
  ) {
    throw new Error("Stato prenotazione non valido.");
  }
  return {
    id,
    numeroFattura,
    progressivo: Number(obj?.progressivo ?? 0),
    anno: Number(obj?.anno ?? 0),
    stato,
    incerto: Boolean(obj?.incerto),
    numeroMin: String(obj?.numero_min ?? numeroFattura),
    numeroMax: String(obj?.numero_max ?? numeroFattura),
    altri: Number(obj?.altri ?? 0),
  };
}

export function messaggioAvvisoNumero(
  pren: PrenotazioneNumero,
  numeroPrecedente: string | null
): string | null {
  const cambiato = Boolean(
    numeroPrecedente && numeroPrecedente !== pren.numeroFattura
  );
  if (pren.incerto) {
    return `Il numero ${pren.numeroFattura} non è sicuro: un altro operatore sta creando una fattura. Il numero può variare fra ${pren.numeroMin} e ${pren.numeroMax}. Chi completa prima si aggiudica il numero più basso.`;
  }
  if (cambiato) {
    return `Il numero è diventato ${pren.numeroFattura}. Chi ha completato prima si è aggiudicato il numero più basso.`;
  }
  return null;
}

export async function rpcPrenotazione(
  supabase: RpcClient,
  fn: string,
  args: Record<string, unknown>
): Promise<PrenotazioneNumero> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return parsePrenotazioneNumero(data);
}

export async function rpcNumeroEmesso(
  supabase: RpcClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ numeroFattura: string; numeroInterno: string }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  const obj = asObject(data);
  const numeroFattura = String(obj?.numero_fattura ?? "").trim();
  if (!isNumeroFatturaEmessa(numeroFattura)) {
    throw new Error("Numerazione fattura non valida.");
  }
  const numeroInterno =
    String(obj?.numero_interno ?? "").trim() || `Ft-${numeroFattura}`;
  return { numeroFattura, numeroInterno };
}
