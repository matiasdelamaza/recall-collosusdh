import { markCalledAction } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonSecondary, inputClass } from "./ui";

const M = ADMIN.mesa;

/** Registrar una llamada al cliente (nota opcional). Marca como atendidos los correos del caso. */
export function CallForm({ caseId, back }: { caseId: string; back: string }) {
  return (
    <form action={markCalledAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="back" value={back} />
      <label className="sr-only" htmlFor={`note-${caseId}`}>
        {M.callNote}
      </label>
      <input id={`note-${caseId}`} name="note" maxLength={500} placeholder={M.callNotePlaceholder} className={`${inputClass} min-w-0 flex-1 basis-56`} />
      <button type="submit" className={buttonSecondary}>
        {M.markCalled}
      </button>
    </form>
  );
}
