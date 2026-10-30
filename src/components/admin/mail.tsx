import Link from "next/link";
import type { EmailMessageRow, EmailStatus, MessagePriority } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import type { SignalLevel, SignalReason } from "@/lib/recall/mailbox";
import { fmtDateTime } from "./format";
import { Badge } from "./ui";

const M = ADMIN.mesa;
const I = ADMIN.inbox;

const SIGNAL_COLOR: Record<SignalLevel, string> = { RED: "bg-alert", AMBER: "bg-caution", GREEN: "bg-ok" };

/** Semáforo: punto de color con etiqueta (el color nunca va solo). */
export function SignalBadge({ level }: { level: SignalLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold uppercase tracking-wide">
      <span aria-hidden className={`inline-block size-3 rounded-full ${SIGNAL_COLOR[level]}`} />
      {M.levels[level]}
    </span>
  );
}

export function SignalReasons({ reasons }: { reasons: SignalReason[] }) {
  if (reasons.length === 0) return <span className="text-ink-500">—</span>;
  return (
    <ul className="grid gap-0.5">
      {reasons.map((r) => (
        <li key={r}>{M.reasons[r]}</li>
      ))}
    </ul>
  );
}

export function MessagePriorityBadge({ priority }: { priority: MessagePriority | null }) {
  if (!priority) return null;
  return <Badge variant={priority === "HIGH" ? "alert" : priority === "MEDIUM" ? "caution" : "neutral"}>{I.priority[priority]}</Badge>;
}

export function EmailStatusBadge({ status, openedAt }: { status: EmailStatus; openedAt?: Date | null }) {
  const variant = status === "BOUNCED" || status === "COMPLAINED" || status === "FAILED" ? "alert" : status === "DELAYED" ? "caution" : status === "DELIVERED" ? "ok" : "neutral";
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={variant}>{I.status[status]}</Badge>
      {openedAt ? <Badge variant="ok">{I.opened}</Badge> : null}
    </span>
  );
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Bitácora de correos de una conversación, del más antiguo al más reciente. */
export function MessageTimeline({ messages, linkEach = false, openId }: { messages: EmailMessageRow[]; linkEach?: boolean; openId?: string }) {
  return (
    <ol className="grid gap-3">
      {messages.map((m) => {
        const incoming = m.direction === "IN";
        return (
          <li key={m.id} id={`m-${m.id}`} className={`rounded-md border p-3 text-sm ${incoming ? (m.handledAt ? "border-line bg-paper-100" : "border-ink bg-paper") : "border-line bg-paper"} ${incoming ? "sm:mr-10" : "sm:ml-10"}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={incoming ? "dark" : "neutral"}>{I.direction[m.direction]}</Badge>
              {incoming ? <MessagePriorityBadge priority={m.priority} /> : <EmailStatusBadge status={m.status} openedAt={m.openedAt} />}
              {incoming && !m.handledAt ? <Badge variant="alert">{I.pending}</Badge> : null}
              <span className="text-ink-500">{fmtDateTime(m.createdAt)}</span>
              <span className="text-ink-500">{incoming ? m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail : `→ ${m.toEmails}`}</span>
              {m.actor ? <span className="text-ink-500">· {m.actor}</span> : null}
            </div>
            <div className="font-semibold">{linkEach ? <Link href={`/admin/bandeja/${m.id}`} className="underline underline-offset-2">{m.subject}</Link> : m.subject}</div>
            {incoming && m.triageReason ? (
              <p className="mt-1 text-xs text-ink-500">
                {m.triageReason}
                {m.triageSource ? ` (${I.triageBy[m.triageSource as "AI" | "RULES"] ?? m.triageSource})` : ""}
              </p>
            ) : null}
            {!incoming && m.statusDetail ? <p className="mt-1 text-xs text-alert-700">{m.statusDetail}</p> : null}
            <details className="mt-2" open={incoming && (!m.handledAt || openId === m.id)}>
              <summary className="cursor-pointer text-xs font-semibold text-ink-500">{incoming ? "Mensaje" : "Ver correo enviado"}</summary>
              <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap break-words">{m.bodyText}</p>
            </details>
            {m.attachments && m.attachments.length > 0 ? (
              <div className="mt-2 text-xs">
                <span className="font-semibold uppercase tracking-wider text-ink-500">{I.attachments}: </span>
                {m.attachments.map((a, i) =>
                  a.id ? (
                    <a key={a.id} href={`/api/admin/correos/${m.id}/adjuntos/${a.id}`} target="_blank" rel="noopener noreferrer" className="mr-2 underline underline-offset-2">
                      {a.filename ?? `adjunto ${i + 1}`}
                    </a>
                  ) : (
                    <span key={i} className="mr-2">{a.filename ?? `adjunto ${i + 1}`}</span>
                  ),
                )}
              </div>
            ) : null}
            {incoming && m.handledAt ? <p className="mt-2 text-xs text-ink-500">{I.handledBy(m.handledBy ?? "—", fmtDateTime(m.handledAt))}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
