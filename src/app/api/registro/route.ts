import { NextResponse, type NextRequest } from "next/server";
import { RATE_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import { FORM_VALIDATION } from "@/lib/copy/es";
import { normalizeOutreachRef } from "@/lib/outreach-ref";
import { registerCase, validateRegistrationFields } from "@/lib/recall/register";
import { checkRateLimit, peekRateLimit } from "@/lib/server/rate-limit";
import { getClientIp, getUserAgent, hashIp } from "@/lib/server/request";
import { UploadValidationError, collectRegistrationUploads } from "@/lib/server/uploads";
import type { RegistrationResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const INVALID_REQUEST_MESSAGE = "Solicitud inválida. Vuelve a cargar la página e inténtalo nuevamente.";
/** Margen para cabeceras multipart y campos de texto. */
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

function json(body: RegistrationResponse, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

const TEXT_FIELDS = [
  "serial",
  "requestType",
  "customerName",
  "rut",
  "email",
  "phone",
  "region",
  "city",
  "model",
  "size",
  "dealer",
  "purchaseDate",
  "damageReported",
  "accidentReported",
  "incidentDescription",
  "acknowledgeStopRiding",
  "acceptPrivacy",
] as const;

export async function POST(req: NextRequest) {
  const ipHash = hashIp(getClientIp(req));
  const userAgent = getUserAgent(req);

  // El cupo por IP se consume solo cuando el formulario es válido (más abajo); aquí solo se consulta,
  // para que los errores de validación no agoten el límite de un usuario legítimo.
  if (await peekRateLimit("registro", ipHash, RATE_LIMITS.registration) >= RATE_LIMITS.registration.max) {
    const retry = String(Math.ceil(RATE_LIMITS.registration.windowMs / 1000));
    return json({ ok: false, error: "RATE_LIMITED", message: FORM_VALIDATION.rateLimited }, 429, { "Retry-After": retry });
  }

  // Tamaño declarado antes de parsear el cuerpo.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > UPLOAD_LIMITS.maxTotalBytes + MULTIPART_OVERHEAD_BYTES) {
    return json({ ok: false, error: "TOO_LARGE", message: FORM_VALIDATION.tooLarge }, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }

  // Honeypot: los humanos no lo ven; los bots lo rellenan. Respuesta genérica sin pistas.
  const honeypot = form.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }

  const raw: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    const v = form.get(f);
    if (typeof v === "string") raw[f] = v;
  }

  const fieldsResult = validateRegistrationFields(raw);
  const fieldErrors: Record<string, string> = fieldsResult.ok ? {} : { ...fieldsResult.fields };

  // Archivos: validar aunque haya errores de campos, para devolver todo junto.
  let uploads: Awaited<ReturnType<typeof collectRegistrationUploads>> = [];
  try {
    uploads = await collectRegistrationUploads(form);
  } catch (err) {
    if (err instanceof UploadValidationError) {
      fieldErrors[err.field] = err.message;
    } else {
      console.error("[api/registro] error al procesar archivos", err);
      return json({ ok: false, error: "SERVER_ERROR", message: FORM_VALIDATION.serverError }, 500);
    }
  }

  if (!fieldsResult.ok || Object.keys(fieldErrors).length > 0) {
    return json({ ok: false, error: "VALIDATION", message: FORM_VALIDATION.generic, fields: fieldErrors }, 422);
  }

  // Formulario válido: ahora sí se consume el cupo por IP.
  const rl = await checkRateLimit("registro", ipHash, RATE_LIMITS.registration);
  if (!rl.allowed) {
    return json({ ok: false, error: "RATE_LIMITED", message: FORM_VALIDATION.rateLimited }, 429, { "Retry-After": String(rl.retryAfterSeconds) });
  }

  try {
    const outcome = await registerCase(fieldsResult.data, uploads, {
      serialRaw: typeof raw.serial === "string" ? raw.serial : "",
      ipHash,
      userAgent,
      outreachRef: normalizeOutreachRef(form.get("ref")),
    });

    switch (outcome.kind) {
      case "SERIAL_INVALID":
        return json({ ok: false, error: "VALIDATION", message: FORM_VALIDATION.generic, fields: { serial: outcome.message } }, 422);
      case "DUPLICATE_LIMIT":
        return json({ ok: false, error: "DUPLICATE_LIMIT", message: FORM_VALIDATION.duplicateLimit }, 409);
      case "EXISTING":
        return json(
          {
            ok: true,
            outcome: "EXISTING",
            caseId: outcome.case.caseId,
            serial: outcome.case.serialNumber,
            verification: outcome.case.serialVerificationStatus,
            requestType: outcome.case.requestType,
          },
          200,
        );
      case "CREATED":
      default:
        return json(
          {
            ok: true,
            outcome: "CREATED",
            caseId: outcome.case.caseId,
            serial: outcome.case.serialNumber,
            verification: outcome.case.serialVerificationStatus,
            requestType: outcome.case.requestType,
          },
          201,
        );
    }
  } catch (err) {
    console.error("[api/registro] error", err);
    return json({ ok: false, error: "SERVER_ERROR", message: FORM_VALIDATION.serverError }, 500);
  }
}

function methodNotAllowed() {
  return NextResponse.json({ ok: false, error: "INVALID_REQUEST", message: "Método no permitido." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
