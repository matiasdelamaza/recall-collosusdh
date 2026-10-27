"use client";
import { useActionState } from "react";
import type { SerialDatabaseStatus } from "@/db/schema";
import { importSerialsAction, reprocessAction, setSerialDatabaseStatusAction, type ImportActionState, type ReprocessActionState } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass, labelClass } from "./ui";

const S = ADMIN.serials;

export function SerialDatabaseToggle({ status }: { status: SerialDatabaseStatus }) {
  const next: SerialDatabaseStatus = status === "COMPLETE" ? "PENDING" : "COMPLETE";
  const confirmText = next === "COMPLETE" ? S.confirmComplete : S.confirmPending;
  return (
    <form
      action={setSerialDatabaseStatusAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="status" value={next} />
      <button type="submit" className={next === "COMPLETE" ? buttonDanger : buttonSecondary}>
        {next === "COMPLETE" ? S.markComplete : S.markPending}
      </button>
    </form>
  );
}

const importInitial: ImportActionState = { status: "idle" };

export function ImportSerialsForm() {
  const [state, formAction, pending] = useActionState(importSerialsAction, importInitial);
  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3">
        <div>
          <label htmlFor="file" className={labelClass}>
            {S.importFile}
          </label>
          <input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="notes" className={labelClass}>
            {S.importNotes}
          </label>
          <input id="notes" name="notes" maxLength={500} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" defaultChecked />
          {S.importDryRun}
        </label>
        <div>
          <button type="submit" disabled={pending} className={buttonPrimary}>
            {pending ? ADMIN.common.loading : S.importSubmit}
          </button>
        </div>
      </form>

      {state.status === "error" ? (
        <p role="alert" className="rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
          {state.message}
        </p>
      ) : null}

      {state.status === "done" ? (
        <div role="status" className="rounded-md border border-line bg-paper-100 p-3 text-sm">
          <div className="mb-2 font-bold">
            {S.importResult} — {state.filename} {state.dryRun ? "(solo validación)" : ""}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
            <Stat label={S.importCols.rows} value={state.result.rowCount} />
            <Stat label={S.importCols.inserted} value={state.result.insertedCount} />
            <Stat label={S.importCols.updated} value={state.result.updatedCount} />
            <Stat label={S.importCols.skipped} value={state.result.skippedCount} />
            <Stat label={S.importCols.errors} value={state.result.errors.length} alert={state.result.errors.length > 0} />
          </dl>
          {state.result.errors.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">{S.importErrors}</div>
              <ul className="max-h-60 overflow-auto font-mono text-xs">
                {state.result.errors.map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const reprocessInitial: ReprocessActionState = { status: "idle" };

export function ReprocessForm() {
  const [state, formAction, pending] = useActionState(reprocessAction, reprocessInitial);
  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" />
          {S.reprocessNotify}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" defaultChecked />
          {S.reprocessDryRun}
        </label>
        <div>
          <button type="submit" disabled={pending} className={buttonPrimary}>
            {pending ? ADMIN.common.loading : S.reprocessSubmit}
          </button>
        </div>
      </form>
      {state.status === "error" ? (
        <p role="alert" className="rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <div role="status" className="rounded-md border border-line bg-paper-100 p-3 text-sm">
          <div className="mb-2 font-bold">
            {S.reprocessResult} {state.dryRun ? "(simulación)" : ""} {state.notify && !state.dryRun ? "· con notificación" : ""}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-6">
            <Stat label={S.reprocessCols.scanned} value={state.result.scanned} />
            <Stat label={S.reprocessCols.nowAffected} value={state.result.nowAffected} alert={state.result.nowAffected > 0} />
            <Stat label={S.reprocessCols.nowNotIdentified} value={state.result.nowNotIdentified} />
            <Stat label={S.reprocessCols.unchanged} value={state.result.unchanged} />
            <Stat label={S.reprocessCols.notified} value={state.result.notified} />
            <Stat label={S.reprocessCols.errors} value={state.result.errors.length} alert={state.result.errors.length > 0} />
          </dl>
          {state.result.errors.length > 0 ? (
            <ul className="mt-3 max-h-60 overflow-auto font-mono text-xs">
              {state.result.errors.map((e, i) => (
                <li key={i}>
                  {e.caseId}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className={`text-lg font-extrabold tabular-nums ${alert ? "text-alert-700" : ""}`}>{value}</dd>
    </div>
  );
}
