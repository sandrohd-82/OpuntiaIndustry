import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMMERCIALE_SECTIONS, resolveCommercialePage } from "./commerciale";

const root = resolve(__dirname, "../../..");
const paginaClienti = readFileSync(
  resolve(root, "src/app/app/commerciale/clienti/page.tsx"),
  "utf8"
);
const paginaSezione = readFileSync(
  resolve(root, "src/app/app/commerciale/[section]/page.tsx"),
  "utf8"
);

const voce = COMMERCIALE_SECTIONS.find((item) => item.slug === "clienti");
const pagina = resolveCommercialePage(["clienti"]);
assert.equal(voce?.path, "/app/commerciale/clienti");
assert.equal(pagina?.label, voce?.label);
assert.equal(pagina?.description, voce?.description);

assert.match(
  paginaClienti,
  /requireAnyAreaAccess\(\["commerciale", "amministrazione"\]\)/
);
assert.doesNotMatch(paginaClienti, /area-fiscale/);
assert.match(paginaClienti, /ClientiBoard/);
assert.match(paginaClienti, /AppHeader/);
assert.match(paginaClienti, /resolveCommercialePage\(\["clienti"\]\)/);

assert.doesNotMatch(paginaSezione, /import \{ ClientiBoard \}/);
assert.doesNotMatch(paginaSezione, /section === "clienti"/);
assert.match(paginaSezione, /PossibiliClientiBoard/);
assert.match(paginaSezione, /PreventiviBoard/);
assert.match(paginaSezione, /ListiniB2bBoard/);
assert.match(paginaSezione, /FatturaEmissioneBoard/);
assert.match(
  paginaSezione,
  /requireAnyAreaAccess\(\[\s*"commerciale",\s*"amministrazione",\s*"area-fiscale",\s*\]\)/
);

console.log("commerciale-clienti-route: ok");
