function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canvasPng(root: ParentNode | null): string | null {
  const canvas = root?.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Apre l’anteprima di stampa A4 orizzontale con sola etichetta lotto MP. */
export function stampaEtichettaIngressoMp(opts: {
  lotto: string;
  ingressoLabel: string;
  root?: ParentNode | null;
}): void {
  const image = canvasPng(opts.root ?? document.getElementById("ingresso-mp-etichetta"));
  const lotto = escapeHtml(opts.lotto);
  const ingresso = escapeHtml(opts.ingressoLabel);
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Codice lotto MP ${lotto}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    html, body {
      margin: 0;
      height: 100%;
      background: #fff;
      color: #0f172a;
      font-family: system-ui, sans-serif;
    }
    .page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .title {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 13px;
      color: #64748b;
    }
    img {
      display: block;
      margin: 22px auto 0;
      max-width: 70%;
      max-height: 48vh;
    }
    .lotto {
      margin: 22px 0 10px;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 36px;
      font-weight: 600;
      letter-spacing: 0.08em;
    }
    .ingresso {
      margin: 0;
      font-size: 16px;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="page">
    <p class="title">Codice lotto MP</p>
    ${image ? `<img src="${image}" alt="${lotto}" />` : ""}
    <p class="lotto">${lotto}</p>
    <p class="ingresso">Ingresso: ${ingresso}</p>
  </div>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:1123px;height:794px;border:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 60_000);

  doc.open();
  doc.write(html);
  doc.close();

  const printNow = () => {
    win.focus();
    win.print();
  };

  const img = doc.querySelector("img");
  if (img && !img.complete) {
    img.addEventListener("load", printNow, { once: true });
    img.addEventListener("error", printNow, { once: true });
    return;
  }
  window.setTimeout(printNow, 50);
}
