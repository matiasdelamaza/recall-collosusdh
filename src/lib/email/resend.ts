import "server-only";
import { Resend } from "resend";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

export function createResendEmailProvider(apiKey: string, from: string): EmailProvider {
  const client = new Resend(apiKey);
  return {
    name: "resend",
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const { data, error } = await client.emails.send({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
      if (error) return { ok: false, provider: "resend", error: error.message };
      return { ok: true, provider: "resend", id: data?.id };
    },
  };
}
