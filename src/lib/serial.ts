/**
 * Normalización y validación de números de serie.
 *
 * Reglas (brief §9.2):
 * - recortar espacios, convertir a mayúsculas, eliminar espacios accidentales;
 * - conservar letras y números (y guiones, por si el formato los usa);
 * - NUNCA usar coincidencia difusa para marcar una unidad como afectada.
 *
 * El formato exacto de las series Polygon aún no está confirmado; la validación
 * de formato es deliberadamente amplia y solo descarta entradas claramente inválidas.
 */

export const SERIAL_MIN_LENGTH = 5;
export const SERIAL_MAX_LENGTH = 32;

/** Caracteres permitidos tras la normalización. */
const SERIAL_PATTERN = /^[A-Z0-9-]+$/;

/** Devuelve la serie canónica (mayúsculas, sin espacios ni caracteres invisibles). */
export function normalizeSerial(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[​-‍﻿]/g, "") // zero-width
    .replace(/\s+/g, "")
    .replace(/[–—_]/g, "-") // guiones tipográficos / guion bajo → guion simple
    .toUpperCase();
}

export type SerialValidation = { valid: true; serial: string } | { valid: false; reason: "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARS" };

/** Valida el formato de una serie ya normalizada (o la normaliza primero). */
export function validateSerial(input: string): SerialValidation {
  const serial = normalizeSerial(input ?? "");
  if (!serial) return { valid: false, reason: "EMPTY" };
  if (serial.length < SERIAL_MIN_LENGTH) return { valid: false, reason: "TOO_SHORT" };
  if (serial.length > SERIAL_MAX_LENGTH) return { valid: false, reason: "TOO_LONG" };
  if (!SERIAL_PATTERN.test(serial)) return { valid: false, reason: "INVALID_CHARS" };
  return { valid: true, serial };
}

/** Enmascara una serie para analítica/logs no sensibles (ej. "ABC1…89"). */
export function maskSerial(serial: string): string {
  const s = normalizeSerial(serial);
  if (s.length <= 6) return "…";
  return `${s.slice(0, 3)}…${s.slice(-2)}`;
}
