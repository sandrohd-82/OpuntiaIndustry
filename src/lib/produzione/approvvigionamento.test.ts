import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classificaProgrammazione,
  copiaOrdineSuData,
  copiaSettimana,
  dateUniche,
  fornitoreAssegnabile,
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
  false
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

console.log("approvvigionamento: ok");
