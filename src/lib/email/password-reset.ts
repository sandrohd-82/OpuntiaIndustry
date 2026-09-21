import { sendSmtpMail } from "@/lib/email/smtp";
import { getPublicAppUrl } from "@/lib/auth/app-url";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetSaDecisionEmail(options: {
  to: string;
  approverName: string;
  requesterName: string;
  requesterEmail: string;
  decisioneUrl: string;
}): Promise<void> {
  const appUrl = getPublicAppUrl();
  const subject = "Richiesta reset password Super Admin — Industry Gestionale";
  const text = [
    `Ciao ${options.approverName},`,
    "",
    `Il Super Admin ${options.requesterName} (${options.requesterEmail}) ha chiesto di reimpostare la password.`,
    "",
    "Basta la tua decisione (Sì o No). Apri questo link:",
    options.decisioneUrl,
    "",
    `Gestionale: ${appUrl}`,
    "",
    "Il link scade dopo 24 ore. Se non ti aspettavi questo messaggio, ignoralo.",
  ].join("\n");
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Reset password Super Admin</h2>
      <p style="margin:0 0 12px">Ciao <strong>${escapeHtml(options.approverName)}</strong>,</p>
      <p style="margin:0 0 16px;color:#334155">
        <strong>${escapeHtml(options.requesterName)}</strong>
        (${escapeHtml(options.requesterEmail)}) chiede di reimpostare la password.
      </p>
      <p style="margin:0 0 16px;color:#334155">
        Basta la tua decisione. Non serve il consenso di entrambi i Super Admin.
      </p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(options.decisioneUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
          Sì / No
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">
        Link valido 24 ore. Gestionale:
        <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a>
      </p>
    </div>
  `.trim();
  await sendSmtpMail({ to: options.to, subject, text, html });
}

export async function sendPasswordResetApprovedEmail(options: {
  to: string;
  name: string;
  link: string;
}): Promise<void> {
  const appUrl = getPublicAppUrl();
  const name = options.name.trim() || "Operatore";
  const subject = "Imposta la nuova password — Industry Gestionale";
  const text = [
    `Ciao ${name},`,
    "",
    "La richiesta di recupero password è stata approvata.",
    "Imposta la nuova password da questo link:",
    options.link,
    "",
    `Gestionale: ${appUrl}/login`,
    "",
    "Il link scade dopo 2 ore. Se non hai chiesto il reset, contatta un Super Admin.",
  ].join("\n");
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Nuova password</h2>
      <p style="margin:0 0 12px">Ciao <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 16px;color:#334155">
        Un Super Admin ha approvato la tua richiesta. Imposta la nuova password:
      </p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(options.link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
          Imposta la password
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">
        Link valido 2 ore. Gestionale:
        <a href="${escapeHtml(appUrl)}/login">${escapeHtml(appUrl)}/login</a>
      </p>
    </div>
  `.trim();
  await sendSmtpMail({ to: options.to, subject, text, html });
}
