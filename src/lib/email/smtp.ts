import { connect as tlsConnect, type TLSSocket } from "tls";
import { EMAIL_OTP_TTL_MINUTES } from "@/lib/auth/constants";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function requireSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.EMAIL_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    throw new Error(
      "Config SMTP incompleta. Imposta SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM."
    );
  }

  return { host, port, user, pass, from };
}

function encodeLogin(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function readResponse(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const onData = (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      // Risposta SMTP completa: ultima riga "NNN " (spazio) non "-"
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("Connessione SMTP chiusa inaspettatamente."));
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("end", onEnd);
  });
}

async function expectCode(socket: TLSSocket, allowed: number[]): Promise<string> {
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!allowed.includes(code)) {
    throw new Error(`SMTP errore ${code}: ${response.trim()}`);
  }
  return response;
}

async function sendCommand(
  socket: TLSSocket,
  command: string,
  allowed: number[]
): Promise<string> {
  socket.write(`${command}\r\n`);
  return expectCode(socket, allowed);
}

/** Invio email via SMTPS (es. Aruba porta 465) */
export async function sendSmtpMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const config = requireSmtpConfig();

  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const s = tlsConnect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
        rejectUnauthorized: true,
      },
      () => resolve(s)
    );
    s.setEncoding("utf8");
    s.once("error", reject);
  });

  try {
    await expectCode(socket, [220]);
    await sendCommand(socket, `EHLO opuntiaindustry.com`, [250]);
    await sendCommand(socket, "AUTH LOGIN", [334]);
    await sendCommand(socket, encodeLogin(config.user), [334]);
    await sendCommand(socket, encodeLogin(config.pass), [235]);
    await sendCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${options.to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);

    const boundary = `----=_Industry_${Date.now()}`;
    const message = [
      `From: Industry Gestionale <${config.from}>`,
      `To: <${options.to}>`,
      `Subject: ${options.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      options.text,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      options.html,
      "",
      `--${boundary}--`,
      "",
      ".",
    ].join("\r\n");

    socket.write(`${message}\r\n`);
    await expectCode(socket, [250]);
    await sendCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const subject = "Codice di verifica - Industry Gestionale";
  const text = [
    "Il tuo codice di verifica per accedere a Industry Gestionale è:",
    "",
    otp,
    "",
    `Il codice scade tra ${EMAIL_OTP_TTL_MINUTES} minuti.`,
    "Se non hai richiesto tu l'accesso, ignora questa email.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Codice di verifica</h2>
      <p style="margin:0 0 16px;color:#475569">
        Usa questo codice per completare l'accesso a <strong>Industry Gestionale</strong>.
      </p>
      <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;text-align:center">
        ${otp}
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">
        Valido per ${EMAIL_OTP_TTL_MINUTES} minuti. Se non hai richiesto l'accesso, ignora questa email.
      </p>
    </div>
  `.trim();

  await sendSmtpMail({ to, subject, text, html });
}
