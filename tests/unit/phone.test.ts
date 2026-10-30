import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("deja los celulares chilenos como +56 9 1234 5678", () => {
    for (const v of ["+56991234567", "+56 9 9123 4567", "+56 9 91234567", "991234567", "+569 9123 4567", "56 9 9123-4567", "(+56) 9 9123 4567"]) {
      expect(normalizePhone(v)).toBe("+56 9 9123 4567");
    }
  });

  it("da formato a fijos de Santiago y de regiones", () => {
    expect(normalizePhone("221234567")).toBe("+56 2 2123 4567");
    expect(normalizePhone("+56 41 2345678")).toBe("+56 41 234 5678");
  });

  it("no inventa dígitos: lo que no reconoce queda como se escribió", () => {
    expect(normalizePhone("+5699123456")).toBe("+5699123456");
    expect(normalizePhone("91234567")).toBe("91234567");
    expect(normalizePhone(" +54 9 11  2345 6789 ")).toBe("+54 9 11 2345 6789");
  });
});
