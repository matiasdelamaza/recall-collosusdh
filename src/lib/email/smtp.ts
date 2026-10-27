import "server-only";
import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function createSmtpEmailProvider(opts: SmtpOptions): EmailProvider {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined,
    // Tiempos acotados: un SMTP lento no debe retener la respuesta del registro.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    name: "smtp",
    async send(message: EmailMessage): Promise<EmailSendResult> {
      try {
        const info = await transporter.sendMail({
          from: opts.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: message.replyTo,
        });
        return { ok: true, provider: "smtp", id: info.messageId };
      } catch (err) {
        return { ok: false, provider: "smtp", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
