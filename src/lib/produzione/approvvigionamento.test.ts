import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { risolviAccessoMaterialeIngresso } from "./fornitore-accesso";
import {
  classificaProgrammazione,
  differenzeApprovvigionamento,
  etichettaVersionePortale,
  presaCheCopreVersione,
  presaVisioneCopre,
  quadriApprovvigionamento,
  ruoloVersionePortale,
  copiaOrdineSuData,
  copiaSettimana,
  anteprimaConsegne,
  dateGiorniFissi,
  dateOgniNGiorni,
  primoGiornoUtile,
  dateRegolari,
  dateUniche,
  fornitoreAssegnabile,
  resocontoConAnteprima,
  riepilogoApprovvigionamento,
  giorniMese,
  giorniSettimana,
  puoGestireApprovvigionamento,
  registraConChiave,
  rigaOrdineValida,
} from "./approvvigionamento";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

assert.deepEqual(rigaOrdineValida({
  materiaPrimaId: MP,
  quantita: 2,
  unitaCatalogo: "kg",
  unitaRichiesta: "kg",
}), { ok: true });
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: MP,
    quantita: 0,
    unitaCatalogo: "kg",
    unitaRichiesta: "kg",
  }).ok,
  false
);
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: MP,
    quantita: 1,
    unitaCatalogo: null,
    unitaRichiesta: "kg",
  }).ok,
  false
);
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: MP,
    quantita: 1,
    unitaCatalogo: "kg",
    unitaRichiesta: "g",
  }).ok,
  true
);
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: "",
    quantita: 1,
    unitaCatalogo: "kg",
    unitaRichiesta: "kg",
  }).ok,
  false
);

assert.equal(
  fornitoreAssegnabile({
    tipologie: ["materia_prima"],
    codiciAssociati: ["MpCl"],
    codiciRichiesti: ["MpCl"],
    stato: "abilitato",
  }).ok,
  true
);
assert.equal(
  fornitoreAssegnabile({
    tipologie: ["servizio"],
    codiciAssociati: ["MpCl"],
    codiciRichiesti: ["MpCl"],
    stato: "abilitato",
  }).ok,
  false
);
assert.match(
  String(
    fornitoreAssegnabile({
      tipologie: ["materia_prima"],
      codiciAssociati: ["MpCl"],
      codiciRichiesti: ["MpCl"],
      stato: "sospeso",
    }).ok === false &&
      (
        fornitoreAssegnabile({
          tipologie: ["materia_prima"],
          codiciAssociati: ["MpCl"],
          codiciRichiesti: ["MpCl"],
          stato: "sospeso",
        }) as { motivo: string }
      ).motivo
  ),
  /sospeso/
);
assert.match(
  (
    fornitoreAssegnabile({
      tipologie: ["materia_prima"],
      codiciAssociati: ["MpCl"],
      codiciRichiesti: ["MpCl"],
      stato: "incompleto",
    }) as { motivo: string }
  ).motivo,
  /abilitato/
);
assert.equal(
  fornitoreAssegnabile({
    tipologie: ["materia_prima"],
    codiciAssociati: ["MpAl"],
    codiciRichiesti: ["MpCl"],
    stato: "abilitato",
  }).ok,
  false
);

assert.equal(
  puoGestireApprovvigionamento({ superadmin: false, aree: ["produzione"] }),
  true
);
assert.equal(
  puoGestireApprovvigionamento({ superadmin: false, aree: ["area-fornitori"] }),
  false
);

const copia = copiaOrdineSuData({
  origineId: A,
  data: "2026-11-20",
  chiave: "k1",
});
assert.notEqual(copia.origineId, "");
assert.equal(copia.dataConsegna, "2026-11-20");
assert.equal(copia.chiave, "k1");

const settimana = copiaSettimana({
  origineLunedi: "2026-11-16",
  destinazioneLunedi: "2026-11-23",
  chiave: "sett-1",
  ordini: [
    { id: A, dataConsegna: "2026-11-16" },
    { id: B, dataConsegna: "2026-11-18" },
    { id: "fuori", dataConsegna: "2026-11-23" },
  ],
});
assert.deepEqual(
  settimana.map((voce) => voce.dataConsegna),
  ["2026-11-23", "2026-11-25"]
);
assert.deepEqual(
  settimana.map((voce) => voce.origineId),
  [A, B]
);
assert.equal(settimana.every((voce) => voce.origineId !== voce.dataConsegna), true);

assert.equal(giorniSettimana("2026-11-18").length, 7);
assert.equal(giorniSettimana("2026-11-18")[0], "2026-11-16");
assert.equal(giorniMese("2026-11").length, 30);
assert.deepEqual(dateUniche(["2026-11-02", "2026-11-02", "no"]), ["2026-11-02"]);

const registro = new Map<string, string[]>();
const prima = registraConChiave(registro, "chiave", () => ["ordine-1"]);
const seconda = registraConChiave(registro, "chiave", () => ["ordine-2"]);
assert.equal(prima.nuova, true);
assert.equal(seconda.nuova, false);
assert.deepEqual(seconda.valore, ["ordine-1"]);
assert.equal(registro.size, 1);

const stessoGiorno = registraConChiave(registro, "giorno", () => [A, B]);
assert.equal(stessoGiorno.valore.length, 2);

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116120000_approvvigionamenti_ordini.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(sql, /stato = 'bozza'/);
assert.match(sql, /quantita > 0/);
assert.match(sql, /prodotti_acquistati/);
assert.match(sql, /sospensione/);
assert.match(sql, /unita_misura/);
assert.match(sql, /on conflict \(chiave\) do nothing/);
assert.equal(sql.includes("insert into public.ordini"), false);
assert.equal(/drop table/i.test(sql), false);
assert.equal(sql.includes("haccp_fogli_ingresso"), false);

assert.deepEqual(classificaProgrammazione(["2026-11-16", "2026-11-18"]), {
  tipo: "settimana",
  inizio: "2026-11-16",
  fine: "2026-11-22",
});
assert.deepEqual(classificaProgrammazione(["2026-11-16", "2026-11-23"]), {
  tipo: "piano",
  inizio: "2026-11-01",
  fine: "2026-11-30",
});
assert.equal(classificaProgrammazione(["2026-11-30", "2026-12-07"]).tipo, "errore");

const piani = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116133000_approvvigionamenti_piani.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(piani, /approvvigionamenti_piani/);
assert.match(piani, /revisione = p_revisione/);
assert.match(piani, /stato = 'bozza'/);
assert.match(piani, /La chiave è già stata usata per un''altra operazione/);
assert.match(piani, /at time zone 'UTC'/);
assert.equal(piani.includes("insert into public.ordini"), false);
assert.equal(piani.includes("haccp_fogli_ingresso"), false);
assert.equal(/drop table/i.test(piani), false);

const riga = {
  materiaPrimaId: MP,
  codice: "Mp1",
  nome: "Cladodio",
  quantita: 2,
  unitaMisura: "kg",
  note: "",
};
assert.deepEqual(
  differenzeApprovvigionamento({
    dataPrima: "2026-11-16",
    dataDopo: "2026-11-18",
    righePrima: [riga],
    righeDopo: [{ ...riga, quantita: 4 }],
  }),
  ["Consegna 2026-11-16 diventa 2026-11-18", "Mp1: 2 kg diventa 4 kg"]
);
const quadri = quadriApprovvigionamento({
  stato: "pubblicato",
  notifica: "fallita",
  visionato: false,
});
assert.equal(quadri.documento, "Pubblicato");
assert.equal(quadri.notifica, "Notifica fallita/incerta");
assert.equal(quadri.presaVisione, "In attesa di presa visione");
assert.equal(presaVisioneCopre(A, A), true);
assert.equal(presaVisioneCopre(A, B), false);
assert.equal(ruoloVersionePortale(2, 2), "corrente");
assert.equal(ruoloVersionePortale(1, 2), "storica");
assert.equal(etichettaVersionePortale("storica"), "Versione storica superata");
const copertura = presaCheCopreVersione({
  versioneId: A,
  dirette: [],
  piani: [{ profileId: B, at: "2026-11-16T10:00:00Z", copertura: [{ versioneId: A }] }],
});
assert.equal(copertura?.origine, "piano");
assert.equal(
  presaCheCopreVersione({
    versioneId: B,
    dirette: [{ versioneId: A, profileId: B, at: "2026-11-16T10:00:00Z" }],
    piani: [{ profileId: B, at: "2026-11-16T10:00:00Z", copertura: [{ versioneId: A }] }],
  }),
  null
);
assert.equal(
  risolviAccessoMaterialeIngresso(
    { superadmin: false, aree: ["area-fornitori"], fornitoreCollegatoId: A },
    B
  ).esito,
  "negato"
);

const pubblicazione = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116140000_approvvigionamenti_pubblicazione.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(pubblicazione, /approvvigionamenti_versioni/);
assert.match(pubblicazione, /Una versione pubblicata non si modifica/);
assert.match(pubblicazione, /approvvigionamento/);
assert.equal(pubblicazione.includes("insert into public.ordini"), false);
assert.equal(pubblicazione.includes("haccp_fogli_ingresso"), false);

const coerenza = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116150000_approvvigionamenti_coerenza.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(coerenza, /approvvigionamento_blocca_ordine/);
assert.match(coerenza, /approvvigionamenti_segnali_portale/);
assert.equal(coerenza.includes("haccp_fogli_ingresso"), false);
assert.equal(/drop table/i.test(coerenza), false);
assert.equal(coerenza.includes("o.note"), false);

assert.deepEqual(dateRegolari("2026-11-01", "2026-11-07", 2), [
  "2026-11-01",
  "2026-11-03",
  "2026-11-05",
  "2026-11-07",
]);
const singolo = anteprimaConsegne({
  operazione: "singolo",
  data: "2026-11-17",
  quantita: 4,
  copiaQuantita: true,
  tipoQuantita: "precisa",
  unitaMisura: "kg",
});
assert.equal(singolo.ok, true);
if (singolo.ok) assert.equal(singolo.consegne.length, 1);

const regolare = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-11-01",
  fine: "2026-11-07",
  cadenza: "regolare",
  ogniGiorni: 2,
  quantita: 3,
  copiaQuantita: true,
  quantitaPerData: { "2026-11-05": 8 },
  tipoQuantita: "stimata",
  unitaMisura: "kg",
});
assert.equal(regolare.ok, true);
if (regolare.ok) {
  assert.deepEqual(
    regolare.consegne.map((voce) => [voce.data, voce.quantita, voce.tipoQuantita]),
    [
      ["2026-11-01", 3, "stimata"],
      ["2026-11-03", 3, "stimata"],
      ["2026-11-05", 8, "stimata"],
      ["2026-11-07", 3, "stimata"],
    ]
  );
}

const manuale = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-11-01",
  fine: "2026-11-10",
  cadenza: "personalizzata",
  dateScelte: ["2026-11-02", "2026-11-02", "2026-11-20", "2026-11-09"],
  quantita: 1,
  copiaQuantita: false,
  quantitaPerData: { "2026-11-02": 2, "2026-11-09": 5 },
  tipoQuantita: "precisa",
  unitaMisura: "kg",
});
assert.equal(manuale.ok, true);
if (manuale.ok) {
  assert.deepEqual(
    manuale.consegne.map((voce) => [voce.data, voce.quantita]),
    [
      ["2026-11-02", 2],
      ["2026-11-09", 5],
    ]
  );
}
assert.equal(
  anteprimaConsegne({
    operazione: "pianificazione",
    inizio: "2026-11-01",
    fine: "2026-11-03",
    cadenza: "personalizzata",
    dateScelte: ["2026-11-02"],
    quantita: 1,
    copiaQuantita: false,
    tipoQuantita: "precisa",
    unitaMisura: "kg",
  }).ok,
  false
);

const misto = riepilogoApprovvigionamento({
  righe: [
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 2,
      ordinata: 2,
      confermata: 2,
      arrivata: 2,
      arrivataMancante: false,
      accettata: 1,
      respinta: 0,
      scaricata: 0,
      lottiCollegati: true,
      unitaLottoDiversa: false,
    },
    {
      ordineId: B,
      materiaId: B,
      unita: "g",
      tipoQuantita: "stimata",
      pianificata: 100,
      ordinata: null,
      confermata: null,
      arrivata: null,
      arrivataMancante: false,
      accettata: null,
      respinta: null,
      scaricata: null,
      lottiCollegati: false,
      unitaLottoDiversa: false,
    },
  ],
  giacenza: null,
  motivoGiacenza: "Seleziona una materia.",
});
assert.equal(misto.consegne, 2);
assert.equal(misto.voci.every((voce) => voce.disponibile === false), true);

const chiaro = riepilogoApprovvigionamento({
  righe: [
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 4,
      ordinata: 4,
      confermata: 4,
      arrivata: null,
      arrivataMancante: true,
      accettata: null,
      respinta: null,
      scaricata: null,
      lottiCollegati: false,
      unitaLottoDiversa: false,
    },
  ],
  giacenza: { quantita: 9, unita: "kg" },
  motivoGiacenza: null,
});
assert.equal(chiaro.voci.find((voce) => voce.chiave === "pianificata_precisa")?.valore, 4);
assert.equal(chiaro.voci.find((voce) => voce.chiave === "pianificata_stimata")?.valore, 0);
assert.equal(chiaro.voci.find((voce) => voce.chiave === "arrivata")?.disponibile, false);
assert.equal(chiaro.voci.find((voce) => voce.chiave === "accettata")?.motivo, "Nessun lotto LM- collegato a queste consegne.");
assert.equal(chiaro.voci.find((voce) => voce.chiave === "giacenza")?.valore, 9);
assert.equal(quadriApprovvigionamento({
  stato: "annullato",
  notifica: "inviata",
  visionato: true,
}).documento, "Annullato");

const doppia = riepilogoApprovvigionamento({
  righe: [
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 1,
      ordinata: 4,
      confermata: 4,
      arrivata: 3,
      arrivataMancante: false,
      accettata: 2,
      respinta: 1,
      scaricata: 1,
      lottiCollegati: true,
      unitaLottoDiversa: false,
    },
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 2,
      ordinata: 4,
      confermata: 4,
      arrivata: 3,
      arrivataMancante: false,
      accettata: 2,
      respinta: 1,
      scaricata: 1,
      lottiCollegati: true,
      unitaLottoDiversa: false,
    },
  ],
  giacenza: null,
  motivoGiacenza: "Seleziona una materia.",
});
assert.equal(doppia.consegne, 1);
assert.equal(doppia.voci.find((voce) => voce.chiave === "pianificata_precisa")?.valore, 3);
assert.equal(doppia.voci.find((voce) => voce.chiave === "ordinata")?.valore, 4);
assert.equal(doppia.voci.find((voce) => voce.chiave === "arrivata")?.valore, 3);
assert.equal(doppia.voci.find((voce) => voce.chiave === "accettata")?.valore, 2);

const doppiaSenzaLotti = riepilogoApprovvigionamento({
  righe: [
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 1,
      ordinata: 4,
      confermata: 0,
      arrivata: null,
      arrivataMancante: false,
      accettata: null,
      respinta: null,
      scaricata: null,
      lottiCollegati: false,
      unitaLottoDiversa: false,
    },
    {
      ordineId: A,
      materiaId: MP,
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 2,
      ordinata: 4,
      confermata: 0,
      arrivata: null,
      arrivataMancante: false,
      accettata: null,
      respinta: null,
      scaricata: null,
      lottiCollegati: false,
      unitaLottoDiversa: false,
    },
  ],
  giacenza: null,
  motivoGiacenza: null,
});
assert.equal(doppiaSenzaLotti.consegne, 1);
assert.equal(doppiaSenzaLotti.voci.find((voce) => voce.chiave === "ordinata")?.valore, 4);
assert.equal(doppiaSenzaLotti.voci.find((voce) => voce.chiave === "pianificata_precisa")?.valore, 3);
assert.equal(
  doppiaSenzaLotti.voci.find((voce) => voce.chiave === "accettata")?.motivo,
  "Nessun lotto LM- collegato a queste consegne."
);
if (regolare.ok) {
  assert.equal(new Set(regolare.consegne.map((voce) => voce.data)).size, regolare.consegne.length);
}

const pianificazione = readFileSync(
  new URL(
    "../../../supabase/migrations/20261117120000_approvvigionamenti_pianificazione.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(pianificazione, /pianificazione/);
assert.match(pianificazione, /tipo_quantita/);
assert.equal(pianificazione.includes("approvvigionamenti_notifiche"), false);
assert.equal(/create table public\.approvvigionamenti_ordini/i.test(pianificazione), false);

const consegnePiano = readFileSync(
  new URL(
    "../../../supabase/migrations/20261117123000_approvvigionamenti_consegne_piano.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(consegnePiano, /approvvigionamento_annulla_consegna/);
assert.match(consegnePiano, /approvvigionamento_collega_consegna/);
assert.match(consegnePiano, /approvvigionamento_estendi_periodo_piano/);
assert.equal(consegnePiano.includes("delete from public.approvvigionamenti_versioni"), false);
assert.equal(consegnePiano.includes("approvvigionamenti_notifiche"), false);

assert.equal(primoGiornoUtile("2026-01-10", "2026-01-31", [1, 2, 3, 4, 5]), "2026-01-12");
assert.equal(primoGiornoUtile("2026-01-12", "2026-01-31", [1, 2, 3, 4, 5]), "2026-01-12");

const primaPrima = dateOgniNGiorni({
  inizio: "2026-01-12",
  fine: "2026-01-31",
  primaConsegna: "2026-01-10",
  ogniGiorni: 3,
  giorniConsentiti: [1, 2, 3, 4, 5],
});
assert.equal(primaPrima.ok, false);

const ogniTre = dateOgniNGiorni({
  inizio: "2026-01-10",
  fine: "2026-01-31",
  primaConsegna: "2026-01-12",
  ogniGiorni: 3,
  giorniConsentiti: [1, 2, 3, 4, 5],
});
assert.equal(ogniTre.ok, true);
if (ogniTre.ok) {
  assert.deepEqual(ogniTre.date, [
    "2026-01-12",
    "2026-01-15",
    "2026-01-21",
    "2026-01-27",
    "2026-01-30",
  ]);
  assert.deepEqual(ogniTre.escluse, ["2026-01-18", "2026-01-24"]);
  assert.equal(ogniTre.date.includes("2026-01-19"), false);
}

const oltreAnno = dateOgniNGiorni({
  inizio: "2026-12-20",
  fine: "2027-01-10",
  primaConsegna: "2026-12-30",
  ogniGiorni: 4,
  giorniConsentiti: [0, 1, 2, 3, 4, 5, 6],
});
assert.equal(oltreAnno.ok, true);
if (oltreAnno.ok) {
  assert.deepEqual(oltreAnno.date, ["2026-12-30", "2027-01-03", "2027-01-07"]);
}

const fissi = dateGiorniFissi({
  inizio: "2026-01-10",
  fine: "2026-01-31",
  giorni: [1, 3, 5],
});
assert.equal(fissi.ok, true);
if (fissi.ok) {
  assert.deepEqual(fissi.date, [
    "2026-01-12",
    "2026-01-14",
    "2026-01-16",
    "2026-01-19",
    "2026-01-21",
    "2026-01-23",
    "2026-01-26",
    "2026-01-28",
    "2026-01-30",
  ]);
}

const manualeNuovo = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-01-10",
  fine: "2026-01-20",
  frequenza: "manuale",
  dateScelte: ["2026-01-11", "2026-01-15"],
  quantita: 2,
  copiaQuantita: true,
  tipoQuantita: "precisa",
  unitaMisura: "kg",
});
assert.equal(manualeNuovo.ok, true);
if (manualeNuovo.ok) assert.equal(manualeNuovo.consegne.length, 2);

const soloAnteprima = resocontoConAnteprima({
  salvate: [],
  anteprima: [
    {
      data: "2026-01-12",
      materiaId: MP,
      materia: "MP",
      unita: "kg",
      tipoQuantita: "precisa",
      quantita: 4,
    },
  ],
});
assert.equal(soloAnteprima.gruppi[0]?.ordinata, 0);
assert.equal(soloAnteprima.gruppi[0]?.precisaAnteprima, 4);
const dopoSalvataggio = resocontoConAnteprima({
  salvate: [
    {
      ordineId: A,
      data: "2026-01-12",
      materiaId: MP,
      materia: "MP",
      unita: "kg",
      tipoQuantita: "precisa",
      pianificata: 4,
      ordinata: 4,
      confermata: 0,
      arrivata: null,
      arrivataMancante: true,
      accettata: null,
      respinta: null,
      scaricata: null,
      lottiCollegati: false,
      unitaLottoDiversa: false,
    },
  ],
  anteprima: [
    {
      data: "2026-01-12",
      materiaId: MP,
      materia: "MP",
      unita: "kg",
      tipoQuantita: "precisa",
      quantita: 4,
    },
  ],
});
assert.equal(dopoSalvataggio.gruppi[0]?.precisaAnteprima, 0);
assert.equal(dopoSalvataggio.gruppi[0]?.precisaSalvata, 4);

console.log("approvvigionamento: ok");
