export type ImpostazioniSede = {
  id: string;
  codice: string;
  nome: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  nazione: string;
  attiva: boolean;
};

export function labelSede(s: Pick<ImpostazioniSede, "nome" | "citta" | "indirizzo">): string {
  const extra = [s.citta, s.indirizzo].map((x) => x.trim()).filter(Boolean);
  return extra.length ? `${s.nome} · ${extra.join(" · ")}` : s.nome;
}
