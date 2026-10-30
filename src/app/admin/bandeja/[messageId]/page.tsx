import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaseSummaryCard, CaseSummarySkeleton } from "@/components/admin/CaseSummaryCard";
import { CallForm } from "@/components/admin/CallForm";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { Avatar, MessageTimeline, SignalBadge, SignalReasons, baseSubject, telHref } from "@/components/admin/mail";
import { Card, Flash, StatusBadge, buttonSecondary, inputClass } from "@/components/admin/ui";
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

  const subject = baseSubject(messages[0]?.subject ?? message.subject) || message.subject;
  const toolbarButton = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-paper-100";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/bandeja" className={toolbarButton}>
          <span aria-hidden>←</span> {I.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#responder" className={toolbarButton}>
            {lastIn ? I.composeTitle : I.composeNewTitle}
          </a>
          {pending ? (
            <form action={markHandledAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className={toolbarButton}>
                {I.markHandled}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink [text-wrap:balance] sm:text-2xl">{subject}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-500">
          <span>{I.threadTitle(c ? c.customerName : counterpart)}</span>
          {c ? (
            <Link href={`/admin/casos/${c.caseId}`} translate="no" className="rounded-sm bg-paper-200 px-1.5 py-0.5 font-mono text-xs text-ink-700 hover:bg-line">
              {c.caseId}
            </Link>
          ) : null}
          {signal ? <SignalBadge level={signal.level} /> : null}
          {c ? <StatusBadge status={c.caseStatus} /> : null}
        </div>
      </header>
      {msg ? <Flash kind={msg.kind}>{msg.text}</Flash> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          <section className="rounded-md border border-line bg-paper px-4 py-3 sm:px-5">
            <MessageTimeline messages={messages} openId={message.id} />
          </section>

          <section id="responder" className="scroll-mt-4 rounded-md border border-line bg-paper p-4 sm:p-5">
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
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <Suspense fallback={<CaseSummarySkeleton />}>
            <CaseSummaryCard messageId={message.id} />
          </Suspense>
          {c ? (
            <Card title={ADMIN.caseDetail.sections.customer}>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={c.customerName} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.customerName}</div>
                    <div className="truncate text-ink-500">{c.email}</div>
                  </div>
                </div>
                <a href={telHref(c.phone)} className="text-lg font-extrabold underline underline-offset-2">
                  {c.phone}
                </a>
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
                <input name="caseId" required maxLength={10} placeholder={I.linkPlaceholder} aria-label={I.linkTitle} autoComplete="off" spellCheck={false} className={`${inputClass} font-mono uppercase`} />
                <button type="submit" className={buttonSecondary}>
                  {I.link}
                </button>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
