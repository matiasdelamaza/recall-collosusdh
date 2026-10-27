/**
 * Contratos compartidos entre cliente y servidor (API pública).
 * Mantener este archivo libre de imports de servidor.
 */
import type { BikeModel, BikeSize, RequestType, SerialVerificationStatus, TriState } from "@/db/schema";

export type { BikeModel, BikeSize, RequestType, SerialVerificationStatus, TriState };

// ── POST /api/verificar ────────────────────────────────────────────────
export interface VerifyRequest {
  serial: string;
  /** Token de Cloudflare Turnstile (solo cuando el servidor lo exige). */
  turnstileToken?: string;
}

export type VerifyResponse =
  | {
      ok: true;
      state: "AFFECTED";
      /** Serie normalizada (la que se guardará en el caso). */
      serial: string;
      model?: string | null;
      size?: string | null;
    }
  | { ok: true; state: "REINFORCED"; serial: string; model?: string | null; size?: string | null }
  | { ok: true; state: "NOT_IDENTIFIED"; serial: string }
  | { ok: true; state: "PENDING_DATABASE"; serial: string }
  | { ok: true; state: "UNVERIFIED"; serial: string; reason: "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARS" }
  | { ok: false; error: "RATE_LIMITED"; message: string; retryAfterSeconds?: number }
  | { ok: false; error: "TURNSTILE_REQUIRED"; message: string }
  | { ok: false; error: "TURNSTILE_FAILED"; message: string }
  | { ok: false; error: "INVALID_REQUEST" | "SERVER_ERROR"; message: string };

/** Estado de verificación público → tipo de solicitud que abre el formulario. */
export function requestTypeForState(state: SerialVerificationStatus): RequestType {
  switch (state) {
    case "AFFECTED":
      return "REPLACEMENT";
    case "PENDING_DATABASE":
      return "PENDING_DATABASE";
    case "NOT_IDENTIFIED":
    case "UNVERIFIED":
    default:
      return "MANUAL_REVIEW";
  }
}

// ── POST /api/registro (multipart/form-data) ───────────────────────────
/**
 * Campos de texto del formulario multipart. Los archivos van en los campos:
 *   serialPhoto (1, obligatorio), bikePhoto (1, obligatorio),
 *   headtubePhoto (0..1), additionalPhotos (0..n), incidentFiles (0..n)
 * Campo honeypot: `website` (debe venir vacío).
 */
export interface RegistrationFields {
  serial: string;
  requestType: RequestType;
  customerName: string;
  rut: string;
  email: string;
  phone: string;
  region: string;
  city: string;
  model: BikeModel;
  size: BikeSize;
  dealer?: string;
  purchaseDate?: string;
  damageReported: TriState;
  accidentReported: "YES" | "NO";
  incidentDescription?: string;
  acknowledgeStopRiding: "on" | "true" | "";
  acceptPrivacy: "on" | "true" | "";
  website?: string; // honeypot
}

export type RegistrationResponse =
  | {
      ok: true;
      outcome: "CREATED";
      caseId: string;
      serial: string;
      verification: SerialVerificationStatus;
      requestType: RequestType;
    }
  | {
      ok: true;
      outcome: "EXISTING";
      caseId: string;
      serial: string;
      verification: SerialVerificationStatus;
      requestType: RequestType;
    }
  | {
      ok: false;
      error: "VALIDATION";
      message: string;
      /** nombre de campo → mensaje en español */
      fields: Record<string, string>;
    }
  | { ok: false; error: "RATE_LIMITED" | "DUPLICATE_LIMIT" | "TOO_LARGE" | "INVALID_REQUEST" | "SERVER_ERROR"; message: string };

// ── POST /api/analytics ────────────────────────────────────────────────
export const ANALYTICS_EVENTS = [
  "page_view",
  "serial_check_started",
  "serial_check_affected",
  "serial_check_reinforced",
  "serial_check_not_identified",
  "serial_check_manual_review",
  "serial_check_pending_database",
  "registration_started",
  "registration_completed",
  "manual_review_requested",
  "contact_clicked",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsRequest {
  name: AnalyticsEvent;
}
