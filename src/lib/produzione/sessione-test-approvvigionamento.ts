import type { OrdineCalendario, PianoCalendario } from "@/app/actions/approvvigionamento";
import {
  anteprimaConsegne,
  consegnaSelezionataValida,
  type TipoQuantitaApprovvigionamento,
} from "@/lib/produzione/approvvigionamento";

export type SessioneTest = {
  ordini: OrdineCalendario[];
  piani: PianoCalendario[];
  versioni: {
    id: string;
    ordineId: string;
    numero: number;
    dataConsegna: string;
    righe: OrdineCalendario["righe"];
  }[];
  sequenzaOrdine: number;
  sequenzaPiano: number;
};

export function sessioneTestVuota(): SessioneTest {
  return { ordini: [], piani: [], versioni: [], sequenzaOrdine: 0, sequenzaPiano: 0 };
}

type RigaScelta = {
  materiaPrimaId: string;
  codice: string;
  nome: string;
  quantita: number;
  unitaMisura: string;
  unitaCatalogo: string | null;
  tipoQuantita: TipoQuantitaApprovvigionamento;
};

export type EsitoSessione =
  | { ok: true; sessione: SessioneTest; messaggio: string }
  | { ok: false; sessione: SessioneTest; motivo: string };

function ordineVuoto(
  id: string,
  codice: string,
  fornitoreId: string,
  fornitore: string,
  data: string,
  note: string,
  riga: OrdineCalendario["righe"][number],
  pianoId: string | null,
  pianoCodice: string | null
): OrdineCalendario {
  return {
    id,
    codice,
    fornitoreId,
    fornitore,
    dataConsegna: data,
    note,
    stato: "bozza",
    versionePubblicata: null,
    versioneId: null,
    notificaStato: "assente",
    notificaId: null,
    visionatoDa: null,
    visionatoAt: null,
    visioneOrigine: null,
    revisione: 1,
    pianoId,
    pianoCodice,
    origineOrdineId: null,
    bilancio: [],
    carichi: [],
    confermataDalFornitore: false,
    righe: [riga],
  };
}

function idNuovo(): string {
  return crypto.randomUUID();
}

export function pianificaInProva(
  sessione: SessioneTest,
  input: {
    fornitoreId: string;
    fornitore: string;
    note: string;
    inizio: string;
    fine: string;
    cadenza: "regolare" | "personalizzata";
    ogniGiorni: number;
    dateScelte: readonly string[];
    quantita: number;
    copiaQuantita: boolean;
    quantitaPerData: Readonly<Record<string, number>>;
    tipoQuantita: TipoQuantitaApprovvigionamento;
    materia: RigaScelta;
  }
): EsitoSessione {
  const scelta = consegnaSelezionataValida({
    materiaPrimaId: input.materia.materiaPrimaId,
    quantita: input.quantita > 0 ? input.quantita : 1,
    unitaCatalogo: input.materia.unitaCatalogo,
    unitaRichiesta: input.materia.unitaMisura,
    tipoQuantita: input.tipoQuantita,
    data: input.inizio,
  });
  if (!scelta.ok && input.copiaQuantita) return { ok: false, sessione, motivo: scelta.motivo };
  const anteprima = anteprimaConsegne({
    operazione: "pianificazione",
    inizio: input.inizio,
    fine: input.fine,
    cadenza: input.cadenza,
    ogniGiorni: input.ogniGiorni,
    dateScelte: input.dateScelte,
    quantita: input.quantita,
    copiaQuantita: input.copiaQuantita,
    quantitaPerData: input.quantitaPerData,
    tipoQuantita: input.tipoQuantita,
    unitaMisura: input.materia.unitaMisura,
  });
  if (!anteprima.ok) return { ok: false, sessione, motivo: anteprima.motivo };
  const pianoId = idNuovo();
  const numeroPiano = sessione.sequenzaPiano + 1;
  const codicePiano = `TEST-PP-${String(numeroPiano).padStart(4, "0")}`;
  const ordini: OrdineCalendario[] = [];
  let numero = sessione.sequenzaOrdine;
  for (const consegna of anteprima.consegne) {
    const valida = consegnaSelezionataValida({
      materiaPrimaId: input.materia.materiaPrimaId,
      quantita: consegna.quantita,
      unitaCatalogo: input.materia.unitaCatalogo,
      unitaRichiesta: consegna.unitaMisura,
      tipoQuantita: consegna.tipoQuantita,
      data: consegna.data,
    });
    if (!valida.ok) return { ok: false, sessione, motivo: valida.motivo };
    numero += 1;
    ordini.push(
      ordineVuoto(
        idNuovo(),
        `TEST-AP-${String(numero).padStart(4, "0")}`,
        input.fornitoreId,
        input.fornitore,
        consegna.data,
        input.note,
        {
          id: idNuovo(),
          materiaPrimaId: input.materia.materiaPrimaId,
          codice: input.materia.codice,
          nome: input.materia.nome,
          quantita: consegna.quantita,
          unitaMisura: consegna.unitaMisura,
          tipoQuantita: consegna.tipoQuantita,
          note: "",
        },
        pianoId,
        codicePiano
      )
    );
  }
  const piano: PianoCalendario = {
    id: pianoId,
    codice: codicePiano,
    fornitoreId: input.fornitoreId,
    fornitore: input.fornitore,
    periodoInizio: input.inizio,
    periodoFine: input.fine,
    tipologia: input.cadenza,
    stato: "bozza",
    versionePubblicata: null,
    versioneId: null,
    notificaStato: "assente",
    notificaId: null,
    visionatoDa: null,
    visionatoAt: null,
    revisione: 1,
    ordini: ordini.map((ordine) => ordine.id),
  };
  return {
    ok: true,
    messaggio: "Bozza di prova salvata. Nessuna scrittura sul database e nessuna mail.",
    sessione: {
      ...sessione,
      ordini: [...sessione.ordini, ...ordini],
      piani: [...sessione.piani, piano],
      sequenzaOrdine: numero,
      sequenzaPiano: numeroPiano,
    },
  };
}

export function ordineSingoloInProva(
  sessione: SessioneTest,
  input: {
    fornitoreId: string;
    fornitore: string;
    note: string;
    data: string;
    quantita: number;
    tipoQuantita: TipoQuantitaApprovvigionamento;
    materia: RigaScelta;
  }
): EsitoSessione {
  const anteprima = anteprimaConsegne({
    operazione: "singolo",
    data: input.data,
    quantita: input.quantita,
    copiaQuantita: true,
    tipoQuantita: input.tipoQuantita,
    unitaMisura: input.materia.unitaMisura,
  });
  if (!anteprima.ok) return { ok: false, sessione, motivo: anteprima.motivo };
  const consegna = anteprima.consegne[0];
  if (!consegna) return { ok: false, sessione, motivo: "Consegna non calcolata." };
  const valida = consegnaSelezionataValida({
    materiaPrimaId: input.materia.materiaPrimaId,
    quantita: consegna.quantita,
    unitaCatalogo: input.materia.unitaCatalogo,
    unitaRichiesta: consegna.unitaMisura,
    tipoQuantita: consegna.tipoQuantita,
    data: consegna.data,
  });
  if (!valida.ok) return { ok: false, sessione, motivo: valida.motivo };
  const numero = sessione.sequenzaOrdine + 1;
  const ordine = ordineVuoto(
    idNuovo(),
    `TEST-AP-${String(numero).padStart(4, "0")}`,
    input.fornitoreId,
    input.fornitore,
    consegna.data,
    input.note,
    {
      id: idNuovo(),
      materiaPrimaId: input.materia.materiaPrimaId,
      codice: input.materia.codice,
      nome: input.materia.nome,
      quantita: consegna.quantita,
      unitaMisura: consegna.unitaMisura,
      tipoQuantita: consegna.tipoQuantita,
      note: "",
    },
    null,
    null
  );
  return {
    ok: true,
    messaggio: "Ordine singolo di prova. Non entra in una pianificazione e non scrive sul database.",
    sessione: { ...sessione, sequenzaOrdine: numero, ordini: [...sessione.ordini, ordine] },
  };
}

export function aggiungiConsegnaInProva(
  sessione: SessioneTest,
  input: {
    pianoId: string;
    data: string;
    quantita: number;
    materia: RigaScelta;
  }
): EsitoSessione {
  const piano = sessione.piani.find((voce) => voce.id === input.pianoId);
  if (!piano) return { ok: false, sessione, motivo: "Piano non trovato." };
  const valida = consegnaSelezionataValida({
    materiaPrimaId: input.materia.materiaPrimaId,
    quantita: input.quantita,
    unitaCatalogo: input.materia.unitaCatalogo,
    unitaRichiesta: input.materia.unitaMisura,
    tipoQuantita: input.materia.tipoQuantita,
    data: input.data,
  });
  if (!valida.ok) return { ok: false, sessione, motivo: valida.motivo };
  const numero = sessione.sequenzaOrdine + 1;
  const ordine = ordineVuoto(
    idNuovo(),
    `TEST-AP-${String(numero).padStart(4, "0")}`,
    piano.fornitoreId,
    piano.fornitore,
    input.data,
    "",
    {
      id: idNuovo(),
      materiaPrimaId: input.materia.materiaPrimaId,
      codice: input.materia.codice,
      nome: input.materia.nome,
      quantita: input.quantita,
      unitaMisura: input.materia.unitaMisura,
      tipoQuantita: valida.tipoQuantita,
      note: "",
    },
    piano.id,
    piano.codice
  );
  const inizio = input.data < piano.periodoInizio ? input.data : piano.periodoInizio;
  const fine = input.data > piano.periodoFine ? input.data : piano.periodoFine;
  return {
    ok: true,
    messaggio: "Consegna aggiunta alla pianificazione di prova. Non è stata pubblicata.",
    sessione: {
      ...sessione,
      sequenzaOrdine: numero,
      ordini: [...sessione.ordini, ordine],
      piani: sessione.piani.map((voce) =>
        voce.id === piano.id
          ? {
              ...voce,
              periodoInizio: inizio,
              periodoFine: fine,
              revisione: voce.revisione + 1,
              stato: voce.versionePubblicata != null ? "da_ripubblicare" : voce.stato,
              ordini: [...voce.ordini, ordine.id],
            }
          : voce
      ),
    },
  };
}

export function modificaConsegnaInProva(
  sessione: SessioneTest,
  input: {
    ordineId: string;
    data: string;
    note: string;
    quantita: number;
    tipoQuantita: TipoQuantitaApprovvigionamento;
  }
): EsitoSessione {
  const ordine = sessione.ordini.find((voce) => voce.id === input.ordineId);
  if (!ordine) return { ok: false, sessione, motivo: "Consegna non trovata." };
  if (ordine.stato === "annullato") {
    return { ok: false, sessione, motivo: "Una consegna annullata non si modifica." };
  }
  const riga = ordine.righe[0];
  if (!riga) return { ok: false, sessione, motivo: "Consegna senza materia." };
  const valida = consegnaSelezionataValida({
    materiaPrimaId: riga.materiaPrimaId,
    quantita: input.quantita,
    unitaCatalogo: riga.unitaMisura,
    unitaRichiesta: riga.unitaMisura,
    tipoQuantita: input.tipoQuantita,
    data: input.data,
  });
  if (!valida.ok) return { ok: false, sessione, motivo: valida.motivo };
  const pubblicato = ordine.versionePubblicata != null;
  return {
    ok: true,
    messaggio: pubblicato
      ? "Modifica di prova registrata. La versione già pubblicata resta storica finché non si pubblica di nuovo."
      : "Bozza di prova aggiornata.",
    sessione: {
      ...sessione,
      ordini: sessione.ordini.map((voce) =>
        voce.id === ordine.id
          ? {
              ...voce,
              dataConsegna: input.data,
              note: input.note,
              revisione: voce.revisione + 1,
              stato: pubblicato ? "da_ripubblicare" : voce.stato,
              righe: [{ ...riga, quantita: input.quantita, tipoQuantita: valida.tipoQuantita }],
            }
          : voce
      ),
      piani: sessione.piani.map((piano) => {
        if (piano.id !== ordine.pianoId) return piano;
        return {
          ...piano,
          periodoInizio: input.data < piano.periodoInizio ? input.data : piano.periodoInizio,
          periodoFine: input.data > piano.periodoFine ? input.data : piano.periodoFine,
          revisione: piano.revisione + 1,
          stato: piano.versionePubblicata != null ? "da_ripubblicare" : piano.stato,
        };
      }),
    },
  };
}

export function annullaConsegnaInProva(sessione: SessioneTest, ordineId: string): EsitoSessione {
  const ordine = sessione.ordini.find((voce) => voce.id === ordineId);
  if (!ordine) return { ok: false, sessione, motivo: "Consegna non trovata." };
  if (ordine.carichi.length > 0) {
    return { ok: false, sessione, motivo: "La consegna ha già un carico. Non si annulla." };
  }
  if (ordine.versionePubblicata == null && ordine.stato === "bozza") {
    return {
      ok: true,
      messaggio: "Bozza di prova annullata.",
      sessione: {
        ...sessione,
        ordini: sessione.ordini.filter((voce) => voce.id !== ordine.id),
        piani: sessione.piani.map((piano) =>
          piano.id === ordine.pianoId
            ? { ...piano, ordini: piano.ordini.filter((id) => id !== ordine.id), revisione: piano.revisione + 1 }
            : piano
        ),
      },
    };
  }
  return {
    ok: true,
    messaggio: "Consegna annullata in prova. Le versioni pubblicate restano e non sono più valide.",
    sessione: {
      ...sessione,
      ordini: sessione.ordini.map((voce) =>
        voce.id === ordine.id ? { ...voce, stato: "annullato", revisione: voce.revisione + 1 } : voce
      ),
      piani: sessione.piani.map((piano) =>
        piano.id === ordine.pianoId
          ? {
              ...piano,
              ordini: piano.ordini.filter((id) => id !== ordine.id),
              revisione: piano.revisione + 1,
              stato: piano.versionePubblicata != null ? "da_ripubblicare" : piano.stato,
            }
          : piano
      ),
    },
  };
}

export function pubblicaInProva(
  sessione: SessioneTest,
  input: { ambito: "ordine" | "piano"; id: string }
): EsitoSessione {
  const obiettivi =
    input.ambito === "ordine"
      ? sessione.ordini.filter((ordine) => ordine.id === input.id)
      : sessione.ordini.filter((ordine) => ordine.pianoId === input.id && ordine.stato !== "annullato");
  if (!obiettivi.length) return { ok: false, sessione, motivo: "Nessuna consegna da pubblicare." };
  if (obiettivi.some((ordine) => ordine.stato === "annullato")) {
    return { ok: false, sessione, motivo: "Una consegna annullata non si pubblica." };
  }
  const versioni = [...sessione.versioni];
  const aggiornati = new Map<string, OrdineCalendario>();
  for (const ordine of obiettivi) {
    const numero = (ordine.versionePubblicata ?? 0) + 1;
    const versioneId = idNuovo();
    versioni.push({
      id: versioneId,
      ordineId: ordine.id,
      numero,
      dataConsegna: ordine.dataConsegna,
      righe: ordine.righe,
    });
    aggiornati.set(ordine.id, {
      ...ordine,
      stato: "pubblicato",
      versionePubblicata: numero,
      versioneId,
      revisione: ordine.revisione + 1,
    });
  }
  const numeroPiano =
    input.ambito === "piano"
      ? (sessione.piani.find((piano) => piano.id === input.id)?.versionePubblicata ?? 0) + 1
      : null;
  return {
    ok: true,
    messaggio:
      input.ambito === "piano"
        ? `Versione ${numeroPiano} simulata. Nessuna mail e nessuna scrittura sul database. Le versioni precedenti restano storiche.`
        : "Pubblicazione simulata. Nessuna mail e nessuna scrittura sul database.",
    sessione: {
      ...sessione,
      versioni,
      ordini: sessione.ordini.map((ordine) => aggiornati.get(ordine.id) ?? ordine),
      piani: sessione.piani.map((piano) => {
        if (input.ambito === "piano" && piano.id === input.id) {
          return { ...piano, stato: "pubblicato", versionePubblicata: numeroPiano, revisione: piano.revisione + 1 };
        }
        if (input.ambito === "ordine" && obiettivi.some((ordine) => ordine.pianoId === piano.id)) {
          return {
            ...piano,
            stato: piano.versionePubblicata != null ? "da_ripubblicare" : piano.stato,
            revisione: piano.revisione + 1,
          };
        }
        return piano;
      }),
    },
  };
}
