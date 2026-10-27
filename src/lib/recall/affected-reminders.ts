/**
 * Recordatorio automático a quien consultó una serie afectada, dejó su correo y no registró caso
 * (27-10-2026, pedido de Cross Mountain). Lo corre Vercel Cron una vez al día (/api/cron/recordatorios).
 *
 * Reglas:
 * - Solo consultas AFECTADAS con correo, dejado hace al menos 24 h, sin recordatorio previo.
 * - Un correo por persona (agrupado por correo), con todas sus series.
 * - No se envía si ya existe un caso con alguna de esas series o con ese correo.
 * - Un solo recordatorio por correo: tras enviarlo se marcan todas sus consultas.
 */
import "server-only";
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { recallCases, serialLookups } from "@/db/schema";
import { logAudit } from "@/lib/server/audit";
import { sendAffectedReminder } from "./notifications";

export const AFFECTED_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
/** Tope por corrida, para no exceder el tiempo de la función ni el límite del proveedor de correo. */
const MAX_PER_RUN = 50;

export interface AffectedReminderResult {
  candidates: number;
  sent: number;
  skippedWithCase: number;
  failed: number;
}

export async function sendAffectedReminders(options: { now?: Date; dryRun?: boolean } = {}): Promise<AffectedReminderResult> {
  const now = options.now ?? new Date();
  const db = await getDb();
  const rows = await db
    .select({ id: serialLookups.id, email: serialLookups.contactEmail, serial: serialLookups.serialNormalized })
    .from(serialLookups)
    .where(
      and(
        eq(serialLookups.result, "AFFECTED"),
        isNotNull(serialLookups.contactEmail),
        lte(serialLookups.contactAt, new Date(now.getTime() - AFFECTED_REMINDER_DELAY_MS)),
        isNull(serialLookups.reminderSentAt),
      ),
    )
    .orderBy(serialLookups.contactAt);

  const byEmail = new Map<string, { ids: string[]; serials: Set<string> }>();
  for (const r of rows) {
    const email = r.email!.toLowerCase();
    const entry = byEmail.get(email) ?? { ids: [], serials: new Set<string>() };
    entry.ids.push(r.id);
    entry.serials.add(r.serial);
    byEmail.set(email, entry);
  }

  const result: AffectedReminderResult = { candidates: byEmail.size, sent: 0, skippedWithCase: 0, failed: 0 };
  for (const [email, entry] of byEmail) {
    if (result.sent + result.failed >= MAX_PER_RUN) break;
    const serials = [...entry.serials];
    // Ya recordado antes por otra consulta (p. ej. volvió a consultar después del recordatorio).
    const reminded = await db
      .select({ id: serialLookups.id })
      .from(serialLookups)
      .where(and(sql`lower(${serialLookups.contactEmail}) = ${email}`, isNotNull(serialLookups.reminderSentAt)))
      .limit(1);
    if (reminded.length > 0) {
      if (!options.dryRun) await db.update(serialLookups).set({ reminderSentAt: now }).where(inArray(serialLookups.id, entry.ids));
      continue;
    }
    const withCase = await db
      .select({ id: recallCases.id })
      .from(recallCases)
      .where(or(inArray(recallCases.serialNumber, serials), sql`lower(${recallCases.email}) = ${email}`))
      .limit(1);
    if (withCase.length > 0) {
      result.skippedWithCase++;
      continue;
    }
    if (options.dryRun) {
      result.sent++;
      continue;
    }
    if (await sendAffectedReminder(email, serials)) {
      await db.update(serialLookups).set({ reminderSentAt: now }).where(inArray(serialLookups.id, entry.ids));
      result.sent++;
    } else {
      result.failed++;
    }
  }

  if (!options.dryRun && (result.sent > 0 || result.failed > 0)) {
    await logAudit({ type: "AFFECTED_REMINDERS_SENT", actor: "cron", payload: { ...result } });
  }
  return result;
}
