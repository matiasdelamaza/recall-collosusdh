import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/config";
import { sendAffectedReminders } from "@/lib/recall/affected-reminders";
import { sendWeeklyFollowUps } from "@/lib/recall/follow-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Envíos espaciados para no superar el límite del proveedor de correo. */
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function safeEqual(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Vercel Cron (vercel.json, una vez al día): recordatorio a quien dejó su correo con una serie
 * afectada hace más de 24 h y no registró caso, y novedad semanal a los casos afectados en curso
 * sin correo de seguimiento hace 7 días. Vercel envía "Authorization: Bearer $CRON_SECRET".
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
  const reminders = await sendAffectedReminders();
  console.log("[cron] recordatorios a consultas afectadas sin registro:", reminders);
  const weekly = await sendWeeklyFollowUps();
  console.log("[cron] novedades semanales a casos afectados:", weekly);
  return NextResponse.json({ ok: true, ...reminders, weekly }, { headers: NO_STORE });
}
