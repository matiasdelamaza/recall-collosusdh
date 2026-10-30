import "server-only";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

/** Proveedor de desarrollo: imprime el correo en la consola del servidor. */
export function createConsoleEmailProvider(from: string): EmailProvider {
  return {
    name: "console",
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const to = Array.isArray(message.to) ? message.to.join(", ") : message.to;
      console.log(
        [
          "────────────────────────── CORREO (console) ──────────────────────────",
          `De:      ${from}`,
          `Para:    ${to}`,
          `Asunto:  ${message.subject}`,
          "",
          message.text,
          "──────────────────────────────────────────────────────────────────────",
        ].join("\n"),
      );
      return { ok: true, provider: "console", id: `console-${crypto.randomUUID()}` };
    },
  };
}
