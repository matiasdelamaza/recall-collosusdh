import { fmtNumber, fmtPercent, labelStatus } from "@/components/admin/format";
import { Badge, Card, KpiTile, PageHeader, buttonSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { STATUS_LABELS } from "@/lib/copy/es";
import { ADMIN } from "@/lib/copy/es-admin";
import { getRecallMetrics } from "@/lib/recall/metrics";

export const dynamic = "force-dynamic";

const M = ADMIN.metrics;
const K = M.kpis;

export default async function AdminMetricsPage() {
  await requireAdmin();
  const m = await getRecallMetrics();

  return (
    <>
      <PageHeader title={M.title}>
        <Badge variant={m.serialDatabaseStatus === "COMPLETE" ? "dark" : "caution"}>
          {M.serialDbStatus}: {STATUS_LABELS.serialDatabase[m.serialDatabaseStatus]}
        </Badge>
        <a href="/api/admin/exportar/resumen.csv" className={buttonSecondary}>
          {M.exportCsv}
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiTile label={K.affectedSerials} value={fmtNumber(m.affectedSerialsLoaded)} />
        <KpiTile label={K.totalLookups} value={fmtNumber(m.totalLookups)} />
        <KpiTile label={K.affectedLookups} value={fmtNumber(m.affectedLookups)} />
        <KpiTile label={K.totalCases} value={fmtNumber(m.totalCases)} />
        <KpiTile label={K.affectedCases} value={fmtNumber(m.affectedCases)} />
        <KpiTile label={K.contacted} value={fmtNumber(m.customersContacted)} />
        <KpiTile label={K.framesAssigned} value={fmtNumber(m.framesAssigned)} />
        <KpiTile label={K.replaced} value={fmtNumber(m.replacementsCompleted)} />
        <KpiTile label={K.open} value={fmtNumber(m.openCases)} />
        <KpiTile label={K.closed} value={fmtNumber(m.closedCases)} />
        <KpiTile label={K.accident} value={fmtNumber(m.accidentCases)} alert={m.accidentCases > 0} />
        <KpiTile label={K.damage} value={fmtNumber(m.damageCases)} alert={m.damageCases > 0} />
        <KpiTile label={K.completionRate} value={fmtPercent(m.completionRate)} hint={M.completionHint} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title={M.byStatus}>
          <table className="w-full text-sm">
            <tbody>
              {m.casesByStatus.map((s) => (
                <tr key={s.status} className="border-b border-line last:border-b-0">
                  <td className="py-1.5">{labelStatus(s.status)}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">{fmtNumber(s.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={M.daily}>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-500">
              <tr>
                <th className="py-1 text-left">{M.dailyCols.day}</th>
                <th className="py-1 text-right">{M.dailyCols.lookups}</th>
                <th className="py-1 text-right">{M.dailyCols.registrations}</th>
              </tr>
            </thead>
            <tbody>
              {m.daily.map((d) => (
                <tr key={d.day} className="border-b border-line last:border-b-0">
                  <td className="py-1 font-mono text-xs">{d.day}</td>
                  <td className="py-1 text-right tabular-nums">{fmtNumber(d.lookups)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtNumber(d.registrations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={M.analytics}>
          {m.analytics.length === 0 ? (
            <p className="text-sm text-ink-500">—</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="py-1 text-left">{M.analyticsCols.name}</th>
                  <th className="py-1 text-right">{M.analyticsCols.last30}</th>
                  <th className="py-1 text-right">{M.analyticsCols.total}</th>
                </tr>
              </thead>
              <tbody>
                {m.analytics.map((a) => (
                  <tr key={a.name} className="border-b border-line last:border-b-0">
                    <td className="py-1 font-mono text-xs">{a.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(a.last30)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
