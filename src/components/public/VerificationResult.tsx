"use client";

import type { RefObject } from "react";
import { FLOW, RESULT_AFFECTED, RESULT_NOT_FOUND, RESULT_PENDING_DATABASE, RESULT_REINFORCED, SERIAL_VALIDATION, WHERE_SERIAL } from "@/lib/copy/es";
import { MANUAL_REVIEW_AFTER_ATTEMPTS } from "@/lib/limits";
import type { RequestType, VerifyResponse } from "@/lib/types";
import { Badge, Button, cx } from "./ui";

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
export function VerificationResult({ result, headingRef, failedAttempts, onStartRegistration, onRetry, onVerifyAnother }: VerificationResultProps) {
  const headingProps = { ref: headingRef, tabIndex: -1 as const, className: "headline outline-none" };

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
            <p className="text-[15px] text-ink-500">{RESULT_REINFORCED.body3}</p>
          </div>
          <SerialLine label={RESULT_REINFORCED.serialLabel} serial={result.serial} model={result.model} size={result.size} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
 * Serie no encontrada o con formato inválido: mensaje de error y "volver a intentar".
 * Tras MANUAL_REVIEW_AFTER_ATTEMPTS intentos fallidos seguidos se ofrece la revisión manual,
 * para que un dueño con la serie bien escrita (pero ausente de la lista) no quede sin salida.
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
  const offerManual = failedAttempts >= MANUAL_REVIEW_AFTER_ATTEMPTS;
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
      {offerManual ? (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[16px] font-bold text-ink">{RESULT_NOT_FOUND.manualTitle}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{RESULT_NOT_FOUND.manualBody}</p>
          <p className="mt-2 text-[15px] font-semibold text-ink">{RESULT_NOT_FOUND.manualSafety}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="secondary" onClick={() => onStartRegistration("MANUAL_REVIEW")}>
              {RESULT_NOT_FOUND.manualCta}
            </Button>
            <a href="#contacto" className="text-sm underline underline-offset-4 text-ink-700 hover:text-ink">
              {RESULT_NOT_FOUND.contactLink}
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}
