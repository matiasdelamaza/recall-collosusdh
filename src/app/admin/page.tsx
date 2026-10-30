import Link from "next/link";
import { CasesFilters, filtersToQuery } from "@/components/admin/CasesFilters";
import { CasesTable } from "@/components/admin/CasesTable";
import { PageHeader, buttonSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { listCases, parseCaseFilters, STATUS_ALL, STATUS_OPEN } from "@/lib/recall/cases";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function AdminCasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseCaseFilters(sp);
  const result = await listCases(filters);

  return (
    <>
      <PageHeader title={ADMIN.cases.title}>
        <span className="text-sm text-ink-500">{ADMIN.cases.total(result.total)}</span>
        <a href={`/api/admin/exportar/casos.csv${filtersToQuery(filters, { page: undefined })}`} className={buttonSecondary}>
          {ADMIN.cases.exportCsv}
        </a>
        <a href={`/api/admin/exportar/casos.xlsx${filtersToQuery(filters, { page: undefined })}`} className={buttonSecondary}>
          {ADMIN.cases.exportXlsx}
        </a>
      </PageHeader>

      <CasesFilters filters={filters} />
      {filters.status === STATUS_OPEN ? (
        <p className="mb-3 text-sm text-ink-500">
          {ADMIN.cases.closedHidden}{" "}
          <Link href={`/admin${filtersToQuery(filters, { status: STATUS_ALL, page: undefined })}`} className="font-semibold text-ink underline underline-offset-2">
            {ADMIN.cases.showClosed}
          </Link>
        </p>
      ) : null}
      <CasesTable rows={result.rows} />

      {result.totalPages > 1 ? (
        <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
          {result.page > 1 ? (
            <Link href={`/admin${filtersToQuery(filters, { page: result.page - 1 })}`} className={buttonSecondary}>
              {ADMIN.cases.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-500">{ADMIN.cases.page(result.page, result.totalPages)}</span>
          {result.page < result.totalPages ? (
            <Link href={`/admin${filtersToQuery(filters, { page: result.page + 1 })}`} className={buttonSecondary}>
              {ADMIN.cases.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
