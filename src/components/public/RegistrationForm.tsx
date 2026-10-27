"use client";

import { useRef, useState, type FormEvent } from "react";
import { FLOW, FORM, FORM_VALIDATION } from "@/lib/copy/es";
import { compressFormImages } from "@/lib/image-compress";
import { UPLOAD_MAX_TOTAL_BYTES } from "@/lib/limits";
import { CHILE_REGIONS, isChileRegion } from "@/lib/regions";
import { formatRut, isValidRut } from "@/lib/rut";
import { validateSerial } from "@/lib/serial";
import type { RegistrationResponse, RequestType, SerialVerificationStatus } from "@/lib/types";
import { Button, Field, FieldError, SELECT_ARROW_STYLE, cx, inputClass, selectClass } from "./ui";

/**
 * Reglas de archivos (espejo de UPLOAD_LIMITS en src/lib/config.ts; el servidor es la autoridad).
 * MAX_FILE_BYTES aplica a la foto original: antes de enviarla se reduce (src/lib/image-compress.ts)
 * y lo que se controla después es el total enviado (UPLOAD_MAX_TOTAL_BYTES).
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_TOTAL = 10;
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPT = [...ALLOWED_MIME, ...ALLOWED_EXT].join(",");

export interface RegistrationFormProps {
  serial: string;
  requestType: RequestType;
  verification: SerialVerificationStatus;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  onSuccess: (response: Extract<RegistrationResponse, { ok: true }>) => void;
  onBack: () => void;
}

type Errors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fileOk(file: File): string | null {
  if (!file || file.size === 0) return null;
  const name = file.name.toLowerCase();
  const extOk = ALLOWED_EXT.some((e) => name.endsWith(e));
  const mimeOk = !file.type || ALLOWED_MIME.includes(file.type);
  if (!extOk || !mimeOk) return FORM_VALIDATION.fileType;
  if (file.size > MAX_FILE_BYTES) return FORM_VALIDATION.fileSize;
  return null;
}

function filesFrom(fd: FormData, name: string): File[] {
  return fd.getAll(name).filter((v): v is File => v instanceof File && v.size > 0);
}

function validate(fd: FormData, requestType: RequestType, serialEditable: boolean): Errors {
  const errors: Errors = {};
  const str = (k: string) => String(fd.get(k) ?? "").trim();

  if (serialEditable) {
    // Serie ilegible o parcial: el servidor la acepta solo como revisión manual; aquí basta con que no esté vacía.
    const v = validateSerial(str("serial"));
    if (!v.valid && v.reason === "EMPTY") errors.serial = FORM_VALIDATION.required;
  }
  if (str("customerName").length < 3) errors.customerName = FORM_VALIDATION.customerName;
  if (!isValidRut(str("rut"))) errors.rut = FORM_VALIDATION.rut;
  if (!EMAIL_RE.test(str("email"))) errors.email = FORM_VALIDATION.email;
  const phoneDigits = str("phone").replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) errors.phone = FORM_VALIDATION.phone;
  if (!isChileRegion(str("region"))) errors.region = FORM_VALIDATION.region;
  if (!str("city")) errors.city = FORM_VALIDATION.city;
  if (!str("model")) errors.model = FORM_VALIDATION.model;
  if (!str("size")) errors.size = FORM_VALIDATION.size;
  if (!str("damageReported")) errors.damageReported = FORM_VALIDATION.damageReported;

  const serialPhotos = filesFrom(fd, "serialPhoto");
  const bikePhotos = filesFrom(fd, "bikePhoto");
  const headtube = filesFrom(fd, "headtubePhoto");
  const additional = filesFrom(fd, "additionalPhotos");
  const incident = filesFrom(fd, "incidentFiles");

  if (serialPhotos.length === 0) errors.serialPhoto = FORM_VALIDATION.serialPhoto;
  if (bikePhotos.length === 0) errors.bikePhoto = FORM_VALIDATION.bikePhoto;

  const check = (key: string, files: File[]) => {
    for (const f of files) {
      const err = fileOk(f);
      if (err) {
        errors[key] = err;
        return;
      }
    }
  };
  check("serialPhoto", serialPhotos);
  check("bikePhoto", bikePhotos);
  check("headtubePhoto", headtube);
  check("additionalPhotos", additional);
  check("incidentFiles", incident);

  const total = serialPhotos.length + bikePhotos.length + headtube.length + additional.length + incident.length;
  if (total > MAX_FILES_TOTAL) errors.additionalPhotos = FORM_VALIDATION.tooManyFiles;

  if (!fd.get("acknowledgeStopRiding")) errors.acknowledgeStopRiding = FORM_VALIDATION.acknowledge;
  if (!fd.get("acceptPrivacy")) errors.acceptPrivacy = FORM_VALIDATION.privacy;

  void requestType;
  return errors;
}

function FileInput({
  id,
  name,
  multiple,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  multiple?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [names, setNames] = useState<string[]>([]);
  // Input nativo oculto (su botón sale en el idioma del navegador); el control visible es propio y en español.
  return (
    <div className={cx("rounded-sm border border-line bg-paper p-3", invalid && "border-alert")}>
      <input
        id={id}
        name={name}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => setNames(Array.from(e.currentTarget.files ?? []).map((f) => f.name))}
        className="peer sr-only"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={id}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-sm border border-ink bg-paper px-4 text-sm font-semibold text-ink hover:bg-paper-100 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
        >
          {multiple ? FLOW.chooseFiles : FLOW.chooseFile}
        </label>
        <span className="text-xs text-ink-500">{names.length > 0 ? FLOW.filesSelected(names.length) : FLOW.noFileSelected}</span>
      </div>
      {names.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="truncate">
              {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RadioGroup({
  name,
  legend,
  options,
  error,
  required,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const errId = `${name}-error`;
  return (
    <fieldset className="mb-5" aria-describedby={error ? errId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-sm font-semibold text-ink">
        {legend}
        {required ? <span className="ml-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">{FORM.required}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3.5 text-[15px] text-ink has-[:checked]:border-ink has-[:checked]:bg-paper-100"
          >
            <input type="radio" name={name} value={o.value} onChange={() => onChange?.(o.value)} className="h-4 w-4 accent-ink" />
            {o.label}
          </label>
        ))}
      </div>
      <FieldError id={errId} message={error} />
    </fieldset>
  );
}

/** Formulario de registro del propietario (brief §11–§13). Un solo paso con secciones. */
export function RegistrationForm({ serial, requestType, verification, headingRef, onSuccess, onBack }: RegistrationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rut, setRut] = useState("");

  // Si la serie no pudo verificarse, el usuario puede corregirla; en los demás casos queda bloqueada.
  const serialEditable = verification === "UNVERIFIED";

  function focusFirstError(errs: Errors) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("requestType", requestType);
    if (!serialEditable) fd.set("serial", serial);

    const errs = validate(fd, requestType, serialEditable);
    setErrors(errs);
    setGeneralError(null);
    if (Object.keys(errs).length > 0) {
      setGeneralError(FORM_VALIDATION.generic);
      focusFirstError(errs);
      return;
    }

    setSubmitting(true);
    try {
      const totalBytes = await compressFormImages(fd);
      if (totalBytes > UPLOAD_MAX_TOTAL_BYTES) {
        setGeneralError(FORM_VALIDATION.tooLarge);
        return;
      }
      const res = await fetch("/api/registro", { method: "POST", body: fd });
      let data: RegistrationResponse | null = null;
      try {
        data = (await res.json()) as RegistrationResponse;
      } catch {
        data = null;
      }
      if (!data) {
        if (res.status === 413) setGeneralError(FORM_VALIDATION.tooLarge);
        else if (res.status === 429) setGeneralError(FORM_VALIDATION.rateLimited);
        else setGeneralError(FORM_VALIDATION.serverError);
        return;
      }
      if (data.ok) {
        onSuccess(data);
        return;
      }
      if (data.error === "VALIDATION") {
        setErrors(data.fields ?? {});
        setGeneralError(data.message || FORM_VALIDATION.generic);
        focusFirstError(data.fields ?? {});
        return;
      }
      const fallback: Record<string, string> = {
        RATE_LIMITED: FORM_VALIDATION.rateLimited,
        DUPLICATE_LIMIT: FORM_VALIDATION.duplicateLimit,
        TOO_LARGE: FORM_VALIDATION.tooLarge,
      };
      setGeneralError(data.message || fallback[data.error] || FORM_VALIDATION.serverError);
    } catch {
      setGeneralError(FORM_VALIDATION.serverError);
    } finally {
      setSubmitting(false);
    }
  }

  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-error` : undefined });

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate encType="multipart/form-data" aria-labelledby="formulario-titulo" className="rounded-md border border-line bg-paper">
      <div className="border-b border-line px-5 py-6 sm:px-8">
        <h2 id="formulario-titulo" ref={headingRef} tabIndex={-1} className="headline text-[24px] text-ink outline-none sm:text-[30px]">
          {FORM.title[requestType]}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{FORM.intro[requestType]}</p>
      </div>

      <div className="px-5 py-6 sm:px-8">
        {generalError ? (
          <div role="alert" className="mb-6 rounded-sm border border-alert bg-alert-50 px-4 py-3 text-sm font-medium text-alert-700">
            <p>{generalError}</p>
            {Object.keys(errors).length > 1 ? (
              <ul className="mt-2 list-disc pl-5 font-normal">
                {Object.values(errors).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Honeypot: los humanos no lo ven ni lo completan. */}
        <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="website">Sitio web</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <input type="hidden" name="requestType" value={requestType} />

        {/* ── Bicicleta ── */}
        <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{FORM.sections.bike}</h3>

        <Field id="serial" label={FORM.fields.serialNumber} hint={serialEditable ? FLOW.serialEditableHint : FORM.fields.serialReadOnlyHint} error={err("serial")} required requiredLabel={FORM.required}>
          <input
            id="serial"
            name="serial"
            type="text"
            defaultValue={serial}
            readOnly={!serialEditable}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            className={cx(inputClass, "serial font-bold", !serialEditable && "bg-paper-100 text-ink-700")}
            {...aria("serial")}
          />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="model" label={FORM.fields.model} error={err("model")} required requiredLabel={FORM.required}>
            <select id="model" name="model" defaultValue="" className={selectClass} style={SELECT_ARROW_STYLE} {...aria("model")}>
              <option value="" disabled>
                —
              </option>
              {(Object.keys(FORM.options.model) as (keyof typeof FORM.options.model)[]).map((k) => (
                <option key={k} value={k}>
                  {FORM.options.model[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="size" label={FORM.fields.size} error={err("size")} required requiredLabel={FORM.required}>
            <select id="size" name="size" defaultValue="" className={selectClass} style={SELECT_ARROW_STYLE} {...aria("size")}>
              <option value="" disabled>
                —
              </option>
              {(Object.keys(FORM.options.size) as (keyof typeof FORM.options.size)[]).map((k) => (
                <option key={k} value={k}>
                  {FORM.options.size[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="dealer" label={FORM.fields.dealer} error={err("dealer")} optionalLabel={FORM.optional}>
            <input id="dealer" name="dealer" type="text" placeholder={FORM.fields.dealerPlaceholder} maxLength={120} className={inputClass} {...aria("dealer")} />
          </Field>
          <Field id="purchaseDate" label={FORM.fields.purchaseDate} error={err("purchaseDate")} optionalLabel={FORM.optional}>
            <input id="purchaseDate" name="purchaseDate" type="text" placeholder={FORM.fields.purchaseDatePlaceholder} maxLength={40} className={inputClass} {...aria("purchaseDate")} />
          </Field>
        </div>

        {/* ── Propietario ── */}
        <h3 className="mb-4 mt-6 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{FORM.sections.customer}</h3>

        <Field id="customerName" label={FORM.fields.customerName} error={err("customerName")} required requiredLabel={FORM.required}>
          <input id="customerName" name="customerName" type="text" autoComplete="name" maxLength={120} className={inputClass} {...aria("customerName")} />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="rut" label={FORM.fields.rut} error={err("rut")} required requiredLabel={FORM.required}>
            <input
              id="rut"
              name="rut"
              type="text"
              inputMode="text"
              placeholder={FORM.fields.rutPlaceholder}
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              onBlur={() => setRut((v) => (v.trim() ? formatRut(v) : v))}
              maxLength={12}
              className={inputClass}
              {...aria("rut")}
            />
          </Field>
          <Field id="phone" label={FORM.fields.phone} error={err("phone")} required requiredLabel={FORM.required}>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={FORM.fields.phonePlaceholder} maxLength={20} className={inputClass} {...aria("phone")} />
          </Field>
        </div>

        <Field id="email" label={FORM.fields.email} error={err("email")} required requiredLabel={FORM.required}>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={160} className={inputClass} {...aria("email")} />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field id="region" label={FORM.fields.region} error={err("region")} required requiredLabel={FORM.required}>
            <select id="region" name="region" defaultValue="" className={selectClass} style={SELECT_ARROW_STYLE} {...aria("region")}>
              <option value="" disabled>
                {FORM.fields.regionPlaceholder}
              </option>
              {CHILE_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field id="city" label={FORM.fields.city} error={err("city")} required requiredLabel={FORM.required}>
            <input id="city" name="city" type="text" autoComplete="address-level2" maxLength={80} className={inputClass} {...aria("city")} />
          </Field>
        </div>

        {/* ── Fotografías ── */}
        <h3 className="mb-1 mt-6 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{FORM.sections.uploads}</h3>
        <p className="mb-4 text-sm text-ink-500">{FORM.uploadHint}</p>

        <Field id="serialPhoto" label={FORM.fields.serialPhoto} error={err("serialPhoto")} required requiredLabel={FORM.required}>
          <FileInput id="serialPhoto" name="serialPhoto" invalid={!!err("serialPhoto")} describedBy={err("serialPhoto") ? "serialPhoto-error" : undefined} />
        </Field>
        <Field id="bikePhoto" label={FORM.fields.bikePhoto} error={err("bikePhoto")} required requiredLabel={FORM.required}>
          <FileInput id="bikePhoto" name="bikePhoto" invalid={!!err("bikePhoto")} describedBy={err("bikePhoto") ? "bikePhoto-error" : undefined} />
        </Field>
        <Field id="headtubePhoto" label={FORM.fields.headtubePhoto} error={err("headtubePhoto")} optionalLabel={FORM.optional}>
          <FileInput id="headtubePhoto" name="headtubePhoto" invalid={!!err("headtubePhoto")} describedBy={err("headtubePhoto") ? "headtubePhoto-error" : undefined} />
        </Field>
        <Field id="additionalPhotos" label={FORM.fields.additionalPhotos} error={err("additionalPhotos")} optionalLabel={FORM.optional}>
          <FileInput id="additionalPhotos" name="additionalPhotos" multiple invalid={!!err("additionalPhotos")} describedBy={err("additionalPhotos") ? "additionalPhotos-error" : undefined} />
        </Field>

        {/* ── Estado del cuadro ── */}
        <h3 className="mb-4 mt-6 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{FORM.sections.incident}</h3>

        <RadioGroup
          name="damageReported"
          legend={FORM.fields.damageReported}
          required
          error={err("damageReported")}
          options={(Object.keys(FORM.options.tri) as (keyof typeof FORM.options.tri)[]).map((k) => ({ value: k, label: FORM.options.tri[k] }))}
        />

        {/* ── Confirmación ── */}
        <h3 className="mb-4 mt-6 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{FORM.sections.confirm}</h3>

        <div className="mb-4">
          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed text-ink">
            <input type="checkbox" name="acknowledgeStopRiding" className="mt-1 h-5 w-5 shrink-0 accent-ink" aria-describedby={err("acknowledgeStopRiding") ? "acknowledgeStopRiding-error" : undefined} />
            <span className="font-semibold">{FORM.fields.acknowledge}</span>
          </label>
          <FieldError id="acknowledgeStopRiding-error" message={err("acknowledgeStopRiding")} />
        </div>
        <div className="mb-6">
          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed text-ink">
            <input type="checkbox" name="acceptPrivacy" className="mt-1 h-5 w-5 shrink-0 accent-ink" aria-describedby={err("acceptPrivacy") ? "acceptPrivacy-error" : undefined} />
            <span>
              {FORM.fields.privacy}{" "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                ({FLOW.privacyLinkText})
              </a>
            </span>
          </label>
          <FieldError id="acceptPrivacy-error" message={err("acceptPrivacy")} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" variant={requestType === "REPLACEMENT" ? "primary" : "primary"} disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? FORM.submitting : FORM.submit[requestType]}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
            {FORM.back}
          </Button>
        </div>
      </div>
    </form>
  );
}
