import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { ACTIVE_CASE_STATUSES, recallCases, type RecallCase } from "@/db/schema";
import type { Database } from "@/db/client";

export type DuplicateDecision =
  | { kind: "NONE" }
  | { kind: "EXISTING"; existing: RecallCase }
  | { kind: "LIMIT_REACHED"; activeCount: number }
  | { kind: "FLAG_DUPLICATE"; activeCount: number };

/** Casos activos con la misma serie normalizada. */
export async function findActiveCasesBySerial(db: Database, serialNormalized: string): Promise<RecallCase[]> {
  return db
    .select()
    .from(recallCases)
    .where(and(eq(recallCases.serialNumber, serialNormalized), inArray(recallCases.caseStatus, [...ACTIVE_CASE_STATUSES])))
    .orderBy(recallCases.createdAt);
}

/**
 * Decide qué hacer ante un nuevo registro de una serie:
 * - sin casos activos → NONE (crear normalmente)
 * - un caso activo con el mismo email o RUT → EXISTING (no crear, devolver su número de caso)
 * - casos activos de otra identidad ≥ límite → LIMIT_REACHED (rechazar)
 * - casos activos de otra identidad < límite → FLAG_DUPLICATE (crear marcado como DUPLICATE_CASE)
 */
export function decideDuplicate(
  active: RecallCase[],
  identity: { email: string; rut: string },
  maxActivePerSerial: number,
): DuplicateDecision {
  if (active.length === 0) return { kind: "NONE" };
  const email = identity.email.trim().toLowerCase();
  const rut = identity.rut.trim().toUpperCase();
  const same = active.find((c) => c.email.trim().toLowerCase() === email || c.rut.trim().toUpperCase() === rut);
  if (same) return { kind: "EXISTING", existing: same };
  if (active.length >= maxActivePerSerial) return { kind: "LIMIT_REACHED", activeCount: active.length };
  return { kind: "FLAG_DUPLICATE", activeCount: active.length };
}
