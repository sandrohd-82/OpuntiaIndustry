import type { SessioneTest } from "@/lib/produzione/sessione-test-approvvigionamento";
import { sessioneTestVuota } from "@/lib/produzione/sessione-test-approvvigionamento";
import type { PropostaRevisione } from "@/lib/produzione/revisione-piano";

export const CHIAVE_MEMORIA_TEST = "opuntia.approvvigionamento.test.v1";

export type MemoriaTest = {
  attiva: boolean;
  email: string;
  sessione: SessioneTest;
  proposte: PropostaRevisione[];
};

export function memoriaTestVuota(): MemoriaTest {
  return { attiva: false, email: "", sessione: sessioneTestVuota(), proposte: [] };
}

export function leggiMemoriaTest(raw: string | null): MemoriaTest | null {
  if (!raw) return null;
  try {
    const valore = JSON.parse(raw) as Partial<MemoriaTest>;
    if (!valore.sessione || !Array.isArray(valore.sessione.ordini) || !Array.isArray(valore.proposte)) {
      return null;
    }
    return {
      attiva: Boolean(valore.attiva),
      email: typeof valore.email === "string" ? valore.email : "",
      sessione: valore.sessione,
      proposte: valore.proposte,
    };
  } catch {
    return null;
  }
}

export function serializzaMemoriaTest(memoria: MemoriaTest): string {
  return JSON.stringify(memoria);
}

/** Distrugge la prova. Non restituisce dati da salvare. */
export function annullaMemoriaTest(): null {
  return null;
}
