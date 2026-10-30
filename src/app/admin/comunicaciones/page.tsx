import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { CommsForm } from "@/components/admin/CommsForm";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { Card, KpiTile, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { getBroadcastAudience } from "@/lib/recall/follow-up";

export const dynamic = "force-dynamic";
/** El envío de un comunicado corre en la acción de esta página, espaciado por el límite del proveedor. */
export const maxDuration = 300;

const C = ADMIN.comms;

type BroadcastPayload = { subject?: string; sent?: number; failed?: number };

export default async function AdminCommsPage() {
  await requireAdmin();
  const db = await getDb();
  const [audience, history] = await Promise.all([
    getBroadcastAudience(),
    db.select().from(auditEvents).where(eq(auditEvents.type, "BROADCAST_SENT")).orderBy(desc(auditEvents.createdAt)).limit(25),
  ]);

  return (
    <>
      <PageHeader title={C.title} />
      <p className="mb-4 max-w-3xl text-sm text-ink-500">{C.intro}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title={C.formTitle}>
          <CommsForm cases={audience.cases} contacts={audience.contacts} />
        </Card>
        <div className="grid content-start gap-4">
          <Card title={C.audienceTitle}>
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label={C.audienceCases} value={fmtNumber(audience.cases)} />
              <KpiTile label={C.audienceContacts} value={fmtNumber(audience.contacts)} />
            </div>
          </Card>
          <Card title={C.autoTitle}>
            <ul className="grid list-disc gap-2 pl-4 text-sm">
              <li>{C.autoStage}</li>
              <li>{C.autoWeekly}</li>
              <li>{C.autoReminder}</li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card title={C.historyTitle}>
          {history.length === 0 ? (
            <p className="text-sm text-ink-500">{C.historyEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-3 py-2">{C.historyCols.date}</th>
                    <th className="px-3 py-2">{C.historyCols.by}</th>
                    <th className="px-3 py-2">{C.historyCols.subject}</th>
                    <th className="px-3 py-2 text-right">{C.historyCols.sent}</th>
                    <th className="px-3 py-2 text-right">{C.historyCols.failed}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const p = (h.payload ?? {}) as BroadcastPayload;
                    return (
                      <tr key={h.id} className="border-t border-line">
                        <td className="whitespace-nowrap px-3 py-2 text-ink-500">{fmtDateTime(h.createdAt)}</td>
                        <td className="px-3 py-2">{h.actor}</td>
                        <td className="px-3 py-2">{p.subject ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(p.sent ?? 0)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.failed ? "font-bold text-alert" : ""}`}>{fmtNumber(p.failed ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
