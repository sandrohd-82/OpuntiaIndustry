"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { upsertCameraAction } from "@/app/actions/produzione-camere";
import type { CameraPublic, CameraTargetKind } from "@/lib/produzione/camera";

type Props = {
  targetKind: CameraTargetKind;
  targetId: string;
  label: string;
  initial?: CameraPublic | null;
  onClose: () => void;
  onSaved: (camera: CameraPublic) => void;
};

const STEPS = [
  "Modello e scopo",
  "Cosa ti serve",
  "Montaggio e rete",
  "Trovare l’indirizzo IP",
  "Account e RTSP",
  "Percorso /live/ch0",
  "Prova con VLC",
  "MediaMTX in officina",
  "Dati da salvare",
] as const;

export function RegistraCameraWizard({
  targetKind,
  targetId,
  label,
  initial,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [ip, setIp] = useState(initial?.cameraIp ?? "");
  const [path, setPath] = useState(initial?.cameraRtspPath || "/live/ch0");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await upsertCameraAction({
      targetKind,
      targetId,
      cameraIp: ip.trim(),
      cameraRtspPath: path.trim() || "/live/ch0",
      cameraPassword: password,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onSaved(res.camera);
  }

  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Solo amministratore · passo {step + 1} di {STEPS.length}
        </p>
        <h2 id={titleId} className="mt-1 text-lg font-semibold">
          Registra telecamera ieGeek · {label}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{STEPS[step]}</p>

        <div className="mt-4 space-y-3 text-sm leading-relaxed">
          {step === 0 ? (
            <>
              <p>
                Questa guida vale per le telecamere <strong>ieGeek ZS-GX4S</strong>{" "}
                (bullet IP, RTSP su porta <strong>554</strong>). Lo stream non
                arriva mai così com’è al browser: OpuntiaIndustry chiede a{" "}
                <strong>MediaMTX</strong> (Docker in officina) di aprire l’RTSP{" "}
                <em>solo quando</em> un operatore clicca «Guarda Live» e di
                chiuderlo quando la finestra si chiude.
              </p>
              <p>
                Centro di lavoro collegato: <strong>{label}</strong> (
                {targetKind === "area" ? "intera area" : "singola postazione"}
                ). Un’area può avere una camera d’insieme; ogni posto (es.
                Spaccapale) può avere la propria.
              </p>
              <p>
                La password della camera <strong>non viene mostrata</strong> agli
                operatori e non finisce nei log. Solo admin e superadmin possono
                completare questo wizard.
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Telecamera ieGeek ZS-GX4S, alimentatore 12 V (o PoE se usi uno
                switch PoE e l’adattatore previsto dal modello).
              </li>
              <li>
                Cavo Ethernet CAT5e/CAT6 dalla camera allo <strong>stesso
                switch/router</strong> del PC (o NAS) dove gira Docker MediaMTX.
                Le ieGeek in <code>192.168.x</code> non sono raggiungibili da
                Vercel: il live funziona dai PC in LAN (o in VPN aziendale).
              </li>
              <li>
                App <strong>ieGeek</strong> (o CloudEdge, a seconda del firmware)
                su smartphone, per il primo accoppiamento.
              </li>
              <li>
                Un PC Windows in officina con <strong>VLC</strong> (prova RTSP)
                e <strong>Docker Desktop</strong> per MediaMTX.
              </li>
              <li>
                Accesso al router (elenco DHCP) oppure ONVIF Device Manager, per
                leggere l’IP assegnato.
              </li>
              <li>
                Password <strong>nuova e robusta</strong> per l’utente{" "}
                <code>admin</code> della camera. Non lasciare quella di fabbrica
                e non riusarla su altri servizi.
              </li>
            </ol>
          ) : null}

          {step === 2 ? (
            <>
              <p>
                Fissa la camera in modo che inquadri il banco o il varco
                magazzino. Evita controluce diretto sul sensore.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Collega alimentazione e cavo di rete. Attendi 1–2 minuti.</li>
                <li>
                  Il LED di rete deve essere acceso. Se no: cavo, porta switch,
                  o alimentazione.
                </li>
                <li>
                  La camera deve stare nella <strong>stessa VLAN/LAN</strong> del
                  host MediaMTX. Se la metti in «rete ospite» isolata, il live
                  non partirà.
                </li>
                <li>
                  Annota dove l’hai installata (es. «Taglio — Spaccapale,
                  parete nord») nelle note interne: serve per audit e
                  manutenzione.
                </li>
              </ol>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p>
                Ti serve l’IPv4 fisso o riservato in DHCP, esempio{" "}
                <code>192.168.1.120</code>.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Apri l’app ieGeek, seleziona la camera, cerca Impostazioni →
                  Informazioni dispositivo / Rete. Copia l’IP LAN (non l’UID
                  cloud).
                </li>
                <li>
                  In alternativa: router → elenco client DHCP → cerca «ieGeek»,
                  «GX4S» o l’indirizzo MAC stampato sul corpo camera.
                </li>
                <li>
                  Terza via: software <strong>ONVIF Device Manager</strong> sulla
                  stessa LAN: elenca le camera e mostra IP + porte.
                </li>
                <li>
                  Dal PC officina apri il Prompt e lancia{" "}
                  <code>ping 192.168.1.120</code>. Se non risponde, non
                  proseguire: MediaMTX non potrà aprire l’RTSP.
                </li>
                <li>
                  Consigliato: nel router crea una <strong>prenotazione
                  DHCP</strong> su quel MAC, così l’IP non cambia dopo un
                  blackout.
                </li>
              </ol>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p>
                L’utente RTSP delle ZS-GX4S è quasi sempre <code>admin</code>.
                La password è quella che hai impostato sulla camera (non quella
                di OpuntiaIndustry).
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Nelle impostazioni camera cerca Rete / Protocollo /{" "}
                  <strong>RTSP</strong> e <strong>abilitalo</strong>. Porta
                  predefinita: <strong>554</strong>.
                </li>
                <li>
                  Se esiste «autenticazione RTSP», lasciala attiva. Non esporre
                  la porta 554 su Internet (niente port forwarding).
                </li>
                <li>
                  Cambia la password di fabbrica. Evita caratteri che rompono
                  gli URL (<code>@ : / ? #</code>): se li usi, il gestionale li
                  codifica, ma VLC diventa più scomodo da testare.
                </li>
                <li>
                  Annota la password in un gestore aziendale, non su un foglio
                  vicino alla linea.
                </li>
              </ol>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <p>
                Il canale principale delle ieGeek ZS-GX4S è di solito:
              </p>
              <p className="rounded-md bg-slate-100 px-3 py-2 font-mono text-xs">
                rtsp://admin:PASSWORD@IP:554/live/ch0
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <code>/live/ch0</code> — stream principale (qualità alta).
                  Usalo per il live in officina.
                </li>
                <li>
                  <code>/live/ch1</code> — sotto-stream (più leggero). Usalo
                  solo se la rete è lenta.
                </li>
                <li>
                  Se il firmware parla di «subtype=0» invece di ch0, prova
                  comunque <code>/live/ch0</code> prima di cambiare.
                </li>
              </ul>
              <p>
                Nel form finale lascerai il path <code>/live/ch0</code> salvo
                prove diverse riuscite in VLC.
              </p>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <p>
                Prima di salvare in Opuntia, verifica dallo <strong>stesso
                PC</strong> dove gira Docker:
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Apri VLC → Media → Apri flusso di rete.</li>
                <li>
                  Incolla{" "}
                  <code>rtsp://admin:LA_PASSWORD@IP:554/live/ch0</code>{" "}
                  sostituendo IP e password reali.
                </li>
                <li>
                  Entro 3–5 secondi deve comparire il video. Se chiedi utente e
                  password, sono quelli della camera.
                </li>
                <li>
                  Se VLC fallisce: IP sbagliato, RTSP spento, password errata,
                  oppure un firewall sul PC blocca la 554 in uscita.
                </li>
                <li>
                  Solo se VLC funziona ha senso registrare la camera qui: il
                  gestionale userà lo stesso URL (la password resta cifrata in
                  database, mai inviata al browser).
                </li>
              </ol>
            </>
          ) : null}

          {step === 7 ? (
            <>
              <p>
                Sul PC officina (stessa LAN delle ieGeek), con Docker acceso:
              </p>
              <p className="rounded-md bg-slate-100 px-3 py-2 font-mono text-xs">
                cd docker/mediamtx
                <br />
                copia .env.example → .env e incolla TUNNEL_TOKEN
                <br />
                docker compose up -d
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Crea un Cloudflare Tunnel (Zero Trust → Networks → Tunnels).
                  Hostname pubblico (es.{" "}
                  <code>cameras.tuodominio.it</code>) verso{" "}
                  <code>http://mediamtx:8888</code> (solo HLS). Non esporre
                  554, 8889, 9997.
                </li>
                <li>
                  Incolla il token connector in{" "}
                  <code>docker/mediamtx/.env</code> come{" "}
                  <code>TUNNEL_TOKEN=…</code> (una tantum). Poi{" "}
                  <code>docker compose up -d</code>.
                </li>
                <li>
                  Su Vercel:{" "}
                  <code>MEDIAMTX_HLS_BASE_URL=https://cameras.tuodominio.it</code>
                  . Opzionale (stesso Tunnel, secondo hostname + Access):{" "}
                  <code>MEDIAMTX_API_URL=https://mtx-api.tuodominio.it</code>{" "}
                  così il live da remoto crea il path on-demand.
                </li>
                <li>
                  Prova dal PC: <code>http://127.0.0.1:8888</code>. Da
                  smartphone 4G: apri il gestionale e «Guarda Live» (solo
                  admin).
                </li>
              </ol>
            </>
          ) : null}

          {step === 8 ? (
            <form id="camera-register-form" onSubmit={submit} className="space-y-3">
              <p>
                Compila solo dopo la prova VLC. Utente RTSP fisso:{" "}
                <code>admin</code>.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Indirizzo IP camera</span>
                <input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.1.120"
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Path RTSP</span>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/live/ch0"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
                />
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Default ieGeek ZS-GX4S: /live/ch0
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">
                  Password RTSP (utente admin)
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    initial?.hasPassword
                      ? "Lascia vuoto per non cambiarla"
                      : "Password impostata sulla camera"
                  }
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
            >
              Indietro
            </button>
            {!last ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
              >
                Avanti
              </button>
            ) : (
              <button
                type="submit"
                form="camera-register-form"
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva telecamera"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
