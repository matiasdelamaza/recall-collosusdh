import "server-only";
import { and, count, desc, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { LOOKUP_RESULTS, recallCases, serialLookups, type LookupResult } from "@/db/schema";
import { normalizeSerial } from "@/lib/serial";

export interface RecordLookupInput {
  serialNormalized: string;
  result: LookupResult;
  ipHash: string | null;
  userAgent: string | null;
  outreachRef?: string | null;
}

/** Registra una consulta de serie (métricas y detección de enumeración). Devuelve su id, o null si falla. Nunca lanza. */
export async function recordLookup(input: RecordLookupInput): Promise<string | null> {
  try {
    const db = await getDb();
    const id = crypto.randomUUID();
    await db.insert(serialLookups).values({
      id,
      serialNormalized: input.serialNormalized.slice(0, 64),
      result: input.result,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      outreachRef: input.outreachRef ?? null,
    });
    return id;
  } catch (err) {
    console.error("[lookups] no se pudo registrar la consulta", err);
    return null;
  }
}

/** Plazo para dejar el correo después de una consulta afectada. */
export const AFFECTED_CONTACT_WINDOW_MS = 2 * 60 * 60 * 1000;

export type SaveAffectedContactResult =
  | { kind: "SAVED"; first: boolean; lookup: { serial: string; outreachRef: string | null; createdAt: Date } }
  | { kind: "NOT_FOUND" };

/**
 * Guarda el correo de quien consultó una serie afectada. Solo acepta la consulta AFFECTED
 * hecha desde la misma conexión y dentro del plazo; `first` indica si es el primer correo de esa consulta.
 */
export async function saveAffectedContact(lookupId: string, email: string, ipHash: string | null): Promise<SaveAffectedContactResult> {
  const db = await getDb();
  const [row] = await db
    .select({
      serial: serialLookups.serialNormalized,
      ipHash: serialLookups.ipHash,
      result: serialLookups.result,
      contactEmail: serialLookups.contactEmail,
      outreachRef: serialLookups.outreachRef,
      createdAt: serialLookups.createdAt,
    })
    .from(serialLookups)
    .where(eq(serialLookups.id, lookupId))
    .limit(1);
  if (!row || row.result !== "AFFECTED" || row.ipHash !== ipHash || Date.now() - row.createdAt.getTime() > AFFECTED_CONTACT_WINDOW_MS) {
    return { kind: "NOT_FOUND" };
  }
  await db.update(serialLookups).set({ contactEmail: email, contactAt: new Date() }).where(eq(serialLookups.id, lookupId));
  return { kind: "SAVED", first: !row.contactEmail, lookup: { serial: row.serial, outreachRef: row.outreachRef, createdAt: row.createdAt } };
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

// ── Panel interno: listado de consultas ────────────────────────────────

export interface LookupListFilters {
  result?: LookupResult;
  /** Búsqueda por serie (contiene). */
  q?: string;
  page?: number;
}

export interface LookupRow {
  id: string;
  createdAt: Date;
  serialNormalized: string;
  result: LookupResult;
  /** Primeros caracteres del hash de IP: permite ver intentos repetidos de una misma conexión sin exponer la IP. */
  connection: string | null;
  /** Caso registrado con esa serie, si existe. */
  caseId: string | null;
  /** Correo dejado tras una consulta afectada. */
  contactEmail: string | null;
  /** Código del enlace personal por el que llegó. */
  outreachRef: string | null;
}

export const LOOKUPS_PAGE_SIZE = 50;

/** Interpreta los parámetros de la URL del listado. */
export function parseLookupFilters(sp: Record<string, string | string[] | undefined>): LookupListFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const result = one("result");
  const page = Number(one("page") ?? "1");
  return {
    result: (LOOKUP_RESULTS as readonly string[]).includes(result ?? "") ? (result as LookupResult) : undefined,
    q: one("q")?.slice(0, 64),
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

function lookupWhere(filters: LookupListFilters) {
  const conds = [];
  if (filters.result) conds.push(eq(serialLookups.result, filters.result));
  if (filters.q) conds.push(ilike(serialLookups.serialNormalized, `%${normalizeSerial(filters.q).replace(/[%_\\]/g, "\\$&")}%`));
  return conds.length ? and(...conds) : undefined;
}

async function selectLookups(filters: LookupListFilters, limit: number, offset: number): Promise<LookupRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: serialLookups.id,
      createdAt: serialLookups.createdAt,
      serialNormalized: serialLookups.serialNormalized,
      result: serialLookups.result,
      ipHash: serialLookups.ipHash,
      contactEmail: serialLookups.contactEmail,
      outreachRef: serialLookups.outreachRef,
      caseId: sql<string | null>`(select ${recallCases.caseId} from ${recallCases} where ${recallCases.serialNumber} = ${serialLookups.serialNormalized} and ${serialLookups.serialNormalized} <> '' order by ${recallCases.createdAt} limit 1)`,
    })
    .from(serialLookups)
    .where(lookupWhere(filters))
    .orderBy(desc(serialLookups.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    serialNormalized: r.serialNormalized,
    result: r.result,
    connection: r.ipHash ? r.ipHash.slice(0, 8) : null,
    caseId: r.caseId ?? null,
    contactEmail: r.contactEmail ?? null,
    outreachRef: r.outreachRef ?? null,
  }));
}

export async function listLookups(filters: LookupListFilters): Promise<{ rows: LookupRow[]; total: number; page: number; totalPages: number }> {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(serialLookups).where(lookupWhere(filters));
  const rows = await selectLookups(filters, LOOKUPS_PAGE_SIZE, (page - 1) * LOOKUPS_PAGE_SIZE);
  return { rows, total: Number(total), page, totalPages: Math.max(1, Math.ceil(Number(total) / LOOKUPS_PAGE_SIZE)) };
}

/** Todas las consultas que cumplen los filtros (exportación). Límite de seguridad: 50.000. */
export async function listAllLookupsForExport(filters: LookupListFilters): Promise<LookupRow[]> {
  return selectLookups(filters, 50_000, 0);
}

export interface LookupSummary {
  total: number;
  byResult: Record<LookupResult, number>;
  /** Series distintas consultadas (excluye vacías). */
  distinctSerials: number;
  /** Conexiones distintas (hash de IP). */
  distinctConnections: number;
  /** Consultas afectadas en las que se dejó correo. */
  affectedWithEmail: number;
}

/** Resumen de todas las consultas (todas las fechas). */
export async function summarizeLookups(): Promise<LookupSummary> {
  const db = await getDb();
  const [rows, [distinct]] = await Promise.all([
    db.select({ result: serialLookups.result, n: count() }).from(serialLookups).groupBy(serialLookups.result),
    db
      .select({
        serials: sql<number>`count(distinct nullif(${serialLookups.serialNormalized}, ''))`,
        connections: sql<number>`count(distinct ${serialLookups.ipHash})`,
        affectedWithEmail: sql<number>`count(*) filter (where ${serialLookups.result} = 'AFFECTED' and ${serialLookups.contactEmail} is not null)`,
      })
      .from(serialLookups),
  ]);
  const byResult = Object.fromEntries(LOOKUP_RESULTS.map((r) => [r, 0])) as Record<LookupResult, number>;
  let total = 0;
  for (const r of rows) {
    byResult[r.result] = Number(r.n);
    total += Number(r.n);
  }
  return { total, byResult, distinctSerials: Number(distinct.serials), distinctConnections: Number(distinct.connections), affectedWithEmail: Number(distinct.affectedWithEmail) };
}
