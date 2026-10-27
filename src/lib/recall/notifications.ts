import "server-only";
import type { RecallCase } from "@/db/schema";
import { getEnv, getInternalNotificationEmails } from "@/lib/config";
import { getEmailProvider } from "@/lib/email";
import {
  customerConfirmationEmail,
  customerResultAffectedEmail,
  customerResultNotIdentifiedEmail,
  customerResultReinforcedEmail,
  internalNotificationEmail,
  type CaseEmailData,
  type EmailContext,
  type RenderedEmail,
} from "@/lib/email/templates";
import { logAudit } from "@/lib/server/audit";

export function getEmailContext(): EmailContext {
  const env = getEnv();
  return {
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    contactEmail: env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || undefined,
    contactWhatsapp: env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim() || undefined,
    contactHours: env.NEXT_PUBLIC_CONTACT_HOURS?.trim() || undefined,
  };
}

type Kind = "CUSTOMER_CONFIRMATION" | "INTERNAL_NEW_CASE" | "CUSTOMER_RESULT_AFFECTED" | "CUSTOMER_RESULT_REINFORCED" | "CUSTOMER_RESULT_NOT_IDENTIFIED";

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

async function deliver(kind: Kind, to: string | string[], rendered: RenderedEmail, c: Pick<RecallCase, "id" | "caseId">): Promise<boolean> {
  try {
    const provider = getEmailProvider();
    const res = await withTimeout(provider.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html }), SEND_TIMEOUT_MS);
    if (res.ok) {
      await logAudit({ type: "EMAIL_SENT", caseId: c.id, payload: { kind, provider: res.provider, id: res.id, caseId: c.caseId } });
      return true;
    }
    console.error(`[email] fallo al enviar ${kind} para ${c.caseId}:`, res.error);
    await logAudit({ type: "EMAIL_FAILED", caseId: c.id, payload: { kind, provider: res.provider, error: res.error, caseId: c.caseId } });
    return false;
  } catch (err) {
    console.error(`[email] excepción al enviar ${kind} para ${c.caseId}:`, err);
    await logAudit({ type: "EMAIL_FAILED", caseId: c.id, payload: { kind, error: err instanceof Error ? err.message : String(err), caseId: c.caseId } });
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
