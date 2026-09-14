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

async function qrPngDataUrl(text: string): Promise<string> {
  const bwip = await import("bwip-js");
  const toCanvas =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bwip as any).toCanvas ?? (bwip as any).default?.toCanvas;
  if (typeof toCanvas !== "function") {
    throw new Error("QR non disponibile.");
  }
  const canvas = document.createElement("canvas");
  await toCanvas(canvas, { bcid: "qrcode", text, scale: 4 });
  return canvas.toDataURL("image/png");
}

function openPrintHtml(html: string) {
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
  window.setTimeout(cleanup, 90_000);

  doc.open();
  doc.write(html);
  doc.close();

  const printNow = () => {
    win.focus();
    win.print();
  };

  const images = [...doc.querySelectorAll("img")];
  if (images.length === 0) {
    window.setTimeout(printNow, 50);
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) printNow();
  };
  for (const img of images) {
    if (img.complete) done();
    else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  }
}

/** Un foglio PDF per contenitore: timbro lettera, tipo, QR token, id A13 in basso a sx. */
export async function stampaFogliUnitaIngressoMp(opts: {
  lotto: string;
  ingressoLabel: string;
  lettera: string;
  unita: Array<{
    codiceUnita: string;
    tipoNome: string;
    indiceTipo: number;
    totaleTipo: number;
    scanPayload: string;
  }>;
}): Promise<void> {
  if (opts.unita.length === 0) {
    stampaEtichettaIngressoMp({
      lotto: opts.lotto,
      ingressoLabel: opts.ingressoLabel,
    });
    return;
  }

  const pages: string[] = [];
  for (const u of opts.unita) {
    const qr = await qrPngDataUrl(u.scanPayload);
    pages.push(`<section class="page">
  <div class="stamp" aria-label="Gruppo ${escapeHtml(opts.lettera)}">${escapeHtml(opts.lettera)}</div>
  <p class="kicker">Foglio contenitore</p>
  <p class="tipo-label">Tipo contenitore</p>
  <p class="tipo">${escapeHtml(u.tipoNome)}</p>
  <p class="prog">${escapeHtml(u.tipoNome)} ${u.indiceTipo}/${u.totaleTipo}</p>
  <img src="${qr}" alt="" />
  <p class="lotto">${escapeHtml(opts.lotto)}</p>
  <p class="ingresso">Ingresso: ${escapeHtml(opts.ingressoLabel)}</p>
  <p class="uid">${escapeHtml(u.codiceUnita)}</p>
</section>`);
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Fogli contenitore ${escapeHtml(opts.lotto)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    html, body { margin: 0; background: #fff; color: #0f172a; font-family: system-ui, sans-serif; }
    .page {
      position: relative;
      min-height: 178mm;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .page:last-child { page-break-after: auto; }
    .stamp {
      position: absolute;
      top: 4mm;
      right: 6mm;
      width: 30mm;
      height: 30mm;
      border: 1.4mm solid #b91c1c;
      border-radius: 50%;
      box-shadow: inset 0 0 0 0.7mm #b91c1c;
      color: #b91c1c;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18mm;
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1;
      transform: rotate(-12deg);
    }
    .kicker {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 12px;
      color: #64748b;
    }
    .tipo-label {
      margin: 12px 0 0;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .tipo {
      margin: 4px 0 0;
      font-size: 34px;
      font-weight: 700;
    }
    .prog { margin: 6px 0 0; font-size: 16px; color: #334155; }
    img { display: block; margin: 16px auto 0; width: 42mm; height: 42mm; }
    .lotto {
      margin: 14px 0 6px;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: 0.06em;
    }
    .ingresso { margin: 0; font-size: 15px; color: #334155; }
    .uid {
      position: absolute;
      left: 8mm;
      bottom: 5mm;
      margin: 0;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #0f172a;
    }
  </style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;

  openPrintHtml(html);
}
