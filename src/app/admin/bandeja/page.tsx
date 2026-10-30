import Link from "next/link";
import { fmtDateTime } from "@/components/admin/format";
import { EmailStatusBadge, MessagePriorityBadge } from "@/components/admin/mail";
import { AlertBox, Badge, Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { getEnv } from "@/lib/config";
import { ADMIN } from "@/lib/copy/es-admin";
import { INBOX_FILTERS, getInboxCounts, listInbox, type InboxFilter } from "@/lib/recall/mailbox";

export const dynamic = "force-dynamic";

const I = ADMIN.inbox;
type Search = Record<string, string | string[] | undefined>;

export default async function AdminInboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = Array.isArray(sp.f) ? sp.f[0] : sp.f;
  const filter: InboxFilter = INBOX_FILTERS.includes(raw as InboxFilter) ? (raw as InboxFilter) : "pending";
  const [rows, counts] = await Promise.all([listInbox(filter), getInboxCounts()]);

  return (
    <>
      <PageHeader title={I.title} />
      <p className="mb-4 max-w-3xl text-sm text-ink-500">{I.intro}</p>
      {!getEnv().INBOX_EMAIL ? (
        <div className="mb-4">
          <AlertBox tone="caution">{ADMIN.mesa.noInbox}</AlertBox>
        </div>
      ) : null}

      <nav aria-label={I.title} className="mb-4 flex flex-wrap gap-1 text-sm">
        {INBOX_FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/bandeja?f=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-sm border px-3 py-1.5 font-semibold ${f === filter ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:bg-paper-100"}`}
          >
            {I.filters[f]}
            {f === "pending" && counts.pending > 0 ? ` (${counts.pending})` : ""}
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">{I.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2">{I.cols.priority}</th>
                  <th className="px-3 py-2">{I.cols.date}</th>
                  <th className="px-3 py-2">{I.cols.from}</th>
                  <th className="px-3 py-2">{I.cols.case}</th>
                  <th className="px-3 py-2">{I.cols.subject}</th>
                  <th className="px-3 py-2">{I.cols.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const incoming = m.direction === "IN";
                  const unread = incoming && !m.readAt;
                  return (
                    <tr key={m.id} className={`border-t border-line align-top ${unread ? "font-semibold" : ""}`}>
                      <td className="px-3 py-2">{incoming ? <MessagePriorityBadge priority={m.priority} /> : <Badge>{I.direction.OUT}</Badge>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{fmtDateTime(m.createdAt)}</td>
                      <td className="max-w-56 truncate px-3 py-2" title={incoming ? m.fromEmail : m.toEmails}>
                        {incoming ? m.customerName ?? m.fromName ?? m.fromEmail : `→ ${m.customerName ?? m.toEmails}`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{m.casePublicId ?? <span className="font-sans text-ink-500">{I.noCase}</span>}</td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/bandeja/${m.id}`} className="underline underline-offset-2">
                          {m.subject}
                        </Link>
                        {incoming && m.triageReason && m.priority !== "LOW" ? <span className="block text-xs font-normal text-ink-500">{m.triageReason}</span> : null}
                      </td>
                      <td className="px-3 py-2">{incoming ? m.handledAt ? <Badge>{I.status.RECEIVED}</Badge> : <Badge variant="alert">{I.pending}</Badge> : <EmailStatusBadge status={m.status} openedAt={m.openedAt} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
