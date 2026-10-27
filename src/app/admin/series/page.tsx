import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { affectedSerials, serialImports } from "@/db/schema";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { ImportSerialsForm, ReprocessForm, SerialDatabaseToggle } from "@/components/admin/SerialsForms";
import { Badge, Card, Flash, KpiTile, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { STATUS_LABELS } from "@/lib/copy/es";
import { ADMIN } from "@/lib/copy/es-admin";
import { getSerialDatabaseStatus } from "@/lib/recall/verify";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const S = ADMIN.serials;

export default async function AdminSerialsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;

  const db = await getDb();
  const [status, [{ total }], imports] = await Promise.all([
    getSerialDatabaseStatus(),
    db.select({ total: count() }).from(affectedSerials).where(eq(affectedSerials.status, "RECALL")),
    db.select().from(serialImports).orderBy(desc(serialImports.createdAt)).limit(25),
  ]);

  return (
    <>
      <PageHeader title={S.title}>
        <Badge variant={status === "COMPLETE" ? "dark" : "caution"}>{STATUS_LABELS.serialDatabase[status]}</Badge>
      </PageHeader>

      {msg === "statusChanged" ? <Flash>{S.messages.statusChanged}</Flash> : null}
      {msg === "error" ? <Flash kind="error">{S.messages.error}</Flash> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title={S.statusTitle}>
          <p className={`mb-4 rounded-md border px-3 py-2 text-sm ${status === "COMPLETE" ? "border-ink bg-paper-100" : "border-caution bg-caution-50 text-caution"}`}>
            {status === "COMPLETE" ? S.statusComplete : S.statusPending}
          </p>
          <SerialDatabaseToggle status={status} />
        </Card>
        <KpiTile label={S.totalSerials} value={fmtNumber(Number(total))} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={S.importTitle}>
          <p className="mb-3 text-sm text-ink-500">{S.importHelp}</p>
          <ImportSerialsForm />
        </Card>
        <Card title={S.reprocessTitle}>
          <p className="mb-3 text-sm text-ink-500">{S.reprocessHelp}</p>
          <ReprocessForm />
        </Card>
      </div>

      <Card title={S.historyTitle} className="mt-4">
        {imports.length === 0 ? (
          <p className="text-sm text-ink-500">{S.historyEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="py-1 text-left">{S.historyCols.date}</th>
                  <th className="py-1 text-left">{S.historyCols.file}</th>
                  <th className="py-1 text-right">{S.historyCols.rows}</th>
                  <th className="py-1 text-right">{S.historyCols.inserted}</th>
                  <th className="py-1 text-right">{S.historyCols.updated}</th>
                  <th className="py-1 text-right">{S.historyCols.skipped}</th>
                  <th className="py-1 text-left">{S.historyCols.by}</th>
                  <th className="py-1 text-left">{S.historyCols.notes}</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="py-1 whitespace-nowrap">{fmtDateTime(i.createdAt)}</td>
                    <td className="py-1 font-mono text-xs">{i.filename}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(i.rowCount)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(i.insertedCount)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(i.updatedCount)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNumber(i.skippedCount)}</td>
                    <td className="py-1">{i.importedBy}</td>
                    <td className="py-1 text-ink-500">{i.notes ?? "—"}</td>
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
