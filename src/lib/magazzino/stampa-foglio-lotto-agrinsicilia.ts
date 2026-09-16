import type { FoglioLottoPagina } from "@/lib/magazzino/fogli-lotto-blocchi";
import type { LottoAgrinsiciliaDettaglio } from "@/lib/magazzino/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dt(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT");
}

function paginaHtml(
  lotto: LottoAgrinsiciliaDettaglio,
  pagina: FoglioLottoPagina,
  isLast: boolean
): string {
  return `<section class="sheet${isLast ? " last" : ""}">
  <p class="muted">OpuntiaIndustry · Foglio lotto da attaccare</p>
  <p class="unit">${escapeHtml(pagina.titoloUnita)}${
    pagina.totale > 1
      ? ` · foglio ${pagina.indice}/${pagina.totale}`
      : ""
  }</p>
  <h1 class="code">${escapeHtml(lotto.lottoCodice)}</h1>
  <p><strong>${escapeHtml(lotto.prodottoCodice)}</strong> — ${escapeHtml(lotto.prodottoNome)}</p>
  <p>Quantità lotto: <strong>${lotto.quantitaKg.toLocaleString("it-IT")} ${escapeHtml(lotto.unita)}</strong>
    ${lotto.daCompletareCi ? ' <span class="badge">C/I da completare</span>' : ""}</p>
  <p>${escapeHtml(pagina.dettaglioUnita)}</p>
  ${
    pagina.composizione
      ? `<p><strong>Composizione:</strong> ${escapeHtml(pagina.composizione)}</p>`
      : ""
  }
  ${
    lotto.confezionamentoRiepilogo
      ? `<p class="muted">Tutti i blocchi: ${escapeHtml(lotto.confezionamentoRiepilogo)}</p>`
      : ""
  }

  <h2>Foglio ingresso materia prima</h2>
  ${
    lotto.foglioIngresso
      ? `<p>${escapeHtml(lotto.foglioIngresso.codice)}
      ${lotto.foglioIngresso.lottoMp ? ` · MP ${escapeHtml(lotto.foglioIngresso.lottoMp)}` : ""}
      · ${escapeHtml(lotto.foglioIngresso.documentoStato)}
      ${lotto.foglioIngresso.operatoreMuletto ? ` · muletto ${escapeHtml(lotto.foglioIngresso.operatoreMuletto)}` : ""}</p>`
      : "<p class='muted'>Nessun foglio ingresso collegato.</p>"
  }

  <h2>Foglio di lavorazione</h2>
  ${
    lotto.foglio
      ? `<p>${escapeHtml(lotto.foglio.codice)} · ${escapeHtml(lotto.foglio.stato)}
      ${lotto.foglio.lottoLabel ? ` · ${escapeHtml(lotto.foglio.lottoLabel)}` : ""}</p>`
      : "<p class='muted'>Nessun foglio di lavorazione collegato.</p>"
  }

  <h2>Lotto esterno</h2>
  ${
    lotto.lottoEsterno
      ? `<p class="code">${escapeHtml(lotto.lottoEsterno.codice)}</p>`
      : "<p class='muted'>Nessun lotto esterno associato.</p>"
  }

  <h2>Registrazioni / turni operatori</h2>
  <table>
    <thead><tr><th>Quando</th><th>Evento</th><th>Operatore</th></tr></thead>
    <tbody>
      ${lotto.timeline
        .map(
          (e) => `<tr>
            <td>${escapeHtml(dt(e.at))}</td>
            <td>${escapeHtml(e.titolo)}${e.dettaglio ? `<div class="muted">${escapeHtml(e.dettaglio)}</div>` : ""}</td>
            <td>${escapeHtml(e.operatore || "—")}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="cut">
    <p class="muted">Ritaglia e attacca sul contenitore / bancale.</p>
    <p class="code">${escapeHtml(lotto.lottoCodice)}</p>
    <p>${escapeHtml(pagina.titoloUnita)} · ${escapeHtml(pagina.dettaglioUnita)}</p>
    <p>${escapeHtml(lotto.prodottoCodice)} · ${lotto.quantitaKg.toLocaleString("it-IT")} ${escapeHtml(lotto.unita)}</p>
  </div>
</section>`;
}

export function stampaFogliLottoAgrinsicilia(
  lotto: LottoAgrinsiciliaDettaglio,
  pagine: FoglioLottoPagina[]
): void {
  const sheets = pagine.length
    ? pagine
    : [
        {
          titoloUnita: "Foglio lotto",
          dettaglioUnita: lotto.confezioneNome
            ? `${lotto.confezioneNome} · ${lotto.isolamentoNome ?? "—"}`
            : "Senza blocchi",
          composizione: lotto.confezionamentoRiepilogo ?? "",
          indice: 1,
          totale: 1,
        },
      ];
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Fogli lotto ${escapeHtml(lotto.lottoCodice)} (${sheets.length})</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: system-ui, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .code { font-family: ui-monospace, monospace; font-size: 16px; letter-spacing: .04em; }
    h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { color: #64748b; font-weight: 600; font-size: 10px; text-transform: uppercase; }
    .muted { color: #64748b; }
    .badge { display: inline-block; border: 1px solid #f59e0b; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
    .unit { font-weight: 700; margin: 0 0 6px; }
    .cut { margin-top: 18px; border-top: 1px dashed #94a3b8; padding-top: 10px; }
    .sheet { page-break-after: always; padding-bottom: 8px; }
    .sheet.last { page-break-after: auto; }
  </style>
</head>
<body>
  ${sheets.map((p, i) => paginaHtml(lotto, p, i === sheets.length - 1)).join("\n")}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function stampaFoglioLottoAgrinsicilia(
  lotto: LottoAgrinsiciliaDettaglio
): void {
  stampaFogliLottoAgrinsicilia(lotto, []);
}
