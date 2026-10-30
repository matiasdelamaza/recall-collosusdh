import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { CASE_EXPORT_HEADERS, caseExportValues } from "@/lib/recall/case-export";
import { listAllCasesForExport, parseCaseFilters } from "@/lib/recall/cases";
import { logAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEP = ";";

/**
 * Escapa un valor para CSV; neutraliza fórmulas (=, +, -, @) para hojas de cálculo
 * anteponiendo un espacio (invisible en la celda; el apóstrofo clásico se muestra en Excel/LibreOffice).
 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = ` ${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseCaseFilters(params);
  const rows = await listAllCasesForExport(filters);

  const lines: string[] = [CASE_EXPORT_HEADERS.map(cell).join(SEP)];
  for (const r of rows) lines.push(caseExportValues(r).map(cell).join(SEP));

  await logAudit({ type: "EXPORT_CSV", actor: auth.identity.actor, payload: { export: "casos", rows: rows.length, filters } });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="casos-recall-collosus-dh-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
