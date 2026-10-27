import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { STATUS_LABELS } from "@/lib/copy/es";
import { getRecallMetrics } from "@/lib/recall/metrics";
import { logAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEP = ";";
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const m = await getRecallMetrics();
  const K = ADMIN.metrics.kpis;
  const rows: [string, string | number][] = [
    ["Generado", new Date().toISOString()],
    [ADMIN.metrics.serialDbStatus, STATUS_LABELS.serialDatabase[m.serialDatabaseStatus]],
    [K.affectedSerials, m.affectedSerialsLoaded],
    [K.totalLookups, m.totalLookups],
    [K.affectedLookups, m.affectedLookups],
    [K.totalCases, m.totalCases],
    [K.affectedCases, m.affectedCases],
    [K.contacted, m.customersContacted],
    [K.framesAssigned, m.framesAssigned],
    [K.replaced, m.replacementsCompleted],
    [K.open, m.openCases],
    [K.closed, m.closedCases],
    [K.accident, m.accidentCases],
    [K.damage, m.damageCases],
    [K.completionRate, m.completionRate === null ? "" : `${(m.completionRate * 100).toFixed(1)} %`],
  ];
  for (const s of m.casesByStatus) rows.push([`Casos — ${STATUS_LABELS.caseStatus[s.status]}`, s.count]);

  await logAudit({ type: "EXPORT_CSV", actor: auth.identity.actor, payload: { export: "resumen" } });

  const csv = "﻿" + ["Indicador;Valor", ...rows.map(([k, v]) => `${cell(k)}${SEP}${cell(v)}`)].join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resumen-recall-collosus-dh-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
