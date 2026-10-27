import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { serialLookups, type LookupResult } from "@/db/schema";

export interface RecordLookupInput {
  serialNormalized: string;
  result: LookupResult;
  ipHash: string | null;
  userAgent: string | null;
}

/** Registra una consulta de serie (métricas y detección de enumeración). Nunca lanza. */
export async function recordLookup(input: RecordLookupInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(serialLookups).values({
      serialNormalized: input.serialNormalized.slice(0, 64),
      result: input.result,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
    });
  } catch (err) {
    console.error("[lookups] no se pudo registrar la consulta", err);
  }
}

/**
 * Consultas recientes de una IP (hasheada) que NO resultaron en coincidencia positiva.
 * Las respuestas RATE_LIMITED no cuentan: de lo contrario cada reintento bloqueado
 * renovaría el bloqueo y este nunca expiraría.
 */
export async function countRecentMisses(ipHash: string, windowMs: number): Promise<number> {
  const db = await getDb();
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(serialLookups)
    .where(
      and(
        eq(serialLookups.ipHash, ipHash),
        inArray(serialLookups.result, ["NOT_IDENTIFIED", "INVALID", "PENDING_DATABASE"]),
        gt(serialLookups.createdAt, since),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}
