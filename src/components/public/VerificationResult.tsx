"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { AFFECTED_GATE, FLOW, FORM_VALIDATION, RESULT_AFFECTED, RESULT_NOT_FOUND, RESULT_PENDING_DATABASE, RESULT_REINFORCED, SERIAL_VALIDATION, WHERE_SERIAL } from "@/lib/copy/es";
import { MANUAL_REVIEW_AFTER_ATTEMPTS } from "@/lib/limits";
import type { AffectedContactResponse, RequestType, VerifyResponse } from "@/lib/types";
import { EMAIL_RE } from "./RegistrationForm";
import { Badge, Button, cx, inputClass } from "./ui";

export type VerifyOk = Extract<VerifyResponse, { ok: true }>;

export interface VerificationResultProps {
  result: VerifyOk;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Intentos fallidos seguidos (no encontrada / formato inválido), incluido el actual. */
  failedAttempts: number;
  onStartRegistration: (requestType: RequestType) => void;
  /** Vuelve al campo de serie conservando lo escrito, para corregirlo. */
  onRetry: () => void;
  onVerifyAnother: () => void;
  /** Correo dejado antes de ver el resultado de una serie afectada (null = aún no se pide/entrega). */
  contactEmail?: string | null;
  onContactSaved?: (email: string) => void;
}

function SerialLine({ label, serial, model, size }: { label: string; serial: string; model?: string | null; size?: string | null }) {
  return (
    <dl className={cx("mt-5 grid gap-3 rounded-sm border border-line bg-paper p-4 text-sm", (model || size) && "sm:grid-cols-3")}>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</dt>
        <dd className="mt-1 break-all serial text-[15px] font-bold text-ink">{serial || "—"}</dd>
      </div>
      {model ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{FLOW.modelLabel}</dt>
          <dd className="mt-1 text-[15px] font-semibold text-ink">{model}</dd>
        </div>
      ) : null}
      {size ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{FLOW.sizeLabel}</dt>
          <dd className="mt-1 text-[15px] font-semibold text-ink">{size}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Tarjeta de resultado de la verificación: cuatro estados distintos (brief §10 y §34). */
export function VerificationResult({ result, headingRef, failedAttempts, onStartRegistration, onRetry, onVerifyAnother, contactEmail, onContactSaved }: VerificationResultProps) {
  const headingProps = { ref: headingRef, tabIndex: -1 as const, className: "headline outline-none" };

  // Serie afectada: primero se pide el correo; el aviso se muestra después (pedido de Cross Mountain).
  if (result.state === "AFFECTED" && !contactEmail && onContactSaved) {
    return <AffectedEmailGate headingProps={headingProps} serial={result.serial} lookupId={result.lookupId} onSaved={onContactSaved} />;
  }

  if (result.state === "AFFECTED") {
    return (
      <article aria-labelledby="resultado-titulo" className="overflow-hidden rounded-md border-2 border-alert bg-paper">
        <div className="bg-alert px-5 py-6 text-white sm:px-8 sm:py-8">
          <Badge tone="neutral">{RESULT_AFFECTED.badge}</Badge>
          <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[26px] text-white outline-none sm:text-[34px]">
            <span aria-hidden="true" className="mr-2">
              ⚠
            </span>
            {RESULT_AFFECTED.title}
          </h2>
          <p className="headline mt-3 text-[30px] text-white sm:text-[40px]">{RESULT_AFFECTED.subtitle}</p>
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="space-y-3 text-[16px] leading-relaxed text-ink-700">
            <p>{RESULT_AFFECTED.body1}</p>
            <p className="font-semibold text-ink">{RESULT_AFFECTED.body2}</p>
            <p>{RESULT_AFFECTED.body3}</p>
            <p className="font-semibold text-ink">{RESULT_AFFECTED.body4}</p>
          </div>
          <SerialLine label={RESULT_AFFECTED.serialLabel} serial={result.serial} model={result.model} size={result.size} />
          <div className="mt-6">
            <Button variant="primary" onClick={() => onStartRegistration("REPLACEMENT")} className="w-full">
              {RESULT_AFFECTED.cta}
            </Button>
          </div>
        </div>
      </article>
    );
  }

  if (result.state === "REINFORCED") {
    return (
      <article aria-labelledby="resultado-titulo" className="overflow-hidden rounded-md border-2 border-ok bg-paper">
        <div className="bg-ok px-5 py-6 text-white sm:px-8 sm:py-7">
          <Badge tone="ok">{RESULT_REINFORCED.badge}</Badge>
          <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[24px] text-white outline-none sm:text-[30px]">
            <span aria-hidden="true" className="mr-2">
              ✓
            </span>
            {RESULT_REINFORCED.title}
          </h2>
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="space-y-3 text-[16px] leading-relaxed text-ink-700">
            <p>{RESULT_REINFORCED.body1}</p>
            <p className="font-semibold text-ok-700">{RESULT_REINFORCED.body2}</p>
          </div>
          <SerialLine label={RESULT_REINFORCED.serialLabel} serial={result.serial} model={result.model} size={result.size} />
          <div className="mt-6 rounded-sm border border-line bg-paper-100 px-4 py-4">
            <p className="text-[15px] font-semibold leading-relaxed text-ink">{RESULT_REINFORCED.body3}</p>
            <Button variant="secondary" onClick={() => onStartRegistration("MANUAL_REVIEW")} className="mt-3">
              {RESULT_REINFORCED.ctaDamage}
            </Button>
          </div>
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={onVerifyAnother}>
              {RESULT_REINFORCED.ctaAnother}
            </Button>
          </div>
        </div>
      </article>
    );
  }

  if (result.state === "NOT_IDENTIFIED") {
    return (
      <NotFoundCard headingProps={headingProps} serial={result.serial} failedAttempts={failedAttempts} onRetry={onRetry} onStartRegistration={onStartRegistration} />
    );
  }

  if (result.state === "PENDING_DATABASE") {
    return (
      <article aria-labelledby="resultado-titulo" className="rounded-md border border-caution bg-caution-50 px-5 py-6 sm:px-8 sm:py-8">
        <Badge tone="caution">{RESULT_PENDING_DATABASE.badge}</Badge>
        <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
          {RESULT_PENDING_DATABASE.title}
        </h2>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-700">
          <p>{RESULT_PENDING_DATABASE.body1}</p>
          <p>{RESULT_PENDING_DATABASE.body2}</p>
          <p className="font-semibold text-ink">{RESULT_PENDING_DATABASE.safety}</p>
        </div>
        <SerialLine label={FLOW.verifiedSerialLabel} serial={result.serial} />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="primary" onClick={() => onStartRegistration("PENDING_DATABASE")}>
            {RESULT_PENDING_DATABASE.cta}
          </Button>
          <Button variant="secondary" onClick={onVerifyAnother}>
            {RESULT_PENDING_DATABASE.ctaAnother}
          </Button>
        </div>
      </article>
    );
  }

  // UNVERIFIED (formato inválido): mismo tratamiento que "no encontrado", con el motivo concreto.
  return (
    <NotFoundCard
      headingProps={headingProps}
      serial={result.serial}
      reason={SERIAL_VALIDATION[result.reason]}
      failedAttempts={failedAttempts}
      onRetry={onRetry}
      onStartRegistration={onStartRegistration}
    />
  );
}

/**
 * Paso previo al aviso de una serie afectada: pide un correo y no adelanta el resultado.
 * Solo un correo mal escrito detiene el paso; si el servidor falla, el aviso se muestra igual
 * (la persona no puede quedarse sin saber que no debe usar la bicicleta).
 */
function AffectedEmailGate({
  headingProps,
  serial,
  lookupId,
  onSaved,
}: {
  headingProps: { ref?: RefObject<HTMLHeadingElement | null>; tabIndex: -1; className: string };
  serial: string;
  lookupId: string | null;
  onSaved: (email: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError(FORM_VALIDATION.email);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSending(true);
    try {
      if (lookupId) {
        const res = await fetch("/api/verificar/correo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lookupId, email: value }),
        });
        const data = (await res.json().catch(() => null)) as AffectedContactResponse | null;
        if (data && !data.ok && data.error === "VALIDATION") {
          setError(data.message);
          setSending(false);
          inputRef.current?.focus();
          return;
        }
      }
    } catch {
      // Sin conexión con el servidor: se muestra el aviso igual.
    }
    onSaved(value);
  }

  return (
    <article aria-labelledby="resultado-titulo" className="rounded-md border-2 border-ink bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <Badge tone="neutral">{AFFECTED_GATE.badge}</Badge>
      <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
        {AFFECTED_GATE.title}
      </h2>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{AFFECTED_GATE.body}</p>
      <SerialLine label={FLOW.verifiedSerialLabel} serial={serial} />
      <form onSubmit={handleSubmit} noValidate className="mt-6">
        <label htmlFor="correo-resultado" className="block text-sm font-bold uppercase tracking-[0.1em] text-ink">
          {AFFECTED_GATE.emailLabel}
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            ref={inputRef}
            id="correo-resultado"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={160}
            required
            placeholder={AFFECTED_GATE.emailPlaceholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "correo-resultado-error" : "correo-resultado-ayuda"}
            disabled={sending}
            className={cx(inputClass, "sm:flex-1")}
          />
          <Button type="submit" variant="primary" disabled={sending} aria-busy={sending || undefined} className="w-full sm:w-auto">
            {sending ? AFFECTED_GATE.ctaLoading : AFFECTED_GATE.cta}
          </Button>
        </div>
        {error ? (
          <p id="correo-resultado-error" role="alert" className="mt-2 text-sm font-medium text-alert">
            {error}
          </p>
        ) : null}
        <p id="correo-resultado-ayuda" className="mt-3 text-sm leading-relaxed text-ink-500">
          {AFFECTED_GATE.privacy}{" "}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">
            ({FLOW.privacyLinkText})
          </a>
        </p>
      </form>
    </article>
  );
}

/**
 * Serie no encontrada o con formato inválido: mensaje de error y "volver a intentar".
 * Tras MANUAL_REVIEW_AFTER_ATTEMPTS intentos fallidos seguidos, la acción principal pasa a ser
 * enviar fotos, modelo y talla a Postventa (revisión manual), para que nadie quede sin salida.
 */
function NotFoundCard({
  headingProps,
  serial,
  reason,
  failedAttempts,
  onRetry,
  onStartRegistration,
}: {
  headingProps: { ref?: RefObject<HTMLHeadingElement | null>; tabIndex: -1; className: string };
  serial: string;
  reason?: string;
  failedAttempts: number;
  onRetry: () => void;
  onStartRegistration: (requestType: RequestType) => void;
}) {
  // Al tercer intento fallido, la ayuda de Postventa pasa a ser la acción principal.
  if (failedAttempts >= MANUAL_REVIEW_AFTER_ATTEMPTS) {
    return (
      <article aria-labelledby="resultado-titulo" className="rounded-md border-2 border-ink bg-paper px-5 py-6 sm:px-8 sm:py-8">
        <Badge tone="neutral">{RESULT_NOT_FOUND.badge}</Badge>
        <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
          {RESULT_NOT_FOUND.helpTitle}
        </h2>
        {reason ? <p className="mt-4 font-semibold text-alert-700">{reason}</p> : null}
        <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{RESULT_NOT_FOUND.helpBody}</p>
        <ol className="mt-4 space-y-2 rounded-sm border-l-4 border-ink bg-paper-100 p-4 text-[15px] leading-relaxed text-ink">
          {RESULT_NOT_FOUND.helpItems.map((item, i) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="font-bold tabular-nums">
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[15px] font-semibold text-ink">{RESULT_NOT_FOUND.manualSafety}</p>
        {serial ? <SerialLine label={FLOW.verifiedSerialLabel} serial={serial} /> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="primary" onClick={() => onStartRegistration("MANUAL_REVIEW")} className="w-full sm:w-auto">
            {RESULT_NOT_FOUND.manualCta}
          </Button>
          <Button variant="secondary" onClick={onRetry} className="w-full sm:w-auto">
            {RESULT_NOT_FOUND.retryAgain}
          </Button>
        </div>
        <p className="mt-4 text-sm">
          <a href="#contacto" className="underline underline-offset-4 text-ink-700 hover:text-ink">
            {RESULT_NOT_FOUND.contactLink}
          </a>
        </p>
      </article>
    );
  }

  return (
    <article aria-labelledby="resultado-titulo" className="rounded-md border-2 border-alert bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <Badge tone="neutral">{RESULT_NOT_FOUND.badge}</Badge>
      <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
        {RESULT_NOT_FOUND.title}
      </h2>
      <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-700">
        {reason ? <p className="font-semibold text-alert-700">{reason}</p> : null}
        <p>{RESULT_NOT_FOUND.body1}</p>
      </div>
      {serial ? <SerialLine label={FLOW.verifiedSerialLabel} serial={serial} /> : null}
      <dl className="mt-4 grid gap-4 rounded-sm border-l-4 border-ink bg-paper-100 p-4 text-[15px] leading-relaxed text-ink-700 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{RESULT_NOT_FOUND.formatLabel}</dt>
          <dd className="mt-1">{RESULT_NOT_FOUND.formatBody}</dd>
          <dd className="mt-2">
            <span className="text-ink-500">{RESULT_NOT_FOUND.exampleLabel}: </span>
            <span className="serial text-[17px] font-bold tracking-[0.06em] text-ink" translate="no">
              {WHERE_SERIAL.exampleSerial}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{RESULT_NOT_FOUND.locationLabel}</dt>
          <dd className="mt-1">{RESULT_NOT_FOUND.locationBody}</dd>
          <dd className="mt-2">
            <a href="#donde-esta-la-serie" className="font-semibold text-ink underline underline-offset-4 hover:text-ink-700">
              {RESULT_NOT_FOUND.locationLink}
            </a>
          </dd>
        </div>
      </dl>
      <div className="mt-6">
        <Button variant="primary" onClick={onRetry} className="w-full sm:w-auto">
          {RESULT_NOT_FOUND.retry}
        </Button>
      </div>
    </article>
  );
}
