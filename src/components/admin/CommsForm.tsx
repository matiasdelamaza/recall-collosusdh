"use client";
import { startTransition, useActionState, useState } from "react";
import { broadcastAction, type BroadcastActionState } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonDanger, buttonSecondary, inputClass, labelClass } from "./ui";

const C = ADMIN.comms;
const initial: BroadcastActionState = { status: "idle" };

export function CommsForm({ cases, contacts }: { cases: number; contacts: number }) {
  const [state, formAction, pending] = useActionState(broadcastAction, initial);
  // El envío se despacha a mano (sin la prop `action`) para que React no restablezca el formulario:
  // al restablecerlo, la casilla de contactos volvía a marcarse sin que cambiara el destinatario.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeContacts, setIncludeContacts] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const total = cases + (includeContacts ? contacts : 0);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (submitter?.getAttribute("value") === "send" && !window.confirm(C.confirmDialog(total))) return;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      <div>
        <label htmlFor="subject" className={labelClass}>
          {C.subject}
        </label>
        <input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required placeholder={C.subjectPlaceholder} className={inputClass} />
      </div>
      <div>
        <label htmlFor="body" className={labelClass}>
          {C.body}
        </label>
        <textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} required rows={8} placeholder={C.bodyPlaceholder} className={inputClass} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={includeContacts} onChange={(e) => setIncludeContacts(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
        {C.includeContacts} ({contacts})
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
        {C.confirm}
      </label>
      {/* Las casillas viajan desde el estado, así lo enviado es siempre lo que muestra el botón. */}
      <input type="hidden" name="includeContacts" value={includeContacts ? "on" : ""} />
      <input type="hidden" name="confirmed" value={confirmed ? "on" : ""} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="test" disabled={pending} className={buttonSecondary}>
          {pending ? C.sending : C.sendTest}
        </button>
        <button type="submit" name="intent" value="send" disabled={pending || !confirmed || total === 0} className={buttonDanger}>
          {pending ? C.sending : C.send(total)}
        </button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
          {state.message}
        </p>
      ) : state.status !== "idle" ? (
        <p role="status" className="rounded-md border border-line bg-paper-100 px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
