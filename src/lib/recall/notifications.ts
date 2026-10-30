import "server-only";
import type { RecallCase } from "@/db/schema";
import { getEnv, getInternalNotificationEmails } from "@/lib/config";
import { CONTACT } from "@/lib/copy/es";
import { getEmailProvider } from "@/lib/email";
import {
  affectedReminderEmail,
  contactBroadcastEmail,
  customerFollowUpEmail,
  type FollowUpKind,
  customerConfirmationEmail,
  customerResultAffectedEmail,
  customerResultNotIdentifiedEmail,
  customerResultReinforcedEmail,
  internalAffectedContactEmail,
  internalNotificationEmail,
  internalUrgentMessageEmail,
  manualEmail,
  type UrgentMessageEmailData,
  type AffectedContactEmailData,
  type CaseEmailData,
  type EmailContext,
  type RenderedEmail,
} from "@/lib/email/templates";
import { logAudit } from "@/lib/server/audit";
import { recordOutgoing } from "./mailbox";

export function getEmailContext(): EmailContext {
  const env = getEnv();
  return {
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    contactEmail: env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || CONTACT.defaultEmail,
    contactWhatsapp: env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim() || undefined,
    contactHours: env.NEXT_PUBLIC_CONTACT_HOURS?.trim() || undefined,
  };
}

type Kind = "MANUAL_EMAIL" | "INTERNAL_URGENT_MESSAGE" | "CUSTOMER_FOLLOW_UP" | "CUSTOMER_BROADCAST" | "CUSTOMER_CONFIRMATION" | "INTERNAL_NEW_CASE" | "INTERNAL_AFFECTED_CONTACT" | "CUSTOMER_AFFECTED_REMINDER" | "CUSTOMER_RESULT_AFFECTED" | "CUSTOMER_RESULT_REINFORCED" | "CUSTOMER_RESULT_NOT_IDENTIFIED";

/** Tiempo máximo de espera por envío; pasado este plazo se registra el fallo y la petición continúa. */
const SEND_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`tiempo de espera agotado (${ms} ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Dirección a la que responden los clientes: la casilla de la mesa de control si está configurada. */
export function getReplyToEmail(): string | undefined {
  return getEnv().INBOX_EMAIL || getEmailContext().contactEmail;
}

/** Los correos a clientes quedan en la bandeja (bitácora por caso); los avisos internos no. */
function isCustomerEmail(kind: Kind, to: string | string[]): boolean {
  if (kind.startsWith("INTERNAL_")) return false;
  const internal = new Set(getInternalNotificationEmails().map((e) => e.toLowerCase()));
  return (Array.isArray(to) ? to : [to]).some((e) => !internal.has(e.toLowerCase()));
}

/** `c` es el caso al que se asocia el envío en la bitácora; null para avisos sin caso (consultas). */
async function deliver(kind: Kind, to: string | string[], rendered: RenderedEmail, c: Pick<RecallCase, "id" | "caseId"> | null, label = c?.caseId ?? "", actor?: string): Promise<boolean> {
  const log = (status: "SENT" | "FAILED", providerId?: string, error?: string) =>
    isCustomerEmail(kind, to) ? recordOutgoing({ kind, to, rendered, caseUuid: c?.id || null, providerId, status, error, actor }) : Promise.resolve();
  try {
    const provider = getEmailProvider();
    // Se envía desde EMAIL_FROM (no-reply); las respuestas llegan a la casilla de la mesa de control.
    const replyTo = getReplyToEmail();
    const res = await withTimeout(provider.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html, replyTo }), SEND_TIMEOUT_MS);
    if (res.ok) {
      await logAudit({ type: "EMAIL_SENT", caseId: c?.id || null, actor, payload: { kind, provider: res.provider, id: res.id, caseId: label } });
      await log("SENT", res.id);
      return true;
    }
    console.error(`[email] fallo al enviar ${kind} para ${label}:`, res.error);
    await logAudit({ type: "EMAIL_FAILED", caseId: c?.id || null, actor, payload: { kind, provider: res.provider, error: res.error, caseId: label } });
    await log("FAILED", undefined, res.error);
    return false;
  } catch (err) {
    console.error(`[email] excepción al enviar ${kind} para ${label}:`, err);
    const error = err instanceof Error ? err.message : String(err);
    await logAudit({ type: "EMAIL_FAILED", caseId: c?.id || null, actor, payload: { kind, error, caseId: label } });
    await log("FAILED", undefined, error);
    return false;
  }
}

/** Correo escrito por Postventa desde la bandeja. Nunca lanza. */
export async function sendManualEmail(c: Pick<RecallCase, "id" | "caseId" | "serialNumber"> | null, to: string, message: { subject: string; body: string }, actor: string): Promise<boolean> {
  return deliver("MANUAL_EMAIL", to, manualEmail(c, message, getEmailContext()), c, c?.caseId ?? to, actor);
}

/** Alerta interna "llamar ahora" por un correo de alta prioridad. Nunca lanza. */
export async function sendUrgentMessageAlert(d: UrgentMessageEmailData): Promise<boolean> {
  const internalTo = getInternalNotificationEmails();
  if (internalTo.length === 0) {
    console.warn(`[email] INTERNAL_NOTIFICATION_EMAILS no configurado: no se envió la alerta del correo ${d.messageId}`);
    return false;
  }
  return deliver("INTERNAL_URGENT_MESSAGE", internalTo, internalUrgentMessageEmail(d, getEmailContext()), null, d.caseId ?? d.fromEmail);
}

/** Correo de confirmación al cliente + alerta interna. Nunca lanza. */
export async function sendNewCaseNotifications(c: RecallCase): Promise<{ customer: boolean; internal: boolean }> {
  const ctx = getEmailContext();
  const data: CaseEmailData = c;
  const customer = await deliver("CUSTOMER_CONFIRMATION", c.email, customerConfirmationEmail(data, ctx), c);

  const internalTo = getInternalNotificationEmails();
  let internal = false;
  if (internalTo.length === 0) {
    console.warn(`[email] INTERNAL_NOTIFICATION_EMAILS no configurado: no se envió alerta interna del caso ${c.caseId}`);
    await logAudit({ type: "EMAIL_FAILED", caseId: c.id, payload: { kind: "INTERNAL_NEW_CASE", error: "sin destinatarios configurados", caseId: c.caseId } });
  } else {
    internal = await deliver("INTERNAL_NEW_CASE", internalTo, internalNotificationEmail(data, ctx), c);
  }
  return { customer, internal };
}

/** Notifica al cliente el resultado tras el reproceso contra la base oficial. Nunca lanza. */
export async function sendResultNotification(c: RecallCase, result: "AFFECTED" | "REINFORCED" | "NOT_IDENTIFIED"): Promise<boolean> {
  const ctx = getEmailContext();
  if (result === "AFFECTED") return deliver("CUSTOMER_RESULT_AFFECTED", c.email, customerResultAffectedEmail(c, ctx), c);
  if (result === "REINFORCED") return deliver("CUSTOMER_RESULT_REINFORCED", c.email, customerResultReinforcedEmail(c, ctx), c);
  return deliver("CUSTOMER_RESULT_NOT_IDENTIFIED", c.email, customerResultNotIdentifiedEmail(c, ctx), c);
}

/** Alerta interna: consulta de serie afectada con correo, aún sin caso. Nunca lanza. */
/** Seguimiento a un cliente con caso (cambio de etapa, novedad semanal o comunicado). Nunca lanza. */
export async function sendFollowUp(c: RecallCase, kind: FollowUpKind, message?: { subject: string; body: string }, to: string | string[] = c.email): Promise<boolean> {
  const rendered = customerFollowUpEmail(c, kind, getEmailContext(), message);
  return deliver(kind === "BROADCAST" ? "CUSTOMER_BROADCAST" : "CUSTOMER_FOLLOW_UP", to, rendered, c.id ? c : null, c.caseId);
}

/** Comunicado a quien dejó su correo con una serie afectada y no tiene caso. Nunca lanza. */
export async function sendBroadcastToContact(email: string | string[], serials: string[], message: { subject: string; body: string }): Promise<boolean> {
  return deliver("CUSTOMER_BROADCAST", email, contactBroadcastEmail(serials, message, getEmailContext()), null, serials.join(", "));
}

/** Recordatorio a quien dejó su correo con una serie afectada y no registró caso. Nunca lanza. */
export async function sendAffectedReminder(email: string, serials: string[]): Promise<boolean> {
  return deliver("CUSTOMER_AFFECTED_REMINDER", email, affectedReminderEmail(serials, getEmailContext()), null, serials.join(", "));
}

export async function sendAffectedContactNotification(d: AffectedContactEmailData): Promise<boolean> {
  const internalTo = getInternalNotificationEmails();
  if (internalTo.length === 0) {
    console.warn(`[email] INTERNAL_NOTIFICATION_EMAILS no configurado: no se envió aviso de la serie afectada ${d.serial}`);
    return false;
  }
  return deliver("INTERNAL_AFFECTED_CONTACT", internalTo, internalAffectedContactEmail(d, getEmailContext()), null, d.serial);
}
