import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/config";
import { sendAffectedReminders } from "@/lib/recall/affected-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function safeEqual(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Vercel Cron (vercel.json, una vez al día): recordatorio a quien dejó su correo con una serie
 * afectada hace más de 24 h y no registró caso. Vercel envía "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET no configurado: no se envían recordatorios");
    return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 503, headers: NO_STORE });
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }
  const result = await sendAffectedReminders();
  console.log("[cron] recordatorios a consultas afectadas sin registro:", result);
  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
}
