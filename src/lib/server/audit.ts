import "server-only";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";

export type AuditType =
  | "CASE_CREATED"
  | "CASE_DUPLICATE_DETECTED"
  | "STATUS_CHANGED"
  | "CASE_ASSIGNED"
  | "NOTE_ADDED"
  | "REPLACEMENT_FRAME_SET"
  | "EMAIL_SENT"
  | "EMAIL_FAILED"
  | "SERIALS_IMPORTED"
  | "SERIAL_DATABASE_STATUS_CHANGED"
  | "CASES_REPROCESSED"
  | "ADMIN_LOGIN"
  | "ADMIN_LOGIN_FAILED"
  | "ADMIN_LOGOUT"
  | "FILE_VIEWED"
  | "EXPORT_CSV"
  | "LOOKUP_SUSPICIOUS"
  | "AFFECTED_CONTACT_SAVED"
  | "AFFECTED_REMINDERS_SENT"
  | "FOLLOW_UPS_SENT"
  | "BROADCAST_SENT"
  | "EMAIL_RECEIVED"
  | "EMAIL_BOUNCED"
  | "EMAIL_LINKED"
  | "CUSTOMER_CALLED"
  | "MESSAGE_HANDLED";

export interface AuditInput {
  type: AuditType;
  actor?: string;
  caseId?: string | null; // uuid interno del caso
  payload?: Record<string, unknown>;
}

/** Registra un evento de auditoría. Nunca lanza: los fallos de auditoría no deben romper el flujo. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditEvents).values({
      type: input.type,
      actor: input.actor ?? "system",
      caseId: input.caseId ?? null,
      payload: input.payload ?? null,
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar el evento", input.type, err);
  }
}
