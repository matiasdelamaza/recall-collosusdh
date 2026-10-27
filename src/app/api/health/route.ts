import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEnv, getInternalNotificationEmails, RATE_LIMITS } from "@/lib/config";
import { getEmailProvider } from "@/lib/email";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getClientIp, hashIp } from "@/lib/server/request";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Endpoint técnico de salud (sin datos sensibles).
 *   GET /api/health            → estado de la base de datos
 *   GET /api/health?storage=1  → además, prueba de escritura/lectura/borrado en el almacenamiento (limitada por IP)
 *   GET /api/health?email=1    → además, envía un correo de prueba solo a INTERNAL_NOTIFICATION_EMAILS (límite global)
 */
export async function GET(req: NextRequest) {
  const body: {
    ok: boolean;
    db: "ok" | "error";
    storage?: { provider: string; ok: boolean; error?: string };
    email?: { provider: string; ok: boolean; recipients: number; error?: string };
  } = { ok: true, db: "ok" };
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
  } catch {
    body.ok = false;
    body.db = "error";
  }

  if (req.nextUrl.searchParams.get("storage") === "1") {
    const rl = await checkRateLimit("health-storage", hashIp(getClientIp(req)), RATE_LIMITS.analytics);
    if (!rl.allowed) {
      return NextResponse.json({ ...body, storage: { provider: getEnv().STORAGE_PROVIDER, ok: false, error: "rate_limited" } }, { status: 429, headers: NO_STORE });
    }
    const provider = getEnv().STORAGE_PROVIDER;
    const key = `health/${crypto.randomUUID()}.txt`;
    try {
      const storage = getStorage();
      const payload = new TextEncoder().encode("ok");
      await storage.put(key, payload, "text/plain");
      const back = await storage.get(key);
      await storage.delete(key);
      const ok = !!back && new TextDecoder().decode(back.data) === "ok";
      body.storage = { provider, ok };
      if (!ok) body.ok = false;
    } catch (err) {
      body.ok = false;
      body.storage = { provider, ok: false, error: err instanceof Error ? err.message.slice(0, 160) : "error" };
    }
  }

  if (req.nextUrl.searchParams.get("email") === "1") {
    const provider = getEnv().EMAIL_PROVIDER;
    const to = getInternalNotificationEmails();
    const rl = await checkRateLimit("health-email", "global", RATE_LIMITS.healthEmail);
    if (!rl.allowed) {
      return NextResponse.json({ ...body, email: { provider, ok: false, recipients: to.length, error: "rate_limited" } }, { status: 429, headers: NO_STORE });
    }
    if (to.length === 0) {
      body.ok = false;
      body.email = { provider, ok: false, recipients: 0, error: "sin_destinatarios" };
    } else {
      try {
        const text = "Correo de prueba del portal de la campaña de seguridad Polygon Collosus DH. Si lo recibes, el envío de correos funciona. No requiere ninguna acción.";
        const res = await getEmailProvider().send({ to, subject: "Prueba de correo · Aviso de suspensión de uso Polygon Collosus DH", text, html: `<p>${text}</p>` });
        body.email = { provider: res.provider, ok: res.ok, recipients: to.length, ...(res.ok ? {} : { error: (res.error ?? "error").slice(0, 160) }) };
        if (!res.ok) body.ok = false;
      } catch (err) {
        body.ok = false;
        body.email = { provider, ok: false, recipients: to.length, error: err instanceof Error ? err.message.slice(0, 160) : "error" };
      }
    }
  }

  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: NO_STORE });
}
