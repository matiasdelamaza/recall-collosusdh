import { createHash, timingSafeEqual } from "node:crypto";
import { desc, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { ACTIVE_CASE_STATUSES, recallCases } from "@/db/schema";
import { getEnv, RATE_LIMITS } from "@/lib/config";
import { STATUS_LABELS } from "@/lib/copy/es";
import { verifySerial } from "@/lib/recall/verify";
import { validateSerial } from "@/lib/serial";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function safeEqual(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * Consulta de una serie para el agente de MABA (chat del sitio). Responde lo mismo que la
 * verificación pública y, si la serie ya tiene caso, solo su etapa: nunca datos del cliente
 * ni el identificador del caso. Autenticación: "Authorization: Bearer $MABA_API_KEY".
 */
export async function POST(req: NextRequest) {
  const key = getEnv().MABA_API_KEY;
  if (!key) return json({ ok: false, error: "NOT_CONFIGURED" }, 503);
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${key}`)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const rl = await checkRateLimit("maba", "maba", RATE_LIMITS.mabaLookup);
  if (!rl.allowed) {
    return json({ ok: false, error: "RATE_LIMITED", retryAfterSeconds: rl.retryAfterSeconds }, 429, {
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }

  let payload: { serial?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: "INVALID_REQUEST" }, 400);
    payload = JSON.parse(text) as typeof payload;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }
  if (!payload || typeof payload !== "object" || typeof payload.serial !== "string") {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }
  const serialInput = payload.serial.slice(0, 80);

  const outcome = await verifySerial(serialInput);
  if (outcome.state === "UNVERIFIED") return json({ ok: true, ...outcome, case: null });

  // El caso puede guardar la serie tal como la escribió el cliente o la de la lista de Polygon.
  const typed = validateSerial(serialInput);
  const serials = [...new Set([outcome.serial, typed.valid ? typed.serial : outcome.serial])];
  const db = await getDb();
  const [latest] = await db
    .select({ status: recallCases.caseStatus, createdAt: recallCases.createdAt, updatedAt: recallCases.updatedAt })
    .from(recallCases)
    .where(inArray(recallCases.serialNumber, serials))
    .orderBy(desc(recallCases.createdAt))
    .limit(1);

  return json({
    ok: true,
    ...outcome,
    case: latest
      ? {
          status: latest.status,
          statusLabel: STATUS_LABELS.caseStatus[latest.status],
          active: ACTIVE_CASE_STATUSES.includes(latest.status),
          openedAt: latest.createdAt.toISOString(),
          updatedAt: latest.updatedAt.toISOString(),
        }
      : null,
  });
}
