import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { getEnv } from "@/lib/config";
import { fetchReceivedEmail } from "@/lib/email/inbound";
import { ingestInbound } from "@/lib/recall/inbox";
import { applyDeliveryEvent, isDeliveryEvent } from "@/lib/recall/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** El análisis de prioridad con IA puede tardar unos segundos. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface WebhookEvent {
  type: string;
  created_at: string;
  data: { email_id?: string; bounce?: { message?: string; type?: string }; failed?: { reason?: string }; suppressed?: { message?: string } };
}

/**
 * Webhook de Resend (mesa de control): correos recibidos en la casilla (email.received) y estados
 * de entrega de los correos enviados (email.delivered, email.bounced, email.opened…).
 * Firma verificada con RESEND_WEBHOOK_SECRET; ante un error se responde 500 para que Resend reintente.
 */
export async function POST(req: NextRequest) {
  const env = getEnv();
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] RESEND_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 503, headers: NO_STORE });
  }
  const payload = await req.text();
  let event: WebhookEvent;
  try {
    event = new Resend(env.RESEND_API_KEY ?? "re_sin_clave").webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? "",
      },
      webhookSecret: secret,
    }) as unknown as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 401, headers: NO_STORE });
  }

  const emailId = event.data?.email_id;
  if (!emailId) return NextResponse.json({ ok: true, ignored: event.type }, { headers: NO_STORE });
  try {
    if (event.type === "email.received") {
      const result = await ingestInbound(await fetchReceivedEmail(emailId));
      return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
    }
    if (isDeliveryEvent(event.type)) {
      const d = event.data;
      const detail = d.bounce ? [d.bounce.type, d.bounce.message].filter(Boolean).join(": ") : (d.failed?.reason ?? d.suppressed?.message);
      const found = await applyDeliveryEvent(event.type, emailId, new Date(event.created_at), detail);
      return NextResponse.json({ ok: true, found }, { headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, ignored: event.type }, { headers: NO_STORE });
  } catch (err) {
    console.error(`[webhook] fallo al procesar ${event.type} ${emailId}:`, err);
    return NextResponse.json({ ok: false, error: "PROCESSING_FAILED" }, { status: 500, headers: NO_STORE });
  }
}
