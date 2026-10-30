"use client";
import { useActionState } from "react";
import { importOutreachAction, rebuildCaseEmailsAction, type RebuildActionState } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonSecondary, inputClass, labelClass } from "./ui";

const R = ADMIN.comms.rebuild;
const initial: RebuildActionState = { status: "idle" };

function Result({ state }: { state: RebuildActionState }) {
  if (state.status === "error")
    return (
      <p role="alert" className="rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
        {state.message}
      </p>
    );
  if (state.status === "done")
    return (
      <p role="status" className="rounded-md border border-line bg-paper-100 px-3 py-2 text-sm">
        {state.message}
      </p>
    );
  return null;
}

export function EmailBackfillForms() {
  const [system, systemAction, systemPending] = useActionState(rebuildCaseEmailsAction, initial);
  const [outreach, outreachAction, outreachPending] = useActionState(importOutreachAction, initial);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={systemAction} className="grid content-start gap-3">
        <h3 className="text-sm font-bold text-ink">{R.systemTitle}</h3>
        <p className="text-sm text-ink-500">{R.systemHelp}</p>
        <div>
          <button type="submit" disabled={systemPending} className={buttonSecondary}>
            {systemPending ? R.working : R.systemButton}
          </button>
        </div>
        <Result state={system} />
      </form>
      <form action={outreachAction} className="grid content-start gap-3">
        <h3 className="text-sm font-bold text-ink">{R.outreachTitle}</h3>
        <p className="text-sm text-ink-500">{R.outreachHelp}</p>
        <div>
          <label htmlFor="outreach-file" className={labelClass}>
            {R.outreachFile}
          </label>
          <input id="outreach-file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
        </div>
        <div>
          <button type="submit" disabled={outreachPending} className={buttonSecondary}>
            {outreachPending ? R.working : R.outreachButton}
          </button>
        </div>
        <Result state={outreach} />
      </form>
    </div>
  );
}
