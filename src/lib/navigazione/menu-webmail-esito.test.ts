import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esitoMenuWebmail } from "./menu-webmail-esito";

assert.equal(
  esitoMenuWebmail({
    success: true,
    accounts: [],
    grantedIds: [],
    assignMode: false,
    grantTone: "on",
  }),
  "applica"
);
assert.equal(
  esitoMenuWebmail({ success: false, error: "Non autenticato." }),
  "svuota"
);
assert.equal(
  esitoMenuWebmail({ success: false, error: "Accesso non verificato." }),
  "svuota"
);
assert.equal(
  esitoMenuWebmail({ success: false, error: "Lettura non disponibile." }),
  "conserva"
);

const menu = readFileSync("src/components/webmail/WebmailSidebarNav.tsx", "utf8");
const modale = readFileSync(
  "src/components/amministrazione/ClienteSchedaCompletaModal.tsx",
  "utf8"
);
assert.match(menu, /leggiWebmailMenu\(/);
assert.match(menu, /listWebmailUnreadInboxByAccountAction/);
assert.doesNotMatch(menu, /listWebmailMenuAccountsAction/);
assert.match(menu, /setInterval\(load, 30000\)/);
assert.match(modale, /\[cliente\.id, generazione\]/);
assert.doesNotMatch(modale, /\[cliente\.id, generazione, canEdit\]/);
assert.match(
  readFileSync("src/components/amministrazione/RichiediAnagraficaButton.tsx", "utf8"),
  /riepilogoAnagraficaFormAction/
);
assert.match(
  readFileSync("src/components/amministrazione/ClientiBoard.tsx", "utf8"),
  /getCommercialeAnagraficaContextAction/
);

console.log("menu-webmail-esito: ok");
