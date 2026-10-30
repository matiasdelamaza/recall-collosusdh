import Link from "next/link";
import { CallForm } from "@/components/admin/CallForm";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { EmailStatusBadge, SignalBadge, SignalReasons, telHref } from "@/components/admin/mail";
import { AlertBox, Card, Flash, KpiTile, PageHeader, StatusBadge } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { getEnv } from "@/lib/config";
import { ADMIN } from "@/lib/copy/es-admin";
import { getControlBoard, getInboxCounts } from "@/lib/recall/mailbox";

export const dynamic = "force-dynamic";

const M = ADMIN.mesa;
type Search = Record<string, string | string[] | undefined>;

const MESSAGES: Record<string, { kind: "ok" | "error"; text: string }> = {
  called: { kind: "ok", text: M.called },
  invalid: { kind: "error", text: ADMIN.caseDetail.messages.invalid },
};

export default async function AdminMesaPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const msgKey = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const msg = msgKey ? MESSAGES[msgKey] : undefined;
  const [board, counts] = await Promise.all([getControlBoard(), getInboxCounts()]);
  const red = board.filter((r) => r.level === "RED");
  const amber = board.filter((r) => r.level === "AMBER").length;
  const green = board.filter((r) => r.level === "GREEN").length;

  return (
    <>
      <PageHeader title={M.title} />
      <p className="mb-4 max-w-3xl text-sm text-ink-500">{M.intro}</p>
      {msg ? <Flash kind={msg.kind}>{msg.text}</Flash> : null}
      {!getEnv().INBOX_EMAIL ? (
        <div className="mb-4">
          <AlertBox tone="caution">{M.noInbox}</AlertBox>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiTile label={M.kpis.callNow} value={fmtNumber(red.length)} alert={red.length > 0} />
        <KpiTile label={M.kpis.pending} value={fmtNumber(counts.pending)} alert={counts.pendingHigh > 0} />
        <KpiTile label={M.kpis.undelivered} value={fmtNumber(counts.undelivered)} />
        <KpiTile label={M.kpis.amber} value={fmtNumber(amber)} />
        <KpiTile label={M.kpis.green} value={fmtNumber(green)} />
      </div>

      <Card title={M.callNowTitle} className="mb-5 border-alert">
        {red.length === 0 ? (
          <p className="text-sm text-ink-500">{M.callNowEmpty}</p>
        ) : (
          <ul className="grid gap-3">
            {red.map(({ case: c, mail, reasons }) => (
              <li key={c.id} className="grid gap-2 rounded-md border border-alert bg-alert-50/40 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
                <div className="grid gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <SignalBadge level="RED" />
                    <Link href={`/admin/casos/${c.caseId}`} className="font-mono font-bold underline underline-offset-2">
                      {c.caseId}
                    </Link>
                    <span className="font-semibold">{c.customerName}</span>
                    <a href={telHref(c.phone)} className="text-base font-extrabold underline underline-offset-2">
                      {c.phone}
                    </a>
                  </div>
                  <div className="font-semibold text-alert-700">
                    <SignalReasons reasons={reasons} />
                  </div>
                  {mail.lastPendingExcerpt ? (
                    <blockquote className="border-l-2 border-line pl-2 text-ink-700">
                      {mail.lastPendingReason ? <span className="block text-xs font-semibold text-ink-500">{mail.lastPendingReason}</span> : null}
                      {mail.lastPendingExcerpt}
                      {mail.lastPendingExcerpt.length >= 280 ? "…" : ""}
                    </blockquote>
                  ) : null}
                  <div className="text-xs text-ink-500">
                    {M.lastCall}: {c.lastCallAt ? fmtDateTime(c.lastCallAt) : M.never}
                  </div>
                </div>
                <CallForm caseId={c.caseId} back="/admin/mesa" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={M.boardTitle}>
        {board.length === 0 ? (
          <p className="text-sm text-ink-500">{M.boardEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2">{M.cols.signal}</th>
                  <th className="px-3 py-2">{M.cols.case}</th>
                  <th className="px-3 py-2">{M.cols.customer}</th>
                  <th className="px-3 py-2">{M.cols.phone}</th>
                  <th className="px-3 py-2">{M.cols.stage}</th>
                  <th className="px-3 py-2">{M.cols.reasons}</th>
                  <th className="px-3 py-2">{M.cols.lastIn}</th>
                  <th className="px-3 py-2">{M.cols.lastOut}</th>
                </tr>
              </thead>
              <tbody>
                {board.map(({ case: c, mail, level, reasons }) => (
                  <tr key={c.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">
                      <SignalBadge level={level} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/admin/casos/${c.caseId}`} className="font-mono font-semibold underline underline-offset-2">
                        {c.caseId}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{c.customerName}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <a href={telHref(c.phone)} className="underline underline-offset-2">
                        {c.phone}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={c.caseStatus} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <SignalReasons reasons={reasons} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-500">
                      {mail.lastInboundAt ? fmtDateTime(mail.lastInboundAt) : "—"}
                      {mail.pending > 0 ? <span className="ml-1 font-bold text-alert-700">({mail.pending})</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-500">
                      {mail.lastOutboundAt ? (
                        <div className="grid gap-1">
                          <span className="whitespace-nowrap">{fmtDateTime(mail.lastOutboundAt)}</span>
                          {mail.lastOutboundStatus ? <EmailStatusBadge status={mail.lastOutboundStatus} /> : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
