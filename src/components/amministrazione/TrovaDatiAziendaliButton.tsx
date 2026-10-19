"use client";

/** Ricerca Google fissa: intestazione e dati aziendali del nome scritto in scheda. */
export function queryTrovaDatiAziendali(nome: string): string {
  return `trova intestazione "${nome.trim()}" e tutti i dati aziendali p iva tel mail ecc..`;
}

export function TrovaDatiAziendaliButton({ nome }: { nome: string }) {
  const pronto = nome.trim().length > 0;
  return (
    <button
      type="button"
      disabled={!pronto}
      title={
        pronto
          ? "Apre una scheda Google con la ricerca sui dati aziendali"
          : "Scrivi prima la ragione sociale"
      }
      onClick={() => {
        const url = `https://www.google.com/search?hl=it&q=${encodeURIComponent(queryTrovaDatiAziendali(nome))}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
    >
      Trova dati aziendali
    </button>
  );
}
