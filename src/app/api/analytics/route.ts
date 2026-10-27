import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { RATE_LIMITS, getEnv } from "@/lib/config";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getClientIp, hashIp } from "@/lib/server/request";
import { ANALYTICS_EVENTS, type AnalyticsEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Analítica interna sin PII: solo se persiste el nombre del evento (lista cerrada) y la fecha.
 * Cualquier otro dato del cuerpo se descarta.
 */
export async function POST(req: NextRequest) {
  const ipHash = hashIp(getClientIp(req));
  const rl = await checkRateLimit("analytics", ipHash, RATE_LIMITS.analytics);
  if (!rl.allowed) return new NextResponse(null, { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } });

  let name: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 400, headers: NO_STORE });
    name = (JSON.parse(text) as { name?: unknown })?.name;
  } catch {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }
  if (typeof name !== "string" || !(ANALYTICS_EVENTS as readonly string[]).includes(name)) {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  if (getEnv().ANALYTICS_PROVIDER === "none") return new NextResponse(null, { status: 204, headers: NO_STORE });

  try {
    const db = await getDb();
    await db.insert(analyticsEvents).values({ name: name as AnalyticsEvent });
  } catch (err) {
    console.error("[api/analytics] no se pudo guardar el evento", err);
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

function methodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
