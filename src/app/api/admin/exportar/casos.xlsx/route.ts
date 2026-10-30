import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { CASE_EXPORT_HEADERS, caseExportValues } from "@/lib/recall/case-export";
import { listAllCasesForExport, parseCaseFilters } from "@/lib/recall/cases";
import { logAudit } from "@/lib/server/audit";
import { buildXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Misma exportación que casos.csv, como planilla Excel (fechas en hora de Chile). */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseCaseFilters(params);
  const rows = await listAllCasesForExport(filters);
  const file = buildXlsx({ sheetName: "Casos", headers: CASE_EXPORT_HEADERS, rows: rows.map(caseExportValues) });

  await logAudit({ type: "EXPORT_CSV", actor: auth.identity.actor, payload: { export: "casos", format: "xlsx", rows: rows.length, filters } });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="casos-recall-collosus-dh-${stamp}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
