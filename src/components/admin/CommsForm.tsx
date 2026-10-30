"use client";
import { startTransition, useActionState, useState } from "react";
import { broadcastAction, type BroadcastActionState } from "@/lib/admin/actions";
import type { BroadcastTarget } from "@/lib/recall/follow-up";
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
  const [target, setTarget] = useState<BroadcastTarget>("cases");
  const [confirmed, setConfirmed] = useState(false);
  const counts: Record<BroadcastTarget, number> = { cases, contacts, all: cases + contacts };
  const total = counts[target];

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
      <fieldset className="grid gap-1.5">
        <legend className={labelClass}>{C.target}</legend>
        {(["cases", "contacts", "all"] as const).map((t) => (
          <label key={t} className="flex items-start gap-2 text-sm">
            <input type="radio" checked={target === t} onChange={() => setTarget(t)} className="mt-0.5 size-4 accent-ink" />
            {C.targets[t]} ({counts[t]})
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
        {C.confirm}
      </label>
      {/* Destinatarios y confirmación viajan desde el estado, así lo enviado es siempre lo que muestra el botón. */}
      <input type="hidden" name="target" value={target} />
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
