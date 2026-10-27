import { describe, expect, it } from "vitest";
import { CHILE_REGIONS, isChileRegion } from "@/lib/regions";

describe("CHILE_REGIONS", () => {
  it("contiene las 16 regiones sin duplicados", () => {
    expect(CHILE_REGIONS).toHaveLength(16);
    expect(new Set(CHILE_REGIONS).size).toBe(16);
  });

  it("empieza en el norte y termina en el sur", () => {
    expect(CHILE_REGIONS[0]).toBe("Arica y Parinacota");
    expect(CHILE_REGIONS[CHILE_REGIONS.length - 1]).toBe("Magallanes y de la Antártica Chilena");
  });

  it("incluye la Región Metropolitana", () => {
    expect(CHILE_REGIONS).toContain("Metropolitana de Santiago");
  });
});

describe("isChileRegion", () => {
  it("acepta nombres exactos", () => {
    expect(isChileRegion("Valparaíso")).toBe(true);
    expect(isChileRegion("Ñuble")).toBe(true);
  });

  it("rechaza variantes o valores desconocidos", () => {
    expect(isChileRegion("valparaíso")).toBe(false);
    expect(isChileRegion("Santiago")).toBe(false);
    expect(isChileRegion("")).toBe(false);
  });
});
