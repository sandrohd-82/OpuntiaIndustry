import { normalizzaUnitaApprovvigionamento } from "@/lib/produzione/unita-approvvigionamento";
import type { VoceRevisione } from "@/lib/produzione/revisione-piano";

export type StatoAccordoFornitore =
  | "in_attesa"
  | "accettato"
  | "modifica_richiesta"
  | "revisione_da_pubblicare"
  | "nuova_accettazione";

export type DifferenzaRevisione = {
  codice: string;
  attuale: string;
  proposto: string;
  esito: "modificata" | "aggiunta" | "eliminata";
};

export type RigaBozzaRevisione = {
  materiaPrimaId: string;
  codice: string;
  quantita: number;
  unitaMisura: string;
  unitaNome: string;
  tipoQuantita: "precisa" | "stimata";
  note: string;
};

const ETICHETTE: Record<StatoAccordoFornitore, string> = {
  in_attesa: "In attesa di risposta",
  accettato: "Accettato",
  modifica_richiesta: "Modifica richiesta",
  revisione_da_pubblicare: "Revisione da pubblicare",
  nuova_accettazione: "Nuova accettazione necessaria",
};

export function etichettaStatoAccordo(stato: StatoAccordoFornitore): string {
  return ETICHETTE[stato];
}

export function tipoRispostaAccordo(
  valore: string | null | undefined
): "conferma" | "proposta" | "indisponibilita" | "rifiuto" | null {
  if (
    valore === "conferma" ||
    valore === "proposta" ||
    valore === "indisponibilita" ||
    valore === "rifiuto"
  ) {
    return valore;
  }
  return null;
}

export function statoRispostaAccordo(
  valore: string | null | undefined
): "accettata" | "in_esame" | "respinta" | null {
  if (valore === "accettata" || valore === "in_esame" || valore === "respinta") return valore;
  return null;
}

/** Stato visibile dell'accordo sulla versione pubblicata corrente. Non pubblica e non scrive. */
export function statoAccordoFornitore(input: {
  pubblicato: boolean;
  annullata: boolean;
  bozzaNonPubblicata: boolean;
  rispostaTipo: "conferma" | "proposta" | "indisponibilita" | "rifiuto" | null;
  rispostaStato: "accettata" | "in_esame" | "respinta" | null;
  confermaSuVersionePrecedente: boolean;
}): StatoAccordoFornitore | null {
  if (!input.pubblicato || input.annullata) return null;
  if (input.bozzaNonPubblicata) return "revisione_da_pubblicare";
  if (input.rispostaTipo && input.rispostaTipo !== "conferma" && input.rispostaStato !== "respinta") {
    return "modifica_richiesta";
  }
  if (input.rispostaTipo === "conferma" && input.rispostaStato === "accettata") return "accettato";
  if (input.rispostaStato === "respinta") return null;
  if (input.confermaSuVersionePrecedente) return "nuova_accettazione";
  return "in_attesa";
}

export function chiaveRevisioneRisposta(rispostaId: string): string {
  return `rev-risp-${rispostaId}`;
}

export function chiaveEstensioneRisposta(rispostaId: string): string {
  return `rve-risp-${rispostaId}`;
}

export function chiaveVoceRevisione(
  voceId: string,
  tipo: "aggiorna" | "annulla" | "aggiungi" | "estendi"
): string {
  let prefisso = "rve-";
  if (tipo === "aggiorna") prefisso = "rvu-";
  if (tipo === "annulla") prefisso = "rva-";
  if (tipo === "aggiungi") prefisso = "rvg-";
  return `${prefisso}${voceId}`;
}

export function propostaProntaPerRevisione(voci: readonly { stato: string }[]): boolean {
  return (
    voci.length > 0 &&
    voci.every((voce) => voce.stato !== "in_esame") &&
    voci.some((voce) => voce.stato === "accettata")
  );
}

export function riepilogoVociAccettate(voci: readonly VoceRevisione[]): {
  applicabile: boolean;
  motivo: string | null;
  differenze: DifferenzaRevisione[];
} {
  if (voci.some((voce) => voce.stato === "in_esame")) {
    return {
      applicabile: false,
      motivo: "Chiudi prima le modifiche ancora in esame.",
      differenze: [],
    };
  }
  const accettate = voci.filter((voce) => voce.stato === "accettata");
  if (!accettate.length) {
    return {
      applicabile: false,
      motivo: "Nessuna modifica accettata da copiare sulla bozza.",
      differenze: [],
    };
  }
  return {
    applicabile: true,
    motivo: null,
    differenze: accettate.map(differenzaVoce),
  };
}

function differenzaVoce(voce: VoceRevisione): DifferenzaRevisione {
  if (voce.operazione === "aggiunta") {
    return {
      codice: voce.codice,
      attuale: "—",
      proposto: `${voce.dataDopo ?? ""} · ${voce.quantitaDopo ?? ""} ${voce.unita}`.trim(),
      esito: "aggiunta",
    };
  }
  if (voce.operazione === "eliminazione") {
    return {
      codice: voce.codice,
      attuale: `${voce.dataPrima ?? ""} · ${voce.quantitaPrima ?? ""} ${voce.unita}`.trim(),
      proposto: "Eliminata",
      esito: "eliminata",
    };
  }
  const attuale = [voce.dataPrima, voce.quantitaPrima != null ? `${voce.quantitaPrima} ${voce.unita}` : null]
    .filter(Boolean)
    .join(" · ");
  const proposto = [voce.dataDopo, voce.quantitaDopo != null ? `${voce.quantitaDopo} ${voce.unita}` : null]
    .filter(Boolean)
    .join(" · ");
  return { codice: voce.codice, attuale, proposto: proposto || voce.unita, esito: "modificata" };
}

export function bozzaDopoProposta(input: {
  dataAttuale: string;
  dataProposta: string | null;
  righeAttuali: readonly RigaBozzaRevisione[];
  righeProposte: readonly { codice: string; quantita: number; unitaMisura: string }[];
  materiePerCodice: Readonly<Record<string, string>>;
}):
  | { ok: true; dataConsegna: string; righe: RigaBozzaRevisione[]; differenze: DifferenzaRevisione[] }
  | { ok: false; motivo: string } {
  const differenze: DifferenzaRevisione[] = [];
  const dataConsegna = input.dataProposta || input.dataAttuale;
  if (input.dataProposta && input.dataProposta !== input.dataAttuale) {
    differenze.push({
      codice: "Data di consegna",
      attuale: input.dataAttuale,
      proposto: input.dataProposta,
      esito: "modificata",
    });
  }
  const proposte = new Map<string, { quantita: number; unita: string }>();
  for (const riga of input.righeProposte) {
    const unita = normalizzaUnitaApprovvigionamento(riga.unitaMisura);
    if (!unita.ok) return { ok: false, motivo: "Unità proposta non prevista." };
    if (!(riga.quantita > 0)) return { ok: false, motivo: "Quantità proposta non valida." };
    proposte.set(riga.codice, { quantita: riga.quantita, unita: unita.sigla });
  }
  const usati = new Set<string>();
  const righe = input.righeAttuali.map((riga) => {
    const proposta = proposte.get(riga.codice);
    if (!proposta || usati.has(riga.codice)) return { ...riga };
    usati.add(riga.codice);
    if (proposta.quantita === riga.quantita && proposta.unita === riga.unitaMisura) return { ...riga };
    differenze.push({
      codice: riga.codice,
      attuale: `${riga.quantita} ${riga.unitaMisura}`,
      proposto: `${proposta.quantita} ${proposta.unita}`,
      esito: "modificata",
    });
    return {
      ...riga,
      quantita: proposta.quantita,
      unitaMisura: proposta.unita,
      unitaNome: proposta.unita === riga.unitaMisura ? riga.unitaNome : "",
    };
  });
  for (const [codice, proposta] of proposte) {
    if (usati.has(codice)) continue;
    const materiaPrimaId = input.materiePerCodice[codice];
    if (!materiaPrimaId) {
      return { ok: false, motivo: `La materia ${codice} non è nella bozza e non è in anagrafica.` };
    }
    differenze.push({
      codice,
      attuale: "—",
      proposto: `${proposta.quantita} ${proposta.unita}`,
      esito: "aggiunta",
    });
    righe.push({
      materiaPrimaId,
      codice,
      quantita: proposta.quantita,
      unitaMisura: proposta.unita,
      unitaNome: "",
      tipoQuantita: "precisa",
      note: "",
    });
  }
  if (!differenze.length) return { ok: false, motivo: "La proposta non cambia la bozza." };
  return { ok: true, dataConsegna, righe, differenze };
}

/** Aggiorna la prima riga della consegna, quella usata dalla proposta di piano. Le altre restano. */
export function rigaPianoAggiornata(input: {
  dataAttuale: string;
  righe: readonly RigaBozzaRevisione[];
  voce: VoceRevisione;
}): { ok: true; dataConsegna: string; righe: RigaBozzaRevisione[] } | { ok: false; motivo: string } {
  const prima = input.righe[0];
  if (!prima) return { ok: false, motivo: "La consegna non ha materie da aggiornare." };
  const dataConsegna = input.voce.dataDopo || input.dataAttuale;
  const unita = normalizzaUnitaApprovvigionamento(input.voce.unita);
  if (!unita.ok) return { ok: false, motivo: "Unità proposta non prevista." };
  const cambiaQuantita =
    input.voce.operazione === "quantita" ||
    input.voce.operazione === "data_quantita" ||
    input.voce.operazione === "unita";
  const quantita = cambiaQuantita ? input.voce.quantitaDopo : prima.quantita;
  if (quantita == null || !(quantita > 0)) return { ok: false, motivo: "Quantità proposta non valida." };
  const unitaMisura =
    input.voce.operazione === "unita" || input.voce.unita !== prima.unitaMisura ? unita.sigla : prima.unitaMisura;
  return {
    ok: true,
    dataConsegna,
    righe: input.righe.map((riga, indice) =>
      indice === 0
        ? {
            ...riga,
            quantita,
            unitaMisura,
            unitaNome: unitaMisura === riga.unitaMisura ? riga.unitaNome : "",
          }
        : { ...riga }
    ),
  };
}

export function materiaIdVoce(voce: VoceRevisione): string | null {
  const id = (voce as { materiaId?: string | null }).materiaId;
  return typeof id === "string" && id.length > 0 ? id : null;
}
