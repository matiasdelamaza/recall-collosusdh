/**
 * Correos entrantes a la casilla de la mesa de control y respuestas de Postventa (30-10-2026).
 * Cada entrante se asocia al caso (por número de caso en el asunto/cuerpo o por el correo del remitente),
 * se le asigna prioridad y, si es alta, se avisa al equipo para llamar al cliente.
 */
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { emailMessages, recallCases, type RecallCase } from "@/db/schema";
import { CASE_ID_PREFIX } from "@/lib/case-id";
import type { InboundEmail } from "@/lib/email/inbound";
import { logAudit } from "@/lib/server/audit";
import { markInboundHandled, parseAddress } from "./mailbox";
import { sendManualEmail, sendUrgentMessageAlert } from "./notifications";
import { triageMessage } from "./triage";

const CASE_ID_IN_TEXT = new RegExp(`\\b${CASE_ID_PREFIX}-[A-HJKMNP-Z2-9]{5}\\b`, "i");

/** Texto plano a partir de HTML (para correos que solo traen HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Quita el texto citado de una respuesta (nuestro correo original), para analizar solo lo que escribió el cliente. */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (/^(el|on)\s.+(escribi[oó]|wrote):?$/i.test(l) || /^-{2,}\s*(mensaje original|original message|forwarded message|mensaje reenviado)/i.test(l) || /^(de|from):\s.+/i.test(l)) break;
    if (l.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

/** Respuesta automática (fuera de oficina, acuse automático): no se alerta. */
function isAutoReply(e: InboundEmail): boolean {
  const h = Object.fromEntries(Object.entries(e.headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["precedence"] === "auto_reply") return true;
  return /^(respuesta autom[aá]tica|fuera de (la )?oficina|out of office|automatic reply|auto(matic)?[- ]?reply)/i.test(e.subject.trim());
}

async function findCase(fromEmail: string, subject: string, body: string): Promise<RecallCase | null> {
  const db = await getDb();
  const ref = `${subject}\n${body}`.match(CASE_ID_IN_TEXT)?.[0]?.toUpperCase();
  if (ref) {
    const byRef = await db.query.recallCases.findFirst({ where: eq(recallCases.caseId, ref) });
    // Solo si el número de caso es del mismo remitente; si no, se asocia por correo.
    if (byRef && byRef.email.toLowerCase() === fromEmail) return byRef;
  }
  const [byEmail] = await db.select().from(recallCases).where(sql`lower(${recallCases.email}) = ${fromEmail}`).orderBy(desc(recallCases.createdAt)).limit(1);
  return byEmail ?? null;
}

export interface IngestResult {
  id: string | null;
  duplicate: boolean;
  priority: string | null;
  caseId: string | null;
}

/** Guarda un correo entrante, lo asocia, le asigna prioridad y alerta si es alta. Idempotente por id del proveedor. */
export async function ingestInbound(e: InboundEmail): Promise<IngestResult> {
  const db = await getDb();
  const [existing] = await db.select({ id: emailMessages.id }).from(emailMessages).where(eq(emailMessages.providerId, e.providerId)).limit(1);
  if (existing) return { id: existing.id, duplicate: true, priority: null, caseId: null };

  const from = parseAddress(e.from);
  const body = (e.text?.trim() || (e.html ? htmlToText(e.html) : "")).slice(0, 50_000);
  const own = stripQuotedReply(body);
  const c = await findCase(from.email, e.subject, own);
  const auto = isAutoReply(e);
  const triage = auto
    ? { priority: "LOW" as const, reason: "Respuesta automática", source: "RULES" as const }
    : await triageMessage({ subject: e.subject, body: own, caseContext: c ? { accidentReported: c.accidentReported, damageReported: c.damageReported, caseStatus: c.caseStatus } : null });

  const [row] = await db
    .insert(emailMessages)
    .values({
      caseId: c?.id ?? null,
      direction: "IN",
      kind: "CUSTOMER_MESSAGE",
      fromEmail: from.email,
      fromName: from.name,
      toEmails: e.to.join(", ").toLowerCase(),
      subject: e.subject.slice(0, 500) || "(sin asunto)",
      bodyText: body || "(sin texto)",
      providerId: e.providerId,
      status: "RECEIVED",
      statusAt: e.receivedAt,
      attachments: e.attachments.map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, size: a.size })),
      priority: triage.priority,
      triageReason: triage.reason,
      triageSource: triage.source,
      handledAt: auto ? new Date() : null,
      handledBy: auto ? "automático" : null,
      createdAt: e.receivedAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { id: null, duplicate: true, priority: null, caseId: null };

  await logAudit({ type: "EMAIL_RECEIVED", caseId: c?.id ?? null, payload: { from: from.email, subject: e.subject.slice(0, 200), priority: triage.priority, reason: triage.reason, source: triage.source } });

  if (triage.priority === "HIGH") {
    await sendUrgentMessageAlert({
      caseId: c?.caseId ?? null,
      customerName: c?.customerName ?? from.name,
      phone: c?.phone ?? null,
      fromEmail: from.email,
      subject: e.subject,
      reason: triage.reason,
      excerpt: own.slice(0, 600),
      messageId: row.id,
    });
  }
  return { id: row.id, duplicate: false, priority: triage.priority, caseId: c?.caseId ?? null };
}

/** Envía un correo de Postventa y marca como atendidos los pendientes de ese caso o remitente. */
export async function sendFromInbox(input: { case: RecallCase | null; to: string; subject: string; body: string; actor: string }): Promise<boolean> {
  const ok = await sendManualEmail(input.case, input.to, { subject: input.subject, body: input.body }, input.actor);
  if (!ok) return false;
  if (input.case) {
    const db = await getDb();
    await db.update(recallCases).set({ lastCustomerUpdateAt: new Date() }).where(eq(recallCases.id, input.case.id));
    await markInboundHandled({ caseUuid: input.case.id }, input.actor);
  } else {
    await markInboundHandled({ fromEmail: input.to }, input.actor);
  }
  return true;
}
