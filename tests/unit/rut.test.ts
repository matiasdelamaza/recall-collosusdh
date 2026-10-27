import { describe, expect, it } from "vitest";
import { cleanRut, computeRutDv, formatRut, isValidRut, normalizeRut } from "@/lib/rut";

describe("cleanRut", () => {
  it("deja solo dígitos y K en mayúscula", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
    expect(cleanRut("22.333.444-k")).toBe("22333444K");
    expect(cleanRut(" 7 654 321 - 6 ")).toBe("76543216");
  });
});

describe("computeRutDv", () => {
  it("calcula dígitos verificadores numéricos", () => {
    expect(computeRutDv("12345678")).toBe("5");
    expect(computeRutDv("7654321")).toBe("6");
    expect(computeRutDv("9876543")).toBe("3");
  });

  it("calcula el dígito verificador K", () => {
    expect(computeRutDv("22333444")).toBe("K");
    expect(computeRutDv("16543210")).toBe("K");
  });

  it("calcula el dígito verificador 0", () => {
    expect(computeRutDv("19876543")).toBe("0");
  });
});

describe("isValidRut", () => {
  it("acepta RUT válidos con distintos formatos", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("7.654.321-6")).toBe(true);
  });

  it("acepta RUT válidos con DV K en minúscula o mayúscula", () => {
    expect(isValidRut("22.333.444-K")).toBe(true);
    expect(isValidRut("22.333.444-k")).toBe(true);
    expect(isValidRut("16543210K")).toBe(true);
  });

  it("acepta RUT válido con DV 0", () => {
    expect(isValidRut("19.876.543-0")).toBe(true);
  });

  it("rechaza RUT con dígito verificador incorrecto", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("12345678-K")).toBe(false);
    expect(isValidRut("22.333.444-1")).toBe(false);
  });

  it("rechaza RUT demasiado cortos o largos", () => {
    expect(isValidRut("1-9")).toBe(false);
    expect(isValidRut("123456")).toBe(false);
    expect(isValidRut("1234567890-1")).toBe(false);
  });

  it("rechaza cuerpos triviales con dígitos repetidos", () => {
    expect(isValidRut("11.111.111-1")).toBe(false);
    expect(isValidRut("22222222-2")).toBe(false);
  });

  it("rechaza entradas vacías o basura", () => {
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
    expect(isValidRut("K-K")).toBe(false);
  });
});

describe("normalizeRut", () => {
  it("devuelve cuerpo-DV sin puntos", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizeRut("22333444k")).toBe("22333444-K");
  });

  it("devuelve la entrada limpia si es demasiado corta", () => {
    expect(normalizeRut("5")).toBe("5");
    expect(normalizeRut("")).toBe("");
  });
});

describe("formatRut", () => {
  it("formatea con puntos y guion", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("76543216")).toBe("7.654.321-6");
    expect(formatRut("22333444k")).toBe("22.333.444-K");
  });

  it("es idempotente", () => {
    expect(formatRut(formatRut("123456785"))).toBe("12.345.678-5");
  });
});
