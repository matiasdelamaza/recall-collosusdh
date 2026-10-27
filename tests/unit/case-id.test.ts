import { describe, expect, it } from "vitest";
import { CASE_ID_PATTERN, CASE_ID_PREFIX, CASE_ID_SUFFIX_LENGTH, generateCaseId, isValidCaseId, normalizeCaseId } from "@/lib/case-id";

describe("generateCaseId", () => {
  it("genera identificadores con formato RCDH-XXXXX", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateCaseId();
      expect(id).toMatch(/^RCDH-[A-Z0-9]{5}$/);
      expect(id.startsWith(`${CASE_ID_PREFIX}-`)).toBe(true);
      expect(id.length).toBe(CASE_ID_PREFIX.length + 1 + CASE_ID_SUFFIX_LENGTH);
    }
  });

  it("nunca usa caracteres ambiguos (0, O, 1, I, L)", () => {
    for (let i = 0; i < 500; i++) {
      const suffix = generateCaseId().slice(CASE_ID_PREFIX.length + 1);
      expect(suffix).not.toMatch(/[01OIL]/);
    }
  });

  it("genera identificadores distintos (sin colisiones evidentes)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateCaseId());
    expect(ids.size).toBeGreaterThan(990);
  });
});

describe("isValidCaseId", () => {
  it("acepta identificadores válidos", () => {
    expect(isValidCaseId("RCDH-ABCDE")).toBe(true);
    expect(isValidCaseId("RCDH-23456")).toBe(true);
    expect(isValidCaseId(generateCaseId())).toBe(true);
  });

  it("acepta minúsculas y espacios alrededor", () => {
    expect(isValidCaseId(" rcdh-abcde ")).toBe(true);
  });

  it("rechaza identificadores con caracteres ambiguos o formato incorrecto", () => {
    expect(isValidCaseId("RCDH-ABCD0")).toBe(false);
    expect(isValidCaseId("RCDH-ABCDO")).toBe(false);
    expect(isValidCaseId("RCDH-ABCD1")).toBe(false);
    expect(isValidCaseId("RCDH-ABCDI")).toBe(false);
    expect(isValidCaseId("RCDH-ABCDL")).toBe(false);
    expect(isValidCaseId("RCDH-ABCD")).toBe(false);
    expect(isValidCaseId("RCDH-ABCDEF")).toBe(false);
    expect(isValidCaseId("RCDHABCDE")).toBe(false);
    expect(isValidCaseId("XXXX-ABCDE")).toBe(false);
    expect(isValidCaseId("")).toBe(false);
  });

  it("expone un patrón consistente con la validación", () => {
    expect(CASE_ID_PATTERN.test("RCDH-ABCDE")).toBe(true);
  });
});

describe("normalizeCaseId", () => {
  it("quita espacios y pasa a mayúsculas", () => {
    expect(normalizeCaseId(" rcdh - abcde ")).toBe("RCDH-ABCDE");
  });
});
