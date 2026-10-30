import { describe, expect, it } from "vitest";
import { setupTestEnv } from "./helpers";

setupTestEnv("ia");

const { redactForAi } = await import("@/lib/ai/redact");

describe("anonimización", () => {
  it("anonimiza datos personales", () => {
    const out = redactForAi(
      "Soy JUANA Pérez, juana@x.cl, +56 9 1234 5678, RUT 12.345.678-5, caso RCDH-CHUS5, serie PGC123",
      { names: ["Juana Pérez Soto"], caseId: "RCDH-CHUS5", serial: "PGC123" },
    );
    expect(out).toBe(
      "Soy {nombre} {nombre}, [correo], [teléfono], RUT [rut], caso {caso}, serie {serie}",
    );
  });

  it("no toca palabras que contienen el nombre", () => {
    expect(redactForAi("Mariana llamó", { names: ["Ana"] })).toBe("Mariana llamó");
  });

  it("sin contexto solo quita correos, teléfonos y RUT", () => {
    expect(redactForAi("fono 912345678 rut 12345678-5")).toBe("fono [teléfono] rut [rut]");
  });

  it("anonimiza teléfonos con prefijo 56 sin +", () => {
    expect(redactForAi("fono 56912345678")).toBe("fono [teléfono]");
    expect(redactForAi("fono 56 9 1234 5678")).toBe("fono [teléfono]");
  });

  it("anonimiza RUT sin guion", () => {
    expect(redactForAi("rut 12.345.678")).toBe("rut [rut]");
    expect(redactForAi("rut 12.345.678 5")).toBe("rut [rut]");
    expect(redactForAi("rut 12345678k")).toBe("rut [rut]");
    expect(redactForAi("rut 12.345.678-K.")).toBe("rut [rut].");
  });
});
