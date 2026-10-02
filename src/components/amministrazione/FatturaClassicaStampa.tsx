"use client";

import type { FatturaClassicaSoggetto } from "@/lib/amministrazione/fattura-classica-stampa";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import { formatIbanDisplay } from "@/lib/iban";
import { formatPreventivoDataIt } from "@/lib/amministrazione/preventivo-letterhead";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function testo(value: string, vuoto = "—") {
  const t = value.trim();
  return t || vuoto;
}

function Soggetto({
  titolo,
  soggetto,
  align,
}: {
  titolo: string;
  soggetto: FatturaClassicaSoggetto;
  align: "left" | "right";
}) {
  const right = align === "right";
  return (
    <div className={right ? "text-right text-[11px] leading-[1.45]" : "text-[12px] leading-[1.45]"}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em]">{titolo}</p>
      <p className={`mt-1 font-semibold ${right ? "" : "uppercase"}`}>
        {testo(soggetto.ragioneSociale)}
      </p>
      {right ? (
        <>
          <p>{testo(soggetto.via, "")}</p>
          <p>{testo(soggetto.capCitta, "")}</p>
          <p>
            P.iva {testo(soggetto.partitaIva)} - C.F. {testo(soggetto.codiceFiscale)}
          </p>
          {soggetto.email.trim() ? <p>{soggetto.email.trim()}</p> : null}
          {soggetto.telefono.trim() ? <p>Tel. {soggetto.telefono.trim()}</p> : null}
        </>
      ) : (
        <>
          <p>
            <span className="font-semibold">P.IVA:</span> {testo(soggetto.partitaIva)}
          </p>
          <p>
            <span className="font-semibold">CF:</span> {testo(soggetto.codiceFiscale)}
          </p>
          {soggetto.sdi.trim() ? (
            <p>
              <span className="font-semibold">SDI:</span> {soggetto.sdi.trim()}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Grafica della fattura di sistema. I testi arrivano dall'XML SDI. */
export function FatturaClassicaStampa({
  model,
}: {
  model: FatturaClassicaStampaModel;
}) {
  const data = model.dataDocumento
    ? formatPreventivoDataIt(model.dataDocumento)
    : "—";
  return (
    <article className="commercialista-fattura-foglio paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 print:shadow-none print:ring-0">
      <div className="box-border px-[12mm] py-[8mm] text-slate-900">
        <header>
          <div className="flex items-start justify-end">
            <div className="w-[58%] text-slate-900">
              <Soggetto titolo="Emittente" soggetto={model.emittente} align="right" />
              <p className="mt-1.5 text-right text-[12px] font-bold tracking-wide">
                FATTURA nr. {testo(model.numero)} del {data}
              </p>
            </div>
          </div>
          <div className="mt-3 h-px w-full bg-slate-900" />
        </header>

        <section className="mt-5">
          <div className="grid grid-cols-2 gap-6 text-slate-900">
            <Soggetto
              titolo="Destinatario"
              soggetto={model.destinatario}
              align="left"
            />
            <div className="pt-5 text-right text-[12px] uppercase leading-[1.45]">
              <p>{testo(model.destinatario.via, "")}</p>
              <p>{testo(model.destinatario.capCitta, "")}</p>
            </div>
          </div>
        </section>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <table className="w-full text-left text-[11px]">
            <thead className="border-b border-slate-300 text-slate-600">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                <th className="py-1.5 pr-2 font-medium">Qty</th>
                <th className="py-1.5 pr-2 font-medium">Listino</th>
                <th className="py-1.5 pr-2 font-medium">Sconto</th>
                <th className="py-1.5 pr-2 font-medium">Netto</th>
                <th className="py-1.5 font-medium">IVA</th>
              </tr>
            </thead>
            <tbody>
              {model.righe.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-2 italic text-slate-400">
                    Nessuna riga nello SDI
                  </td>
                </tr>
              ) : (
                model.righe.map((r, i) => {
                  const netto = prezzoScontatoUnitario(
                    r.prezzoUnitario,
                    r.scontoPercentuale
                  );
                  const nome = [r.codice, r.descrizione].filter(Boolean).join(" — ");
                  return (
                    <tr key={`${r.codice}-${i}`} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{nome}</td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {r.quantita} {r.unitaMisura}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {euro(r.prezzoUnitario)} €
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-medium tabular-nums">
                        {euro(netto)} €
                      </td>
                      <td className="py-1.5 tabular-nums">{r.ivaPercentuale}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {model.note.trim() ? (
            <p className="mt-3 whitespace-pre-line text-[11px] leading-[1.45]">
              {model.note.trim()}
            </p>
          ) : null}
          <div className="mt-3 h-px w-full bg-slate-900" />
        </div>

        <div className="commercialista-fattura-piede mt-4 grid grid-cols-2 border border-slate-800 text-[11px] leading-normal">
          <div className="border-r border-slate-800 p-3">
            <p className="text-[12px] font-bold">Pagamento</p>
            <p className="mt-0.5">{testo(model.pagamento)}</p>
            {model.scadenze.length > 1 ? (
              <ul className="mt-1 space-y-0.5">
                {model.scadenze.map((s, i) => (
                  <li key={`${s.data}-${i}`}>
                    Scadenza {i + 1}:{" "}
                    {s.data ? formatPreventivoDataIt(s.data) : "—"} · {euro(s.importo)} €
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 space-y-0.5">
              <p>
                <span className="font-semibold">Banca:</span> {testo(model.banca)}
              </p>
              <p>
                <span className="font-semibold">IBAN:</span>{" "}
                {model.iban.trim() ? formatIbanDisplay(model.iban) : "—"}
              </p>
              <p>
                <span className="font-semibold">BIC:</span> {testo(model.bic)}
              </p>
              <p>
                <span className="font-semibold">Importo:</span> {euro(model.totale)} €
              </p>
              <p>
                <span className="font-semibold">Causale:</span> Pagamento Fattura n.{" "}
                {testo(model.numero)} del {data}.
              </p>
            </div>
          </div>
          <div className="p-3">
            <p className="text-[12px] font-bold">Totali</p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between gap-3">
                <span>Imponibile</span>
                <span className="tabular-nums">{euro(model.imponibile)} €</span>
              </div>
              {model.aliquote.length > 1 ? (
                model.aliquote.map((a) => (
                  <div
                    key={`${a.aliquota}-${a.imponibile}`}
                    className="flex justify-between gap-3"
                  >
                    <span>IVA {a.aliquota}%</span>
                    <span className="tabular-nums">{euro(a.imposta)} €</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between gap-3">
                  <span>
                    Totale IVA{" "}
                    {model.aliquote[0] ? `${model.aliquote[0].aliquota}%` : ""}
                  </span>
                  <span className="tabular-nums">{euro(model.imposta)} €</span>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-slate-800 pt-1 font-semibold">
                <span>Totale Fattura</span>
                <span className="tabular-nums">{euro(model.totale)} €</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-4 text-center">
          <p className="text-[10px] font-semibold leading-[1.4]">
            {testo(model.emittente.ragioneSociale)}
          </p>
          <p className="text-[10px] leading-[1.4]">
            {[model.emittente.via, model.emittente.capCitta, model.emittente.email]
              .map((x) => x.trim())
              .filter(Boolean)
              .join(" - ") || "—"}
          </p>
          {model.emittente.telefono.trim() ? (
            <p className="text-[10px] leading-[1.4]">
              Tel. {model.emittente.telefono.trim()}
            </p>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
