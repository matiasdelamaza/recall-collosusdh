/**
 * Seguimiento por correo a clientes con unidad afectada (29-10-2026, pedido de Cross Mountain):
 * - aviso al cambiar la etapa del caso (desde el panel, opcional por cambio),
 * - novedad semanal si el caso lleva 7 días sin correo de seguimiento (Vercel Cron diario),
 * - comunicados de Postventa a todos los afectados desde el panel.
 */
import "server-only";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { recallCases, serialLookups, type CaseStatus, type RecallCase } from "@/db/schema";
import { FOLLOW_UP } from "@/lib/copy/es";
import { logAudit } from "@/lib/server/audit";
import { sendBroadcastToContact, sendFollowUp } from "./notifications";

export const WEEKLY_FOLLOW_UP_MS = 7 * 24 * 60 * 60 * 1000;
/** Pausa entre envíos masivos, bajo el límite de 2 por segundo de Resend. */
const SEND_GAP_MS = 600;

/** Etapas del reemplazo que generan aviso al cliente (el registro ya tiene su confirmación). */
export const STAGE_EMAIL_STATUSES: readonly CaseStatus[] = FOLLOW_UP.stages.map(([s]) => s).filter((s) => s !== "REGISTERED");
/** Etapas en curso: reciben novedad semanal y comunicados. */
const IN_PROGRESS_STATUSES: readonly CaseStatus[] = FOLLOW_UP.stages.map(([s]) => s).filter((s) => s !== "REPLACED");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Aviso de cambio de etapa. Solo unidades afectadas y etapas del reemplazo. Nunca lanza. */
export async function notifyStageChange(c: RecallCase): Promise<boolean> {
  if (c.serialVerificationStatus !== "AFFECTED" || !STAGE_EMAIL_STATUSES.includes(c.caseStatus)) return false;
  const ok = await sendFollowUp(c, "STAGE");
  if (ok) await markUpdated([c.id]);
  return ok;
}

async function markUpdated(ids: string[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.update(recallCases).set({ lastCustomerUpdateAt: new Date() }).where(inArray(recallCases.id, ids));
}

/** Casos afectados en curso (destinatarios de novedades y comunicados). */
async function casesInProgress(extra?: ReturnType<typeof lte>) {
  const db = await getDb();
  return db
    .select()
    .from(recallCases)
    .where(and(eq(recallCases.serialVerificationStatus, "AFFECTED"), inArray(recallCases.caseStatus, [...IN_PROGRESS_STATUSES]), extra))
    .orderBy(recallCases.createdAt);
}

export interface WeeklyFollowUpResult {
  due: number;
  sent: number;
  failed: number;
}

/** Novedad semanal a casos afectados en curso sin correo de seguimiento hace 7 días. */
export async function sendWeeklyFollowUps(options: { now?: Date; dryRun?: boolean } = {}): Promise<WeeklyFollowUpResult> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - WEEKLY_FOLLOW_UP_MS);
  const due = await casesInProgress(lte(sql`coalesce(${recallCases.lastCustomerUpdateAt}, ${recallCases.createdAt})`, since));
  const result: WeeklyFollowUpResult = { due: due.length, sent: 0, failed: 0 };
  if (options.dryRun) return result;
  for (const [i, c] of due.entries()) {
    if (i > 0) await sleep(SEND_GAP_MS);
    if (await sendFollowUp(c, "WEEKLY")) {
      await markUpdated([c.id]);
      result.sent++;
    } else result.failed++;
  }
  if (result.sent > 0 || result.failed > 0) await logAudit({ type: "FOLLOW_UPS_SENT", actor: "cron", payload: { ...result } });
  return result;
}

/** Correos que dejaron una serie afectada sin caso registrado (ni por la serie ni por el correo). */
async function contactsWithoutCase(): Promise<{ email: string; serials: string[] }[]> {
  const db = await getDb();
  const rows = await db
    .select({ email: serialLookups.contactEmail, serial: serialLookups.serialNormalized })
    .from(serialLookups)
    .where(
      and(
        eq(serialLookups.result, "AFFECTED"),
        isNotNull(serialLookups.contactEmail),
        sql`not exists (select 1 from ${recallCases} where ${recallCases.serialNumber} = ${serialLookups.serialNormalized} or lower(${recallCases.email}) = lower(${serialLookups.contactEmail}))`,
      ),
    );
  const byEmail = new Map<string, Set<string>>();
  for (const r of rows) {
    const email = r.email!.toLowerCase();
    byEmail.set(email, (byEmail.get(email) ?? new Set()).add(r.serial));
  }
  return [...byEmail].map(([email, serials]) => ({ email, serials: [...serials] }));
}

export interface BroadcastAudience {
  cases: number;
  contacts: number;
}

export async function getBroadcastAudience(): Promise<BroadcastAudience> {
  const [cases, contacts] = await Promise.all([casesInProgress(), contactsWithoutCase()]);
  // Un correo con caso no se repite como contacto sin caso (contactsWithoutCase ya lo excluye).
  return { cases: cases.length, contacts: contacts.length };
}

export interface BroadcastResult extends BroadcastAudience {
  sent: number;
  failed: number;
}

/** Comunicado de Postventa a todos los casos afectados en curso y, opcionalmente, a contactos sin caso. */
export async function sendBroadcast(message: { subject: string; body: string }, options: { includeContacts: boolean; actor: string }): Promise<BroadcastResult> {
  const [cases, contacts] = await Promise.all([casesInProgress(), options.includeContacts ? contactsWithoutCase() : Promise.resolve([])]);
  const result: BroadcastResult = { cases: cases.length, contacts: contacts.length, sent: 0, failed: 0 };
  let first = true;
  for (const c of cases) {
    if (!first) await sleep(SEND_GAP_MS);
    first = false;
    if (await sendFollowUp(c, "BROADCAST", message)) {
      await markUpdated([c.id]);
      result.sent++;
    } else result.failed++;
  }
  for (const k of contacts) {
    if (!first) await sleep(SEND_GAP_MS);
    first = false;
    if (await sendBroadcastToContact(k.email, k.serials, message)) result.sent++;
    else result.failed++;
  }
  await logAudit({ type: "BROADCAST_SENT", actor: options.actor, payload: { subject: message.subject, body: message.body, includeContacts: options.includeContacts, ...result } });
  return result;
}

/** Prueba de un comunicado a los correos internos, con un caso de ejemplo. */
export async function sendBroadcastTest(message: { subject: string; body: string }, to: string[]): Promise<boolean> {
  const sample = { id: "", caseId: "RCDH-EJEMPLO", customerName: "Nombre Apellido", email: to.join(","), serialNumber: "H24000000", caseStatus: "VALIDATED" } as RecallCase;
  return sendFollowUp({ ...sample, email: to[0]! }, "BROADCAST", { ...message, subject: `[PRUEBA] ${message.subject}` }, to);
}

