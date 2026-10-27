import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { RATE_LIMITS } from "@/lib/config";
import { AFFECTED_GATE, FORM_VALIDATION, RESULT_ERROR } from "@/lib/copy/es";
import { saveAffectedContact } from "@/lib/recall/lookups";
import { sendAffectedContactNotification } from "@/lib/recall/notifications";
import { logAudit } from "@/lib/server/audit";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getClientIp, hashIp } from "@/lib/server/request";
import type { AffectedContactResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const INVALID_REQUEST_MESSAGE = "Solicitud inválida. Vuelve a verificar el número de serie.";

const bodySchema = z.object({
  lookupId: z.uuid(),
  email: z.string().trim().max(254).pipe(z.email()).transform((v) => v.toLowerCase()),
});

function json(body: AffectedContactResponse, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * Correo que se pide antes de mostrar el resultado de una serie afectada.
 * Queda en la consulta (serial_lookups) aunque la persona no complete el registro, y avisa a Postventa.
 */
export async function POST(req: NextRequest) {
  const ipHash = hashIp(getClientIp(req));

  const rl = await checkRateLimit("verificar-correo", ipHash, RATE_LIMITS.affectedContact);
  if (!rl.allowed) {
    return json({ ok: false, error: "RATE_LIMITED", message: AFFECTED_GATE.rateLimited }, 429, { "Retry-After": String(rl.retryAfterSeconds) });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
    raw = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((i) => i.path[0] === "email");
    return emailIssue
      ? json({ ok: false, error: "VALIDATION", message: FORM_VALIDATION.email }, 422)
      : json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }

  try {
    const saved = await saveAffectedContact(parsed.data.lookupId, parsed.data.email, ipHash);
    if (saved.kind === "NOT_FOUND") return json({ ok: false, error: "NOT_FOUND", message: INVALID_REQUEST_MESSAGE }, 404);
    await logAudit({ type: "AFFECTED_CONTACT_SAVED", payload: { lookupId: parsed.data.lookupId, serial: saved.lookup.serial, outreachRef: saved.lookup.outreachRef, first: saved.first } });
    if (saved.first) {
      await sendAffectedContactNotification({ serial: saved.lookup.serial, email: parsed.data.email, outreachRef: saved.lookup.outreachRef, createdAt: saved.lookup.createdAt });
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[api/verificar/correo] error", err);
    return json({ ok: false, error: "SERVER_ERROR", message: RESULT_ERROR.body }, 500);
  }
}

function methodNotAllowed() {
  return NextResponse.json({ ok: false, error: "INVALID_REQUEST", message: "Método no permitido." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
