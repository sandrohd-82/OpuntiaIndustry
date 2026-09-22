"use client";

import {
  MEX_LEGGENDA,
  MEX_PAYLOAD_LEN,
  MEX_TIPI,
  MEX_VERSIONE,
} from "@/lib/action/iot-mex";

export function ArchivioIotFunzionamentoBoard() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[15px] leading-7 text-slate-800">
      <p>
        Il master (gestionale) e il device si parlano con <strong>Mex</strong>:
        frame fissi da 9 byte, come i modulini XBee. Ogni messaggio ha un
        inizio, una lunghezza, un tipo, un comando, i dati e un checksum. Se la
        somma non torna, master e device scartano il frame.
      </p>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Come funziona (oggi grafica, poi IoT)
      </h3>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>In Action imposti Temperatura e Ventilazione, poi On su entrambi.</li>
        <li>
          Avvia essiccatore registra l’azione e mostra i Mex in uscita già
          codificati, con checksum.
        </li>
        <li>
          Le risposte in ingresso restano «in attesa» finché il dispositivo non
          è collegato.
        </li>
        <li>
          La percentuale bruciatore non si comanda a mano: il device la regola
          dalla sonda TEMP-BRUC per tenere il setpoint.
        </li>
      </ol>
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        Protocollo Mex versione {MEX_VERSIONE}. Documentato in Leggenda Mex.
        Nessun invio radio finché l’IoT non è configurato.
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
          Struttura del frame
        </h3>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[13px] leading-6 text-slate-100">
          <code>7E | LEN | DIR | TIPO | CMD | D0 D1 D2 | CHK</code>
        </pre>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">
          <li>
            <span className="font-mono">7E</span> inizio frame (come XBee)
          </li>
          <li>
            <span className="font-mono">LEN</span> = {MEX_PAYLOAD_LEN} (byte da
            DIR a D2)
          </li>
          <li>
            <span className="font-mono">DIR</span> O = Out (master→device), I =
            In (device→master)
          </li>
          <li>
            <span className="font-mono">TIPO</span> lettera ASCII del tipo
          </li>
          <li>
            <span className="font-mono">CMD</span> codice comando (01, 02, 03,
            04, 10)
          </li>
          <li>
            <span className="font-mono">D0 D1 D2</span> dati (On/Off, °C, %, id
            sensore + valore)
          </li>
          <li>
            <span className="font-mono">CHK</span> = 0xFF − (somma DIR…D2 &
            0xFF). Chi riceve verifica: somma + CHK ≡ 0xFF
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lettera iniziale (tipo)
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Lettera</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Significato</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(MEX_TIPI).map((t) => (
                <tr key={t.lettera} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono font-semibold">{t.lettera}</td>
                  <td className="px-3 py-2">{t.nome}</td>
                  <td className="px-3 py-2">{t.spiegazione}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600">
          Il codice visibile è lettera + comando in hex: A01, A02, R10, K01,
          S10. Corto da leggere, abbastanza preciso da non confondersi.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Messaggi Out e In
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Codice</th>
                <th className="px-3 py-2">Messaggio</th>
                <th className="px-3 py-2">Significato</th>
                <th className="px-3 py-2">Esempio + CHK</th>
              </tr>
            </thead>
            <tbody>
              {MEX_LEGGENDA.map((v) => (
                <tr
                  key={`${v.dir}-${v.codice}`}
                  className="border-t border-[var(--border)] align-top"
                >
                  <td className="px-3 py-2 font-semibold">{v.versoLabel}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{v.codice}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{v.titolo}</p>
                    <p className="text-xs text-slate-500">{v.spiegazione}</p>
                  </td>
                  <td className="px-3 py-2">{v.significato}</td>
                  <td className="px-3 py-2">
                    <p className="font-mono text-[11px] tracking-wide">
                      {v.esempio.hexSpaced}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      LEN {v.esempio.len} · CHK {v.esempio.chk
                        .toString(16)
                        .toUpperCase()
                        .padStart(2, "0")}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
