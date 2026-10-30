import Link from "next/link";
import { notFound } from "next/navigation";
import { CallForm } from "@/components/admin/CallForm";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { MessageTimeline, SignalBadge, SignalReasons, telHref } from "@/components/admin/mail";
import { Card, Flash, PageHeader, StatusBadge, buttonSecondary, inputClass } from "@/components/admin/ui";
import { linkMessageAction, markHandledAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { EMPTY_MAIL_STATS, caseSignal, getMailStats, getThread, markMessagesRead } from "@/lib/recall/mailbox";

export const dynamic = "force-dynamic";

const I = ADMIN.inbox;
type Search = Record<string, string | string[] | undefined>;

const MESSAGES: Record<string, { kind: "ok" | "error"; text: string }> = {
  handled: { kind: "ok", text: I.handled },
  linked: { kind: "ok", text: I.linked },
  linkNotFound: { kind: "error", text: I.linkNotFound },
  called: { kind: "ok", text: ADMIN.mesa.called },
  invalid: { kind: "error", text: ADMIN.caseDetail.messages.invalid },
};

function replySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export default async function AdminThreadPage({ params, searchParams }: { params: Promise<{ messageId: string }>; searchParams: Promise<Search> }) {
  await requireAdmin();
  const { messageId } = await params;
  const sp = await searchParams;
  const msgKey = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const msg = msgKey ? MESSAGES[msgKey] : undefined;
  const thread = await getThread(messageId);
  if (!thread) notFound();
  const { message, case: c, counterpart, messages } = thread;
  await markMessagesRead(messages.filter((m) => m.direction === "IN" && !m.readAt).map((m) => m.id));
  const pending = messages.some((m) => m.direction === "IN" && !m.handledAt);
  const signal = c ? caseSignal(c, (await getMailStats([c.id])).get(c.id) ?? EMPTY_MAIL_STATS) : null;
  const lastIn = [...messages].reverse().find((m) => m.direction === "IN");
  const back = `/admin/bandeja/${message.id}`;

  return (
    <>
      <div className="mb-3">
        <Link href="/admin/bandeja" className="text-sm font-semibold text-ink-500 underline underline-offset-2">
          ← {I.back}
        </Link>
      </div>
      <PageHeader title={I.threadTitle(c ? `${c.customerName} · ${c.caseId}` : counterpart)}>
        {signal ? <SignalBadge level={signal.level} /> : null}
        {c ? <StatusBadge status={c.caseStatus} /> : null}
      </PageHeader>
      {msg ? <Flash kind={msg.kind}>{msg.text}</Flash> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <MessageTimeline messages={messages} openId={message.id} />
        </Card>

        <div className="grid content-start gap-4">
          {c ? (
            <Card title={ADMIN.caseDetail.sections.customer}>
              <div className="grid gap-2 text-sm">
                <div className="font-semibold">{c.customerName}</div>
                <a href={telHref(c.phone)} className="text-lg font-extrabold underline underline-offset-2">
                  {c.phone}
                </a>
                <div className="text-ink-500">{c.email}</div>
                {signal && signal.reasons.length > 0 ? (
                  <div className="text-xs font-semibold text-alert-700">
                    <SignalReasons reasons={signal.reasons} />
                  </div>
                ) : null}
                <Link href={`/admin/casos/${c.caseId}`} className="font-semibold underline underline-offset-2">
                  {ADMIN.mesa.openCase} {c.caseId}
                </Link>
                <CallForm caseId={c.caseId} back={back} />
              </div>
            </Card>
          ) : (
            <Card title={I.linkTitle}>
              <p className="mb-2 text-sm text-ink-500">{I.linkHelp}</p>
              <form action={linkMessageAction} className="flex gap-2">
                <input type="hidden" name="messageId" value={message.id} />
                <input name="caseId" required maxLength={10} placeholder={I.linkPlaceholder} aria-label={I.linkTitle} className={`${inputClass} font-mono uppercase`} />
                <button type="submit" className={buttonSecondary}>
                  {I.link}
                </button>
              </form>
            </Card>
          )}

          <Card>
            <EmailComposer
              title={lastIn ? I.composeTitle : I.composeNewTitle}
              target={{
                caseId: c?.caseId ?? null,
                to: c?.email ?? counterpart,
                firstName: c?.customerName.split(/\s+/)[0] ?? null,
                serial: c?.serialNumber ?? null,
                replySubject: lastIn ? replySubject(lastIn.subject) : undefined,
              }}
            />
          </Card>

          {pending ? (
            <form action={markHandledAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className={`${buttonSecondary} w-full`}>
                {I.markHandled}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
