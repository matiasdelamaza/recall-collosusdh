/**
 * Lógica central de verificación de números de serie (SOLO servidor).
 *
 * Reglas:
 * - La base de series afectadas se consulta únicamente aquí, por coincidencia EXACTA
 *   sobre la serie normalizada. Sin coincidencia difusa.
 * - Si la base oficial de Polygon aún no está marcada como COMPLETE (ajuste
 *   `serial_database_status`), NUNCA se devuelve un resultado "no identificada":
 *   todo lo que no sea coincidencia positiva queda como PENDING_DATABASE.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { affectedSerials, SETTING_KEYS, settings, type SerialDatabaseStatus, type SerialVerificationStatus } from "@/db/schema";
import { validateSerial } from "@/lib/serial";

export type VerificationOutcome =
  | { state: "AFFECTED"; serial: string; model: string | null; size: string | null; productionBatch: string | null }
  | { state: "NOT_IDENTIFIED"; serial: string }
  | { state: "PENDING_DATABASE"; serial: string }
  | { state: "UNVERIFIED"; serial: string; reason: "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARS" };

/** Lee el estado de la base de series (PENDING por defecto si no se ha configurado). */
export async function getSerialDatabaseStatus(): Promise<SerialDatabaseStatus> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(settings.key, SETTING_KEYS.SERIAL_DATABASE_STATUS) });
  return row?.value === "COMPLETE" ? "COMPLETE" : "PENDING";
}

export async function setSerialDatabaseStatus(status: SerialDatabaseStatus, updatedBy: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key: SETTING_KEYS.SERIAL_DATABASE_STATUS, value: status, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: status, updatedBy, updatedAt: new Date() },
    });
}

/** Busca una serie normalizada en la base oficial. Coincidencia exacta. */
export async function findAffectedSerial(serialNormalized: string) {
  const db = await getDb();
  const row = await db.query.affectedSerials.findFirst({ where: eq(affectedSerials.serialNumber, serialNormalized) });
  if (!row || row.status !== "RECALL") return null;
  return row;
}

/**
 * Verifica una serie ingresada por el usuario.
 * Decisión pura a partir de: validación de formato, coincidencia y estado de la base.
 */
export async function verifySerial(input: string): Promise<VerificationOutcome> {
  const validation = validateSerial(input);
  if (!validation.valid) {
    return { state: "UNVERIFIED", serial: "", reason: validation.reason };
  }
  const serial = validation.serial;
  const match = await findAffectedSerial(serial);
  if (match) {
    return { state: "AFFECTED", serial, model: match.model, size: match.size, productionBatch: match.productionBatch };
  }
  const dbStatus = await getSerialDatabaseStatus();
  return decideNonMatch(serial, dbStatus);
}

/** Decisión para una serie válida sin coincidencia, según el estado de la base. Exportada para pruebas. */
export function decideNonMatch(serial: string, dbStatus: SerialDatabaseStatus): VerificationOutcome {
  if (dbStatus === "COMPLETE") return { state: "NOT_IDENTIFIED", serial };
  return { state: "PENDING_DATABASE", serial };
}

export function outcomeToStatus(outcome: VerificationOutcome): SerialVerificationStatus {
  return outcome.state;
}
