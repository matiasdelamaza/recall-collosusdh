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
import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { affectedSerials, SETTING_KEYS, settings, type SerialDatabaseStatus, type SerialVerificationStatus } from "@/db/schema";
import { splitSizeSuffix, validateSerial, withSizeSuffixes } from "@/lib/serial";

export type VerificationOutcome =
  | { state: "AFFECTED"; serial: string; model: string | null; size: string | null; productionBatch: string | null }
  | { state: "REINFORCED"; serial: string; model: string | null; size: string | null }
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

/** Número de series cargadas con estado RECALL (las que el sitio informa como afectadas). */
export async function countRecallSerials(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ total: count() }).from(affectedSerials).where(eq(affectedSerials.status, "RECALL"));
  return Number(row?.total ?? 0);
}

/** Busca una serie normalizada en la lista importada, con cualquier estado. Coincidencia exacta. */
export async function findListedSerial(serialNormalized: string) {
  const db = await getDb();
  const row = await db.query.affectedSerials.findFirst({ where: eq(affectedSerials.serialNumber, serialNormalized) });
  return row ?? null;
}

/**
 * Busca una serie en la lista de Polygon tolerando la talla pegada al final: la lista trae algunas
 * series como "A25022640XL" y el cuadro lleva grabado "A25022640" (o al revés).
 * Devuelve la fila tal como está en la lista, para que consultas y casos muestren la serie de Polygon.
 */
export async function matchListedSerial(serialNormalized: string) {
  const exact = await findListedSerial(serialNormalized);
  if (exact) return exact;
  const variants = withSizeSuffixes(serialNormalized);
  if (variants.length > 0) {
    const db = await getDb();
    const rows = await db.select().from(affectedSerials).where(inArray(affectedSerials.serialNumber, variants));
    // Si hubiera más de una talla, prima la afectada (lado seguro).
    return rows.find((r) => r.status === "RECALL") ?? rows.find((r) => r.status === "REINFORCED") ?? null;
  }
  const withSize = splitSizeSuffix(serialNormalized);
  return withSize ? findListedSerial(withSize.serial) : null;
}

/** Busca una serie normalizada en la tanda afectada (estado RECALL). Coincidencia exacta. */
export async function findAffectedSerial(serialNormalized: string) {
  const row = await findListedSerial(serialNormalized);
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
  const match = await matchListedSerial(validation.serial);
  // Con coincidencia, la serie que se registra es la de la lista de Polygon (con talla si la trae).
  const serial = match && match.status !== "EXCLUDED" ? match.serialNumber : validation.serial;
  if (match?.status === "RECALL") {
    return { state: "AFFECTED", serial, model: match.model, size: match.size, productionBatch: match.productionBatch };
  }
  if (match?.status === "REINFORCED") {
    return { state: "REINFORCED", serial, model: match.model, size: match.size };
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
