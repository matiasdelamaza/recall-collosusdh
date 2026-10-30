import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { AlertBox, Badge, Card, Flash, PageHeader, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/admin/ui";
import { saveTeamContextAction, toggleExampleAction } from "@/lib/admin/ai-actions";
import { requireAdmin } from "@/lib/admin/session";
import { EXAMPLES_MAX, KNOWLEDGE_TOTAL_MAX, fixedContext, getTeamContextRow, listExamplesForAdmin } from "@/lib/ai/knowledge";
import { ADMIN } from "@/lib/copy/es-admin";

export const dynamic = "force-dynamic";

const T = ADMIN.ai;
const FLASH_ERRORS = new Set(["tooLong", "invalid"]);

export default async function AdminTrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const msgKey = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const msg = msgKey && Object.hasOwn(T.messages, msgKey) ? { key: msgKey, text: T.messages[msgKey as keyof typeof T.messages] } : null;
  let data: [Awaited<ReturnType<typeof getTeamContextRow>>, Awaited<ReturnType<typeof listExamplesForAdmin>>];
  try {
    data = await Promise.all([getTeamContextRow(), listExamplesForAdmin()]);
  } catch (err) {
    // Si la base falla (por ejemplo, falta aplicar la migración 0007), la página avisa en vez de romperse.
    console.error("[entrenamiento] no se pudo cargar el contexto o los ejemplos:", err);
    return (
      <>
        <PageHeader title={T.title} />
        <AlertBox tone="caution">{T.loadFailed}</AlertBox>
      </>
    );
  }
  const [context, { used: usedExamples, excluded: excludedExamples }] = data;
  const examples = [...usedExamples, ...excludedExamples];

  return (
    <>
      <PageHeader title={T.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-ink-500">{T.intro}</p>
      {!process.env.OPENROUTER_API_KEY ? (
        <div className="mb-4">
          <AlertBox tone="caution">{T.noKey}</AlertBox>
        </div>
      ) : null}
      {msg ? <Flash kind={FLASH_ERRORS.has(msg.key) ? "error" : "ok"}>{msg.text}</Flash> : null}

      <div className="grid gap-4">
        <Card title={T.contextTitle}>
          <p className="mb-3 max-w-3xl text-sm text-ink-500">{T.contextHelp}</p>
          <form action={saveTeamContextAction} className="grid gap-3">
            <div>
              <label htmlFor="context-body" className={labelClass}>
                {T.contextLabel}
              </label>
              <textarea id="context-body" name="body" rows={18} defaultValue={context?.body ?? ""} maxLength={KNOWLEDGE_TOTAL_MAX} className={inputClass} />
              <p className="mt-1 text-xs tabular-nums text-ink-500">
                {T.contextLimit(fmtNumber(context?.body.length ?? 0), fmtNumber(KNOWLEDGE_TOTAL_MAX))}
                {context ? ` · ${T.lastUpdate(context.updatedBy ?? "—", fmtDateTime(context.updatedAt))}` : null}
              </p>
            </div>
            <div>
              <button type="submit" className={buttonPrimary}>
                {T.load}
              </button>
            </div>
          </form>
        </Card>

        <Card title={T.examplesTitle}>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{T.examplesUsed(fmtNumber(usedExamples.length), fmtNumber(EXAMPLES_MAX))}</summary>
            <p className="my-2 max-w-3xl text-sm text-ink-500">{T.examplesHelp}</p>
            {examples.length === 0 ? (
              <p className="text-sm text-ink-500">{T.examplesEmpty}</p>
            ) : (
              <ul className="grid gap-3">
                {examples.map((e) => (
                  <li key={e.id} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-500">
                        {fmtDateTime(e.createdAt)} {e.excluded ? <Badge>{T.excluded}</Badge> : null}
                      </p>
                      <form action={toggleExampleAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="excluded" value={e.excluded ? "false" : "true"} />
                        <button type="submit" className={buttonSecondary}>
                          {e.excluded ? T.include : T.exclude}
                        </button>
                      </form>
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {T.subject}: {e.subject}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{e.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </Card>

        <Card title={T.fixedTitle}>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{T.fixedShow}</summary>
            <p className="my-2 max-w-3xl text-sm text-ink-500">{T.fixedHelp}</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-sm bg-paper-100 p-3 text-xs">{fixedContext()}</pre>
          </details>
        </Card>
      </div>
    </>
  );
}
