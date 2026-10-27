import { CASE_STATUSES, type RecallCase } from "@/db/schema";
import { addNote, assignCase, setReplacementFrame, updateCaseStatus } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { labelStatus } from "./format";
import { Card, buttonPrimary, inputClass, labelClass, selectClass } from "./ui";

const A = ADMIN.caseDetail.actions;
const S = ADMIN.caseDetail.sections;

export function CaseActions({ c }: { c: RecallCase }) {
  return (
    <div className="grid gap-4">
      <Card title={A.changeStatus}>
        <form action={updateCaseStatus} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="caseId" value={c.caseId} />
          <div className="flex-1">
            <label htmlFor="status" className={labelClass}>
              {A.newStatus}
            </label>
            <select id="status" name="status" defaultValue={c.caseStatus} className={selectClass}>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labelStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonPrimary}>
            {A.save}
          </button>
        </form>
      </Card>

      <Card title={A.assign}>
        <form action={assignCase} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="caseId" value={c.caseId} />
          <div className="flex-1">
            <label htmlFor="assignedTo" className={labelClass}>
              {ADMIN.caseDetail.fields.assignedTo}
            </label>
            <input id="assignedTo" name="assignedTo" defaultValue={c.assignedTo ?? ""} placeholder={A.assignPlaceholder} maxLength={80} className={inputClass} />
          </div>
          <button type="submit" className={buttonPrimary}>
            {A.assign}
          </button>
        </form>
      </Card>

      <Card title={S.replacement}>
        <form action={setReplacementFrame} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="caseId" value={c.caseId} />
          <div>
            <label htmlFor="replacementFrameSerial" className={labelClass}>
              {ADMIN.caseDetail.fields.replacementSerial}
            </label>
            <input
              id="replacementFrameSerial"
              name="replacementFrameSerial"
              defaultValue={c.replacementFrameSerial ?? ""}
              placeholder={A.replacementSerialPlaceholder}
              maxLength={64}
              className={`${inputClass} font-mono`}
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label htmlFor="replacementFrameVersion" className={labelClass}>
              {ADMIN.caseDetail.fields.replacementVersion}
            </label>
            <input
              id="replacementFrameVersion"
              name="replacementFrameVersion"
              defaultValue={c.replacementFrameVersion ?? ""}
              placeholder={A.replacementVersionPlaceholder}
              maxLength={120}
              className={inputClass}
            />
          </div>
          <button type="submit" className={buttonPrimary}>
            {A.setReplacement}
          </button>
        </form>
      </Card>

      <Card title={A.addNote}>
        <form action={addNote} className="grid gap-2">
          <input type="hidden" name="caseId" value={c.caseId} />
          <div>
            <label htmlFor="author" className={labelClass}>
              Autor
            </label>
            <input id="author" name="author" placeholder="Tu nombre" maxLength={80} className={inputClass} />
          </div>
          <div>
            <label htmlFor="body" className={labelClass}>
              Nota
            </label>
            <textarea id="body" name="body" required rows={3} maxLength={4000} placeholder={A.notePlaceholder} className={inputClass} />
          </div>
          <div>
            <button type="submit" className={buttonPrimary}>
              {A.addNote}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
