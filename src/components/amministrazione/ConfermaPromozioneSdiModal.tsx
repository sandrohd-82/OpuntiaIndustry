"use client";

export function ConfermaPromozioneSdiModal({
  nome,
  occupato,
  etichettaConferma = "Conferma e invia allo SDI",
  nota,
  onAnnulla,
  onConferma,
}: {
  nome: string;
  occupato?: boolean;
  etichettaConferma?: string;
  nota?: string;
  onAnnulla: () => void;
  onConferma: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promozione-sdi-titolo"
        className="w-full max-w-lg rounded-2xl border border-amber-300 bg-white p-5 shadow-xl"
      >
        <h2 id="promozione-sdi-titolo" className="text-base font-semibold text-amber-950">
          Passaggio a cliente
        </h2>
        <p className="mt-3 text-sm text-slate-800">
          Con l&apos;invio di questa prima fattura allo SDI,{" "}
          <strong>{nome || "questo possibile cliente"}</strong> passerà da possibile
          cliente a cliente. Ordine e fattura resteranno collegati alla nuova scheda.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Se l&apos;invio allo SDI non riesce, resta possibile cliente.
        </p>
        {nota ? <p className="mt-2 text-sm text-slate-700">{nota}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={onAnnulla}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={occupato}
            onClick={onConferma}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {etichettaConferma}
          </button>
        </div>
      </div>
    </div>
  );
}
