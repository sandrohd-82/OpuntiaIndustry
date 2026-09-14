export const UNITA_CODICE_RE = /^[A-Z][1-9][0-9]{0,8}$/;
export const UNITA_SCAN_PREFIX = "OI-U/";

export type IngressoMpUnita = {
  id: string;
  foglioId: string;
  confezioneId: string | null;
  confezionamentoId: string;
  tipoNome: string;
  gruppoLettera: string;
  indiceTipo: number;
  totaleTipo: number;
  codiceUnita: string;
  scanToken: string;
  scanPayload: string;
  usatoAt: string | null;
};

export function composeCodiceUnita(lettera: string, n: number): string {
  const L = lettera.trim().toUpperCase();
  if (!/^[A-Z]$/.test(L) || !Number.isInteger(n) || n < 1) {
    throw new Error("Codice contenitore non valido.");
  }
  return `${L}${n}`;
}

export function scanPayloadFromToken(token: string): string {
  return `${UNITA_SCAN_PREFIX}${token.trim()}`;
}

export function parseUnitaScanInput(raw: string): {
  token: string | null;
  codice: string | null;
} {
  const v = String(raw ?? "").trim();
  if (!v) return { token: null, codice: null };
  const upper = v.toUpperCase();
  if (upper.startsWith(UNITA_SCAN_PREFIX)) {
    return { token: v.slice(UNITA_SCAN_PREFIX.length).trim() || null, codice: null };
  }
  if (UNITA_CODICE_RE.test(upper)) {
    return { token: null, codice: upper };
  }
  return { token: null, codice: null };
}

export function isUnitaScanInput(raw: string): boolean {
  const parsed = parseUnitaScanInput(raw);
  return Boolean(parsed.token || parsed.codice);
}

export function quantitaContenitoriRiga(raw: string | number | null | undefined): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Anteprima fogli (un foglio per contenitore) prima dell’emissione reale. */
export function buildAnteprimaUnita(opts: {
  foglioId?: string;
  lettera: string;
  righe: Array<{
    confezionamentoId: string;
    tipoNome: string;
    quantitaConfezioni: number;
  }>;
}): IngressoMpUnita[] {
  const L = /^[A-Z]$/.test(opts.lettera.trim().toUpperCase())
    ? opts.lettera.trim().toUpperCase()
    : "A";
  const out: IngressoMpUnita[] = [];
  let n = 1;
  for (const r of opts.righe) {
    const q = Math.max(0, Math.trunc(r.quantitaConfezioni));
    if (!r.confezionamentoId || q < 1) continue;
    const tipo = r.tipoNome.trim() || "Contenitore";
    for (let i = 1; i <= q; i += 1) {
      const token = `ANTEPRIMA-${n}`;
      out.push({
        id: `preview-${n}`,
        foglioId: opts.foglioId ?? "",
        confezioneId: null,
        confezionamentoId: r.confezionamentoId,
        tipoNome: tipo,
        gruppoLettera: L,
        indiceTipo: i,
        totaleTipo: q,
        codiceUnita: composeCodiceUnita(L, n),
        scanToken: token,
        scanPayload: scanPayloadFromToken(token),
        usatoAt: null,
      });
      n += 1;
    }
  }
  return out;
}
