/**
 * Registro de un caso de recall (lógica de negocio, sin HTTP).
 */
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  BIKE_MODELS,
  BIKE_SIZES,
  REQUEST_TYPES,
  TRI_STATE,
  caseFiles,
  recallCases,
  type CaseStatus,
  type RecallCase,
  type RequestType,
} from "@/db/schema";
import { MAX_ACTIVE_CASES_PER_SERIAL } from "@/lib/config";
import { FORM_VALIDATION, SERIAL_VALIDATION } from "@/lib/copy/es";
import { generateCaseId } from "@/lib/case-id";
import { CHILE_REGIONS } from "@/lib/regions";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { normalizeSerial } from "@/lib/serial";
import { logAudit } from "@/lib/server/audit";
import { buildStorageKey, type ValidatedUpload } from "@/lib/server/uploads";
import { getStorage } from "@/lib/storage";
import { requestTypeForState } from "@/lib/types";
import { decideDuplicate, findActiveCasesBySerial } from "./duplicates";
import { sendNewCaseNotifications } from "./notifications";
import { verifySerial } from "./verify";

// ── Validación de campos ───────────────────────────────────────────────

/** Elimina etiquetas HTML y caracteres de control; colapsa espacios. */
function clean(max: number) {
  return z
    .string()
    .transform((s) =>
      (s ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, max),
    );
}

const onFlag = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const registrationSchema = z.object({
  serial: z.string().max(80, SERIAL_VALIDATION.TOO_LONG),
  requestType: z.enum(REQUEST_TYPES).optional(),
  customerName: clean(120).pipe(z.string().min(3, FORM_VALIDATION.customerName)),
  rut: z.string().refine((v) => isValidRut(v), FORM_VALIDATION.rut).transform(normalizeRut),
  email: clean(254).pipe(z.email(FORM_VALIDATION.email)).transform((v) => v.toLowerCase()),
  phone: clean(30).pipe(z.string().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, FORM_VALIDATION.phone)),
  region: z.enum(CHILE_REGIONS, { error: FORM_VALIDATION.region }),
  city: clean(80).pipe(z.string().min(2, FORM_VALIDATION.city)),
  model: z.enum(BIKE_MODELS, { error: FORM_VALIDATION.model }),
  size: z.enum(BIKE_SIZES, { error: FORM_VALIDATION.size }),
  dealer: clean(120).optional(),
  purchaseDate: clean(60).optional(),
  damageReported: z.enum(TRI_STATE, { error: FORM_VALIDATION.damageReported }),
  /** Ya no se pregunta en el formulario público (27-10-2026); se acepta si llega y por defecto es "NO". */
  accidentReported: z.enum(["YES", "NO"], { error: FORM_VALIDATION.accidentReported }).optional(),
  incidentDescription: clean(2000).optional(),
  acknowledgeStopRiding: onFlag.refine((v) => v, FORM_VALIDATION.acknowledge),
  acceptPrivacy: onFlag.refine((v) => v, FORM_VALIDATION.privacy),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export type FieldErrors = Record<string, string>;

/** Valida los campos de texto. Devuelve datos limpios o errores por campo (español). */
export function validateRegistrationFields(raw: Record<string, unknown>): { ok: true; data: RegistrationInput } | { ok: false; fields: FieldErrors } {
  const parsed = registrationSchema.safeParse(raw);
  const fields: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issueMessage(key, issue.message);
    }
    return { ok: false, fields };
  }
  const data = parsed.data;
  if (data.accidentReported === "YES" && !data.incidentDescription) {
    fields.incidentDescription = FORM_VALIDATION.incidentDescription;
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, data };
}

/** Sustituye mensajes genéricos de zod por los mensajes en español del campo. */
function issueMessage(key: string, message: string): string {
  const known = FORM_VALIDATION as Record<string, string>;
  if (message && /[áéíóúñ¿¡]|^(Ingresa|Selecciona|Indica|Debes|Adjunta|Este)/.test(message)) return message;
  return known[key] ?? FORM_VALIDATION.required;
}

// ── Registro ───────────────────────────────────────────────────────────

export interface RegisterContext {
  serialRaw: string;
  ipHash: string | null;
  userAgent: string | null;
}

export type RegisterOutcome =
  | { kind: "CREATED"; case: RecallCase }
  | { kind: "EXISTING"; case: RecallCase }
  | { kind: "DUPLICATE_LIMIT" }
  | { kind: "SERIAL_INVALID"; message: string };

/**
 * Crea (o reutiliza) un caso. La verificación de la serie se ejecuta SIEMPRE en el servidor;
 * el `requestType` enviado por el cliente se ignora si no coincide con el resultado real.
 */
export async function registerCase(input: RegistrationInput, uploads: ValidatedUpload[], ctx: RegisterContext): Promise<RegisterOutcome> {
  const verification = await verifySerial(input.serial);
  let serial: string;
  let requestType: RequestType;
  if (verification.state === "UNVERIFIED") {
    // Serie ilegible, parcial o con formato desconocido (brief §10, estado C): se acepta
    // SOLO como solicitud de revisión manual, nunca como unidad afectada.
    const partial = normalizeSerial(input.serial).replace(/[^A-Z0-9-]/g, "").slice(0, 64);
    if (!partial) return { kind: "SERIAL_INVALID", message: SERIAL_VALIDATION.EMPTY };
    serial = partial;
    requestType = "MANUAL_REVIEW";
  } else if (verification.state === "REINFORCED") {
    // No afectada (OK de Polygon): solo se registra si el cliente ve daño en el cuadro (27-10-2026, pedido de Cross Mountain).
    // Va a revisión manual de Postventa, nunca como reemplazo.
    serial = verification.serial;
    requestType = "MANUAL_REVIEW";
  } else {
    serial = verification.serial;
    requestType = requestTypeForState(verification.state);
  }

  const db = await getDb();
  const active = await findActiveCasesBySerial(db, serial);
  const decision = decideDuplicate(active, { email: input.email, rut: input.rut }, MAX_ACTIVE_CASES_PER_SERIAL);

  if (decision.kind === "EXISTING") {
    await logAudit({
      type: "CASE_DUPLICATE_DETECTED",
      caseId: decision.existing.id,
      payload: { caseId: decision.existing.caseId, outcome: "EXISTING", ipHash: ctx.ipHash },
    });
    return { kind: "EXISTING", case: decision.existing };
  }
  if (decision.kind === "LIMIT_REACHED") {
    await logAudit({
      type: "CASE_DUPLICATE_DETECTED",
      payload: { serial, outcome: "LIMIT_REACHED", activeCount: decision.activeCount, ipHash: ctx.ipHash },
    });
    return { kind: "DUPLICATE_LIMIT" };
  }

  const flaggedDuplicate = decision.kind === "FLAG_DUPLICATE";
  const caseStatus: CaseStatus = flaggedDuplicate ? "DUPLICATE_CASE" : requestType === "MANUAL_REVIEW" ? "MANUAL_REVIEW" : "REGISTERED";
  // Serie no afectada que llega por la vía de daño visible: alta prioridad para que Postventa la vea primero.
  const priority = input.accidentReported === "YES" || verification.state === "REINFORCED" ? "HIGH" : "NORMAL";

  const storage = getStorage();
  const caseUuid = crypto.randomUUID();
  const storedKeys: string[] = [];

  // Subida de archivos (ya validados) antes de confirmar la transacción.
  const fileRows = [] as { kind: ValidatedUpload["kind"]; storageKey: string; originalName: string; mimeType: string; sizeBytes: number }[];
  try {
    for (const up of uploads) {
      const key = buildStorageKey(caseUuid, up.kind, up.extension);
      await storage.put(key, up.data, up.mimeType);
      storedKeys.push(key);
      fileRows.push({ kind: up.kind, storageKey: key, originalName: up.originalName, mimeType: up.mimeType, sizeBytes: up.size });
    }
  } catch (err) {
    await cleanupFiles(storedKeys);
    throw err;
  }

  let created: RecallCase;
  try {
    created = await db.transaction(async (tx) => {
      let row: RecallCase | undefined;
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const caseId = generateCaseId();
        const clash = await tx.select({ id: recallCases.id }).from(recallCases).where(eq(recallCases.caseId, caseId)).limit(1);
        if (clash.length > 0) continue;
        const inserted = await tx
          .insert(recallCases)
          .values({
            id: caseUuid,
            caseId,
            customerName: input.customerName,
            rut: input.rut,
            email: input.email,
            phone: input.phone,
            region: input.region,
            city: input.city,
            serialNumber: serial,
            serialRaw: ctx.serialRaw.slice(0, 80),
            model: input.model,
            size: input.size,
            dealer: input.dealer || null,
            purchaseDate: input.purchaseDate || null,
            serialVerificationStatus: verification.state,
            requestType,
            priority,
            caseStatus,
            damageReported: input.damageReported,
            accidentReported: input.accidentReported === "YES",
            incidentDescription: input.accidentReported === "YES" ? input.incidentDescription || null : null,
            acknowledgedStopRiding: true,
            source: "WEB",
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
          })
          .returning();
        row = inserted[0];
      }
      if (!row) throw new Error("No se pudo generar un número de caso único");
      if (fileRows.length > 0) {
        await tx.insert(caseFiles).values(fileRows.map((f) => ({ ...f, caseId: row!.id })));
      }
      return row;
    });
  } catch (err) {
    await cleanupFiles(storedKeys);
    throw err;
  }

  await logAudit({
    type: "CASE_CREATED",
    caseId: created.id,
    payload: {
      caseId: created.caseId,
      requestType,
      verification: verification.state,
      caseStatus,
      priority,
      flaggedDuplicate,
      activeCasesForSerial: active.length,
      files: fileRows.length,
      ipHash: ctx.ipHash,
    },
  });

  // Notificaciones: fuera de la transacción; nunca hacen fallar el registro.
  await sendNewCaseNotifications(created);

  return { kind: "CREATED", case: created };
}

async function cleanupFiles(keys: string[]): Promise<void> {
  const storage = getStorage();
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (err) {
      console.error("[register] no se pudo eliminar archivo huérfano", key, err);
    }
  }
}
