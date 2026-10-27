import "server-only";
import type { RecallCase } from "@/db/schema";
import { getEnv, getInternalNotificationEmails } from "@/lib/config";
import { CONTACT } from "@/lib/copy/es";
import { getEmailProvider } from "@/lib/email";
import {
  affectedReminderEmail,
  customerConfirmationEmail,
  customerResultAffectedEmail,
  customerResultNotIdentifiedEmail,
  customerResultReinforcedEmail,
  internalAffectedContactEmail,
  internalNotificationEmail,
  type AffectedContactEmailData,
  type CaseEmailData,
  type EmailContext,
  type RenderedEmail,
} from "@/lib/email/templates";
import { logAudit } from "@/lib/server/audit";

export function getEmailContext(): EmailContext {
  const env = getEnv();
  return {
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    contactEmail: env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || CONTACT.defaultEmail,
    contactWhatsapp: env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim() || undefined,
    contactHours: env.NEXT_PUBLIC_CONTACT_HOURS?.trim() || undefined,
  };
}

type Kind = "CUSTOMER_CONFIRMATION" | "INTERNAL_NEW_CASE" | "INTERNAL_AFFECTED_CONTACT" | "CUSTOMER_AFFECTED_REMINDER" | "CUSTOMER_RESULT_AFFECTED" | "CUSTOMER_RESULT_REINFORCED" | "CUSTOMER_RESULT_NOT_IDENTIFIED";

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

/** `c` es el caso al que se asocia el envío en la bitácora; null para avisos sin caso (consultas). */
async function deliver(kind: Kind, to: string | string[], rendered: RenderedEmail, c: Pick<RecallCase, "id" | "caseId"> | null, label = c?.caseId ?? ""): Promise<boolean> {
  try {
    const provider = getEmailProvider();
    // Se envía desde EMAIL_FROM (no-reply); las respuestas llegan al correo de contacto de Cross Mountain.
    const replyTo = getEmailContext().contactEmail;
    const res = await withTimeout(provider.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html, replyTo }), SEND_TIMEOUT_MS);
    if (res.ok) {
      await logAudit({ type: "EMAIL_SENT", caseId: c?.id, payload: { kind, provider: res.provider, id: res.id, caseId: label } });
      return true;
    }
    console.error(`[email] fallo al enviar ${kind} para ${label}:`, res.error);
    await logAudit({ type: "EMAIL_FAILED", caseId: c?.id, payload: { kind, provider: res.provider, error: res.error, caseId: label } });
    return false;
  } catch (err) {
    console.error(`[email] excepción al enviar ${kind} para ${label}:`, err);
    await logAudit({ type: "EMAIL_FAILED", caseId: c?.id, payload: { kind, error: err instanceof Error ? err.message : String(err), caseId: label } });
    return false;
  }
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
