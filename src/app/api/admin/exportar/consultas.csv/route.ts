import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { listAllLookupsForExport, parseLookupFilters } from "@/lib/recall/lookups";
import { logAudit } from "@/lib/server/audit";
import { STATUS_LABELS } from "@/lib/copy/es";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEP = ";";

/** Igual que en casos.csv: escapa y neutraliza fórmulas (=, +, -, @). */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = ` ${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADERS = ["Fecha", "Serie ingresada", "Resultado", "Correo", "Código de enlace", "Conexión", "Caso registrado"];

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseLookupFilters(params);
  const rows = await listAllLookupsForExport(filters);

  const lines: string[] = [HEADERS.map(cell).join(SEP)];
  for (const r of rows) {
    lines.push([r.createdAt, r.serialNormalized, STATUS_LABELS.lookupResult[r.result], r.contactEmail, r.outreachRef, r.connection, r.caseId].map(cell).join(SEP));
  }

  await logAudit({ type: "EXPORT_CSV", actor: auth.identity.actor, payload: { export: "consultas", rows: rows.length, filters } });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consultas-recall-collosus-dh-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
