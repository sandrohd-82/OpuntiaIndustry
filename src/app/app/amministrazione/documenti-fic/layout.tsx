export default function DocumentoFicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* Vista documento: nasconde la sidebar dell'app (nuova scheda / stampa) */
        body:has(.paper-invoice-viewer) aside,
        body:has(.paper-invoice-viewer) [data-app-sidebar] {
          display: none !important;
        }
        body:has(.paper-invoice-viewer) .flex.min-h-screen > div.flex-1 {
          max-width: 100%;
        }
        @media print {
          body:has(.paper-invoice-viewer) aside,
          body:has(.paper-invoice-viewer) [data-app-sidebar] {
            display: none !important;
          }
        }
      `}</style>
      {children}
    </>
  );
}
