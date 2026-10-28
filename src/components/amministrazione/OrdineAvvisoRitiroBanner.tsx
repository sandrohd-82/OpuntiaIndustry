export function OrdineAvvisoRitiroBanner({
  attivo,
  email,
  etichetta,
  orari,
  sede,
  misure,
  peso,
}: {
  attivo: boolean;
  email: string;
  etichetta?: string;
  orari: boolean;
  sede: boolean;
  misure: boolean;
  peso: boolean;
}) {
  if (!attivo || !email.trim()) return null;
  const voci = [
    orari ? "orari di ritiro" : "",
    sede ? "sede di ritiro" : "",
    misure ? "misure del collo" : "",
    peso ? "peso del collo" : "",
  ].filter(Boolean);
  const destinatario = etichetta?.trim()
    ? `${etichetta.trim()}: ${email.trim()}`
    : email.trim();
  return (
    <p className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      Quando la merce sarà pronta per il ritiro, una mail verrà inviata a{" "}
      {destinatario}.
      {voci.length
        ? ` Conterrà: ${voci.join(", ")}.`
        : " Nessun contenuto extra è stato selezionato."}
    </p>
  );
}

export function OrdineNessunaMailBanner({ attivo }: { attivo: boolean }) {
  if (!attivo) return null;
  return (
    <p className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
      Non è prevista alcuna mail al cliente: né fattura, né tracking, né
      cortesia.
    </p>
  );
}
