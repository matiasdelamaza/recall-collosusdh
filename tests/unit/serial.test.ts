import { describe, expect, it } from "vitest";
import { maskSerial, normalizeSerial, SERIAL_MAX_LENGTH, SERIAL_MIN_LENGTH, validateSerial } from "@/lib/serial";

describe("normalizeSerial", () => {
  it("convierte a mayúsculas", () => {
    expect(normalizeSerial("abc12345")).toBe("ABC12345");
  });

  it("elimina espacios al inicio, al final e internos", () => {
    expect(normalizeSerial("  ab c 123 45  ")).toBe("ABC12345");
    expect(normalizeSerial("AB\tC\n123")).toBe("ABC123");
  });

  it("convierte guiones tipográficos y guion bajo a guion simple", () => {
    expect(normalizeSerial("AB–12")).toBe("AB-12"); // en dash
    expect(normalizeSerial("AB—12")).toBe("AB-12"); // em dash
    expect(normalizeSerial("AB_12")).toBe("AB-12");
  });

  it("elimina caracteres de ancho cero y BOM", () => {
    expect(normalizeSerial("AB​C‌1‍2﻿3")).toBe("ABC123");
  });

  it("normaliza caracteres de ancho completo (NFKC)", () => {
    expect(normalizeSerial("ＡＢＣ１２３")).toBe("ABC123");
  });

  it("devuelve cadena vacía para entrada vacía", () => {
    expect(normalizeSerial("")).toBe("");
    expect(normalizeSerial("   ")).toBe("");
  });
});

describe("validateSerial", () => {
  it("acepta una serie válida y la devuelve normalizada", () => {
    const r = validateSerial(" abc-12345 ");
    expect(r).toEqual({ valid: true, serial: "ABC-12345" });
  });

  it("rechaza entrada vacía con EMPTY", () => {
    expect(validateSerial("")).toEqual({ valid: false, reason: "EMPTY" });
    expect(validateSerial("   ")).toEqual({ valid: false, reason: "EMPTY" });
  });

  it("rechaza series demasiado cortas con TOO_SHORT", () => {
    const short = "A".repeat(SERIAL_MIN_LENGTH - 1);
    expect(validateSerial(short)).toEqual({ valid: false, reason: "TOO_SHORT" });
    expect(validateSerial("A".repeat(SERIAL_MIN_LENGTH)).valid).toBe(true);
  });

  it("rechaza series demasiado largas con TOO_LONG", () => {
    const long = "A".repeat(SERIAL_MAX_LENGTH + 1);
    expect(validateSerial(long)).toEqual({ valid: false, reason: "TOO_LONG" });
    expect(validateSerial("A".repeat(SERIAL_MAX_LENGTH)).valid).toBe(true);
  });

  it("rechaza caracteres no permitidos con INVALID_CHARS", () => {
    expect(validateSerial("ABC#12345")).toEqual({ valid: false, reason: "INVALID_CHARS" });
    expect(validateSerial("ABC.12345")).toEqual({ valid: false, reason: "INVALID_CHARS" });
    expect(validateSerial("ÁBC12345")).toEqual({ valid: false, reason: "INVALID_CHARS" });
  });

  it("cuenta la longitud después de normalizar (los espacios no cuentan)", () => {
    expect(validateSerial("A B C")).toEqual({ valid: false, reason: "TOO_SHORT" });
  });
});

describe("maskSerial", () => {
  it("oculta el centro de una serie larga", () => {
    expect(maskSerial("ABCDEFGH1234")).toBe("ABC…34");
  });

  it("oculta por completo series cortas", () => {
    expect(maskSerial("ABC123")).toBe("…");
    expect(maskSerial("")).toBe("…");
  });

  it("normaliza antes de enmascarar", () => {
    expect(maskSerial(" abc def 1234 ")).toBe("ABC…34");
  });
});
