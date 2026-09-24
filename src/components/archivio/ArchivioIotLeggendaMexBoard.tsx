"use client";

import {
  IOT_LETTERA_META,
  IOT_LETTERE,
  IOT_LETTERE_LEGGENDA,
  IOT_LETTERE_VERSIONE,
  encodeCorpoRegola,
} from "@/lib/action/iot-lettere";
import {
  MEX_CLASSI,
  MEX_CMD,
  MEX_LEGGENDA,
  MEX_PAYLOAD_LEN,
  MEX_TIPI,
  MEX_VERSIONE,
  encodeOnBruciatoreEsempio,
  encodeRegolaVentolaEsempio,
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
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        <p className="font-semibold">Frame e corpo</p>
        <p className="mt-1">
          Il frame inviato resta sempre{" "}
          <span className="font-mono">
            7E 0F 49 00 13 A2 00 41 62 C8 1F 4F …
          </span>{" "}
          (18 byte). Le lettere <span className="font-mono">h l r i s</span>{" "}
          sono il <strong>tipo azione del corpo</strong> (h High, l Low, r
          Regola, i Input, s Sensor). La A nel frame è l’involucro Mex, non
          Regola. Minuscola = master → slave; maiuscola = risposta.
        </p>
        <p className="mt-2 text-xs">
          Protocollo Mex v{MEX_VERSIONE} · corpo lettere v{IOT_LETTERE_VERSIONE} ·
          documento Approvato. Gli UID di esempio sono segnaposto finché non si
          collegano i modulini veri.
        </p>
      </div>
    </div>
  );
}

export function ArchivioIotLeggendaMexBoard() {
  const onBruciatore = encodeOnBruciatoreEsempio();
  const scenari = scenariOnBruciatore(onBruciatore);
  const regola30 = encodeRegolaVentolaEsempio(30);
  const corpoRegola30 = encodeCorpoRegola({
    componente: MEX_CMD.FAN_POWER,
    impostazione: 30,
  });

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
          Tipo frame Mex (A / R / K / S) — non è il tipo azione del corpo
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
          Corpo del messaggio (h / l / r / i / s)
        </h3>
        <p className="text-sm text-slate-700">
          Tipo azione = lettera del corpo: <span className="font-mono">r</span> è
          Regola (non la A del frame). Formato{" "}
          <span className="font-mono">r(Numero componente)-(Impostazione)</span>.
          Esempio ventola 30%: corpo{" "}
          <span className="font-mono">{corpoRegola30}</span> — tipo azione{" "}
          <span className="font-mono">r</span>, componente{" "}
          <span className="font-mono">04</span>, impostazione{" "}
          <span className="font-mono">30</span>. Frame{" "}
          <span className="font-mono">{regola30.hexSpaced}</span> (CMD 04 e D1 04
          = componente, D0 1E = 30).
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Uso</th>
                <th className="px-3 py-2">Nel frame</th>
                <th className="px-3 py-2">Esempio master</th>
                <th className="px-3 py-2">Risposta slave</th>
              </tr>
            </thead>
            <tbody>
              {IOT_LETTERE.map((L) => {
                const m = IOT_LETTERA_META[L];
                const nelFrame =
                  L === "r"
                    ? "CMD + D1 = componente · D0 = impostazione"
                    : L === "s"
                      ? "TIPO R · D0 = id sensore"
                      : L === "l"
                        ? "TIPO A · D0 = 00"
                        : "TIPO A · D0 = 01";
                return (
                  <tr key={L} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-mono text-lg font-semibold">
                      {L}
                    </td>
                    <td className="px-3 py-2 font-medium">{m.nome}</td>
                    <td className="px-3 py-2">{m.uso}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{nelFrame}</td>
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
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Corpo</th>
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
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-800">
          <li>
            <span className="font-mono">h</span> /{" "}
            <span className="font-mono">l</span> /{" "}
            <span className="font-mono">i</span> /{" "}
            <span className="font-mono">s</span>: il numero è l’indirizzo (Mex
            CMD in anagrafica).
          </li>
          <li>
            <span className="font-mono">r</span> = tipo azione Regola:{" "}
            <span className="font-mono">r(Componente)-(Impostazione)</span>
            {" "}es. <span className="font-mono">r04-30</span>. Nel frame CMD e D1
            = 04 (componente), D0 = 1E (30).
          </li>
          <li>
            Risposta sensore: <span className="font-mono">S12-0256</span> = id
            12, valore <strong>25,6</strong> (quattro cifre = decimi).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Esempio unico: On bruciatore (A01) sui 3 mezzi
        </h3>
        <p className="text-sm text-slate-700">
          Stesso Mex, tre involucri. Device di esempio SH{" "}
          <span className="font-mono">{onBruciatore.uidHigh}</span> SL{" "}
          <span className="font-mono">{onBruciatore.uidLow}</span> (OUI Digi
          0013A200 + seriale basso, come da datasheet XBee). Corpo{" "}
          <span className="font-mono">h1</span>.
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
          Messaggi Out e In (frame hex)
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
