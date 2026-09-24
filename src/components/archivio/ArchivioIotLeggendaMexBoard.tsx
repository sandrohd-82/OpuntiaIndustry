"use client";

import {
  IOT_LETTERA_META,
  IOT_LETTERE,
  IOT_LETTERE_LEGGENDA,
  IOT_LETTERE_VERSIONE,
} from "@/lib/action/iot-lettere";

export function ArchivioIotFunzionamentoBoard() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[15px] leading-7 text-slate-800">
      <p>
        I messaggi IoT sono <strong>lettere + numero</strong>. Il gestionale è
        il master, gli oggetti (essiccatori, attuatori, sensori) sono gli slave.
      </p>
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        <p className="font-semibold">Regola di direzione</p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            <strong>Minuscola</strong> = master (Gestionale) → slave (oggetto)
          </li>
          <li>
            <strong>Maiuscola</strong> = stessa lettera, risposta slave →
            Gestionale
          </li>
        </ul>
      </div>
      <p className="text-sm text-slate-600">
        Protocollo lettere v{IOT_LETTERE_VERSIONE} · documento in Archivio IoT ·
        stato Approvato.
      </p>
    </div>
  );
}

export function ArchivioIotLeggendaMexBoard() {
  return (
    <div className="space-y-6">
      <ArchivioIotFunzionamentoBoard />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lettere
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Uso</th>
                <th className="px-3 py-2">Esempio master</th>
                <th className="px-3 py-2">Risposta slave</th>
              </tr>
            </thead>
            <tbody>
              {IOT_LETTERE.map((L) => {
                const m = IOT_LETTERA_META[L];
                return (
                  <tr key={L} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-mono text-lg font-semibold">
                      {L}
                    </td>
                    <td className="px-3 py-2 font-medium">{m.nome}</td>
                    <td className="px-3 py-2">{m.uso}</td>
                    <td className="px-3 py-2 font-mono">{m.esempioOut}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono">{m.esempioAck}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {m.notaAck}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tutti i messaggi (invio e conferma)
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Messaggio</th>
                <th className="px-3 py-2">Titolo</th>
                <th className="px-3 py-2">Significato</th>
              </tr>
            </thead>
            <tbody>
              {IOT_LETTERE_LEGGENDA.map((v) => (
                <tr
                  key={`${v.verso}-${v.messaggio}`}
                  className="border-t border-[var(--border)] align-top"
                >
                  <td className="px-3 py-2 font-semibold">
                    {v.verso === "out" ? "Master → slave" : "Slave → master"}
                  </td>
                  <td className="px-3 py-2 font-mono text-base font-semibold">
                    {v.messaggio}
                  </td>
                  <td className="px-3 py-2">{v.titolo}</td>
                  <td className="px-3 py-2">{v.significato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 text-sm leading-6 text-slate-800">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Come si legge il numero
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-mono">h</span> /{" "}
            <span className="font-mono">l</span> /{" "}
            <span className="font-mono">i</span> /{" "}
            <span className="font-mono">s</span>: il numero è l’
            <strong>indirizzo</strong> del componente o del sensore (Mex CMD in
            anagrafica).
          </li>
          <li>
            <span className="font-mono">r</span>: il numero è il{" "}
            <strong>valore</strong> da regolare (es. 65 = 65% inverter, oppure
            °C sul setpoint).
          </li>
          <li>
            Risposta sensore: <span className="font-mono">S12-0256</span> = id
            12, valore <strong>25,6</strong> (quattro cifre = decimi).
          </li>
          <li>
            In Sequenze, se il canale non ha Mex CMD, il messaggio non si
            genera.
          </li>
        </ul>
      </section>
    </div>
  );
}
