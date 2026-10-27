import Link from "next/link";
import { LOOKUP_RESULTS, type LookupResult } from "@/db/schema";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { Badge, KpiTile, PageHeader, buttonPrimary, buttonSecondary, inputClass, labelClass, selectClass } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { STATUS_LABELS } from "@/lib/copy/es";
import { ADMIN } from "@/lib/copy/es-admin";
import { listLookups, parseLookupFilters, summarizeLookups, type LookupListFilters } from "@/lib/recall/lookups";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const L = ADMIN.lookups;

const RESULT_VARIANT: Record<LookupResult, "alert" | "ok" | "caution" | "neutral" | "dark"> = {
  AFFECTED: "alert",
  REINFORCED: "ok",
  NOT_IDENTIFIED: "caution",
  INVALID: "caution",
  PENDING_DATABASE: "neutral",
  RATE_LIMITED: "dark",
};

function toQuery(filters: LookupListFilters, page?: number): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.result) p.set("result", filters.result);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function AdminLookupsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const filters = parseLookupFilters(await searchParams);
  const [summary, list] = await Promise.all([summarizeLookups(), listLookups(filters)]);
  const by = summary.byResult;

  return (
    <>
      <PageHeader title={L.title}>
        <span className="text-sm text-ink-500">{L.total(list.total)}</span>
        <a href={`/api/admin/exportar/consultas.csv${toQuery(filters)}`} className={buttonSecondary}>
          {L.exportCsv}
        </a>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-ink-500">{L.intro}</p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label={L.kpis.total} value={fmtNumber(summary.total)} />
        <KpiTile label={L.kpis.distinctSerials} value={fmtNumber(summary.distinctSerials)} />
        <KpiTile label={L.kpis.distinctConnections} value={fmtNumber(summary.distinctConnections)} />
        <KpiTile label={L.kpis.affected} value={fmtNumber(by.AFFECTED)} alert={by.AFFECTED > 0} />
        <KpiTile label={L.kpis.affectedWithEmail} value={`${fmtNumber(summary.affectedWithEmail)} de ${fmtNumber(by.AFFECTED)}`} />
        <KpiTile label={L.kpis.reinforced} value={fmtNumber(by.REINFORCED)} />
        <KpiTile label={L.kpis.notFound} value={fmtNumber(by.NOT_IDENTIFIED)} />
        <KpiTile label={L.kpis.invalid} value={fmtNumber(by.INVALID)} />
        <KpiTile label={L.kpis.pending} value={fmtNumber(by.PENDING_DATABASE)} />
        <KpiTile label={L.kpis.rateLimited} value={fmtNumber(by.RATE_LIMITED)} />
      </div>

      <form method="get" action="/admin/consultas" className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-line bg-paper-100 p-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label htmlFor="q" className={labelClass}>
            {L.search}
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={L.searchPlaceholder} className={inputClass} maxLength={64} />
        </div>
        <div>
          <label htmlFor="result" className={labelClass}>
            {L.result}
          </label>
          <select id="result" name="result" defaultValue={filters.result ?? ""} className={selectClass}>
            <option value="">{L.all}</option>
            {LOOKUP_RESULTS.map((r) => (
              <option key={r} value={r}>
                {STATUS_LABELS.lookupResult[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonPrimary}>
            {L.apply}
          </button>
          <a href="/admin/consultas" className={buttonSecondary}>
            {L.clear}
          </a>
        </div>
      </form>

      {list.rows.length === 0 ? (
        <p className="rounded-md border border-line bg-paper-100 p-6 text-center text-sm text-ink-500">{L.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-paper-100 text-[11px] uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{L.columns.date}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.serial}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.result}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.contact}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.ref}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.connection}</th>
                <th className="px-3 py-2 font-semibold">{L.columns.case}</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-paper-100">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2 font-mono">{r.serialNormalized || <span className="text-ink-300">{L.emptySerial}</span>}</td>
                  <td className="px-3 py-2">
                    <Badge variant={RESULT_VARIANT[r.result]}>{STATUS_LABELS.lookupResult[r.result]}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {r.contactEmail ? (
                      <a href={`mailto:${r.contactEmail}`} className="break-all underline underline-offset-2">
                        {r.contactEmail}
                      </a>
                    ) : r.result === "AFFECTED" ? (
                      <span className="text-alert">{L.noContact}</span>
                    ) : (
                      <span className="text-ink-300">{ADMIN.common.none}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.outreachRef ?? <span className="text-ink-300">{ADMIN.common.none}</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-500">{r.connection ?? ADMIN.common.none}</td>
                  <td className="px-3 py-2">
                    {r.caseId ? (
                      <Link href={`/admin/casos/${encodeURIComponent(r.caseId)}`} className="font-mono font-bold underline underline-offset-2">
                        {r.caseId}
                      </Link>
                    ) : (
                      <span className="text-ink-300">{ADMIN.common.none}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.totalPages > 1 ? (
        <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
          {list.page > 1 ? (
            <Link href={`/admin/consultas${toQuery(filters, list.page - 1)}`} className={buttonSecondary}>
              {L.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-500">{L.page(list.page, list.totalPages)}</span>
          {list.page < list.totalPages ? (
            <Link href={`/admin/consultas${toQuery(filters, list.page + 1)}`} className={buttonSecondary}>
              {L.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
