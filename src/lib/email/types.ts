/**
 * Interfaz de envío de correo transaccional.
 * Todos los textos de correo viven en `src/lib/copy/es.ts` (EMAIL) y en las plantillas de `src/lib/email/templates.ts`.
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: "console" | "resend" | "smtp";
  id?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: "console" | "resend" | "smtp";
  send(message: EmailMessage): Promise<EmailSendResult>;
}
