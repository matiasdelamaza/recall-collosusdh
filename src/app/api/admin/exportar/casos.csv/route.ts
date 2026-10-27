import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { listAllCasesForExport, parseCaseFilters } from "@/lib/recall/cases";
import { logAudit } from "@/lib/server/audit";
import { STATUS_LABELS } from "@/lib/copy/es";
import { formatRut } from "@/lib/rut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEP = ";";

/** Escapa un valor para CSV; neutraliza fórmulas (=, +, -, @) para hojas de cálculo. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADERS = [
  "N° caso",
  "Fecha registro",
  "Última actualización",
  "Estado",
  "Prioridad",
  "Tipo de solicitud",
  "Verificación de serie",
  "Nombre",
  "RUT",
  "Correo",
  "Teléfono",
  "Región",
  "Ciudad",
  "Número de serie",
  "Serie ingresada",
  "Modelo",
  "Talla",
  "Lugar de compra",
  "Fecha aprox. compra",
  "Daño reportado",
  "Accidente reportado",
  "Descripción incidente",
  "Confirmó no utilizar",
  "Serie cuadro reemplazo",
  "Versión cuadro reemplazo",
  "Asignado a",
  "Origen",
  "Resultado notificado",
  "Cerrado",
];

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseCaseFilters(params);
  const rows = await listAllCasesForExport(filters);

  const lines: string[] = [HEADERS.map(cell).join(SEP)];
  for (const r of rows) {
    lines.push(
      [
        r.caseId,
        r.createdAt,
        r.updatedAt,
        STATUS_LABELS.caseStatus[r.caseStatus],
        STATUS_LABELS.priority[r.priority],
        STATUS_LABELS.requestType[r.requestType],
        STATUS_LABELS.verification[r.serialVerificationStatus],
        r.customerName,
        formatRut(r.rut),
        r.email,
        r.phone,
        r.region,
        r.city,
        r.serialNumber,
        r.serialRaw,
        STATUS_LABELS.model[r.model],
        STATUS_LABELS.size[r.size],
        r.dealer,
        r.purchaseDate,
        STATUS_LABELS.tri[r.damageReported],
        r.accidentReported ? "Sí" : "No",
        r.incidentDescription,
        r.acknowledgedStopRiding ? "Sí" : "No",
        r.replacementFrameSerial,
        r.replacementFrameVersion,
        r.assignedTo,
        r.source,
        r.resultNotifiedAt,
        r.closedAt,
      ]
        .map(cell)
        .join(SEP),
    );
  }

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
