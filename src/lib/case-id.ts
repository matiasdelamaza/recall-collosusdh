import { randomInt } from "node:crypto";

/**
 * Identificador público de caso: RCDH-XXXXX
 * Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictado por teléfono/WhatsApp.
 */
export const CASE_ID_PREFIX = "RCDH";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CASE_ID_SUFFIX_LENGTH = 5;
export const CASE_ID_PATTERN = new RegExp(`^${CASE_ID_PREFIX}-[${ALPHABET}]{${CASE_ID_SUFFIX_LENGTH}}$`);

export function generateCaseId(): string {
  let suffix = "";
  for (let i = 0; i < CASE_ID_SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${CASE_ID_PREFIX}-${suffix}`;
}

export function isValidCaseId(value: string): boolean {
  return CASE_ID_PATTERN.test((value ?? "").trim().toUpperCase());
}

export function normalizeCaseId(value: string): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
