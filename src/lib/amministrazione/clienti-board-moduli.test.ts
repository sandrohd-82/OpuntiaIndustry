import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sorgente = readFileSync(
  resolve(__dirname, "../../components/amministrazione/ClientiBoard.tsx"),
  "utf8"
);

const differiti = [
  "AnagraficaSchedaDetail",
  "ClienteSchedaCompletaModal",
  "ClienteFormModal",
  "AziendaTimelineModal",
  "CollegaAziendaScelteModal",
  "FatturaSyncQueueModal",
  "SoftDeleteConfirmModal",
  "PdfExportDetailModal",
];

for (const nome of differiti) {
  assert.doesNotMatch(
    sorgente,
    new RegExp(`import \\{[^}]*\\b${nome}\\b[^}]*\\} from`)
  );
  assert.match(
    sorgente,
    new RegExp(`import\\("@/components/amministrazione/${nome}"\\)`)
  );
  assert.match(sorgente, new RegExp(`mod\\.${nome}`));
}

assert.match(sorgente, /from "@\/hooks\/useClienti"/);
assert.match(sorgente, /ClientiFiltersPanel/);
assert.match(sorgente, /AziendaFigliaRaccordo/);
assert.doesNotMatch(
  sorgente,
  /import \{ exportClientiPdf \} from "@\/lib\/amministrazione\/clienti-pdf"/
);
assert.match(sorgente, /import\("@\/lib\/amministrazione\/clienti-pdf"\)/);
assert.match(sorgente, /ssr: false/);
assert.match(sorgente, /Caricamento dettaglio/);
assert.match(sorgente, /Preparazione PDF/);

console.log("clienti-board-moduli: ok");
