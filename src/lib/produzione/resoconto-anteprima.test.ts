import assert from "node:assert/strict";
import { anteprimaConsegne } from "./approvvigionamento";
import {
  anteprimaEsclusaDalFiltro,
  resocontoConAnteprima,
  type ConsegnaSalvataResoconto,
} from "./approvvigionamento";

const materia = "mp-1";
const salvata = (data: string, quantita: number): ConsegnaSalvataResoconto => ({
  ordineId: `ord-${data}`,
  data,
  materiaId: materia,
  materia: "MP olio",
  unita: "kg",
  tipoQuantita: "precisa",
  pianificata: quantita,
  ordinata: quantita,
  confermata: 1,
  arrivata: 1,
  arrivataMancante: false,
  accettata: 1,
  respinta: 0,
  scaricata: 0,
  lottiCollegati: true,
  unitaLottoDiversa: false,
});

const bozza = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-11-01",
  fine: "2026-11-05",
  cadenza: "regolare",
  ogniGiorni: 2,
  quantita: 4,
  copiaQuantita: true,
  tipoQuantita: "precisa",
  unitaMisura: "kg",
});
if (!bozza.ok) throw new Error(bozza.motivo);
const soloAnteprima = resocontoConAnteprima({
  salvate: [],
  anteprima: bozza.consegne.map((consegna) => ({
    data: consegna.data,
    materiaId: materia,
    materia: "MP olio",
    unita: consegna.unitaMisura,
    tipoQuantita: consegna.tipoQuantita,
    quantita: consegna.quantita,
  })),
});
assert.equal(soloAnteprima.consegnePreviste, 3);
assert.equal(soloAnteprima.gruppi[0]?.precisaAnteprima, 12);
assert.equal(soloAnteprima.gruppi[0]?.precisaSalvata, 0);
assert.equal(soloAnteprima.gruppi[0]?.ordinata, 0);

const quantitaCambiata = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-11-01",
  fine: "2026-11-05",
  cadenza: "regolare",
  ogniGiorni: 2,
  quantita: 4,
  copiaQuantita: true,
  quantitaPerData: { "2026-11-03": 9 },
  tipoQuantita: "stimata",
  unitaMisura: "kg",
});
if (!quantitaCambiata.ok) throw new Error(quantitaCambiata.motivo);
const dopoQuantita = resocontoConAnteprima({
  salvate: [],
  anteprima: quantitaCambiata.consegne.map((consegna) => ({
    data: consegna.data,
    materiaId: materia,
    materia: "MP olio",
    unita: consegna.unitaMisura,
    tipoQuantita: consegna.tipoQuantita,
    quantita: consegna.quantita,
  })),
});
assert.equal(dopoQuantita.gruppi[0]?.stimataAnteprima, 17);
assert.equal(dopoQuantita.gruppi[0]?.precisaAnteprima, 0);

const dateCambiate = anteprimaConsegne({
  operazione: "pianificazione",
  inizio: "2026-12-01",
  fine: "2026-12-01",
  cadenza: "personalizzata",
  dateScelte: ["2026-12-01"],
  quantita: 2,
  copiaQuantita: true,
  tipoQuantita: "precisa",
  unitaMisura: "kg",
});
if (!dateCambiate.ok) throw new Error(dateCambiate.motivo);
assert.equal(dateCambiate.consegne.length, 1);

const esclusa = anteprimaEsclusaDalFiltro({
  attiva: true,
  materiaId: materia,
  fornitoreId: "forn-1",
  filtroMateria: "altra",
  filtroFornitore: "",
  filtroStato: "",
  filtroPiano: "",
});
assert.match(esclusa ?? "", /filtro materia/);
assert.equal(
  anteprimaEsclusaDalFiltro({
    attiva: false,
    materiaId: materia,
    fornitoreId: "",
    filtroMateria: "altra",
    filtroFornitore: "",
    filtroStato: "",
    filtroPiano: "",
  }),
  null
);

const dopoSalvataggio = resocontoConAnteprima({
  salvate: [salvata("2026-11-01", 4), salvata("2026-11-03", 4), salvata("2026-11-05", 4)],
  anteprima: bozza.consegne.map((consegna) => ({
    data: consegna.data,
    materiaId: materia,
    materia: "MP olio",
    unita: consegna.unitaMisura,
    tipoQuantita: consegna.tipoQuantita,
    quantita: consegna.quantita,
  })),
});
assert.equal(dopoSalvataggio.consegnePreviste, 3);
assert.equal(dopoSalvataggio.gruppi[0]?.precisaSalvata, 12);
assert.equal(dopoSalvataggio.gruppi[0]?.precisaAnteprima, 0);
assert.equal(dopoSalvataggio.gruppi[0]?.ordinata, 12);

const unitaDiversa = resocontoConAnteprima({
  salvate: [],
  anteprima: [
    {
      data: "2026-11-01",
      materiaId: materia,
      materia: "MP olio",
      unita: "kg",
      tipoQuantita: "precisa",
      quantita: 4,
    },
    {
      data: "2026-11-02",
      materiaId: materia,
      materia: "MP olio",
      unita: "g",
      tipoQuantita: "precisa",
      quantita: 100,
    },
  ],
});
assert.equal(unitaDiversa.gruppi.length, 2);
assert.equal(unitaDiversa.gruppi.find((gruppo) => gruppo.unita === "kg")?.precisaAnteprima, 4);
assert.equal(unitaDiversa.gruppi.find((gruppo) => gruppo.unita === "g")?.precisaAnteprima, 100);

console.log("resoconto anteprima: ok");
