import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTestEnv } from "./helpers";

setupTestEnv("ia");

const { redactForAi } = await import("@/lib/ai/redact");
const { triageMessage, triageByRules } = await import("@/lib/recall/triage");

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

describe("análisis de prioridad anonimizado", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("no envía nombre, teléfono ni correo a OpenRouter y las reglas leen el texto original", async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ priority: "LOW", reason: "Consulta" }) } }] }), { status: 200 });
    });
    const input = {
      subject: "Hola",
      body: "Soy Juana, mi fono es 912345678 y mi correo juana@x.cl. Me caí ayer",
      redact: { names: ["Juana Pérez"] },
    };
    const res = await triageMessage(input);
    const user = bodies[0]!.messages.find((m) => m.role === "user")!.content;
    expect(user).not.toContain("Juana");
    expect(user).not.toContain("912345678");
    expect(user).not.toContain("juana@x.cl");
    expect(user).toContain("Me caí ayer");
    // La IA dijo LOW, pero las reglas ven "me caí" en el texto original.
    expect(res.priority).toBe("HIGH");
    expect(res.priority).toBe(triageByRules(input).priority);
  });
});
