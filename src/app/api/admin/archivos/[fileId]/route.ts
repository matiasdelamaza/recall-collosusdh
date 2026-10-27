import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/session";
import { getCaseFile } from "@/lib/recall/cases";
import { logAudit } from "@/lib/server/audit";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { fileId } = await ctx.params;
  const file = await getCaseFile(fileId);
  if (!file) return NextResponse.json({ ok: false, error: "Archivo no encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const stored = await getStorage().get(file.storageKey);
  if (!stored) return NextResponse.json({ ok: false, error: "Archivo no disponible." }, { status: 404, headers: { "Cache-Control": "no-store" } });

  await logAudit({ type: "FILE_VIEWED", actor: auth.identity.actor, caseId: file.caseId, payload: { fileId: file.id, kind: file.kind } });

  const contentType = SAFE_TYPES.has(file.mimeType) ? file.mimeType : "application/octet-stream";
  const safeName = file.originalName.replace(/[^\w.\-]+/g, "_").slice(0, 100) || "archivo";
  const body = new Uint8Array(stored.data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
