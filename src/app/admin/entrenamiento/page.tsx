import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import { AlertBox, Badge, Card, Flash, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/admin/ui";
import { deleteKnowledgeAction, saveKnowledgeAction, toggleExampleAction } from "@/lib/admin/ai-actions";
import { requireAdmin } from "@/lib/admin/session";
import { EXAMPLES_MAX, KNOWLEDGE_BODY_MAX, KNOWLEDGE_TITLE_MAX, KNOWLEDGE_TOTAL_MAX, activeKnowledgeChars, fixedContext, listExampleReplies, listKnowledge } from "@/lib/ai/knowledge";
import { ADMIN } from "@/lib/copy/es-admin";

export const dynamic = "force-dynamic";

const T = ADMIN.ai;
const FLASH_ERRORS = new Set(["tooLong", "invalid"]);

export default async function AdminTrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const msgKey = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const msg = msgKey && msgKey in T.messages ? { key: msgKey, text: T.messages[msgKey as keyof typeof T.messages] } : null;
  const [cards, examples] = await Promise.all([listKnowledge(), listExampleReplies({ includeExcluded: true })]);
  const used = activeKnowledgeChars(cards);
  const examplesUsed = examples.filter((e) => !e.excluded).length;

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
        <Card title={T.newTitle}>
          <p className="mb-3 max-w-3xl text-sm text-ink-500">{T.newHelp}</p>
          <form action={saveKnowledgeAction} className="grid gap-3">
            <div>
              <label htmlFor="new-title" className={labelClass}>
                {T.fieldTitle}
              </label>
              <input id="new-title" name="title" required maxLength={KNOWLEDGE_TITLE_MAX} className={inputClass} />
              <p className="mt-1 text-xs text-ink-500">{T.titleLimit}</p>
            </div>
            <div>
              <label htmlFor="new-body" className={labelClass}>
                {T.fieldBody}
              </label>
              <textarea id="new-body" name="body" required rows={5} maxLength={KNOWLEDGE_BODY_MAX} className={inputClass} />
              <p className="mt-1 text-xs text-ink-500">{T.bodyLimit}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked /> {T.fieldActive}
            </label>
            <div>
              <button type="submit" className={buttonPrimary}>
                {T.save}
              </button>
            </div>
          </form>
        </Card>

        <Card title={T.cardsTitle}>
          <p className="mb-3 text-sm tabular-nums text-ink-500">{T.charsUsed(fmtNumber(used), fmtNumber(KNOWLEDGE_TOTAL_MAX))}</p>
          {cards.length === 0 ? (
            <p className="text-sm text-ink-500">{T.cardsEmpty}</p>
          ) : (
            <ul className="grid gap-3">
              {cards.map((k) => (
                <li key={k.id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">
                      {k.title} {!k.active ? <Badge>{T.inactive}</Badge> : null}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={saveKnowledgeAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <input type="hidden" name="title" value={k.title} />
                        <input type="hidden" name="body" value={k.body} />
                        <input type="hidden" name="active" value={k.active ? "false" : "true"} />
                        <button type="submit" className={buttonSecondary}>
                          {k.active ? T.deactivate : T.activate}
                        </button>
                      </form>
                      <form action={deleteKnowledgeAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <ConfirmSubmit message={T.deleteConfirm} className={buttonDanger}>
                          {T.delete}
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-700">{k.body}</p>
                  <p className="mt-1 text-xs tabular-nums text-ink-500">{fmtNumber(k.title.length + k.body.length)}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">{T.edit}</summary>
                    <form action={saveKnowledgeAction} className="mt-2 grid gap-3">
                      <input type="hidden" name="id" value={k.id} />
                      <div>
                        <label htmlFor={`t-${k.id}`} className={labelClass}>
                          {T.fieldTitle}
                        </label>
                        <input id={`t-${k.id}`} name="title" required defaultValue={k.title} maxLength={KNOWLEDGE_TITLE_MAX} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`b-${k.id}`} className={labelClass}>
                          {T.fieldBody}
                        </label>
                        <textarea id={`b-${k.id}`} name="body" required rows={6} defaultValue={k.body} maxLength={KNOWLEDGE_BODY_MAX} className={inputClass} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={k.active} /> {T.fieldActive}
                      </label>
                      <div>
                        <button type="submit" className={buttonPrimary}>
                          {T.saveChanges}
                        </button>
                      </div>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={T.fixedTitle}>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{T.fixedTitle}</summary>
            <p className="my-2 max-w-3xl text-sm text-ink-500">{T.fixedHelp}</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-sm bg-paper-100 p-3 text-xs">{fixedContext()}</pre>
          </details>
        </Card>

        <Card title={T.examplesTitle}>
          <p className="mb-1 max-w-3xl text-sm text-ink-500">{T.examplesHelp}</p>
          <p className="mb-3 text-sm tabular-nums text-ink-500">{T.examplesUsed(fmtNumber(examplesUsed), fmtNumber(EXAMPLES_MAX))}</p>
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
        </Card>
      </div>
    </>
  );
}
