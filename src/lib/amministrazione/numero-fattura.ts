/**
 * Numero fiscale.
 * Fino al 31/12/2026: NN/ANNO (es. 22/2026).
 * Dal 01/01/2027: YY/CCCC (es. 27/0001). Lo sceglie la data di emissione.
 */

/** 22/2026, 01/2026 */
export const NUMERO_FATTURA_ANNO_RE = /^(\d+)\/(20\d{2})$/;
/** 27/0001 */
export const NUMERO_FATTURA_PROGRESSIVO_RE = /^(\d{2})\/(\d{4})$/;

export function isNumeroFatturaEmessa(value: string): boolean {
  const s = value.trim();
  const anno = s.match(NUMERO_FATTURA_ANNO_RE);
  if (anno && Number(anno[2]) <= 2026) return true;
  const prog = s.match(NUMERO_FATTURA_PROGRESSIVO_RE);
  if (!prog) return false;
  return Number(prog[2]) < 2000;
}

export type NumeroFatturaAssegnato = {
  numeroFattura: string;
  numeroInterno: string;
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

function parsePayload(data: unknown): NumeroFatturaAssegnato {
  const row = Array.isArray(data) ? data[0] : data;
  const obj =
    typeof row === "string"
      ? (JSON.parse(row) as { numero_fattura?: string; numero_interno?: string })
      : (row as { numero_fattura?: string; numero_interno?: string } | null);
  const numeroFattura = String(obj?.numero_fattura ?? "").trim();
  if (!isNumeroFatturaEmessa(numeroFattura)) {
    throw new Error("Numerazione fattura non valida.");
  }
  const numeroInterno =
    String(obj?.numero_interno ?? "").trim() || `Ft-${numeroFattura}`;
  return { numeroFattura, numeroInterno };
}

/** Prossimo numero, senza consumarlo. L'assegnazione vera è in assegnaNumeroFattura. */
export async function anteprimaNumeroFattura(
  supabase: RpcClient,
  dataDocumento: string
): Promise<NumeroFatturaAssegnato> {
  const { data, error } = await supabase.rpc("anteprima_numero_fattura", {
    p_data: dataDocumento,
  });
  if (error) throw new Error(error.message);
  return parsePayload(data);
}

/** Incremento atomico del progressivo aziendale dell'anno della data di emissione. */
export async function assegnaNumeroFattura(
  supabase: RpcClient,
  dataDocumento: string
): Promise<NumeroFatturaAssegnato> {
  const { data, error } = await supabase.rpc("next_numero_fattura", {
    p_data: dataDocumento,
  });
  if (error) throw new Error(error.message);
  return parsePayload(data);
}

/** Se il documento importato ha già un numero della serie attiva, il contatore non resta indietro. */
export async function allineaProgressivoFattura(
  supabase: RpcClient,
  numeroFattura: string
): Promise<void> {
  if (!isNumeroFatturaEmessa(numeroFattura.trim())) return;
  const { error } = await supabase.rpc("allinea_progressivo_fattura", {
    p_numero: numeroFattura.trim(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Numero da mostrare in elenchi, dettaglio e anteprima.
 * Fino al 2026: 22/2026. Dal 2027: 27/0001. Storico: il numero già salvato.
 */
export function numeroFatturaVisibile(input: {
  kind?: string | null;
  numeroFattura?: string | null;
  numeroInterno?: string | null;
}): string {
  const kind = input.kind ?? "";
  if (kind === "nota_credito" || kind === "ricevuta") {
    return (input.numeroInterno ?? "").trim();
  }
  const pubblico = (input.numeroFattura ?? "").trim();
  if (pubblico) return pubblico;
  const interno = (input.numeroInterno ?? "").trim();
  if (interno.toUpperCase().startsWith("FT-")) return interno.slice(3);
  return interno;
}
