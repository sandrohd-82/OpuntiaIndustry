import { sendSmtpMail } from "@/lib/email/smtp";
import {
  GOOGLE_AUTHENTICATOR_ANDROID,
  GOOGLE_AUTHENTICATOR_IOS,
  getPublicAppUrl,
} from "@/lib/auth/app-url";

export async function sendPrimoAccessoEmail(options: {
  to: string;
  fullName: string;
  loginEmail: string;
  link: string;
  alreadyHasPassword: boolean;
}): Promise<void> {
  const appUrl = getPublicAppUrl();
  const name = options.fullName.trim() || "Operatore";
  const subject = options.alreadyHasPassword
    ? "Il tuo profilo Industry Gestionale è operativo"
    : "Imposta la password — Industry Gestionale";

  const text = options.alreadyHasPassword
    ? [
        `Ciao ${name},`,
        "",
        "Il tuo profilo su Industry Gestionale è stato attivato (stato Operativo).",
        "",
        `Per accedere usa questa email: ${options.loginEmail}`,
        `Gestionale: ${appUrl}/login`,
        "",
        "Usa la password già impostata. Al login ti verrà chiesto il codice di Google Authenticator.",
        "",
        "Se non ti aspettavi questo messaggio, contatta il Super Admin.",
      ].join("\n")
    : [
        `Ciao ${name},`,
        "",
        "Il tuo profilo su Industry Gestionale è stato attivato (stato Operativo).",
        "",
        `Per accedere dovrai utilizzare questa email: ${options.loginEmail}`,
        "",
        "Al primo accesso imposta la password da questo link:",
        options.link,
        "",
        "Dopo aver impostato la password ti verrà chiesto di configurare Google Authenticator.",
        "Assicurati di aver installato l'app:",
        `Android: ${GOOGLE_AUTHENTICATOR_ANDROID}`,
        `iPhone: ${GOOGLE_AUTHENTICATOR_IOS}`,
        "",
        `Gestionale: ${appUrl}/login`,
        "",
        "Il link scade dopo 14 giorni. Se non ti aspettavi questo messaggio, ignoralo.",
      ].join("\n");

  const html = options.alreadyHasPassword
    ? `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Profilo operativo</h2>
      <p style="margin:0 0 12px">Ciao <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 16px;color:#334155">
        Il tuo profilo su <strong>Industry Gestionale</strong> è stato attivato.
      </p>
      <p style="margin:0 0 8px">Per accedere utilizza questa email:</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:700">${escapeHtml(options.loginEmail)}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(appUrl)}/login" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
          Apri il gestionale
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">
        Usa la password già impostata. Al login ti verrà chiesto il codice di Google Authenticator.
      </p>
    </div>
  `.trim()
    : `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Benvenuto in Industry Gestionale</h2>
      <p style="margin:0 0 12px">Ciao <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 16px;color:#334155">
        Il tuo profilo è stato attivato. Per accedere dovrai utilizzare questa email:
      </p>
      <p style="margin:0 0 20px;font-size:16px;font-weight:700">${escapeHtml(options.loginEmail)}</p>
      <p style="margin:0 0 12px;color:#334155">
        Al primo accesso imposta la password da questo pulsante:
      </p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(options.link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
          Imposta la password
        </a>
      </p>
      <p style="margin:0 0 8px;color:#334155">
        Dopo la password ti verrà chiesto di configurare <strong>Google Authenticator</strong>.
        Assicurati di averla installata:
      </p>
      <p style="margin:0 0 16px;font-size:13px">
        <a href="${GOOGLE_AUTHENTICATOR_ANDROID}">Android</a>
        &nbsp;·&nbsp;
        <a href="${GOOGLE_AUTHENTICATOR_IOS}">iPhone</a>
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">
        Link valido 14 giorni. Gestionale:
        <a href="${escapeHtml(appUrl)}/login">${escapeHtml(appUrl)}</a>
      </p>
    </div>
  `.trim();

  await sendSmtpMail({ to: options.to, subject, text, html });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
