"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { track } from "@/lib/analytics-client";
import { FLOW, HERO, RESULT_ERROR, RESULT_RATE_LIMITED, RESULT_TURNSTILE, SERIAL_VALIDATION } from "@/lib/copy/es";
import { normalizeSerial, validateSerial } from "@/lib/serial";
import { requestTypeForState, type RegistrationResponse, type RequestType, type SerialVerificationStatus, type VerifyResponse } from "@/lib/types";
import { RegistrationForm } from "./RegistrationForm";
import { SuccessState } from "./SuccessState";
import { Turnstile } from "./Turnstile";
import { Button, cx, inputClass } from "./ui";
import { VerificationResult, type VerifyOk } from "./VerificationResult";

type RegistrationOk = Extract<RegistrationResponse, { ok: true }>;

type Step =
  | { kind: "idle" }
  | { kind: "result"; result: VerifyOk }
  | { kind: "form"; result: VerifyOk; requestType: RequestType; verification: SerialVerificationStatus; serial: string }
  | { kind: "success"; response: RegistrationOk };

type Notice =
  | { type: "RATE_LIMITED"; message?: string; retryAfterSeconds?: number }
  | { type: "TURNSTILE_REQUIRED"; message?: string }
  | { type: "TURNSTILE_FAILED"; message?: string }
  | { type: "ERROR"; message?: string };

export interface RecallFlowProps {
  serialDbStatus: "PENDING" | "COMPLETE";
  turnstileSiteKey?: string;
}

function eventFor(state: VerifyOk["state"]) {
  switch (state) {
    case "AFFECTED":
      return "serial_check_affected" as const;
    case "NOT_IDENTIFIED":
      return "serial_check_not_identified" as const;
    case "PENDING_DATABASE":
      return "serial_check_pending_database" as const;
    default:
      return "serial_check_manual_review" as const;
  }
}

/**
 * Flujo principal: hero + verificador → resultado → formulario → confirmación.
 * Todo ocurre en la misma página, sin recargas, con foco y scroll gestionados.
 */
export function RecallFlow({ serialDbStatus, turnstileSiteKey }: RecallFlowProps) {
  const [serialInput, setSerialInput] = useState("");
  const [inlineError, setInlineError] = useState<{ reason: keyof typeof SERIAL_VALIDATION } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const lastSerial = useRef("");

  const inputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultRegionRef = useRef<HTMLDivElement>(null);

  // Foco + scroll al cambiar de paso (accesibilidad).
  useEffect(() => {
    const target =
      step.kind === "result" ? resultHeadingRef.current : step.kind === "form" ? formHeadingRef.current : step.kind === "success" ? successHeadingRef.current : null;
    if (!target) return;
    const id = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [step]);

  const runVerify = useCallback(async (raw: string, turnstileToken?: string) => {
    setLoading(true);
    setNotice(null);
    lastSerial.current = raw;
    track("serial_check_started");
    try {
      const res = await fetch("/api/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: raw, ...(turnstileToken ? { turnstileToken } : {}) }),
      });
      let data: VerifyResponse | null = null;
      try {
        data = (await res.json()) as VerifyResponse;
      } catch {
        data = null;
      }
      if (!data) {
        setNotice(res.status === 429 ? { type: "RATE_LIMITED" } : { type: "ERROR" });
        return;
      }
      if (!data.ok) {
        if (data.error === "RATE_LIMITED") setNotice({ type: "RATE_LIMITED", message: data.message, retryAfterSeconds: data.retryAfterSeconds });
        else if (data.error === "TURNSTILE_REQUIRED") setNotice({ type: "TURNSTILE_REQUIRED", message: data.message });
        else if (data.error === "TURNSTILE_FAILED") setNotice({ type: "TURNSTILE_FAILED", message: data.message });
        else setNotice({ type: "ERROR", message: data.message });
        return;
      }
      setStep({ kind: "result", result: data });
      track(eventFor(data.state));
    } catch {
      setNotice({ type: "ERROR" });
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const v = validateSerial(serialInput);
    if (!v.valid) {
      setInlineError({ reason: v.reason });
      setStep({ kind: "idle" });
      inputRef.current?.focus();
      return;
    }
    setInlineError(null);
    void runVerify(serialInput);
  }

  function openManualFromInvalid() {
    const reason = inlineError?.reason ?? "INVALID_CHARS";
    const result: VerifyOk = { ok: true, state: "UNVERIFIED", serial: normalizeSerial(serialInput), reason };
    setInlineError(null);
    setNotice(null);
    setStep({ kind: "result", result });
    track("serial_check_manual_review");
  }

  function startRegistration(requestType: RequestType) {
    if (step.kind !== "result") return;
    const r = step.result;
    setStep({ kind: "form", result: r, requestType, verification: r.state, serial: r.serial });
    track("registration_started");
  }

  function verifyAnother() {
    setStep({ kind: "idle" });
    setNotice(null);
    setInlineError(null);
    setSerialInput("");
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function handleRegistered(response: RegistrationOk) {
    setStep({ kind: "success", response });
    track("registration_completed");
    if (response.requestType !== "REPLACEMENT") track("manual_review_requested");
  }

  const inlineMessage = inlineError ? SERIAL_VALIDATION[inlineError.reason] : null;
  const showManualFromInvalid = inlineError && inlineError.reason !== "EMPTY";

  return (
    <>
      {/* ── HERO + VERIFICADOR ── */}
      <section id="verificar" aria-labelledby="hero-titulo" className="scroll-mt-4 bg-paper">
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-ink-500">{HERO.kicker}</p>
              <h1 id="hero-titulo" className="headline mt-2 text-[40px] text-ink sm:text-[56px] lg:text-[64px]">
                {HERO.title}
              </h1>
              <p className="mt-4 text-[18px] font-semibold leading-snug text-ink sm:text-[22px]">{HERO.subtitle}</p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-700 sm:text-[17px]">{HERO.body1}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-700 sm:text-[17px]">{HERO.body2}</p>
            </div>

            <div>
              <form onSubmit={handleSubmit} noValidate className="rounded-md border border-ink bg-paper p-5 sm:p-6" aria-label={HERO.cta}>
                <label htmlFor="serie" className="block text-sm font-bold uppercase tracking-[0.1em] text-ink">
                  {HERO.serialLabel}
                </label>
                <input
                  ref={inputRef}
                  id="serie"
                  name="serie"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
                  placeholder={HERO.serialPlaceholder}
                  value={serialInput}
                  onChange={(e) => {
                    setSerialInput(e.target.value);
                    if (inlineError) setInlineError(null);
                  }}
                  aria-invalid={inlineError ? true : undefined}
                  aria-describedby={inlineError ? "serie-error" : "serie-ayuda"}
                  disabled={loading}
                  className={cx(inputClass, "mt-2 serial text-[18px] font-bold uppercase placeholder:font-sans placeholder:text-[15px] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal")}
                />
                {inlineMessage ? (
                  <p id="serie-error" role="alert" className="mt-2 text-sm font-medium text-alert">
                    {inlineMessage}
                  </p>
                ) : null}
                {showManualFromInvalid ? (
                  <button type="button" onClick={openManualFromInvalid} className="mt-2 text-left text-sm underline underline-offset-4 text-ink-700 hover:text-ink">
                    {FLOW.manualFromInvalid}
                  </button>
                ) : null}

                <Button type="submit" variant="primary" disabled={loading} aria-busy={loading || undefined} className="mt-4 w-full sm:w-full">
                  {loading ? HERO.ctaLoading : HERO.cta}
                </Button>

                <p id="serie-ayuda" className="mt-3 text-sm">
                  <a href="#donde-esta-la-serie" className="underline underline-offset-4 text-ink-700 hover:text-ink">
                    {HERO.whereIsSerial}
                  </a>
                </p>
              </form>

              {serialDbStatus === "PENDING" ? (
                <p className="mt-4 rounded-sm border border-line bg-paper-100 px-4 py-3 text-sm leading-relaxed text-ink-700">{HERO.interimNotice}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── RESULTADO / FORMULARIO / CONFIRMACIÓN ── */}
      <div ref={resultRegionRef} role="status" aria-live="polite" aria-label={FLOW.resultRegionLabel} className={cx((notice || step.kind !== "idle") && "border-t border-line bg-paper-100")}>
        {notice || step.kind !== "idle" ? (
          <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
            {notice ? <NoticeCard notice={notice} siteKey={turnstileSiteKey} onToken={(t) => void runVerify(lastSerial.current, t)} onRetry={() => void runVerify(lastSerial.current)} /> : null}

            {step.kind === "result" ? (
              <VerificationResult result={step.result} headingRef={resultHeadingRef} onStartRegistration={startRegistration} onVerifyAnother={verifyAnother} />
            ) : null}

            {step.kind === "form" ? (
              <>
                <CompactResult result={step.result} />
                <RegistrationForm
                  serial={step.serial}
                  requestType={step.requestType}
                  verification={step.verification}
                  headingRef={formHeadingRef}
                  onSuccess={handleRegistered}
                  onBack={() => setStep({ kind: "result", result: step.result })}
                />
              </>
            ) : null}

            {step.kind === "success" ? (
              <SuccessState
                outcome={step.response.outcome}
                caseId={step.response.caseId}
                serial={step.response.serial}
                requestType={step.response.requestType}
                headingRef={successHeadingRef}
                onBackHome={verifyAnother}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Resumen compacto del resultado mientras el formulario está abierto. */
function CompactResult({ result }: { result: VerifyOk }) {
  const affected = result.state === "AFFECTED";
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-sm border px-4 py-3", affected ? "border-alert bg-alert-50" : "border-line bg-paper")}>
      <span className={cx("text-[12px] font-bold uppercase tracking-[0.12em]", affected ? "text-alert-700" : "text-ink-500")}>
        {affected ? FLOW.compact.AFFECTED : result.state === "PENDING_DATABASE" ? FLOW.compact.PENDING_DATABASE : FLOW.compact.MANUAL_REVIEW}
      </span>
      {result.serial ? <span className="serial text-sm font-bold text-ink">{result.serial}</span> : null}
    </div>
  );
}

function NoticeCard({ notice, siteKey, onToken, onRetry }: { notice: Notice; siteKey?: string; onToken: (token: string) => void; onRetry: () => void }) {
  if (notice.type === "TURNSTILE_REQUIRED") {
    if (siteKey) {
      return (
        <div className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8">
          <h2 className="headline text-[20px] text-ink">{RESULT_TURNSTILE.title}</h2>
          <p className="mt-2 text-[15px] text-ink-700">{notice.message || RESULT_TURNSTILE.body}</p>
          <Turnstile siteKey={siteKey} onToken={onToken} />
        </div>
      );
    }
    return (
      <div className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8">
        <h2 className="headline text-[20px] text-ink">{RESULT_TURNSTILE.unavailableTitle}</h2>
        <p className="mt-2 text-[15px] text-ink-700">{RESULT_TURNSTILE.unavailableBody}</p>
      </div>
    );
  }
  if (notice.type === "TURNSTILE_FAILED") {
    return (
      <div className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8">
        <p className="text-[15px] font-medium text-ink">{notice.message || RESULT_TURNSTILE.failed}</p>
        {siteKey ? <Turnstile siteKey={siteKey} onToken={onToken} /> : null}
      </div>
    );
  }
  if (notice.type === "RATE_LIMITED") {
    return (
      <div className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8">
        <h2 className="headline text-[20px] text-ink">{RESULT_RATE_LIMITED.title}</h2>
        <p className="mt-2 text-[15px] text-ink-700">{notice.message || RESULT_RATE_LIMITED.body}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-paper px-5 py-6 sm:px-8">
      <h2 className="headline text-[20px] text-ink">{RESULT_ERROR.title}</h2>
      <p className="mt-2 text-[15px] text-ink-700">{notice.message || RESULT_ERROR.body}</p>
      <div className="mt-4">
        <Button variant="secondary" onClick={onRetry}>
          {RESULT_ERROR.retry}
        </Button>
      </div>
    </div>
  );
}
