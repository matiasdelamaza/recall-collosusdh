import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { fetchReceivedAttachmentUrl } from "@/lib/email/inbound";
import { getMessage } from "@/lib/recall/mailbox";
import { logAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Adjunto de un correo recibido: redirige al enlace temporal de descarga del proveedor. */
export async function GET(_req: Request, ctx: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { messageId, attachmentId } = await ctx.params;
  const message = await getMessage(messageId);
  const known = message?.direction === "IN" && message.providerId && (message.attachments ?? []).some((a) => a.id === attachmentId);
  if (!message || !known) return NextResponse.json({ ok: false, error: "Adjunto no encontrado." }, { status: 404, headers: NO_STORE });
  const url = await fetchReceivedAttachmentUrl(message.providerId!, attachmentId).catch(() => null);
  if (!url) return NextResponse.json({ ok: false, error: "Adjunto no disponible." }, { status: 502, headers: NO_STORE });
  await logAudit({ type: "FILE_VIEWED", actor: auth.identity.actor, caseId: message.caseId, payload: { messageId, attachmentId } });
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
