"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  disableIotDeviceAction,
  getIotDeviceByMacchinarioAction,
  upsertIotDeviceAction,
} from "@/app/actions/produzione-iot";
import {
  listMacchinaAttivitaAction,
  listRicambiAction,
  softDeleteRicambioAction,
  updateMacchinarioAnagraficaAction,
  updateMacchinarioStatoAction,
  upsertRicambioAction,
} from "@/app/actions/produzione-macchinari";
import { IoTControlPanel } from "@/components/produzione/IoTControlPanel";
import { IotStatusDot } from "@/components/produzione/IotStatusDot";
import { MachinePowerToggle } from "@/components/produzione/MachinePowerToggle";
import { InfoHint } from "@/components/ui/InfoHint";
import type { IotDevice } from "@/lib/produzione/iot";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  applyMacchinaPatch,
  attivitaOrigineLabel,
  isInsieme,
  nestMacchinari,
  ricambioSottoSoglia,
  type MacchinarioAttivita,
  type MacchinarioRicambio,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  areaCodice: string;
  macchinaCodice: string;
};

export function MacchinarioBoard({ areaCodice, macchinaCodice }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [isAdmin, setIsAdmin] = useState(false);
  const [editAnagrafica, setEditAnagrafica] = useState(false);
  const [nome, setNome] = useState("");
  const [codiceEdit, setCodiceEdit] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [noteAnag, setNoteAnag] = useState("");
  const [savingAnag, setSavingAnag] = useState(false);
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [macchina, setMacchina] = useState<ProduzioneMacchinario | null>(null);
  const [ricambi, setRicambi] = useState<MacchinarioRicambio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [iot, setIot] = useState(false);
  const [arresto, setArresto] = useState(false);
  const [statoNote, setStatoNote] = useState("");
  const [attivita, setAttivita] = useState<MacchinarioAttivita[]>([]);
  const [articolo, setArticolo] = useState("");
  const [dettaglio, setDettaglio] = useState("");
  const [azienda, setAzienda] = useState("");
  const [presente, setPresente] = useState(false);
  const [scaffale, setScaffale] = useState("");
  const [quantita, setQuantita] = useState("0");
  const [soglia, setSoglia] = useState("0");
  const [iotDevice, setIotDevice] = useState<IotDevice | null>(null);
  const [deviceCode, setDeviceCode] = useState("");
  const [pollSeconds, setPollSeconds] = useState("5");
  const [plaintextToken, setPlaintextToken] = useState<string | null>(null);
  const [savingIot, setSavingIot] = useState(false);

  function load() {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setIsAdmin(res.isAdmin);
      const a = res.items.find((x) => x.codice === areaCodice) ?? null;
      const raw = a?.macchinari.find((x) => x.codice === macchinaCodice) ?? null;
      const tree = nestMacchinari(a?.macchinari ?? []);
      const m =
        tree.find((x) => x.codice === macchinaCodice) ??
        tree.flatMap((x) => x.figli ?? []).find((x) => x.codice === macchinaCodice) ??
        raw;
      setArea(a);
      setMacchina(m ?? null);
      if (m) {
        setNome(m.nome);
        setCodiceEdit(m.codice);
        setDescrizione(m.descrizione);
        setNoteAnag(m.note);
        setEditAnagrafica(false);
        setIot(m.iotCollegato);
        setArresto(m.statoIot === "arresto");
        setStatoNote(m.statoNote);
        const [r, a, d] = await Promise.all([
          listRicambiAction(m.id),
          listMacchinaAttivitaAction(m.id),
          getIotDeviceByMacchinarioAction(m.id),
        ]);
        if (!r.success) setError(r.error);
        else setRicambi(r.items);
        if (!a.success) setError(a.error);
        else setAttivita(a.items);
        if (d.success) {
          setIotDevice(d.device);
          setDeviceCode(d.device?.deviceCode ?? m.codice.toUpperCase());
          setPollSeconds(String(d.device?.pollSeconds ?? 5));
        }
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodice, macchinaCodice]);

  if (!area || !macchina) {
    return (
      <p className="text-sm text-red-700">
        {error ?? (pending ? "Caricamento macchina…" : "Macchinario non trovato.")}
      </p>
    );
  }

  const base = `/app/produzione/gestione-aree/${area.codice}`;

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        {macchina.descrizione || `Impianto in area ${area.nome}.`}
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Anagrafica macchinario</h3>
          {isAdmin && !editAnagrafica ? (
            <button
              type="button"
              onClick={() => setEditAnagrafica(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Modifica anagrafica
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Nome e dati anagrafici si aggiornano in tutte le aree dove esiste
          questo codice macchina.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Nome
            <input
              value={nome}
              disabled={!editAnagrafica}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Codice
            <input
              value={codiceEdit}
              disabled={!editAnagrafica}
              onChange={(e) => setCodiceEdit(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="sm:col-span-2 text-xs text-[var(--muted)]">
            Descrizione
            <input
              value={descrizione}
              disabled={!editAnagrafica}
              onChange={(e) => setDescrizione(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="sm:col-span-2 text-xs text-[var(--muted)]">
            Note
            <input
              value={noteAnag}
              disabled={!editAnagrafica}
              onChange={(e) => setNoteAnag(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </label>
        </div>
        {editAnagrafica ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingAnag || !nome.trim()}
              onClick={() =>
                void (async () => {
                  setSavingAnag(true);
                  setError(null);
                  try {
                    const res = await updateMacchinarioAnagraficaAction({
                      id: macchina.id,
                      nome: nome.trim(),
                      codice: codiceEdit,
                      descrizione,
                      note: noteAnag,
                      iotCollegato: iot,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                    setEditAnagrafica(false);
                    if (res.item.codice !== macchinaCodice) {
                      router.push(`${base}/macchinari/${res.item.codice}`);
                      return;
                    }
                    load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Salvataggio non riuscito."
                    );
                  } finally {
                    setSavingAnag(false);
                  }
                })()
              }
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingAnag ? "Salvataggio…" : "Salva in tutte le aree"}
            </button>
            <button
              type="button"
              disabled={savingAnag}
              onClick={() => {
                setNome(macchina.nome);
                setCodiceEdit(macchina.codice);
                setDescrizione(macchina.descrizione);
                setNoteAnag(macchina.note);
                setEditAnagrafica(false);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            Stato di funzionamento
            <InfoHint title="Come si collega un dispositivo" wide>
              <span className="space-y-2">
                <span className="block">
                  Apri la scheda della macchina (admin).
                </span>
                <span className="block">
                  In Modalità di gestione seleziona Tramite IoT.
                </span>
                <span className="block">
                  Imposta device_code (es. PMP-INZ-DSF) e l’intervallo di
                  polling.
                </span>
                <span className="block">
                  Salva collegamento IoT: viene emesso un token mostrato una
                  sola volta (in database resta solo l’hash).
                </span>
                <span className="block">
                  Copia token e device_code nello sketch ESP32/Arduino.
                </span>
                <span className="block">
                  Il firmware non parla con un broker MQTT e non usa la service
                  role di Supabase. Chiama le API del gestionale:
                </span>
                <span className="block font-mono text-xs leading-relaxed">
                  POST /api/iot/telemetry — invio dati (temperatura, pressione,
                  on, …)
                  <br />
                  GET /api/iot/commands — comandi pendenti (POWER_ON /
                  POWER_OFF)
                  <br />
                  POST /api/iot/commands — ack dopo l’esecuzione
                </span>
                <span className="block">
                  Sketch di esempio:{" "}
                  <span className="font-mono text-xs">
                    scripts/iot/opuntia_iot_client.ino
                  </span>
                </span>
              </span>
            </InfoHint>
          </h3>
          <div className="flex items-center gap-3">
            <IotStatusDot stato={macchina.statoIot} />
            <MachinePowerToggle
              macchina={macchina}
              origine={isInsieme(macchina) ? "insieme" : "scheda"}
              onError={setError}
              onChanged={(item) => {
                setMacchina((prev) => {
                  if (!prev) return item;
                  if (item.id === prev.id) return { ...prev, ...item };
                  const patched = applyMacchinaPatch(
                    [prev, ...(prev.figli ?? [])],
                    item
                  );
                  return nestMacchinari(patched)[0] ?? { ...prev, ...item };
                });
                setArresto(item.statoIot === "arresto");
                setStatoNote(item.statoNote);
                window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                start(async () => {
                  const a = await listMacchinaAttivitaAction(macchina.id);
                  if (a.success) setAttivita(a.items);
                });
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {isInsieme(macchina)
            ? "La vasca è un insieme: On/Off si ripercuote sulle macchine interne. Non ha uno stato proprio."
            : macchina.iotCollegato
              ? "IoT collegato: On/Off registra il comando da inviare al dispositivo."
              : "Senza IoT: On/Off è la dichiarazione dell’operatore."}
        </p>
        {isInsieme(macchina) && (macchina.figli ?? []).length ? (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {(macchina.figli ?? []).map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div>
                  <Link
                    href={`${base}/macchinari/${f.codice}`}
                    className="text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    {f.nome}
                  </Link>
                  <div className="mt-0.5">
                    <IotStatusDot stato={f.statoIot} size="sm" />
                  </div>
                </div>
                <MachinePowerToggle
                  macchina={f}
                  origine="scheda"
                  size="sm"
                  onError={setError}
                  onChanged={(item) => {
                    setMacchina((prev) => {
                      if (!prev) return prev;
                      const flat = [prev, ...(prev.figli ?? [])];
                      return (
                        nestMacchinari(applyMacchinaPatch(flat, item))[0] ?? prev
                      );
                    });
                    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {isInsieme(macchina) ? null : (
        <div className="mt-3 space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-700">
              Modalità di gestione
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo-iot"
                checked={!iot}
                disabled={!isAdmin}
                onChange={() => setIot(false)}
              />
              Manuale (dichiarazione operatore)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo-iot"
                checked={iot}
                disabled={!isAdmin}
                onChange={() => setIot(true)}
              />
              Tramite IoT (REST + Realtime, senza MQTT)
            </label>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={arresto}
                onChange={(e) => setArresto(e.target.checked)}
              />
              Arresto per problema
            </label>
            <label className="min-w-64 flex-1 text-xs text-[var(--muted)]">
              Note / causa (obbligatoria in arresto)
              <input
                value={statoNote}
                onChange={(e) => setStatoNote(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateMacchinarioStatoAction(macchina.id, {
                    iotCollegato: iot,
                    statoIot: arresto
                      ? "arresto"
                      : macchina.statoIot === "acceso"
                        ? "acceso"
                        : "spento",
                    statoNote,
                  });
                  if (!res.success) setError(res.error);
                  else {
                    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                    load();
                  }
                })
              }
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Aggiorna stato
            </button>
          </div>
        </div>
        )}
      </div>

      {!isInsieme(macchina) && iot ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">Collegamento IoT</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Il microcontrollore (ESP32/Arduino) chiama le API REST del
              gestionale. Non serve un broker MQTT.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-[var(--muted)]">
                Device code
                <input
                  value={deviceCode}
                  disabled={!isAdmin}
                  onChange={(e) => setDeviceCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-sm disabled:bg-slate-100"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Poll comandi (secondi)
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={pollSeconds}
                  disabled={!isAdmin}
                  onChange={(e) => setPollSeconds(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Endpoint telemetria: <span className="font-mono">/api/iot/telemetry</span>
              {" · "}
              Endpoint comandi: <span className="font-mono">/api/iot/commands</span>
              {iotDevice?.hasToken
                ? ` · token già emesso (…${iotDevice.apiTokenHint})`
                : " · nessun token ancora"}
            </p>
            {plaintextToken ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-950">
                Token (copialo ora, non verrà più mostrato): {plaintextToken}
              </p>
            ) : null}
            {isAdmin ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingIot || !deviceCode.trim()}
                  onClick={() =>
                    void (async () => {
                      setSavingIot(true);
                      setError(null);
                      try {
                        const res = await upsertIotDeviceAction({
                          macchinarioId: macchina.id,
                          deviceCode,
                          pollSeconds: Number(pollSeconds) || 5,
                          regenerateToken: !iotDevice?.hasToken,
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setIotDevice(res.device);
                        setDeviceCode(res.device.deviceCode);
                        if (res.plaintextToken) setPlaintextToken(res.plaintextToken);
                        setIot(true);
                        window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                        load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Salvataggio IoT fallito.");
                      } finally {
                        setSavingIot(false);
                      }
                    })()
                  }
                  className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingIot ? "Salvataggio…" : "Salva collegamento IoT"}
                </button>
                {iotDevice?.hasToken ? (
                  <button
                    type="button"
                    disabled={savingIot}
                    onClick={() =>
                      void (async () => {
                        setSavingIot(true);
                        setError(null);
                        const res = await upsertIotDeviceAction({
                          macchinarioId: macchina.id,
                          deviceCode,
                          pollSeconds: Number(pollSeconds) || 5,
                          regenerateToken: true,
                        });
                        setSavingIot(false);
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setIotDevice(res.device);
                        if (res.plaintextToken) setPlaintextToken(res.plaintextToken);
                      })()
                    }
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    Rigenera token
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={savingIot}
                  onClick={() =>
                    void (async () => {
                      setSavingIot(true);
                      const res = await disableIotDeviceAction(macchina.id);
                      setSavingIot(false);
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setIot(false);
                      setPlaintextToken(null);
                      window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                      load();
                    })()
                  }
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Torna a manuale
                </button>
              </div>
            ) : null}
          </div>
          {iotDevice ? <IoTControlPanel device={iotDevice} canCommand /> : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">Registro attività On/Off</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Registro immutabile: chi ha dichiarato On o Off, quando e da dove.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {attivita.length === 0 ? (
            <li className="py-2 text-sm text-[var(--muted)]">
              Nessuna attività registrata.
            </li>
          ) : (
            attivita.map((row) => (
              <li key={row.id} className="py-2 text-sm">
                <span
                  className={
                    row.azione === "on"
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-slate-600"
                  }
                >
                  {row.azione === "on" ? "On" : "Off"}
                </span>
                {" · "}
                {row.actorNome || "Operatore"}
                {" · "}
                {attivitaOrigineLabel(row.origine)}
                {" · "}
                {new Date(row.createdAt).toLocaleString("it-IT")}
                {row.note ? (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {row.note}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">Inventario pezzi di ricambio</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--muted)]">
            Articolo
            <input
              value={articolo}
              onChange={(e) => setArticolo(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Nome dettaglio
            <input
              value={dettaglio}
              onChange={(e) => setDettaglio(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Azienda venditrice
            <input
              value={azienda}
              onChange={(e) => setAzienda(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={presente}
              onChange={(e) => setPresente(e.target.checked)}
            />
            Ricambio presente
          </label>
          {presente ? (
            <>
              <label className="text-xs text-[var(--muted)]">
                Scaffale
                <input
                  value={scaffale}
                  onChange={(e) => setScaffale(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Pezzi presenti
                <input
                  type="number"
                  min={0}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Soglia minima
                <input
                  type="number"
                  min={0}
                  value={soglia}
                  onChange={(e) => setSoglia(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
            </>
          ) : null}
        </div>
        <button
          type="button"
          disabled={pending || !articolo.trim() || !dettaglio.trim()}
          onClick={() =>
            start(async () => {
              const res = await upsertRicambioAction({
                macchinarioId: macchina.id,
                articolo,
                nomeDettaglio: dettaglio,
                aziendaVenditrice: azienda,
                presente,
                scaffale,
                quantita: Number(quantita) || 0,
                sogliaMinima: Number(soglia) || 0,
              });
              if (!res.success) {
                setError(res.error);
                return;
              }
              setArticolo("");
              setDettaglio("");
              setAzienda("");
              setPresente(false);
              setScaffale("");
              setQuantita("0");
              setSoglia("0");
              load();
            })
          }
          className="mt-3 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Aggiungi ricambio
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-3">Articolo</th>
                <th className="py-2 pr-3">Nome dettaglio</th>
                <th className="py-2 pr-3">Azienda venditrice</th>
                <th className="py-2 pr-3">Presente</th>
                <th className="py-2 pr-3">Scaffale</th>
                <th className="py-2 pr-3">Pezzi</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {ricambi.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-[var(--muted)]">
                    Nessun ricambio registrato.
                  </td>
                </tr>
              ) : (
                ricambi.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      ricambioSottoSoglia(r)
                        ? "bg-amber-50"
                        : "border-t border-[var(--border)]"
                    }
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{r.articolo}</td>
                    <td className="py-2 pr-3">{r.nomeDettaglio}</td>
                    <td className="py-2 pr-3">{r.aziendaVenditrice || "—"}</td>
                    <td className="py-2 pr-3">{r.presente ? "Sì" : "No"}</td>
                    <td className="py-2 pr-3">{r.presente ? r.scaffale : "—"}</td>
                    <td className="py-2 pr-3">
                      {r.presente
                        ? `${r.quantita} ${r.unita}${
                            ricambioSottoSoglia(r) ? " · sotto soglia" : ""
                          }`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs text-red-700 hover:underline"
                        onClick={() =>
                          start(async () => {
                            const res = await softDeleteRicambioAction(r.id);
                            if (!res.success) setError(res.error);
                            else load();
                          })
                        }
                      >
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Link
        href={`${base}/macchinari`}
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Torna all’elenco macchinari
      </Link>
    </div>
  );
}
