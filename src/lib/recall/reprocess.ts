/**
 * Reproceso de casos registrados en modo interino (PENDING_DATABASE) y casos en
 * revisión manual contra la base oficial una vez cargada.
 * Usado por `scripts/reprocess-pending.ts` y por el panel interno (/admin/series).
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ACTIVE_CASE_STATUSES, recallCases, type RecallCase } from "@/db/schema";
import { logAudit } from "@/lib/server/audit";
import { sendResultNotification } from "./notifications";
import { getSerialDatabaseStatus, matchListedSerial } from "./verify";

export interface ReprocessOptions {
  actor: string;
  /** Enviar correo a los clientes con el resultado (afectada / no afectada / no identificada). */
  notifyCustomers: boolean;
  dryRun?: boolean;
}

export interface ReprocessResult {
  scanned: number;
  nowAffected: number;
  nowReinforced: number;
  nowNotIdentified: number;
  unchanged: number;
  notified: number;
  errors: { caseId: string; message: string }[];
}

export async function reprocessPendingCases(options: ReprocessOptions): Promise<ReprocessResult> {
  const db = await getDb();
  const dbStatus = await getSerialDatabaseStatus();
  const result: ReprocessResult = { scanned: 0, nowAffected: 0, nowReinforced: 0, nowNotIdentified: 0, unchanged: 0, notified: 0, errors: [] };

  const candidates: RecallCase[] = await db
    .select()
    .from(recallCases)
    .where(
      and(
        inArray(recallCases.caseStatus, [...ACTIVE_CASE_STATUSES]),
        inArray(recallCases.serialVerificationStatus, ["PENDING_DATABASE", "NOT_IDENTIFIED", "UNVERIFIED"]),
      ),
    )
    .orderBy(recallCases.createdAt);

  result.scanned = candidates.length;

  for (const c of candidates) {
    try {
      const listed = await matchListedSerial(c.serialNumber);
      if (listed?.status === "RECALL") {
        result.nowAffected++;
        if (options.dryRun) continue;
        const now = new Date();
        // Un caso estacionado en revisión manual entra al flujo de reemplazo; los demás estados se conservan.
        const nextCaseStatus = c.caseStatus === "MANUAL_REVIEW" ? "REGISTERED" : c.caseStatus;
        const [updated] = await db
          .update(recallCases)
          .set({ serialNumber: listed.serialNumber, serialVerificationStatus: "AFFECTED", requestType: "REPLACEMENT", caseStatus: nextCaseStatus, updatedAt: now })
          .where(eq(recallCases.id, c.id))
          .returning();
        await logAudit({
          type: "STATUS_CHANGED",
          actor: options.actor,
          caseId: c.id,
          payload: {
            caseId: c.caseId,
            field: "serialVerificationStatus",
            from: c.serialVerificationStatus,
            to: "AFFECTED",
            caseStatusFrom: c.caseStatus,
            caseStatusTo: nextCaseStatus,
            reason: "reprocess",
          },
        });
        if (options.notifyCustomers && updated) {
          const ok = await sendResultNotification(updated, "AFFECTED");
          if (ok) {
            result.notified++;
            await db.update(recallCases).set({ resultNotifiedAt: new Date() }).where(eq(recallCases.id, c.id));
          }
        }
        continue;
      }

      if (listed?.status === "REINFORCED") {
        // No afectada (OK de Polygon): no forma parte de la campaña. El caso queda en revisión manual para que Postventa lo cierre.
        result.nowReinforced++;
        if (options.dryRun) continue;
        const now = new Date();
        const [updated] = await db
          .update(recallCases)
          .set({ serialNumber: listed.serialNumber, serialVerificationStatus: "REINFORCED", requestType: "MANUAL_REVIEW", caseStatus: "MANUAL_REVIEW", updatedAt: now })
          .where(eq(recallCases.id, c.id))
          .returning();
        await logAudit({
          type: "STATUS_CHANGED",
          actor: options.actor,
          caseId: c.id,
          payload: {
            caseId: c.caseId,
            field: "serialVerificationStatus",
            from: c.serialVerificationStatus,
            to: "REINFORCED",
            caseStatusFrom: c.caseStatus,
            caseStatusTo: "MANUAL_REVIEW",
            reason: "reprocess",
          },
        });
        if (options.notifyCustomers && updated) {
          const ok = await sendResultNotification(updated, "REINFORCED");
          if (ok) {
            result.notified++;
            await db.update(recallCases).set({ resultNotifiedAt: new Date() }).where(eq(recallCases.id, c.id));
          }
        }
        continue;
      }

      if (dbStatus === "COMPLETE" && c.serialVerificationStatus === "PENDING_DATABASE") {
        result.nowNotIdentified++;
        if (options.dryRun) continue;
        const now = new Date();
        const [updated] = await db
          .update(recallCases)
          .set({ serialVerificationStatus: "NOT_IDENTIFIED", requestType: "MANUAL_REVIEW", caseStatus: "MANUAL_REVIEW", updatedAt: now })
          .where(eq(recallCases.id, c.id))
          .returning();
        await logAudit({
          type: "STATUS_CHANGED",
          actor: options.actor,
          caseId: c.id,
          payload: {
            caseId: c.caseId,
            field: "serialVerificationStatus",
            from: "PENDING_DATABASE",
            to: "NOT_IDENTIFIED",
            caseStatusFrom: c.caseStatus,
            caseStatusTo: "MANUAL_REVIEW",
            reason: "reprocess",
          },
        });
        if (options.notifyCustomers && updated) {
          const ok = await sendResultNotification(updated, "NOT_IDENTIFIED");
          if (ok) {
            result.notified++;
            await db.update(recallCases).set({ resultNotifiedAt: new Date() }).where(eq(recallCases.id, c.id));
          }
        }
        continue;
      }

      result.unchanged++;
    } catch (err) {
      result.errors.push({ caseId: c.caseId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!options.dryRun) {
    await logAudit({
      type: "CASES_REPROCESSED",
      actor: options.actor,
      payload: { ...result, errors: result.errors.length, notifyCustomers: options.notifyCustomers, serialDatabaseStatus: dbStatus },
    });
  }
  return result;
}
