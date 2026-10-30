import { STATUS_LABELS } from "@/lib/copy/es";
import { formatRut } from "@/lib/rut";
import type { CaseStatus, Priority, RequestType, SerialVerificationStatus, TriState, BikeModel, BikeSize, FileKind } from "@/db/schema";

const dateTimeFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });
const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" });
const numberFmt = new Intl.NumberFormat("es-CL");

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFmt.format(date);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFmt.format(date);
}

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone: "America/Santiago" });
const timeFmt = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" });
const dayMonthFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" });
const shortDateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeZone: "America/Santiago" });

/** Fecha corta de bandeja: hora si es de hoy, día y mes si es de este año, fecha completa si no. */
export function fmtInboxDate(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = dayKeyFmt.format(date);
  const today = dayKeyFmt.format(now);
  if (day === today) return timeFmt.format(date);
  if (day.slice(0, 4) === today.slice(0, 4)) return dayMonthFmt.format(date).replace(".", "");
  return shortDateFmt.format(date);
}

export function fmtNumber(n: number): string {
  return numberFmt.format(n);
}

export function fmtPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
}

export function fmtRut(rut: string): string {
  return formatRut(rut);
}

export const labelStatus = (s: CaseStatus) => STATUS_LABELS.caseStatus[s] ?? s;
export const labelVerification = (s: SerialVerificationStatus) => STATUS_LABELS.verification[s] ?? s;
export const labelRequestType = (s: RequestType) => STATUS_LABELS.requestType[s] ?? s;
export const labelPriority = (s: Priority) => STATUS_LABELS.priority[s] ?? s;
export const labelModel = (s: BikeModel) => STATUS_LABELS.model[s] ?? s;
export const labelSize = (s: BikeSize) => STATUS_LABELS.size[s] ?? s;
export const labelTri = (s: TriState) => STATUS_LABELS.tri[s] ?? s;
export const labelFileKind = (s: FileKind) => STATUS_LABELS.fileKind[s] ?? s;
export const labelYesNo = (b: boolean) => (b ? "Sí" : "No");

/** Etiquetas en español para tipos de evento de auditoría. */
export const AUDIT_TYPE_LABELS: Record<string, string> = {
  CASE_CREATED: "Caso creado",
  CASE_DUPLICATE_DETECTED: "Duplicado detectado",
  STATUS_CHANGED: "Cambio de estado",
  CASE_ASSIGNED: "Asignación",
  NOTE_ADDED: "Nota agregada",
  REPLACEMENT_FRAME_SET: "Cuadro de reemplazo registrado",
  EMAIL_SENT: "Correo enviado",
  EMAIL_FAILED: "Fallo de correo",
  SERIALS_IMPORTED: "Importación de series",
  SERIAL_DATABASE_STATUS_CHANGED: "Cambio de estado de la base",
  CASES_REPROCESSED: "Reproceso de casos",
  ADMIN_LOGIN: "Inicio de sesión",
  ADMIN_LOGIN_FAILED: "Intento de inicio de sesión fallido",
  ADMIN_LOGOUT: "Cierre de sesión",
  FILE_VIEWED: "Archivo visualizado",
  EXPORT_CSV: "Exportación CSV",
  LOOKUP_SUSPICIOUS: "Actividad sospechosa de consultas",
  AFFECTED_CONTACT_SAVED: "Correo dejado en serie afectada",
  AFFECTED_REMINDERS_SENT: "Recordatorios a consultas sin registro",
  FOLLOW_UPS_SENT: "Novedades semanales a casos",
  BROADCAST_SENT: "Comunicado a afectados",
  EMAIL_RECEIVED: "Correo recibido",
  EMAIL_BOUNCED: "Correo no entregado",
  EMAIL_LINKED: "Correo asociado al caso",
  CUSTOMER_CALLED: "Llamada al cliente",
  MESSAGE_HANDLED: "Correo marcado como atendido",
  AI_KNOWLEDGE_CHANGED: "Entrenamiento de la IA modificado",
};

export function labelAuditType(t: string): string {
  return AUDIT_TYPE_LABELS[t] ?? t;
}

/** Resumen legible de un payload de auditoría (sin exponer datos sensibles innecesarios). */
export function summarizeAuditPayload(type: string, payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "";
  if (type === "STATUS_CHANGED" && typeof payload.from === "string" && typeof payload.to === "string") {
    return `${labelStatus(payload.from as CaseStatus)} → ${labelStatus(payload.to as CaseStatus)}`;
  }
  if (type === "CASE_ASSIGNED") return `${(payload.from as string | null) ?? "—"} → ${(payload.to as string | null) ?? "—"}`;
  if (type === "REPLACEMENT_FRAME_SET") return `${(payload.replacementFrameSerial as string | null) ?? "—"} · ${(payload.replacementFrameVersion as string | null) ?? "—"}`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === "ipHash" || k === "userAgent") continue;
    if (v === null || v === undefined) continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}: ${s.slice(0, 80)}`);
    if (parts.length >= 5) break;
  }
  return parts.join(" · ");
}
