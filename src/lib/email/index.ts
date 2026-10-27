import "server-only";
import { getEnv } from "@/lib/config";
import { createConsoleEmailProvider } from "./console";
import { createResendEmailProvider } from "./resend";
import { createSmtpEmailProvider } from "./smtp";
import type { EmailProvider } from "./types";

export type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

type GlobalWithEmail = typeof globalThis & { __recallEmail?: EmailProvider };
const g = globalThis as GlobalWithEmail;

/** Proveedor de correo según EMAIL_PROVIDER (singleton). */
export function getEmailProvider(): EmailProvider {
  if (g.__recallEmail) return g.__recallEmail;
  const env = getEnv();
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      if (!env.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER=resend requiere RESEND_API_KEY");
      g.__recallEmail = createResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
      break;
    case "smtp":
      if (!env.SMTP_HOST) throw new Error("EMAIL_PROVIDER=smtp requiere SMTP_HOST");
      g.__recallEmail = createSmtpEmailProvider({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.EMAIL_FROM,
      });
      break;
    default:
      g.__recallEmail = createConsoleEmailProvider(env.EMAIL_FROM);
  }
  return g.__recallEmail;
}

/** Reinicia el singleton (pruebas). */
export function resetEmailProvider(): void {
  g.__recallEmail = undefined;
}
