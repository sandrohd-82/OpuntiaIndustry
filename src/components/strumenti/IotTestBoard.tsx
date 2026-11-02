"use client";

import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRotate, FaXmark } from "react-icons/fa6";
import { salvaIotBrokerAction } from "@/app/actions/iot-broker";
import {
  topicConDevice,
  urlWebSocketBroker,
  type IotBrokerImpostazioni,
  type IotProtocolloDevice,
  type IotProtocolloWeb,
  type IotStatoImpostazioni,
} from "@/lib/iot/broker";

type StatoLink = "disconnesso" | "connessione" | "connesso";

type RigaLog = {
  id: string;
  ora: string;
  topic: string;
  payload: string;
};

type ClientMqtt = {
  connected: boolean;
  on(event: "connect" | "reconnect" | "close", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(
    event: "message",
    cb: (topic: string, message: { toString: (encoding?: string) => string }) => void
  ): void;
  subscribe(topic: string | string[]): void;
  unsubscribe(topic: string): void;
  publish(
    topic: string,
    payload: string,
    opts: { qos: 0 },
    cb: (err?: Error | null) => void
  ): void;
  removeAllListeners(): void;
  end(force?: boolean): void;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

function oraAdesso(): string {
  return new Date().toLocaleTimeString("it-IT", { hour12: false });
}

export function IotTestBoard({ iniziale }: { iniziale: IotBrokerImpostazioni }) {
  const [form, setForm] = useState(iniziale);
  const [deviceId, setDeviceId] = useState("WAVESHARE-01");
  const [statoLink, setStatoLink] = useState<StatoLink>("disconnesso");
  const [erroreLink, setErroreLink] = useState<string | null>(null);
  const [topicInvio, setTopicInvio] = useState(
    topicConDevice(iniziale.topicComando, "WAVESHARE-01")
  );
  const [payload, setPayload] = useState("1");
  const [esitoInvio, setEsitoInvio] = useState<string | null>(null);
  const [topicNuovo, setTopicNuovo] = useState("opuntia/#");
  const [topicAttivi, setTopicAttivi] = useState<string[]>([]);
  const [log, setLog] = useState<RigaLog[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esitoSalva, setEsitoSalva] = useState<string | null>(null);
  const clientRef = useRef<ClientMqtt | null>(null);
  const topicsRef = useRef<string[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    topicsRef.current = topicAttivi;
  }, [topicAttivi]);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log, autoScroll]);

  useEffect(() => {
    return () => {
      const client = clientRef.current;
      clientRef.current = null;
      client?.removeAllListeners();
      client?.end(true);
    };
  }, []);

  function aggiungiLog(topic: string, payloadTesto: string) {
    setLog((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          ora: oraAdesso(),
          topic,
          payload: payloadTesto,
        },
      ];
      return next.slice(-300);
    });
  }

  async function connetti() {
    setErroreLink(null);
    setStatoLink("connessione");
    const precedente = clientRef.current;
    clientRef.current = null;
    precedente?.removeAllListeners();
    precedente?.end(true);
    const mqtt = (await import("mqtt/dist/mqtt.esm.js")) as {
      default: {
        connect: (url: string, opts: Record<string, unknown>) => ClientMqtt;
      };
    };
    const connect = mqtt.default.connect;
    const clientId = `${form.webClientIdPrefix}-${crypto.randomUUID().slice(0, 8)}`;
    const client = connect(urlWebSocketBroker(form), {
      clientId,
      username: form.webUtente || undefined,
      password: form.webPassword || undefined,
      reconnectPeriod: 4000,
      connectTimeout: 10000,
      clean: true,
      protocolVersion: 4,
    });
    clientRef.current = client;
    client.on("connect", () => {
      setStatoLink("connesso");
      setErroreLink(null);
      const attivi = topicsRef.current;
      if (attivi.length) client.subscribe(attivi);
    });
    client.on("reconnect", () => setStatoLink("connessione"));
    client.on("close", () => {
      if (clientRef.current === client) setStatoLink("disconnesso");
    });
    client.on("error", (err) => {
      setErroreLink(err.message || "Connessione non riuscita.");
      setStatoLink("disconnesso");
    });
    client.on("message", (topic, message) => {
      aggiungiLog(topic, message.toString("utf8"));
    });
  }

  function pubblica() {
    const client = clientRef.current;
    const topic = topicInvio.trim();
    if (!client || !client.connected) {
      setEsitoInvio("Non connesso al broker.");
      return;
    }
    if (!topic) {
      setEsitoInvio("Manca il topic.");
      return;
    }
    client.publish(topic, payload, { qos: 0 }, (err) => {
      setEsitoInvio(err ? err.message : `Inviato su ${topic}`);
    });
  }

  function iscriviti() {
    const topic = topicNuovo.trim();
    if (!topic) return;
    if (topicAttivi.includes(topic)) return;
    const next = [...topicAttivi, topic];
    setTopicAttivi(next);
    topicsRef.current = next;
    const client = clientRef.current;
    if (client?.connected) client.subscribe(topic);
    setTopicNuovo("");
  }

  function disiscrivi(topic: string) {
    const next = topicAttivi.filter((item) => item !== topic);
    setTopicAttivi(next);
    topicsRef.current = next;
    const client = clientRef.current;
    if (client?.connected) client.unsubscribe(topic);
  }

  async function salva() {
    setSalvataggio(true);
    setEsitoSalva(null);
    const res = await salvaIotBrokerAction({
      webHost: form.webHost,
      webPorta: Number(form.webPorta),
      webProtocollo: form.webProtocollo,
      webUtente: form.webUtente,
      webPassword: form.webPassword,
      webClientIdPrefix: form.webClientIdPrefix,
      deviceHost: form.deviceHost,
      devicePorta: Number(form.devicePorta),
      deviceProtocollo: form.deviceProtocollo,
      deviceUtente: form.deviceUtente,
      devicePassword: form.devicePassword,
      topicComando: form.topicComando,
      topicStato: form.topicStato,
      stato: form.stato,
    });
    setSalvataggio(false);
    if (!res.success) {
      setEsitoSalva(res.error);
      return;
    }
    setForm(res.impostazioni);
    setEsitoSalva(`Salvate, versione ${res.impostazioni.versione}.`);
  }

  const badge =
    statoLink === "connesso"
      ? "bg-emerald-100 text-emerald-800"
      : statoLink === "connessione"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  const badgeTesto =
    statoLink === "connesso"
      ? "Connesso"
      : statoLink === "connessione"
        ? "In connessione"
        : "Disconnesso";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Broker WebSocket</h2>
            <p className="mt-1 font-mono text-xs text-slate-600">{urlWebSocketBroker(form)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>
              {badgeTesto}
            </span>
            <button
              type="button"
              onClick={() => void connetti()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <FaRotate className="h-3.5 w-3.5" />
              Riconnetti
            </button>
          </div>
        </div>
        {erroreLink ? <p className="mt-3 text-sm text-red-700">{erroreLink}</p> : null}
        <p className="mt-3 text-xs text-slate-500">
          Versione impostazioni {form.versione}, stato {form.stato}. Prefisso client{" "}
          {form.webClientIdPrefix}.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Invio messaggi</h2>
          <label className="block text-sm text-slate-700">
            Topic
            <input
              value={topicInvio}
              onChange={(event) => setTopicInvio(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Payload
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={pubblica}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white"
          >
            <FaPaperPlane className="h-3.5 w-3.5" />
            Invia messaggio
          </button>
          {esitoInvio ? <p className="text-sm text-slate-700">{esitoInvio}</p> : null}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Iscrizione canali</h2>
          <label className="block text-sm text-slate-700">
            Aggiungi topic
            <input
              value={topicNuovo}
              onChange={(event) => setTopicNuovo(event.target.value)}
              placeholder="opuntia/#"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={iscriviti}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          >
            Iscriviti
          </button>
          <div className="flex flex-wrap gap-2">
            {topicAttivi.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun topic attivo.</p>
            ) : (
              topicAttivi.map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-800"
                >
                  {topic}
                  <button
                    type="button"
                    aria-label={`Annulla iscrizione ${topic}`}
                    onClick={() => disiscrivi(topic)}
                    className="text-slate-500 hover:text-red-700"
                  >
                    <FaXmark className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Console messaggi</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAutoScroll((value) => !value)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs"
            >
              {autoScroll ? "Pausa scroll" : "Auto-scroll"}
            </button>
            <button
              type="button"
              onClick={() => setLog([])}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs"
            >
              Pulisci console
            </button>
          </div>
        </div>
        <div ref={logRef} className="h-80 overflow-y-auto px-4 py-3 font-mono text-xs leading-6">
          {log.length === 0 ? (
            <p className="text-slate-500">In attesa di messaggi.</p>
          ) : (
            log.map((riga) => (
              <p key={riga.id} className="break-all">
                <span className="text-slate-500">{riga.ora}</span>{" "}
                <span className="text-sky-300">{riga.topic}</span>{" "}
                <span>{riga.payload}</span>
              </p>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Impostazioni persistenti</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            label="Host WebSocket"
            value={form.webHost}
            onChange={(webHost) => setForm({ ...form, webHost })}
          />
          <CampoNumero
            label="Porta WebSocket"
            value={form.webPorta}
            onChange={(webPorta) => setForm({ ...form, webPorta })}
          />
          <label className="block text-sm text-slate-700">
            Protocollo web
            <select
              value={form.webProtocollo}
              onChange={(event) =>
                setForm({ ...form, webProtocollo: event.target.value as IotProtocolloWeb })
              }
              className={inputClass}
            >
              <option value="ws">ws</option>
              <option value="wss">wss</option>
            </select>
          </label>
          <Campo
            label="Utente web"
            value={form.webUtente}
            onChange={(webUtente) => setForm({ ...form, webUtente })}
          />
          <Campo
            label="Password web"
            value={form.webPassword}
            secret
            onChange={(webPassword) => setForm({ ...form, webPassword })}
          />
          <Campo
            label="Prefisso client id"
            value={form.webClientIdPrefix}
            onChange={(webClientIdPrefix) => setForm({ ...form, webClientIdPrefix })}
          />
          <Campo
            label="Host device"
            value={form.deviceHost}
            onChange={(deviceHost) => setForm({ ...form, deviceHost })}
          />
          <CampoNumero
            label="Porta MQTT device"
            value={form.devicePorta}
            onChange={(devicePorta) => setForm({ ...form, devicePorta })}
          />
          <label className="block text-sm text-slate-700">
            Protocollo device
            <select
              value={form.deviceProtocollo}
              onChange={(event) =>
                setForm({
                  ...form,
                  deviceProtocollo: event.target.value as IotProtocolloDevice,
                })
              }
              className={inputClass}
            >
              <option value="mqtt">mqtt</option>
              <option value="mqtts">mqtts</option>
            </select>
          </label>
          <Campo
            label="Utente device"
            value={form.deviceUtente}
            onChange={(deviceUtente) => setForm({ ...form, deviceUtente })}
          />
          <Campo
            label="Password device"
            value={form.devicePassword}
            secret
            onChange={(devicePassword) => setForm({ ...form, devicePassword })}
          />
          <Campo
            label="Topic comando"
            value={form.topicComando}
            onChange={(topicComando) => setForm({ ...form, topicComando })}
          />
          <Campo
            label="Topic stato"
            value={form.topicStato}
            onChange={(topicStato) => setForm({ ...form, topicStato })}
          />
          <label className="block text-sm text-slate-700">
            Stato documento
            <select
              value={form.stato}
              onChange={(event) =>
                setForm({ ...form, stato: event.target.value as IotStatoImpostazioni })
              }
              className={inputClass}
            >
              <option value="bozza">Bozza</option>
              <option value="approvato">Approvato</option>
              <option value="chiuso">Chiuso</option>
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            Device id di prova
            <input
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <p className="font-mono text-xs text-slate-600">
          Comando {topicConDevice(form.topicComando, deviceId)} · Stato{" "}
          {topicConDevice(form.topicStato, deviceId)}
        </p>
        <button
          type="button"
          disabled={salvataggio}
          onClick={() => void salva()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {salvataggio ? "Salvataggio…" : "Salva impostazioni"}
        </button>
        {esitoSalva ? <p className="text-sm text-slate-700">{esitoSalva}</p> : null}
      </section>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
}) {
  return (
    <label className="block text-sm text-slate-700">
      {label}
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function CampoNumero({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm text-slate-700">
      {label}
      <input
        type="number"
        min={1}
        max={65535}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}
