"use client";
import { useActionState, useEffect, useState } from "react";
import { sendEmailAction, type SendEmailActionState } from "@/lib/admin/actions";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonPrimary, inputClass, labelClass, selectClass } from "./ui";

const I = ADMIN.inbox;
const initial: SendEmailActionState = { status: "idle" };

export interface ComposerTarget {
  /** Número de caso público; si existe, el correo va al correo registrado del caso. */
  caseId: string | null;
  to: string;
  firstName: string | null;
  serial: string | null;
  /** Asunto de respuesta sugerido ("Re: …"). */
  replySubject?: string;
}

function fill(text: string, t: ComposerTarget): string {
  return text
    .replaceAll("{nombre}", t.firstName ?? "")
    .replaceAll("{caso}", t.caseId ?? "")
    .replaceAll("{serie}", t.serial ?? "")
    .replace(/Hola :/g, "Hola:")
    .replace(/ – caso $/, "")
    .replace(/\s+\(\)/g, "");
}

export function EmailComposer({ target, title }: { target: ComposerTarget; title: string }) {
  const [state, formAction, pending] = useActionState(sendEmailAction, initial);
  // Controlados: React reinicia los campos no controlados después de cada acción.
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(target.replySubject ?? "");
  const [body, setBody] = useState("");
  const sentAt = state.status === "sent" ? state.at : 0;
  useEffect(() => {
    if (!sentAt) return;
    setTemplateId("");
    setSubject(target.replySubject ?? "");
    setBody("");
  }, [sentAt, target.replySubject]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = ADMIN.templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(fill(t.subject, target));
    setBody(fill(t.body, target));
  }

  return (
    <form action={formAction} className="grid gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">{title}</h3>
      <input type="hidden" name="caseId" value={target.caseId ?? ""} />
      <input type="hidden" name="to" value={target.to} />
      <p className="text-sm">
        <span className={labelClass + " inline"}>{I.to}: </span>
        {target.to}
      </p>
      <div>
        <label htmlFor="template" className={labelClass}>
          {I.template}
        </label>
        <select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={selectClass}>
          <option value="">{I.templateNone}</option>
          {ADMIN.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="subject" className={labelClass}>
          {I.subject}
        </label>
        <input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required className={inputClass} />
      </div>
      <div>
        <label htmlFor="body" className={labelClass}>
          {I.body}
        </label>
        <textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} required rows={9} className={inputClass} />
        <p className="mt-1 text-xs text-ink-500">{I.bodyHelp}</p>
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? I.sending : I.send}
        </button>
      </div>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
            {state.message}
          </p>
        ) : state.status === "sent" ? (
          <p className="rounded-md border border-ink-300 bg-paper-100 px-3 py-2 text-sm">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
