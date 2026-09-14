function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function stampaSchedaLottoUscita(opts: {
  codice: string;
  publicUrl: string;
  prodotto?: string | null;
  settimana: number;
  anno: number;
  qrDataUrl?: string | null;
}): void {
  const codice = escapeHtml(opts.codice);
  const url = escapeHtml(opts.publicUrl);
  const prodotto = escapeHtml(opts.prodotto || "Prodotto Agrinsicilia");
  const img = opts.qrDataUrl
    ? `<img src="${opts.qrDataUrl}" alt="QR" style="width:42mm;height:42mm" />`
    : "";
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Lotto in uscita ${codice}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: system-ui, sans-serif; color: #0f172a; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .code { font-family: ui-monospace, monospace; font-size: 28px; letter-spacing: .06em; }
    .row { display: flex; gap: 24px; align-items: center; margin-top: 16px; }
    p { margin: 6px 0; font-size: 13px; }
    .muted { color: #64748b; }
  </style>
</head>
<body>
  <p class="muted">OpuntiaIndustry · Lotto prodotto in uscita (esterno)</p>
  <h1 class="code">${codice}</h1>
  <p>${prodotto}</p>
  <p>Settimana ISO ${opts.settimana} · ${opts.anno}</p>
  <div class="row">
    ${img}
    <div>
      <p>${
        url
          ? "Inquadra il QR per la storia pubblica del prodotto (solo i campi abilitati)."
          : "QR del codice lotto. La storia pubblica si attiva dopo Registra carico."
      }</p>
      <p class="muted">${url || codice}</p>
    </div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
