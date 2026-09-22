"use client";

import {
  MEX_CLASSI,
  MEX_LEGGENDA,
  MEX_PAYLOAD_LEN,
  MEX_TIPI,
  MEX_VERSIONE,
  encodeOnBruciatoreEsempio,
  scenariOnBruciatore,
} from "@/lib/action/iot-mex";

export function ArchivioIotFunzionamentoBoard() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[15px] leading-7 text-slate-800">
      <p>
        Un solo <strong>Mex</strong> per WiFi, XBee e LoRa. Cambia solo il
        “tubo”: HTTPS, telaio radio XBee o FRMPayload LoRa. L’Arduino gateway
        inoltra gli stessi byte, non traduce il significato.
      </p>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Come funziona (oggi grafica, poi IoT)
      </h3>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>In Action imposti Temperatura e Ventilazione, poi On su entrambi.</li>
        <li>
          Avvia essiccatore registra i Mex (classe Impostazione, UID 8 byte).
        </li>
        <li>
          Lo stesso hex va al device WiFi, oppure diventa RF Data XBee, oppure
          FRMPayload LoRa.
        </li>
        <li>
          L’UID è l’indirizzo IEEE: su XBee è SH (4 byte alti) + SL (4 bassi);
          su LoRa è il DevEUI; su WiFi è la stessa chiave in anagrafica.
        </li>
      </ol>
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        Protocollo Mex versione {MEX_VERSIONE}. Gli UID di esempio sono
        segnaposto finché non si collegano i modulini veri.
      </p>
    </div>
  );
}

export function ArchivioIotLeggendaMexBoard() {
  const onBruciatore = encodeOnBruciatoreEsempio();
  const scenari = scenariOnBruciatore(onBruciatore);

  return (
    <div className="space-y-6">
      <ArchivioIotFunzionamentoBoard />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Struttura del frame unico
        </h3>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[13px] leading-6 text-slate-100">
          <code>7E | LEN | CLS | UID[8] SH+SL | DIR | TIPO | CMD | D0 D1 D2 | CHK</code>
        </pre>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">
          <li>
            <span className="font-mono">7E</span> solo inizio frame (non è la
            classe)
          </li>
          <li>
            <span className="font-mono">LEN</span> = {MEX_PAYLOAD_LEN} (da CLS a
            D2)
          </li>
          <li>
            <span className="font-mono">CLS</span> classe messaggio (C / I / E /
            A)
          </li>
          <li>
            <span className="font-mono">UID</span> 8 byte: 4 alti (SH) + 4 bassi
            (SL), come XBee e DevEUI LoRa
          </li>
          <li>
            <span className="font-mono">DIR</span> O = Out, I = In
          </li>
          <li>
            <span className="font-mono">TIPO</span> A Action, R Request, K acK,
            S Sensor
          </li>
          <li>
            <span className="font-mono">CHK</span> = 0xFF − (somma CLS…D2 &
            0xFF)
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Classe (CLS)
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
              {Object.values(MEX_CLASSI).map((t) => (
                <tr key={t.lettera} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono font-semibold">{t.lettera}</td>
                  <td className="px-3 py-2">{t.nome}</td>
                  <td className="px-3 py-2">{t.spiegazione}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tipo azione (A / R / K / S)
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
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Esempio unico: On bruciatore (A01) sui 3 mezzi
        </h3>
        <p className="text-sm text-slate-700">
          Stesso Mex, tre involucri. Device di esempio SH{" "}
          <span className="font-mono">{onBruciatore.uidHigh}</span> SL{" "}
          <span className="font-mono">{onBruciatore.uidLow}</span> (OUI Digi
          0013A200 + seriale basso, come da datasheet XBee).
        </p>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[13px] leading-6 text-slate-100">
          <code>{`Mex unico  ${onBruciatore.hexSpaced}\nCodice     ${onBruciatore.codice}  CLS=${onBruciatore.cls}  D0=On  CHK=${onBruciatore.chk.toString(16).toUpperCase().padStart(2, "0")}`}</code>
        </pre>
        <div className="grid gap-3 lg:grid-cols-1">
          {scenari.map((s) => (
            <article
              key={s.mezzo}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <h4 className="text-sm font-semibold">{s.titolo}</h4>
              <p className="mt-1 text-sm text-slate-600">{s.spiegazione}</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[12px] leading-5 text-slate-100">
                <code>{s.corpo}</code>
              </pre>
            </article>
          ))}
        </div>
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
                      SH {v.esempio.uidHigh} · SL {v.esempio.uidLow} · CHK{" "}
                      {v.esempio.chk.toString(16).toUpperCase().padStart(2, "0")}
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
