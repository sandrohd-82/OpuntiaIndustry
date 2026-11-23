import { consegnaSelezionataValida } from "@/lib/produzione/approvvigionamento";
import { validaRispostaFornitore } from "@/lib/produzione/risposta-fornitore";

export type ConsegnaUfficiale = {
  id: string;
  codice: string;
  materiaId: string;
  materia: string;
  unita: string;
  unitaCatalogo: string | null;
  tipoQuantita: "precisa" | "stimata";
  data: string;
  quantita: number;
};

export type BozzaConsegna = {
  consegnaId: string | null;
  materiaId: string;
  materia: string;
  codice: string;
  unita: string;
  unitaCatalogo: string | null;
  tipoQuantita: "precisa" | "stimata";
  data: string;
  quantita: number;
  elimina: boolean;
};

export type VoceRevisione = {
  id: string;
  operazione: "data" | "quantita" | "data_quantita" | "unita" | "aggiunta" | "eliminazione";
  consegnaId: string | null;
  codice: string;
  materiaId: string | null;
  materia: string;
  unita: string;
  tipoQuantita: "precisa" | "stimata";
  dataPrima: string | null;
  dataDopo: string | null;
  quantitaPrima: number | null;
  quantitaDopo: number | null;
  stato: "in_esame" | "accettata" | "respinta";
  nota: string;
};

export type PropostaRevisione = {
  id: string;
  pianoId: string;
  codice: string;
  motivazione: string;
  voci: VoceRevisione[];
};

export function scritturaAziendaleConsentita(modalita: "reale" | "test"): boolean {
  return modalita === "reale";
}

function voceBase(
  operazione: VoceRevisione["operazione"],
  campi: Omit<VoceRevisione, "id" | "operazione" | "stato" | "nota">
): VoceRevisione {
  return {
    id: crypto.randomUUID(),
    operazione,
    stato: "in_esame",
    nota: "",
    ...campi,
  };
}

/** La proposta descrive le differenze. Non restituisce ordini da aggiornare. */
export function costruisciRevisionePiano(input: {
  ufficiali: readonly ConsegnaUfficiale[];
  bozza: readonly BozzaConsegna[];
  motivazione: string;
}): { ok: true; motivazione: string; voci: VoceRevisione[] } | { ok: false; motivo: string } {
  const voci: VoceRevisione[] = [];
  const viste = new Set<string>();
  for (const riga of input.bozza) {
    if (riga.consegnaId) viste.add(riga.consegnaId);
    const ufficiale = input.ufficiali.find((consegna) => consegna.id === riga.consegnaId);
    if (riga.elimina) {
      if (!ufficiale) return { ok: false, motivo: "Si elimina solo una consegna della versione pubblicata." };
      voci.push(
        voceBase("eliminazione", {
          consegnaId: ufficiale.id,
          codice: ufficiale.codice,
          materiaId: ufficiale.materiaId,
          materia: ufficiale.materia,
          unita: ufficiale.unita,
          tipoQuantita: ufficiale.tipoQuantita,
          dataPrima: ufficiale.data,
          dataDopo: null,
          quantitaPrima: ufficiale.quantita,
          quantitaDopo: null,
        })
      );
      continue;
    }
    const controllo = consegnaSelezionataValida({
      materiaPrimaId: riga.materiaId,
      quantita: riga.quantita,
      unitaCatalogo: riga.unitaCatalogo,
      unitaRichiesta: riga.unita,
      tipoQuantita: riga.tipoQuantita,
      data: riga.data,
    });
    if (!controllo.ok) return controllo;
    if (!ufficiale) {
      voci.push(
        voceBase("aggiunta", {
          consegnaId: null,
          codice: riga.codice || "Nuova",
          materiaId: riga.materiaId,
          materia: riga.materia,
          unita: riga.unita,
          tipoQuantita: controllo.tipoQuantita,
          dataPrima: null,
          dataDopo: riga.data,
          quantitaPrima: null,
          quantitaDopo: riga.quantita,
        })
      );
      continue;
    }
    const dataDiversa = riga.data !== ufficiale.data;
    const quantitaDiversa = riga.quantita !== ufficiale.quantita;
    const unitaDiversa = riga.unita !== ufficiale.unita;
    if (!dataDiversa && !quantitaDiversa && !unitaDiversa) continue;
    let operazione: VoceRevisione["operazione"] = "quantita";
    if (dataDiversa && quantitaDiversa) operazione = "data_quantita";
    else if (dataDiversa) operazione = "data";
    else if (unitaDiversa && !quantitaDiversa) operazione = "unita";
    voci.push(
      voceBase(operazione, {
        consegnaId: ufficiale.id,
        codice: ufficiale.codice,
        materiaId: ufficiale.materiaId,
        materia: ufficiale.materia,
        unita: riga.unita,
        tipoQuantita: ufficiale.tipoQuantita,
        dataPrima: ufficiale.data,
        dataDopo: riga.data,
        quantitaPrima: ufficiale.quantita,
        quantitaDopo: riga.quantita,
      })
    );
  }
  for (const ufficiale of input.ufficiali) {
    if (viste.has(ufficiale.id)) continue;
    voci.push(
      voceBase("eliminazione", {
        consegnaId: ufficiale.id,
        codice: ufficiale.codice,
        materiaId: ufficiale.materiaId,
        materia: ufficiale.materia,
        unita: ufficiale.unita,
        tipoQuantita: ufficiale.tipoQuantita,
        dataPrima: ufficiale.data,
        dataDopo: null,
        quantitaPrima: ufficiale.quantita,
        quantitaDopo: null,
      })
    );
  }
  if (!voci.length) return { ok: false, motivo: "Nessuna modifica da proporre." };
  const dataRiferimento = voci.find((voce) => voce.dataDopo)?.dataDopo ?? voci[0]?.dataPrima ?? null;
  const risposta = validaRispostaFornitore({
    tipo: "proposta",
    motivazione: input.motivazione,
    dataConsegna: dataRiferimento,
    righe: voci.flatMap((voce) =>
      voce.quantitaDopo == null
        ? []
        : [{ codice: voce.codice, quantita: voce.quantitaDopo, unitaMisura: voce.unita }]
    ),
  });
  if (!risposta.ok) return risposta;
  return { ok: true, motivazione: risposta.motivazione, voci };
}

export function etichettaDifferenza(voce: VoceRevisione): string {
  if (voce.operazione === "aggiunta") {
    return `Aggiunta ${voce.dataDopo}: ${voce.quantitaDopo} ${voce.unita}`;
  }
  if (voce.operazione === "eliminazione") {
    return `Eliminazione ${voce.codice} del ${voce.dataPrima}`;
  }
  if (voce.operazione === "data") {
    return `${voce.codice}: data ${voce.dataPrima} diventa ${voce.dataDopo}`;
  }
  if (voce.operazione === "unita") {
    return `${voce.codice}: unità diventa ${voce.unita}`;
  }
  if (voce.operazione === "quantita") {
    return `${voce.codice}: quantità ${voce.quantitaPrima} diventa ${voce.quantitaDopo} ${voce.unita}`;
  }
  return `${voce.codice}: ${voce.dataPrima} / ${voce.quantitaPrima} diventa ${voce.dataDopo} / ${voce.quantitaDopo} ${voce.unita}`;
}

/** Segna l'esito sulla voce. Non modifica le consegne ufficiali. */
export function decidiVoceRevisione(
  proposta: PropostaRevisione,
  voceId: string,
  esito: "accettata" | "respinta",
  nota: string
): { ok: true; proposta: PropostaRevisione; riusata: boolean } | { ok: false; motivo: string } {
  const testo = nota.trim();
  if (testo.length < 3) return { ok: false, motivo: "La decisione richiede una motivazione." };
  const voce = proposta.voci.find((riga) => riga.id === voceId);
  if (!voce) return { ok: false, motivo: "Modifica non trovata." };
  if (voce.stato !== "in_esame") {
    if (voce.stato === esito) return { ok: true, proposta, riusata: true };
    return { ok: false, motivo: "Questa modifica è già stata decisa." };
  }
  return {
    ok: true,
    riusata: false,
    proposta: {
      ...proposta,
      voci: proposta.voci.map((riga) =>
        riga.id === voceId ? { ...riga, stato: esito, nota: testo } : riga
      ),
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BustaProva = {
  to: string;
  cc: null;
  bcc: null;
  subject: string;
  text: string;
  allegato: string;
  invio: boolean;
};

export function nomeAllegatoProva(codice: string): string {
  const pulito = codice.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${pulito || "pianificazione-di-prova"}.pdf`;
}

/** Stesso avviso del fornitore, segnato TEST, con il PDF al posto del collegamento al gestionale. */
export function preparaEmailProva(input: {
  destinatario: string;
  emailFornitore: string | null;
  codice: string;
  conferma: boolean;
}): { ok: true; busta: BustaProva } | { ok: false; motivo: string } {
  const destinatario = input.destinatario.trim().toLowerCase();
  const fornitore = (input.emailFornitore ?? "").trim().toLowerCase();
  if (!destinatario || destinatario.includes(",") || destinatario.includes(";")) {
    return { ok: false, motivo: "Indica un solo indirizzo di prova." };
  }
  if (!EMAIL.test(destinatario)) return { ok: false, motivo: "Indirizzo di prova non valido." };
  if (fornitore && destinatario === fornitore) {
    return { ok: false, motivo: "Questo è l'indirizzo del fornitore reale. La prova non parte." };
  }
  const codice = input.codice.trim() || "di prova";
  const subject = "TEST — Ordine di approvvigionamento disponibile";
  const text = [
    "TEST",
    "Agrinsicilia ha pubblicato un ordine di approvvigionamento.",
    "Si legge dopo l'accesso, in Gestionale fornitori, sezione Ordini ricevuti.",
    "Questa mail e solo l'avviso. Non conferma la lettura, non e un'accettazione e non garantisce la consegna.",
    "",
    `Pianificazione: ${codice}`,
    "In questa prova la pianificazione e nel PDF allegato.",
    "Non c'e un collegamento al gestionale e non modifica ordini, piani o versioni pubblicate.",
  ].join("\n");
  if (text.includes("http") || subject.includes("http")) {
    return { ok: false, motivo: "La mail di prova non può contenere un collegamento." };
  }
  return {
    ok: true,
    busta: {
      to: destinatario,
      cc: null,
      bcc: null,
      subject,
      text,
      allegato: nomeAllegatoProva(codice),
      invio: input.conferma,
    },
  };
}

export function destinatariInvii(buste: readonly BustaProva[]): string[] {
  return [...new Set(buste.filter((busta) => busta.invio).map((busta) => busta.to))];
}
