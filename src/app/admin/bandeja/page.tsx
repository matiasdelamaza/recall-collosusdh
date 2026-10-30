import Link from "next/link";
import { InboxRowLink } from "@/components/admin/mail";
import { AlertBox, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { getEnv } from "@/lib/config";
import { ADMIN } from "@/lib/copy/es-admin";
import { MESSAGE_PRIORITIES, type MessagePriority } from "@/db/schema";
import { INBOX_FILTERS, countInboxByPriority, getInboxCounts, listInbox, type InboxFilter } from "@/lib/recall/mailbox";

export const dynamic = "force-dynamic";

const I = ADMIN.inbox;
type Search = Record<string, string | string[] | undefined>;

const PRIORITY_DOT: Record<MessagePriority, string> = { HIGH: "bg-alert", MEDIUM: "bg-caution", LOW: "bg-ink-300" };

export default async function AdminInboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = Array.isArray(sp.f) ? sp.f[0] : sp.f;
  const filter: InboxFilter = INBOX_FILTERS.includes(raw as InboxFilter) ? (raw as InboxFilter) : "pending";
  // Los enviados no tienen prioridad: en esa vista no se filtra por prioridad.
  const rawPriority = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  const priority = filter !== "out" && MESSAGE_PRIORITIES.includes(rawPriority as MessagePriority) ? (rawPriority as MessagePriority) : null;
  const [rows, counts, byPriority] = await Promise.all([listInbox(filter, priority), getInboxCounts(), countInboxByPriority(filter)]);
  const now = new Date();
  const chip = (active: boolean) =>
    `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 ${active ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-700 hover:bg-paper-100"}`;

  return (
    <>
      <PageHeader title={I.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-ink-500">{I.intro}</p>
      {!getEnv().INBOX_EMAIL ? (
        <div className="mb-4">
          <AlertBox tone="caution">{ADMIN.mesa.noInbox}</AlertBox>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md border border-line bg-paper">
        <nav aria-label={I.title} className="flex overflow-x-auto border-b border-line">
          {INBOX_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={`/admin/bandeja?f=${f}${priority && f !== "out" ? `&p=${priority}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-[3px] px-4 text-sm transition-colors duration-150 focus-visible:outline-offset-[-3px] ${active ? "border-ink font-bold text-ink" : "border-transparent font-semibold text-ink-500 hover:bg-paper-100 hover:text-ink"}`}
              >
                {I.filters[f]}
                {f === "pending" && counts.pending > 0 ? (
                  <span className="rounded-full bg-alert px-1.5 py-0.5 text-[11px] font-bold leading-none text-paper tabular-nums">{counts.pending}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
          {filter !== "out" ? (
            <nav aria-label={I.priorityFilter} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-ink-500">{I.priorityFilter}</span>
              <Link href={`/admin/bandeja?f=${filter}`} aria-current={priority === null ? "page" : undefined} className={chip(priority === null)}>
                {I.priorityAll}
              </Link>
              {MESSAGE_PRIORITIES.map((p) => (
                <Link key={p} href={`/admin/bandeja?f=${filter}&p=${p}`} aria-current={p === priority ? "page" : undefined} className={chip(p === priority)}>
                  <span aria-hidden className={`size-2 rounded-full ${PRIORITY_DOT[p]}`} />
                  {I.priority[p]}
                  <span className="tabular-nums opacity-70">{byPriority[p]}</span>
                </Link>
              ))}
            </nav>
          ) : (
            <span />
          )}
          <span className="text-xs text-ink-500 tabular-nums">{I.shown(rows.length)}</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-semibold text-ink">{filter === "pending" ? I.emptyPending : I.empty}</p>
            <p className="mt-1 text-sm text-ink-500">{I.emptyHelp}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.id} className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
                <InboxRowLink message={m} casePublicId={m.casePublicId} customerName={m.customerName} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
