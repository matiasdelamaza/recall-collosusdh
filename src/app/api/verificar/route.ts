import { NextResponse, type NextRequest } from "next/server";
import { RATE_LIMITS } from "@/lib/config";
import { RESULT_ERROR, RESULT_RATE_LIMITED } from "@/lib/copy/es";
import { countRecentMisses, recordLookup } from "@/lib/recall/lookups";
import { verifySerial } from "@/lib/recall/verify";
import { logAudit } from "@/lib/server/audit";
import { checkRateLimit, peekRateLimit } from "@/lib/server/rate-limit";
import { getClientIp, getUserAgent, hashIp } from "@/lib/server/request";
import { isTurnstileConfigured, verifyTurnstileToken } from "@/lib/server/turnstile";
import type { VerifyResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: VerifyResponse, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

const INVALID_REQUEST_MESSAGE = "Solicitud inválida. Ingresa el número de serie e inténtalo nuevamente.";
const TURNSTILE_REQUIRED_MESSAGE = "Por seguridad, completa la verificación adicional para continuar.";
const TURNSTILE_FAILED_MESSAGE = "No pudimos validar la verificación adicional. Inténtalo nuevamente.";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const userAgent = getUserAgent(req);

  // 1) Límite de tasa general por IP.
  const rl = await checkRateLimit("verificar", ipHash, RATE_LIMITS.serialLookup);
  if (!rl.allowed) {
    void recordLookup({ serialNormalized: "", result: "RATE_LIMITED", ipHash, userAgent });
    return json(
      { ok: false, error: "RATE_LIMITED", message: RESULT_RATE_LIMITED.body, retryAfterSeconds: rl.retryAfterSeconds },
      429,
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  // 2) Cuerpo JSON acotado.
  let payload: { serial?: unknown; turnstileToken?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
    payload = JSON.parse(text) as typeof payload;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }
  if (!payload || typeof payload !== "object" || typeof payload.serial !== "string") {
    return json({ ok: false, error: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE }, 400);
  }
  const serialInput = payload.serial.slice(0, 80);
  const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";

  try {
    // 3) Anti-enumeración: muchas consultas sin coincidencia desde la misma IP.
    const misses = await countRecentMisses(ipHash, RATE_LIMITS.serialLookup.windowMs);
    if (misses >= RATE_LIMITS.serialLookupSuspiciousThreshold) {
      if (await peekRateLimit("verificar-suspicious-audit", ipHash, RATE_LIMITS.serialLookup) === 0) {
        await checkRateLimit("verificar-suspicious-audit", ipHash, RATE_LIMITS.serialLookup);
        await logAudit({ type: "LOOKUP_SUSPICIOUS", payload: { ipHash, misses, userAgent } });
      }
      if (isTurnstileConfigured()) {
        if (!turnstileToken) return json({ ok: false, error: "TURNSTILE_REQUIRED", message: TURNSTILE_REQUIRED_MESSAGE }, 403);
        const valid = await verifyTurnstileToken(turnstileToken, ip);
        if (!valid) return json({ ok: false, error: "TURNSTILE_FAILED", message: TURNSTILE_FAILED_MESSAGE }, 403);
      } else {
        void recordLookup({ serialNormalized: serialInput, result: "RATE_LIMITED", ipHash, userAgent });
        return json(
          { ok: false, error: "RATE_LIMITED", message: RESULT_RATE_LIMITED.body, retryAfterSeconds: Math.ceil(RATE_LIMITS.serialLookup.windowMs / 1000) },
          429,
          { "Retry-After": String(Math.ceil(RATE_LIMITS.serialLookup.windowMs / 1000)) },
        );
      }
    }

    // 4) Verificación server-side (coincidencia exacta; sin lista expuesta).
    const outcome = await verifySerial(serialInput);

    switch (outcome.state) {
      case "AFFECTED":
        await recordLookup({ serialNormalized: outcome.serial, result: "AFFECTED", ipHash, userAgent });
        return json({ ok: true, state: "AFFECTED", serial: outcome.serial, model: outcome.model, size: outcome.size });
      case "REINFORCED":
        await recordLookup({ serialNormalized: outcome.serial, result: "REINFORCED", ipHash, userAgent });
        return json({ ok: true, state: "REINFORCED", serial: outcome.serial, model: outcome.model, size: outcome.size });
      case "NOT_IDENTIFIED":
        await recordLookup({ serialNormalized: outcome.serial, result: "NOT_IDENTIFIED", ipHash, userAgent });
        return json({ ok: true, state: "NOT_IDENTIFIED", serial: outcome.serial });
      case "PENDING_DATABASE":
        await recordLookup({ serialNormalized: outcome.serial, result: "PENDING_DATABASE", ipHash, userAgent });
        return json({ ok: true, state: "PENDING_DATABASE", serial: outcome.serial });
      case "UNVERIFIED":
      default:
        await recordLookup({ serialNormalized: serialInput.trim().slice(0, 64), result: "INVALID", ipHash, userAgent });
        return json({ ok: true, state: "UNVERIFIED", serial: serialInput.trim().toUpperCase().slice(0, 64), reason: outcome.reason });
    }
  } catch (err) {
    console.error("[api/verificar] error", err);
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
