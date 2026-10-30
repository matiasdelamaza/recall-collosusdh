import { AlertBox, Card } from "@/components/admin/ui";
import { PendingButton } from "@/components/admin/PendingButton";
import { fmtDateTime } from "@/components/admin/format";
import { getCaseSummary } from "@/lib/ai/assist";
import { refreshSummaryAction } from "@/lib/admin/ai-actions";
import { ADMIN } from "@/lib/copy/es-admin";

const S = ADMIN.ai.summary;
const smallButton = "inline-flex min-h-8 items-center rounded-full border border-line bg-paper px-3 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-100";

function RefreshForm({ messageId, label }: { messageId: string; label: string }) {
  return (
    <form action={refreshSummaryAction}>
      <input type="hidden" name="messageId" value={messageId} />
      <PendingButton className={smallButton} pendingLabel={S.refreshing}>
        {label}
      </PendingButton>
    </form>
  );
}

/** Resumen del hilo generado con IA. Se renderiza dentro de <Suspense> para no frenar la página. */
export async function CaseSummaryCard({ messageId, refreshFailed = false }: { messageId: string; refreshFailed?: boolean }) {
  if (!process.env.OPENROUTER_API_KEY) {
    return (
      <Card title={S.title}>
        <p className="text-sm text-ink-500">{ADMIN.ai.noKey}</p>
      </Card>
    );
  }
  const summary = await getCaseSummary(messageId);
  if (!summary) {
    return (
      <Card title={S.title}>
        <div className="grid gap-2 text-sm">
          <p className="text-ink-500">{S.failed}</p>
          <div>
            <RefreshForm messageId={messageId} label={S.retry} />
          </div>
        </div>
      </Card>
    );
  }
  const { content, createdAt } = summary;
  const pending = content.pendiente.filter((p) => p.trim());
  return (
    <Card title={S.title}>
      <div className="grid gap-3 text-sm">
        {refreshFailed ? (
          <p role="status" className="text-xs font-semibold text-alert-700">
            {S.refreshFailed}
          </p>
        ) : null}
        {content.alerta.trim() ? <AlertBox>{content.alerta}</AlertBox> : null}
        {content.resumen.trim() ? <p className="text-pretty">{content.resumen}</p> : null}
        {content.pide.trim() ? (
          <div>
            <h3 className="mb-0.5 text-xs font-bold uppercase tracking-wider text-ink-500">{S.asks}</h3>
            <p className="text-pretty">{content.pide}</p>
          </div>
        ) : null}
        {pending.length > 0 ? (
          <div>
            <h3 className="mb-0.5 text-xs font-bold uppercase tracking-wider text-ink-500">{S.pending}</h3>
            <ul className="grid list-disc gap-0.5 pl-5">
              {pending.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-line pt-2 text-xs text-ink-500">
          <div>
            <div>{S.generatedAt(fmtDateTime(createdAt))}</div>
            <div>{S.disclaimer}</div>
          </div>
          <RefreshForm messageId={messageId} label={S.refresh} />
        </div>
      </div>
    </Card>
  );
}

/** Esqueleto mientras se genera el resumen. */
export function CaseSummarySkeleton() {
  return (
    <Card title={S.title}>
      <div className="grid gap-2" aria-busy="true">
        <span className="sr-only">{S.loading}</span>
        <div className="h-3 w-full animate-pulse rounded-sm bg-paper-200" />
        <div className="h-3 w-11/12 animate-pulse rounded-sm bg-paper-200" />
        <div className="h-3 w-3/4 animate-pulse rounded-sm bg-paper-200" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-paper-200" />
      </div>
    </Card>
  );
}
