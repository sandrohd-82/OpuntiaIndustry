"use client";

import { FaXmark } from "react-icons/fa6";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Guida operativa SuperAdmin: collegare Aruba / Gmail a OpuntiaIndustry.
 */
export function WebmailSetupGuideModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Come collegare le caselle"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Spiega come fare — Aruba e Gmail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 text-sm text-slate-700">
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-900">Prima di iniziare</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              <li>
                Solo il <strong>SuperAdmin</strong> collega caselle ai profili
                (pulsante + accanto a WebMail).
              </li>
              <li>
                In Vercel / <code>.env.local</code> deve esserci{" "}
                <code>WEBMAIL_ENCRYPTION_KEY</code> (cifra le password).
              </li>
              <li>
                Opzionale sync automatica:{" "}
                <code>WEBMAIL_SYNC_ENABLED=true</code> e cron{" "}
                <code>/api/cron/webmail-sync</code>.
              </li>
            </ul>
          </section>

          <section className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
            <h3 className="font-semibold text-sky-950">Gmail / Google Workspace</h3>
            <ol className="list-decimal space-y-2 pl-5 text-xs text-sky-950">
              <li>
                Apri{" "}
                <a
                  className="underline"
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Account → Sicurezza
                </a>{" "}
                con l’account della casella.
              </li>
              <li>
                Attiva la <strong>Verifica in due passaggi</strong> (obbligatoria).
              </li>
              <li>
                Vai a{" "}
                <a
                  className="underline"
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                >
                  App password
                </a>
                : App = Mail, Dispositivo = Altro → «OpuntiaIndustry». Genera e
                copia le <strong>16 lettere</strong>.
              </li>
              <li>
                In Opuntia: seleziona uno o più <strong>profili</strong>,
                provider <strong>Gmail</strong>, email della casella, password =
                App Password → Salva. Poi usa <strong>Sincronizza</strong>.
              </li>
            </ol>
            <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-sky-100 text-sky-900">
                  <tr>
                    <th className="px-2 py-1.5">Parametro</th>
                    <th className="px-2 py-1.5">Valore</th>
                    <th className="px-2 py-1.5">Dove prenderlo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-sky-100">
                    <td className="px-2 py-1.5">Email / Username</td>
                    <td className="px-2 py-1.5">es. commerciale@azienda.it</td>
                    <td className="px-2 py-1.5">Indirizzo casella Google</td>
                  </tr>
                  <tr className="border-t border-sky-100">
                    <td className="px-2 py-1.5">Password</td>
                    <td className="px-2 py-1.5">App Password 16 caratteri</td>
                    <td className="px-2 py-1.5">myaccount.google.com/apppasswords</td>
                  </tr>
                  <tr className="border-t border-sky-100">
                    <td className="px-2 py-1.5">IMAP</td>
                    <td className="px-2 py-1.5">imap.gmail.com:993 SSL</td>
                    <td className="px-2 py-1.5">Preset automatico in UI</td>
                  </tr>
                  <tr className="border-t border-sky-100">
                    <td className="px-2 py-1.5">SMTP</td>
                    <td className="px-2 py-1.5">smtp.gmail.com:465 SSL</td>
                    <td className="px-2 py-1.5">Preset automatico in UI</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-sky-900">
              Workspace: l’admin Google deve consentire IMAP e App password
              per l’unità organizzativa.
            </p>
          </section>

          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <h3 className="font-semibold text-amber-950">Aruba Email (ordinaria)</h3>
            <ol className="list-decimal space-y-2 pl-5 text-xs text-amber-950">
              <li>
                Accedi a{" "}
                <a
                  className="underline"
                  href="https://admin.aruba.it"
                  target="_blank"
                  rel="noreferrer"
                >
                  admin.aruba.it
                </a>{" "}
                (o pannello email del dominio).
              </li>
              <li>
                Sezione <strong>Email</strong> → seleziona la casella (es.
                info@tuodominio.it).
              </li>
              <li>
                Verifica/reimposta la <strong>password della casella</strong>{" "}
                (può essere diversa dalla password account Aruba).
              </li>
              <li>
                Assicurati che IMAP/SMTP siano abilitati (di solito già attivi).
              </li>
              <li>
                In Opuntia: seleziona uno o più <strong>profili</strong>,
                provider <strong>Aruba</strong>, email = username = indirizzo
                completo, password casella → Salva → <strong>Sincronizza</strong>.
              </li>
            </ol>
            <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-amber-100 text-amber-950">
                  <tr>
                    <th className="px-2 py-1.5">Parametro</th>
                    <th className="px-2 py-1.5">Valore</th>
                    <th className="px-2 py-1.5">Dove prenderlo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-amber-100">
                    <td className="px-2 py-1.5">Email / Username</td>
                    <td className="px-2 py-1.5">casella@tuodominio.it</td>
                    <td className="px-2 py-1.5">Pannello Aruba → Email</td>
                  </tr>
                  <tr className="border-t border-amber-100">
                    <td className="px-2 py-1.5">Password</td>
                    <td className="px-2 py-1.5">Password casella</td>
                    <td className="px-2 py-1.5">Stesso pannello (reimposta se serve)</td>
                  </tr>
                  <tr className="border-t border-amber-100">
                    <td className="px-2 py-1.5">IMAP</td>
                    <td className="px-2 py-1.5">imaps.aruba.it:993 SSL</td>
                    <td className="px-2 py-1.5">Preset Aruba in UI</td>
                  </tr>
                  <tr className="border-t border-amber-100">
                    <td className="px-2 py-1.5">SMTP</td>
                    <td className="px-2 py-1.5">smtps.aruba.it:465 SSL</td>
                    <td className="px-2 py-1.5">Preset Aruba in UI</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-amber-950">
              PEC: usa provider Generico con imaps.pec.aruba.it / smtps.pec.aruba.it.
              Per mail commerciali preferisci casella ordinaria, non PEC.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-900">Dopo il salvataggio</h3>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
              <li>
                L’utente collegato vede la casella in <strong>WebMail → Caselle</strong>.
              </li>
              <li>
                Premi <strong>Sincronizza ora</strong> (o attendi il cron) per
                importare la INBOX.
              </li>
              <li>
                Se «Invalid credentials»: ricontrolla App Password (Gmail) o
                password casella (Aruba); username = email completa.
              </li>
            </ol>
          </section>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
