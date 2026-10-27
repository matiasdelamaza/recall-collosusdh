/**
 * Consultas de casos para el panel interno (SOLO servidor).
 */
import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  auditEvents,
  caseFiles,
  caseNotes,
  recallCases,
  CASE_STATUSES,
  PRIORITIES,
  REQUEST_TYPES,
  SERIAL_VERIFICATION_STATUSES,
  TRI_STATE,
  type AuditEvent,
  type CaseFile,
  type CaseNote,
  type CaseStatus,
  type Priority,
  type RecallCase,
  type RequestType,
  type SerialVerificationStatus,
  type TriState,
} from "@/db/schema";
import { isValidCaseId, normalizeCaseId } from "@/lib/case-id";
import { cleanRut, normalizeRut } from "@/lib/rut";
import { normalizeSerial } from "@/lib/serial";

export interface CaseListFilters {
  q?: string;
  status?: CaseStatus;
  priority?: Priority;
  damage?: TriState;
  accident?: "YES" | "NO";
  requestType?: RequestType;
  verification?: SerialVerificationStatus;
  page?: number;
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 50;

/** Convierte searchParams (strings) en filtros tipados, descartando valores inválidos. */
export function parseCaseFilters(params: Record<string, string | string[] | undefined>): CaseListFilters {
  const pick = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" ? s.trim() : "";
  };
  const inList = <T extends string>(v: string, list: readonly T[]): T | undefined => ((list as readonly string[]).includes(v) ? (v as T) : undefined);
  const page = Math.max(1, Number.parseInt(pick("page") || "1", 10) || 1);
  return {
    q: pick("q").slice(0, 120) || undefined,
    status: inList(pick("status"), CASE_STATUSES),
    priority: inList(pick("priority"), PRIORITIES),
    damage: inList(pick("damage"), TRI_STATE),
    accident: inList(pick("accident"), ["YES", "NO"] as const),
    requestType: inList(pick("requestType"), REQUEST_TYPES),
    verification: inList(pick("verification"), SERIAL_VERIFICATION_STATUSES),
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function buildWhere(filters: CaseListFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (filters.status) conds.push(eq(recallCases.caseStatus, filters.status));
  if (filters.priority) conds.push(eq(recallCases.priority, filters.priority));
  if (filters.damage) conds.push(eq(recallCases.damageReported, filters.damage));
  if (filters.accident) conds.push(eq(recallCases.accidentReported, filters.accident === "YES"));
  if (filters.requestType) conds.push(eq(recallCases.requestType, filters.requestType));
  if (filters.verification) conds.push(eq(recallCases.serialVerificationStatus, filters.verification));

  const q = filters.q?.trim();
  if (q) {
    const ors: SQL[] = [];
    const caseId = normalizeCaseId(q);
    if (isValidCaseId(caseId)) ors.push(eq(recallCases.caseId, caseId));
    const serial = normalizeSerial(q);
    if (serial.length >= 3) ors.push(eq(recallCases.serialNumber, serial));
    const rutClean = cleanRut(q);
    if (rutClean.length >= 7 && /^\d+[0-9K]$/.test(rutClean)) ors.push(eq(recallCases.rut, normalizeRut(q)));
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    ors.push(ilike(recallCases.serialNumber, like)); // búsqueda parcial de serie
    ors.push(ilike(recallCases.customerName, like));
    ors.push(ilike(recallCases.email, like));
    ors.push(ilike(recallCases.phone, like));
    conds.push(or(...ors)!);
  }
  return conds.length ? and(...conds) : undefined;
}

export interface CaseListResult {
  rows: RecallCase[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listCases(filters: CaseListFilters): Promise<CaseListResult> {
  const db = await getDb();
  const where = buildWhere(filters);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const [{ total }] = await db.select({ total: count() }).from(recallCases).where(where);
  const rows = await db
    .select()
    .from(recallCases)
    .where(where)
    .orderBy(sql`case when ${recallCases.priority} = 'HIGH' then 0 else 1 end`, desc(recallCases.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total: Number(total), page, pageSize, totalPages: Math.max(1, Math.ceil(Number(total) / pageSize)) };
}

/** Todas las filas que cumplen los filtros (para exportación). Límite de seguridad: 20.000. */
export async function listAllCasesForExport(filters: CaseListFilters): Promise<RecallCase[]> {
  const db = await getDb();
  const where = buildWhere(filters);
  return db
    .select()
    .from(recallCases)
    .where(where)
    .orderBy(sql`case when ${recallCases.priority} = 'HIGH' then 0 else 1 end`, desc(recallCases.createdAt))
    .limit(20_000);
}

export interface CaseDetail {
  case: RecallCase;
  files: CaseFile[];
  notes: CaseNote[];
  audit: AuditEvent[];
}

export async function getCaseByCaseId(caseIdInput: string): Promise<CaseDetail | null> {
  const caseId = normalizeCaseId(caseIdInput);
  if (!isValidCaseId(caseId)) return null;
  const db = await getDb();
  const row = await db.query.recallCases.findFirst({ where: eq(recallCases.caseId, caseId) });
  if (!row) return null;
  const [files, notes, audit] = await Promise.all([
    db.select().from(caseFiles).where(eq(caseFiles.caseId, row.id)).orderBy(asc(caseFiles.createdAt)),
    db.select().from(caseNotes).where(eq(caseNotes.caseId, row.id)).orderBy(desc(caseNotes.createdAt)),
    db.select().from(auditEvents).where(eq(auditEvents.caseId, row.id)).orderBy(desc(auditEvents.createdAt)).limit(200),
  ]);
  return { case: row, files, notes, audit };
}

export async function getCaseFile(fileId: string): Promise<(CaseFile & { caseIdPublic: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const db = await getDb();
  const rows = await db
    .select({ file: caseFiles, caseIdPublic: recallCases.caseId })
    .from(caseFiles)
    .innerJoin(recallCases, eq(caseFiles.caseId, recallCases.id))
    .where(eq(caseFiles.id, fileId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { ...r.file, caseIdPublic: r.caseIdPublic };
}
