import Link from "next/link";
import type { EmailMessageRow, EmailStatus, MessagePriority } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import type { SignalLevel, SignalReason } from "@/lib/recall/mailbox";
import { fmtDateTime, fmtInboxDate } from "./format";
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

/** Inicial para el avatar: primera letra del nombre o del correo. */
function initial(name: string): string {
  const ch = name.trim().replace(/^[^\p{L}\p{N}]+/u, "").charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** Círculo con la inicial: oscuro para el cliente, con borde para Postventa. */
export function Avatar({ name, outgoing = false, size = "md" }: { name: string; outgoing?: boolean; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dim} ${outgoing ? "border border-line bg-paper text-ink-500" : "bg-ink text-paper"}`}>
      {outgoing ? "P" : initial(name)}
    </span>
  );
}

/** Extracto de una línea: sin citas de correos anteriores ni espacios repetidos. */
export function excerpt(body: string | null | undefined, max = 160): string {
  if (!body) return "";
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    // Desde la cabecera de la cita ("El … escribió:") hacia abajo es el correo anterior.
    if (/^\s*(el|on)\b.*(escribió|wrote):\s*$/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    lines.push(line);
  }
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Asunto sin prefijos de respuesta o reenvío, para comparar mensajes de un mismo hilo. */
export function baseSubject(subject: string): string {
  return subject.replace(/^\s*((re|rv|fw|fwd)\s*:\s*)+/i, "").trim();
}

function PaperclipIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </svg>
  );
}

/** Bitácora de correos de una conversación, del más antiguo al más reciente, como un hilo de correo. */
export function MessageTimeline({ messages, linkEach = false, openId }: { messages: EmailMessageRow[]; linkEach?: boolean; openId?: string }) {
  const threadSubject = messages[0] ? baseSubject(messages[0].subject) : "";
  const lastId = messages.at(-1)?.id;
  return (
    <ol className="divide-y divide-line">
      {messages.map((m) => {
        const incoming = m.direction === "IN";
        const pending = incoming && !m.handledAt;
        const sender = incoming ? m.fromName || m.fromEmail : I.direction.OUT;
        const open = m.id === lastId || m.id === openId || pending;
        const showSubject = linkEach || baseSubject(m.subject) !== threadSubject;
        return (
          <li key={m.id} id={`m-${m.id}`} className="py-1 first:pt-0 last:pb-0">
            <details className="group" open={open}>
              <summary className="-mx-2 flex cursor-pointer list-none items-start gap-3 rounded-md px-2 py-2.5 hover:bg-paper-100 [&::-webkit-details-marker]:hidden">
                <Avatar name={sender} outgoing={!incoming} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-bold text-ink">{sender}</span>
                      {incoming && m.fromName ? <span className="ml-1.5 text-xs text-ink-500">&lt;{m.fromEmail}&gt;</span> : null}
                    </span>
                    <time dateTime={new Date(m.createdAt).toISOString()} title={fmtDateTime(m.createdAt)} className="shrink-0 text-xs text-ink-500 tabular-nums">
                      <span className="sm:hidden">{fmtInboxDate(m.createdAt)}</span>
                      <span className="hidden sm:inline">{fmtDateTime(m.createdAt)}</span>
                    </time>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                    <span className="min-w-0 truncate">
                      {incoming ? `${I.toLabel} ${I.direction.OUT}` : `${I.toLabel} ${m.toEmails}`}
                      {m.actor ? ` · ${m.actor}` : ""}
                    </span>
                    {incoming && m.priority && m.priority !== "LOW" ? <MessagePriorityBadge priority={m.priority} /> : null}
                    {pending ? <Badge variant="alert">{I.pending}</Badge> : null}
                    {!incoming ? <EmailStatusBadge status={m.status} openedAt={m.openedAt} /> : null}
                  </div>
                  <div className="mt-1 truncate text-sm text-ink-500 group-open:hidden">{excerpt(m.bodyText, 200)}</div>
                </div>
              </summary>

              <div className="pb-4 pl-[3.25rem] pr-1">
                {showSubject ? <p className="mb-2 text-sm font-semibold text-ink">{m.subject}</p> : null}
                {incoming && m.triageReason ? (
                  <p className="mb-3 rounded-sm bg-paper-100 px-2.5 py-1.5 text-xs text-ink-700">
                    <span className="font-semibold">{I.triageLabel}:</span> {m.triageReason}
                    {m.triageSource ? ` (${I.triageBy[m.triageSource as "AI" | "RULES"] ?? m.triageSource})` : ""}
                  </p>
                ) : null}
                {!incoming && m.statusDetail ? <p className="mb-3 text-xs text-alert-700">{m.statusDetail}</p> : null}
                <p className="max-w-[72ch] whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{m.bodyText}</p>
                {m.attachments && m.attachments.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold text-ink-500">{I.attachments}</p>
                    <ul className="flex flex-wrap gap-2">
                      {m.attachments.map((a, i) => {
                        const label = a.filename ?? `adjunto ${i + 1}`;
                        const chip = "inline-flex max-w-64 items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-semibold";
                        return (
                          <li key={a.id ?? i}>
                            {a.id ? (
                              <a href={`/api/admin/correos/${m.id}/adjuntos/${a.id}`} target="_blank" rel="noopener noreferrer" className={`${chip} hover:bg-paper-100`}>
                                <PaperclipIcon />
                                <span className="truncate">{label}</span>
                              </a>
                            ) : (
                              <span className={chip}>
                                <PaperclipIcon />
                                <span className="truncate">{label}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {incoming && m.handledAt ? <p className="mt-3 text-xs text-ink-500">{I.handledBy(m.handledBy ?? "—", fmtDateTime(m.handledAt))}</p> : null}
                {linkEach ? (
                  <Link href={`/admin/bandeja/${m.id}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-2">
                    {I.viewThread}
                  </Link>
                ) : null}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

/** Fila de la bandeja con el formato de un cliente de correo: remitente, asunto, extracto y fecha. */
export function InboxRowLink({
  message: m,
  casePublicId,
  customerName,
  now,
}: {
  message: EmailMessageRow;
  casePublicId: string | null;
  customerName: string | null;
  now: Date;
}) {
  const incoming = m.direction === "IN";
  const unread = incoming && !m.readAt;
  const pending = incoming && !m.handledAt;
  const who = incoming ? customerName ?? m.fromName ?? m.fromEmail : customerName ?? m.toEmails;
  const text = excerpt(m.bodyText);
  const stripe = pending && m.priority === "HIGH" ? "border-l-alert" : pending && m.priority === "MEDIUM" ? "border-l-caution" : "border-l-transparent";
  const status = pending ? <Badge variant="alert">{I.pending}</Badge> : !incoming ? <EmailStatusBadge status={m.status} openedAt={m.openedAt} /> : null;
  const date = (
    <time dateTime={new Date(m.createdAt).toISOString()} title={fmtDateTime(m.createdAt)} className={`whitespace-nowrap text-xs tabular-nums ${unread ? "font-bold text-ink" : "text-ink-500"}`}>
      {fmtInboxDate(m.createdAt, now)}
    </time>
  );

  return (
    <Link
      href={`/admin/bandeja/${m.id}`}
      className={`flex items-start gap-3 border-l-4 px-3 py-3 transition-colors duration-150 focus-visible:outline-offset-[-3px] sm:items-center sm:px-4 sm:py-2.5 ${stripe} ${unread ? "bg-paper hover:bg-paper-100" : "bg-paper-100/60 hover:bg-paper-200/60"}`}
    >
      <Avatar name={who} outgoing={!incoming} size="sm" />
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="flex items-baseline justify-between gap-2 sm:w-52 sm:shrink-0">
          <span className={`truncate text-sm ${unread ? "font-bold text-ink" : "text-ink-700"}`}>
            {unread ? <span className="sr-only">{I.unread}: </span> : null}
            {incoming ? null : <span className="font-normal text-ink-500">{I.toLabel} </span>}
            {who}
          </span>
          <span className="sm:hidden">{date}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-1 items-center gap-1.5 sm:mt-0">
          {incoming && m.priority && m.priority !== "LOW" ? <MessagePriorityBadge priority={m.priority} /> : null}
          {casePublicId ? <span translate="no" className="shrink-0 rounded-sm bg-paper-200 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">{casePublicId}</span> : null}
          <span className="min-w-0 truncate text-sm">
            <span className={unread ? "font-bold text-ink" : "text-ink"}>{m.subject}</span>
            {text ? <span className="hidden text-ink-500 sm:inline"> — {text}</span> : null}
          </span>
        </div>
        {text ? <div className="mt-0.5 truncate text-sm text-ink-500 sm:hidden">{text}</div> : null}
        {status ? <div className="mt-1.5 sm:hidden">{status}</div> : null}
      </div>
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        {status}
        <span className="w-16 text-right">{date}</span>
      </div>
    </Link>
  );
}
