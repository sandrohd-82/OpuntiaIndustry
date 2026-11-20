import assert from "node:assert/strict";
import type { Profile } from "@/types/database";
import { concludiAzione, apriMisuraScheda, avviaAzione, normalizzaMisureScheda } from "./scheda-completa";
import {
  apriCronometroServer,
  differenzaNonAttribuitaMs,
  includiTempiServer,
  normalizzaTempiServer,
  tempiServerVisibili,
} from "./tempi-server-scheda";

const profilo = {
  app_roles: { code: "superadmin" },
  potere: "operatore",
} as Profile;

assert.equal(
  tempiServerVisibili({ profile: profilo, impersonating: false }),
  true
);
assert.equal(
  tempiServerVisibili({ profile: profilo, impersonating: true }),
  false
);
assert.equal(
  tempiServerVisibili({
    profile: { app_roles: { code: "operator" }, potere: "operatore" } as Profile,
    impersonating: false,
  }),
  false
);
assert.equal(tempiServerVisibili(null), false);

const nascosto = includiTempiServer(false, { totaleMs: 4, passi: [] });
assert.equal("tempiServer" in nascosto, false);
const visibile = includiTempiServer(true, {
  totaleMs: 9,
  passi: [{ nome: "accesso", ms: 3, righe: null }],
});
assert.equal(visibile.tempiServer?.totaleMs, 9);

const sporco = normalizzaTempiServer({
  totaleMs: 12,
  email: "ada@example.com",
  clienteId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  passi: [
    { nome: "query", ms: 8, righe: 2, sql: "select * from clienti" },
    { nome: "sconosciuto", ms: 1, righe: 1 },
    { nome: "ilike", ms: 4, righe: "nome@example.com" },
  ],
});
assert.equal(sporco?.totaleMs, 12);
assert.equal(sporco?.passi.length, 2);
assert.equal(sporco?.passi[1]?.righe, null);
assert.equal(JSON.stringify(sporco).includes("ada@"), false);
assert.equal(JSON.stringify(sporco).includes("select"), false);
assert.equal(JSON.stringify(sporco).includes("aaaaaaaa"), false);

assert.equal(differenzaNonAttribuitaMs(10000, 8000), 2000);
assert.equal(differenzaNonAttribuitaMs(100, 120), 0);
assert.equal(differenzaNonAttribuitaMs(null, 10), null);

const orologio = apriCronometroServer();
const inizio = performance.now();
orologio.segna("accesso", inizio, 1);
const tempi = orologio.chiudi();
assert.equal(tempi.passi[0]?.nome, "accesso");
assert.ok(tempi.totaleMs >= tempi.passi[0]?.ms);

let misura = apriMisuraScheda(1, 1);
misura = avviaAzione(misura, "scheda", 2);
misura = concludiAzione(misura, "scheda", 30, "ok", sporco);
const lette = normalizzaMisureScheda([misura]);
assert.equal(lette[0]?.azioni.scheda?.server?.totaleMs, 12);
assert.equal(lette[0]?.azioni.scheda?.durataMs, 30);
assert.equal(JSON.stringify(lette).includes("ada@"), false);

console.log("tempi-server-scheda: ok");
