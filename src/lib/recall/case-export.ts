/**
 * Columnas de la exportación de casos, compartidas por el CSV y el Excel para que siempre coincidan.
 */
import type { RecallCase } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/copy/es";
import { formatRut } from "@/lib/rut";
import type { XlsxCell } from "@/lib/xlsx";

export const CASE_EXPORT_HEADERS = [
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
  "Código de enlace",
  "Resultado notificado",
  "Cerrado",
];

/** Valores de un caso en el orden de CASE_EXPORT_HEADERS; las fechas quedan como Date. */
export function caseExportValues(r: RecallCase): XlsxCell[] {
  return [
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
    r.outreachRef,
    r.resultNotifiedAt,
    r.closedAt,
  ];
}
