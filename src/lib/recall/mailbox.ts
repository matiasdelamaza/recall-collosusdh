/**
 * Bandeja de la mesa de control (30-10-2026): registro de correos enviados y recibidos,
 * estados de entrega (webhooks de Resend), atención de mensajes y semáforo por caso.
 * Los textos visibles viven en src/lib/copy/es-admin.ts (ADMIN.mesa / ADMIN.inbox).
 */
import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseNotes, emailMessages, recallCases, type CaseStatus, type EmailMessageRow, type EmailStatus, type MessagePriority, type RecallCase } from "@/db/schema";
import { getEnv } from "@/lib/config";
import type { RenderedEmail } from "@/lib/email/templates";
import { logAudit } from "@/lib/server/audit";

/** Separa "Nombre <correo@x>" en nombre y correo (en minúsculas). */
export function parseAddress(raw: string): { email: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2]!.trim().toLowerCase(), name: m[1]!.trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

// ── Envíos ─────────────────────────────────────────────────────────────

export interface OutgoingRecord {
  kind: string;
  to: string | string[];
  rendered: RenderedEmail;
  caseUuid: string | null;
  providerId?: string;
  status: "SENT" | "FAILED";
  error?: string;
  actor?: string;
}

/** Registra un correo enviado a un cliente. Nunca lanza: el registro no debe romper el envío. */
export async function recordOutgoing(r: OutgoingRecord): Promise<void> {
  try {
    const db = await getDb();
    await db
      .insert(emailMessages)
      .values({
        caseId: r.caseUuid,
        direction: "OUT",
        kind: r.kind,
        fromEmail: parseAddress(getEnv().EMAIL_FROM).email,
        toEmails: (Array.isArray(r.to) ? r.to : [r.to]).join(", ").toLowerCase(),
        subject: r.rendered.subject,
        bodyText: r.rendered.text,
        providerId: r.providerId ?? null,
        status: r.status,
        statusDetail: r.error?.slice(0, 500) ?? null,
        statusAt: new Date(),
        actor: r.actor ?? null,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[bandeja] no se pudo registrar el correo enviado", r.kind, err);
  }
}

/** Eventos de entrega de Resend que actualizan un envío. */
const DELIVERY_EVENTS: Record<string, EmailStatus> = {
  "email.delivery_delayed": "DELAYED",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
  "email.suppressed": "FAILED",
};
/** Un estado solo avanza: un evento atrasado no deshace uno posterior. */
const STATUS_RANK: Record<EmailStatus, number> = { SENT: 0, DELAYED: 1, DELIVERED: 2, BOUNCED: 3, COMPLAINED: 3, FAILED: 3, RECEIVED: 0 };
export const UNDELIVERED_STATUSES: readonly EmailStatus[] = ["BOUNCED", "COMPLAINED", "FAILED"];

export function isDeliveryEvent(type: string): boolean {
  return type in DELIVERY_EVENTS || type === "email.opened";
}

/** Aplica un evento de entrega a un envío registrado. Devuelve false si el envío no existe. */
export async function applyDeliveryEvent(type: string, providerId: string, at: Date, detail?: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(emailMessages).where(and(eq(emailMessages.providerId, providerId), eq(emailMessages.direction, "OUT"))).limit(1);
  if (!row) return false;
  if (type === "email.opened") {
    if (!row.openedAt) await db.update(emailMessages).set({ openedAt: at }).where(eq(emailMessages.id, row.id));
    return true;
  }
  const status = DELIVERY_EVENTS[type];
  if (!status || STATUS_RANK[status] <= STATUS_RANK[row.status]) return true;
  await db.update(emailMessages).set({ status, statusAt: at, statusDetail: detail?.slice(0, 500) ?? row.statusDetail }).where(eq(emailMessages.id, row.id));
  if (UNDELIVERED_STATUSES.includes(status)) {
    await logAudit({ type: "EMAIL_BOUNCED", caseId: row.caseId, payload: { status, to: row.toEmails, subject: row.subject, detail: detail ?? null } });
  }
  return true;
}

// ── Atención ───────────────────────────────────────────────────────────

/** Marca como atendidos los correos entrantes pendientes de un caso (o de un remitente sin caso). */
export async function markInboundHandled(target: { caseUuid: string } | { fromEmail: string } | { messageId: string }, actor: string): Promise<number> {
  const db = await getDb();
  const where =
    "caseUuid" in target
      ? eq(emailMessages.caseId, target.caseUuid)
      : "fromEmail" in target
        ? and(eq(emailMessages.fromEmail, target.fromEmail.toLowerCase()), isNull(emailMessages.caseId))
        : eq(emailMessages.id, target.messageId);
  const now = new Date();
  const rows = await db
    .update(emailMessages)
    .set({ handledAt: now, handledBy: actor, readAt: sql`coalesce(${emailMessages.readAt}, ${now})` })
    .where(and(where, eq(emailMessages.direction, "IN"), isNull(emailMessages.handledAt)))
    .returning();
  return rows.length;
}

/** Registra una llamada a un cliente: nota interna, fecha de la llamada y correos atendidos. */
export async function markCaseCalled(c: Pick<RecallCase, "id" | "caseId">, actor: string, note: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db.update(recallCases).set({ lastCallAt: now, updatedAt: now }).where(eq(recallCases.id, c.id));
  await db.insert(caseNotes).values({ caseId: c.id, author: actor, body: note ? `Llamada al cliente: ${note}` : "Llamada al cliente registrada." });
  const handled = await markInboundHandled({ caseUuid: c.id }, actor);
  await logAudit({ type: "CUSTOMER_CALLED", actor, caseId: c.id, payload: { note: note || null, handledMessages: handled } });
}

export async function markMessagesRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.update(emailMessages).set({ readAt: new Date() }).where(and(inArray(emailMessages.id, ids), isNull(emailMessages.readAt)));
}

/** Asocia un correo (y los demás del mismo remitente sin caso) a un caso. */
export async function linkSenderToCase(messageId: string, c: Pick<RecallCase, "id" | "caseId">, actor: string): Promise<number> {
  const db = await getDb();
  const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.id, messageId)).limit(1);
  if (!msg) return 0;
  const counterpart = msg.direction === "IN" ? msg.fromEmail : msg.toEmails;
  const rows = await db
    .update(emailMessages)
    .set({ caseId: c.id })
    .where(and(isNull(emailMessages.caseId), sql`(${emailMessages.id} = ${messageId} or ${emailMessages.fromEmail} = ${counterpart} or ${emailMessages.toEmails} = ${counterpart})`))
    .returning();
  await logAudit({ type: "EMAIL_LINKED", actor, caseId: c.id, payload: { messages: rows.length, email: counterpart } });
  return rows.length;
}

// ── Consultas ──────────────────────────────────────────────────────────

export type InboxFilter = "pending" | "in" | "out" | "all";
export const INBOX_FILTERS: readonly InboxFilter[] = ["pending", "in", "out", "all"];

export interface InboxRow extends EmailMessageRow {
  casePublicId: string | null;
  customerName: string | null;
  phone: string | null;
}

const PRIORITY_ORDER = sql`case ${emailMessages.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`;

export async function listInbox(filter: InboxFilter, limit = 200): Promise<InboxRow[]> {
  const db = await getDb();
  const where =
    filter === "pending"
      ? and(eq(emailMessages.direction, "IN"), isNull(emailMessages.handledAt))
      : filter === "in"
        ? eq(emailMessages.direction, "IN")
        : filter === "out"
          ? eq(emailMessages.direction, "OUT")
          : undefined;
  const rows = await db
    .select({ m: emailMessages, casePublicId: recallCases.caseId, customerName: recallCases.customerName, phone: recallCases.phone })
    .from(emailMessages)
    .leftJoin(recallCases, eq(emailMessages.caseId, recallCases.id))
    .where(where)
    .orderBy(...(filter === "pending" ? [PRIORITY_ORDER, emailMessages.createdAt] : [desc(emailMessages.createdAt)]))
    .limit(limit);
  return rows.map((r) => ({ ...r.m, casePublicId: r.casePublicId, customerName: r.customerName, phone: r.phone }));
}

export interface InboxCounts {
  pending: number;
  pendingHigh: number;
  undelivered: number;
}

export async function getInboxCounts(): Promise<InboxCounts> {
  const db = await getDb();
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${emailMessages.direction} = 'IN' and ${emailMessages.handledAt} is null)`,
      pendingHigh: sql<number>`count(*) filter (where ${emailMessages.direction} = 'IN' and ${emailMessages.handledAt} is null and ${emailMessages.priority} = 'HIGH')`,
      undelivered: sql<number>`count(*) filter (where ${emailMessages.direction} = 'OUT' and ${emailMessages.status} in ('BOUNCED', 'COMPLAINED', 'FAILED'))`,
    })
    .from(emailMessages);
  return { pending: Number(row?.pending ?? 0), pendingHigh: Number(row?.pendingHigh ?? 0), undelivered: Number(row?.undelivered ?? 0) };
}

export async function getMessage(id: string): Promise<EmailMessageRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return row ?? null;
}

export async function getCaseMessages(caseUuid: string): Promise<EmailMessageRow[]> {
  const db = await getDb();
  return db.select().from(emailMessages).where(eq(emailMessages.caseId, caseUuid)).orderBy(emailMessages.createdAt);
}

/** Hilo de un correo: todo el caso, o todo lo intercambiado con ese remitente si no tiene caso. */
export async function getThread(messageId: string): Promise<{ message: EmailMessageRow; case: RecallCase | null; counterpart: string; messages: EmailMessageRow[] } | null> {
  const message = await getMessage(messageId);
  if (!message) return null;
  const db = await getDb();
  const counterpart = message.direction === "IN" ? message.fromEmail : message.toEmails.split(",")[0]!.trim();
  if (message.caseId) {
    const c = (await db.query.recallCases.findFirst({ where: eq(recallCases.id, message.caseId) })) ?? null;
    return { message, case: c, counterpart: c?.email.toLowerCase() ?? counterpart, messages: await getCaseMessages(message.caseId) };
  }
  const messages = await db
    .select()
    .from(emailMessages)
    .where(and(isNull(emailMessages.caseId), sql`(${emailMessages.fromEmail} = ${counterpart} or ${emailMessages.toEmails} = ${counterpart})`))
    .orderBy(emailMessages.createdAt);
  return { message, case: null, counterpart, messages };
}

// ── Semáforo ───────────────────────────────────────────────────────────

export type SignalLevel = "RED" | "AMBER" | "GREEN";
export type SignalReason = "highPriorityMessage" | "unansweredOver24h" | "accidentNoCall" | "unanswered" | "undelivered" | "damageNoCall" | "noUpdate7d";

export interface CaseMailStats {
  pending: number;
  pendingTopPriority: MessagePriority | null;
  oldestPendingAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastOutboundStatus: EmailStatus | null;
  lastPendingReason: string | null;
  lastPendingExcerpt: string | null;
}

export const EMPTY_MAIL_STATS: CaseMailStats = {
  pending: 0,
  pendingTopPriority: null,
  oldestPendingAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  lastOutboundStatus: null,
  lastPendingReason: null,
  lastPendingExcerpt: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Etapas cerradas: no entran a la mesa salvo que tengan correos pendientes. */
export const FINISHED_STATUSES: readonly CaseStatus[] = ["REPLACED", "CLOSED", "DUPLICATE_CASE", "INVALID_SERIAL"];

type SignalCase = Pick<RecallCase, "accidentReported" | "damageReported" | "caseStatus" | "createdAt" | "lastCustomerUpdateAt" | "lastCallAt">;

/** Semáforo de un caso: rojo = llamar ahora, amarillo = atender hoy, verde = al día. */
export function caseSignal(c: SignalCase, m: CaseMailStats, now = new Date()): { level: SignalLevel; reasons: SignalReason[] } {
  const red: SignalReason[] = [];
  const amber: SignalReason[] = [];
  const inProgress = !FINISHED_STATUSES.includes(c.caseStatus);
  if (m.pending > 0 && m.pendingTopPriority === "HIGH") red.push("highPriorityMessage");
  if (m.pending > 0 && m.oldestPendingAt && now.getTime() - m.oldestPendingAt.getTime() > DAY_MS) red.push("unansweredOver24h");
  if (inProgress && c.accidentReported && !c.lastCallAt) red.push("accidentNoCall");
  if (m.pending > 0 && red.length === 0) amber.push("unanswered");
  if (m.lastOutboundStatus && UNDELIVERED_STATUSES.includes(m.lastOutboundStatus)) amber.push("undelivered");
  if (inProgress && c.damageReported === "YES" && !c.lastCallAt) amber.push("damageNoCall");
  const lastUpdate = Math.max(c.lastCustomerUpdateAt?.getTime() ?? 0, c.lastCallAt?.getTime() ?? 0, m.lastOutboundAt?.getTime() ?? 0, c.createdAt.getTime());
  if (inProgress && now.getTime() - lastUpdate > 7 * DAY_MS) amber.push("noUpdate7d");
  if (red.length > 0) return { level: "RED", reasons: [...red, ...amber] };
  if (amber.length > 0) return { level: "AMBER", reasons: amber };
  return { level: "GREEN", reasons: [] };
}

/** Resumen de correos por caso (para la mesa y el detalle del caso). */
export async function getMailStats(caseUuids?: string[]): Promise<Map<string, CaseMailStats>> {
  const db = await getDb();
  const pendingIn = sql`${emailMessages.direction} = 'IN' and ${emailMessages.handledAt} is null`;
  const rows = await db
    .select({
      caseId: emailMessages.caseId,
      pending: sql<number>`count(*) filter (where ${pendingIn})`,
      topRank: sql<number | null>`min(case ${emailMessages.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end) filter (where ${pendingIn})`,
      oldestPendingAt: sql<string | null>`min(${emailMessages.createdAt}) filter (where ${pendingIn})`,
      lastInboundAt: sql<string | null>`max(${emailMessages.createdAt}) filter (where ${emailMessages.direction} = 'IN')`,
      lastOutboundAt: sql<string | null>`max(${emailMessages.createdAt}) filter (where ${emailMessages.direction} = 'OUT')`,
      lastOutboundStatus: sql<EmailStatus | null>`(array_agg(${emailMessages.status} order by ${emailMessages.createdAt} desc) filter (where ${emailMessages.direction} = 'OUT'))[1]`,
      lastPendingReason: sql<string | null>`(array_agg(${emailMessages.triageReason} order by ${emailMessages.createdAt} desc) filter (where ${pendingIn}))[1]`,
      lastPendingExcerpt: sql<string | null>`(array_agg(left(${emailMessages.bodyText}, 280) order by ${emailMessages.createdAt} desc) filter (where ${pendingIn}))[1]`,
    })
    .from(emailMessages)
    .where(caseUuids ? (caseUuids.length ? inArray(emailMessages.caseId, caseUuids) : sql`false`) : sql`${emailMessages.caseId} is not null`)
    .groupBy(emailMessages.caseId);
  const ranks: MessagePriority[] = ["HIGH", "MEDIUM", "LOW"];
  const toDate = (v: string | Date | null) => (v ? new Date(v) : null);
  return new Map(
    rows
      .filter((r) => r.caseId)
      .map((r) => [
        r.caseId!,
        {
          pending: Number(r.pending),
          pendingTopPriority: r.topRank === null ? null : ranks[Number(r.topRank)]!,
          oldestPendingAt: toDate(r.oldestPendingAt),
          lastInboundAt: toDate(r.lastInboundAt),
          lastOutboundAt: toDate(r.lastOutboundAt),
          lastOutboundStatus: r.lastOutboundStatus,
          lastPendingReason: r.lastPendingReason,
          lastPendingExcerpt: r.lastPendingExcerpt,
        },
      ]),
  );
}

export interface BoardRow {
  case: RecallCase;
  mail: CaseMailStats;
  level: SignalLevel;
  reasons: SignalReason[];
}

/** Mesa de control: casos afectados en curso y todo caso con correos pendientes, con su semáforo. */
export async function getControlBoard(now = new Date()): Promise<BoardRow[]> {
  const db = await getDb();
  const stats = await getMailStats();
  const pendingIds = [...stats].filter(([, s]) => s.pending > 0).map(([id]) => id);
  const cases = await db
    .select()
    .from(recallCases)
    .where(
      sql`(${recallCases.serialVerificationStatus} = 'AFFECTED' and ${recallCases.caseStatus} not in (${sql.join(FINISHED_STATUSES.map((s) => sql`${s}`), sql`, `)}))${
        pendingIds.length ? sql` or ${inArray(recallCases.id, pendingIds)}` : sql``
      }`,
    );
  const order: Record<SignalLevel, number> = { RED: 0, AMBER: 1, GREEN: 2 };
  return cases
    .map((c) => {
      const mail = stats.get(c.id) ?? EMPTY_MAIL_STATS;
      return { case: c, mail, ...caseSignal(c, mail, now) };
    })
    .sort((a, b) => order[a.level] - order[b.level] || (a.mail.oldestPendingAt?.getTime() ?? Infinity) - (b.mail.oldestPendingAt?.getTime() ?? Infinity) || a.case.createdAt.getTime() - b.case.createdAt.getTime());
}
