import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/config";

/** Correo recibido en la casilla de la mesa de control, tal como lo entrega el proveedor. */
export interface InboundEmail {
  providerId: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  attachments: { id: string; filename: string | null; contentType: string; size?: number }[];
  receivedAt: Date;
}

function client(): Resend {
  const key = getEnv().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY no configurado");
  return new Resend(key);
}

/** Trae el cuerpo de un correo recibido (el webhook solo trae metadatos). */
export async function fetchReceivedEmail(id: string): Promise<InboundEmail> {
  const { data, error } = await client().emails.receiving.get(id, { html_format: "cid" });
  if (error || !data) throw new Error(`no se pudo leer el correo recibido ${id}: ${error?.message ?? "sin datos"}`);
  return {
    providerId: data.id,
    from: data.from,
    to: data.to,
    subject: data.subject ?? "",
    text: data.text,
    html: data.html,
    headers: data.headers ?? {},
    attachments: (data.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, contentType: a.content_type, size: a.size })),
    receivedAt: new Date(data.created_at),
  };
}

/** Enlace temporal de descarga de un adjunto de un correo recibido. */
export async function fetchReceivedAttachmentUrl(emailId: string, attachmentId: string): Promise<string | null> {
  const r = client().emails.receiving.attachments;
  const { data, error } = await r.get({ emailId, id: attachmentId });
  if (error || !data) return null;
  return data.download_url ?? null;
}
