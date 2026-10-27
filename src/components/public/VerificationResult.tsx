"use client";

import type { RefObject } from "react";
import { FLOW, RESULT_AFFECTED, RESULT_NOT_IDENTIFIED, RESULT_PENDING_DATABASE, RESULT_UNVERIFIED } from "@/lib/copy/es";
import type { RequestType, VerifyResponse } from "@/lib/types";
import { Badge, Button, cx } from "./ui";

export type VerifyOk = Extract<VerifyResponse, { ok: true }>;

export interface VerificationResultProps {
  result: VerifyOk;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onStartRegistration: (requestType: RequestType) => void;
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
export function VerificationResult({ result, headingRef, onStartRegistration, onVerifyAnother }: VerificationResultProps) {
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

  if (result.state === "NOT_IDENTIFIED") {
    return (
      <article aria-labelledby="resultado-titulo" className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8 sm:py-8">
        <Badge tone="neutral">{RESULT_NOT_IDENTIFIED.badge}</Badge>
        <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
          {RESULT_NOT_IDENTIFIED.title}
        </h2>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-700">
          <p>{RESULT_NOT_IDENTIFIED.body1}</p>
          <p>{RESULT_NOT_IDENTIFIED.body2}</p>
          <p className="font-semibold text-ink">{RESULT_NOT_IDENTIFIED.body3}</p>
        </div>
        <SerialLine label={FLOW.verifiedSerialLabel} serial={result.serial} />
        {/* Decisión de Cross Mountain (27-10-2026): sin botón de revisión manual; solo verificar otro número. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="primary" onClick={onVerifyAnother}>
            {RESULT_NOT_IDENTIFIED.ctaAnother}
          </Button>
        </div>
      </article>
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

  // UNVERIFIED
  return (
    <article aria-labelledby="resultado-titulo" className="rounded-md border border-line bg-paper-100 px-5 py-6 sm:px-8 sm:py-8">
      <Badge tone="neutral">{RESULT_UNVERIFIED.badge}</Badge>
      <h2 id="resultado-titulo" {...headingProps} className="headline mt-4 text-[22px] text-ink outline-none sm:text-[28px]">
        {RESULT_UNVERIFIED.title}
      </h2>
      <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-700">
        <p>{RESULT_UNVERIFIED.body1}</p>
        <p>{RESULT_UNVERIFIED.body2}</p>
        <p className="font-semibold text-ink">{RESULT_UNVERIFIED.safety}</p>
      </div>
      {result.serial ? <SerialLine label={FLOW.verifiedSerialLabel} serial={result.serial} /> : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" onClick={() => onStartRegistration("MANUAL_REVIEW")}>
          {RESULT_UNVERIFIED.cta}
        </Button>
        <Button variant="secondary" onClick={onVerifyAnother}>
          {RESULT_UNVERIFIED.ctaAnother}
        </Button>
      </div>
    </article>
  );
}
