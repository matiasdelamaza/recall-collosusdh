/**
 * Métricas operativas de la campaña (brief §31). SOLO servidor.
 */
import "server-only";
import { and, count, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  ACTIVE_CASE_STATUSES,
  affectedSerials,
  analyticsEvents,
  recallCases,
  serialLookups,
  type CaseStatus,
  type SerialDatabaseStatus,
} from "@/db/schema";
import { getSerialDatabaseStatus } from "@/lib/recall/verify";

export const CONTACTED_STATUSES: readonly CaseStatus[] = [
  "CUSTOMER_CONTACTED",
  "REPLACEMENT_FRAME_ASSIGNED",
  "FRAME_IN_TRANSIT",
  "FRAME_RECEIVED",
  "SERVICE_SCHEDULED",
  "REPLACED",
  "CLOSED",
];
export const FRAME_ASSIGNED_STATUSES: readonly CaseStatus[] = [
  "REPLACEMENT_FRAME_ASSIGNED",
  "FRAME_IN_TRANSIT",
  "FRAME_RECEIVED",
  "SERVICE_SCHEDULED",
  "REPLACED",
  "CLOSED",
];
export const REPLACED_STATUSES: readonly CaseStatus[] = ["REPLACED", "CLOSED"];
const EXCLUDED_FROM_RATE: readonly CaseStatus[] = ["DUPLICATE_CASE", "INVALID_SERIAL"];

export interface RecallMetrics {
  serialDatabaseStatus: SerialDatabaseStatus;
  affectedSerialsLoaded: number;
  totalLookups: number;
  affectedLookups: number;
  totalCases: number;
  affectedCases: number;
  customersContacted: number;
  framesAssigned: number;
  replacementsCompleted: number;
  openCases: number;
  closedCases: number;
  accidentCases: number;
  damageCases: number;
  /** 0..1, o null si no hay casos afectados. */
  completionRate: number | null;
  casesByStatus: { status: CaseStatus; count: number }[];
  analytics: { name: string; last30: number; total: number }[];
  daily: { day: string; lookups: number; registrations: number }[];
}

async function countWhere(where: ReturnType<typeof and> | undefined, table: typeof recallCases | typeof serialLookups | typeof affectedSerials) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(table).where(where);
  return Number(n);
}

export async function getRecallMetrics(): Promise<RecallMetrics> {
  const db = await getDb();
  const now = Date.now();
  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const since14 = new Date(now - 13 * 24 * 60 * 60 * 1000);
  since14.setUTCHours(0, 0, 0, 0);

  const notExcluded = sql`${recallCases.caseStatus} not in ('DUPLICATE_CASE', 'INVALID_SERIAL')`;

  const [
    serialDatabaseStatus,
    affectedSerialsLoaded,
    totalLookups,
    affectedLookups,
    totalCases,
    affectedCases,
    customersContacted,
    framesAssigned,
    replacementsCompleted,
    openCases,
    closedCases,
    accidentCases,
    damageCases,
    affectedDenominator,
    affectedReplaced,
    byStatusRows,
    analyticsTotal,
    analytics30,
    dailyLookups,
    dailyRegs,
  ] = await Promise.all([
    getSerialDatabaseStatus(),
    countWhere(eq(affectedSerials.status, "RECALL"), affectedSerials),
    countWhere(undefined, serialLookups),
    countWhere(eq(serialLookups.result, "AFFECTED"), serialLookups),
    countWhere(undefined, recallCases),
    countWhere(eq(recallCases.serialVerificationStatus, "AFFECTED"), recallCases),
    countWhere(inArray(recallCases.caseStatus, [...CONTACTED_STATUSES]), recallCases),
    countWhere(or(inArray(recallCases.caseStatus, [...FRAME_ASSIGNED_STATUSES]), isNotNull(recallCases.replacementFrameSerial)), recallCases),
    countWhere(inArray(recallCases.caseStatus, [...REPLACED_STATUSES]), recallCases),
    countWhere(inArray(recallCases.caseStatus, [...ACTIVE_CASE_STATUSES]), recallCases),
    countWhere(eq(recallCases.caseStatus, "CLOSED"), recallCases),
    countWhere(eq(recallCases.accidentReported, true), recallCases),
    countWhere(eq(recallCases.damageReported, "YES"), recallCases),
    countWhere(and(eq(recallCases.serialVerificationStatus, "AFFECTED"), notExcluded), recallCases),
    countWhere(and(eq(recallCases.serialVerificationStatus, "AFFECTED"), inArray(recallCases.caseStatus, [...REPLACED_STATUSES])), recallCases),
    db.select({ status: recallCases.caseStatus, n: count() }).from(recallCases).groupBy(recallCases.caseStatus),
    db.select({ name: analyticsEvents.name, n: count() }).from(analyticsEvents).groupBy(analyticsEvents.name),
    db
      .select({ name: analyticsEvents.name, n: count() })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, since30))
      .groupBy(analyticsEvents.name),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${serialLookups.createdAt}), 'YYYY-MM-DD')`, n: count() })
      .from(serialLookups)
      .where(gte(serialLookups.createdAt, since14))
      .groupBy(sql`date_trunc('day', ${serialLookups.createdAt})`),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${recallCases.createdAt}), 'YYYY-MM-DD')`, n: count() })
      .from(recallCases)
      .where(gte(recallCases.createdAt, since14))
      .groupBy(sql`date_trunc('day', ${recallCases.createdAt})`),
  ]);

  void EXCLUDED_FROM_RATE;

  const byStatusMap = new Map<CaseStatus, number>();
  for (const r of byStatusRows) byStatusMap.set(r.status, Number(r.n));
  const casesByStatus = (Object.keys(STATUS_ORDER) as CaseStatus[]).map((status) => ({ status, count: byStatusMap.get(status) ?? 0 }));

  const totalMap = new Map<string, number>();
  for (const r of analyticsTotal) totalMap.set(r.name, Number(r.n));
  const last30Map = new Map<string, number>();
  for (const r of analytics30) last30Map.set(r.name, Number(r.n));
  const analytics = [...totalMap.keys()].sort().map((name) => ({ name, last30: last30Map.get(name) ?? 0, total: totalMap.get(name) ?? 0 }));

  const lookupsByDay = new Map<string, number>();
  for (const r of dailyLookups) lookupsByDay.set(r.day, Number(r.n));
  const regsByDay = new Map<string, number>();
  for (const r of dailyRegs) regsByDay.set(r.day, Number(r.n));
  const daily: RecallMetrics["daily"] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since14.getTime() + i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    daily.push({ day, lookups: lookupsByDay.get(day) ?? 0, registrations: regsByDay.get(day) ?? 0 });
  }

  return {
    serialDatabaseStatus,
    affectedSerialsLoaded,
    totalLookups,
    affectedLookups,
    totalCases,
    affectedCases,
    customersContacted,
    framesAssigned,
    replacementsCompleted,
    openCases,
    closedCases,
    accidentCases,
    damageCases,
    completionRate: affectedDenominator > 0 ? affectedReplaced / affectedDenominator : null,
    casesByStatus,
    analytics,
    daily,
  };
}

/** Orden de presentación de estados. */
const STATUS_ORDER: Record<CaseStatus, number> = {
  REGISTERED: 0,
  VALIDATED: 1,
  CUSTOMER_CONTACTED: 2,
  REPLACEMENT_FRAME_ASSIGNED: 3,
  FRAME_IN_TRANSIT: 4,
  FRAME_RECEIVED: 5,
  SERVICE_SCHEDULED: 6,
  REPLACED: 7,
  CLOSED: 8,
  MANUAL_REVIEW: 9,
  INVALID_SERIAL: 10,
  DUPLICATE_CASE: 11,
  CUSTOMER_UNREACHABLE: 12,
};
