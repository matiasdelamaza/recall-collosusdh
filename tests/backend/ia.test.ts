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

describe("contexto de la IA y entrenamiento", () => {
  let n = 0;
  const knowledge = async () => await import("@/lib/ai/knowledge");
  const clearKnowledge = async () => {
    const { getDb } = await import("@/db/client");
    const { aiKnowledge } = await import("@/db/schema");
    await (await getDb()).delete(aiKnowledge);
  };

  it("saveKnowledge valida título y texto", async () => {
    const { saveKnowledge } = await knowledge();
    expect(await saveKnowledge({ title: "", body: "x", active: true }, "t")).toEqual({ ok: false, error: "invalid" });
    expect(await saveKnowledge({ title: "x".repeat(121), body: "x", active: true }, "t")).toEqual({ ok: false, error: "invalid" });
    expect(await saveKnowledge({ title: "t", body: "x".repeat(6001), active: true }, "t")).toEqual({ ok: false, error: "invalid" });
    expect(await saveKnowledge({ title: "t", body: "x".repeat(6000), active: true }, "t")).toEqual({ ok: true });
  });

  it("limita el total de fichas activas a 40.000 caracteres", async () => {
    await clearKnowledge();
    const { saveKnowledge, listKnowledge } = await knowledge();
    // Cada ficha cuenta título (100) + texto.
    const title = "t".repeat(100);
    for (let i = 0; i < 6; i++) expect((await saveKnowledge({ title, body: "x".repeat(6000), active: true }, "t")).ok).toBe(true); // 36.600
    expect((await saveKnowledge({ title, body: "x".repeat(2300), active: true }, "t")).ok).toBe(true); // 39.000
    expect(await saveKnowledge({ title: "n", body: "x".repeat(2000), active: true }, "t")).toEqual({ ok: false, error: "tooLong" });
    // Una inactiva no cuenta.
    expect(await saveKnowledge({ title: "n", body: "x".repeat(2000), active: false }, "t")).toEqual({ ok: true });
    // Editar una activa para que crezca solo cuenta el nuevo tamaño, no se suma dos veces.
    const rows = await listKnowledge();
    const toShrink = rows.find((r) => r.body.length === 2300)!;
    expect(await saveKnowledge({ id: toShrink.id, title, body: "x".repeat(2300 - 400), active: true }, "t")).toEqual({ ok: true });
    expect(await saveKnowledge({ id: toShrink.id, title, body: "x".repeat(2300 + 1500), active: true }, "t")).toEqual({ ok: false, error: "tooLong" });
  });

  it("buildAiContext incluye fichas activas y ejemplos anonimizados sin pie", async () => {
    await clearKnowledge();
    const { getDb } = await import("@/db/client");
    const { emailMessages, recallCases } = await import("@/db/schema");
    const { manualEmail } = await import("@/lib/email/templates");
    const { saveKnowledge, buildAiContext, listExampleReplies, setExampleExcluded } = await knowledge();
    await saveKnowledge({ title: "Ficha activa", body: "Horario de atención lunes a viernes", active: true }, "t");
    await saveKnowledge({ title: "Ficha inactiva", body: "Texto secreto inactivo", active: false }, "t");

    const db = await getDb();
    const [c] = await db
      .insert(recallCases)
      .values({
        caseId: "RCDH-IAT01",
        customerName: "Florencia Gutiérrez",
        rut: "11111111-1",
        email: "florencia.g@example.test",
        phone: "+56 9 1111 2222",
        region: "Metropolitana de Santiago",
        city: "Santiago",
        serialNumber: `S-IA${++n}`,
        serialRaw: `S-IA${n}`,
        model: "COLLOSUS_DH9",
        size: "M",
        damageReported: "NO",
        accidentReported: false,
        acknowledgedStopRiding: true,
        serialVerificationStatus: "AFFECTED",
        requestType: "REPLACEMENT",
        caseStatus: "VALIDATED",
      })
      .returning();
    const insert = async (kind: string, subject: string, body: string, extra: Partial<typeof emailMessages.$inferInsert> = {}) => {
      const [row] = await db
        .insert(emailMessages)
        .values({ caseId: c!.id, direction: "OUT", kind, fromEmail: "postventa@example.test", toEmails: "florencia.g@example.test", subject, bodyText: body, status: "SENT", ...extra })
        .returning();
      return row!;
    };
    const rendered = (body: string) =>
      manualEmail(c!, { subject: "x", body }, { siteUrl: "http://localhost:3000" } as Parameters<typeof manualEmail>[2]).text;
    const kept = await insert("MANUAL_EMAIL", "Re: caso RCDH-IAT01", rendered("Hola Florencia Gutiérrez, revisaremos tu bicicleta. Escríbenos a florencia.g@example.test."));
    await insert("MANUAL_EMAIL", "Excluido", rendered("Ejemplo excluido de la IA"), { aiExcludedAt: new Date() });
    await insert("CUSTOMER_FOLLOW_UP", "Seguimiento", "Aviso automático del seguimiento");

    const ctx = await buildAiContext();
    expect(ctx.facts).toContain("Horario de atención lunes a viernes");
    expect(ctx.facts).not.toContain("Texto secreto inactivo");
    expect(ctx.facts).toContain("PREGUNTAS FRECUENTES");
    expect(ctx.examples).toContain("revisaremos tu bicicleta");
    expect(ctx.examples).not.toContain("Ejemplo excluido");
    expect(ctx.examples).not.toContain("Aviso automático");
    expect(ctx.examples).not.toContain("Equipo de Postventa");
    expect(ctx.examples).not.toContain("RCDH-IAT01");
    expect(ctx.examples).not.toContain("Número de caso");
    expect(ctx.examples).not.toContain("Florencia");
    expect(ctx.examples).not.toContain("florencia.g@example.test");

    const all = await listExampleReplies({ includeExcluded: true });
    expect(all.filter((e) => e.excluded)).toHaveLength(1);
    await setExampleExcluded(kept.id, true, "t");
    expect((await buildAiContext()).examples).toBe("");
    await setExampleExcluded(kept.id, false, "t");
    expect((await buildAiContext()).examples).toContain("revisaremos tu bicicleta");
  });

  it("ejemplos: 20 no excluidos, sin caso se anonimiza el saludo, solo enviados y tope de largo", async () => {
    const { getDb } = await import("@/db/client");
    const { emailMessages } = await import("@/db/schema");
    const { buildAiContext, listExamplesForAdmin } = await knowledge();
    const db = await getDb();
    await db.delete(emailMessages);
    const base = Date.now();
    const rows = Array.from({ length: 30 }, (_, i) => ({
      direction: "OUT" as const,
      kind: "MANUAL_EMAIL",
      fromEmail: "postventa@example.test",
      toEmails: "juan.cliente@example.test",
      subject: `S${i}`,
      bodyText: `Hola Juan Pérez:\n\nRespuesta número ${i} a juan.cliente@example.test`,
      status: "SENT" as const,
      createdAt: new Date(base + i * 1000),
      // los 5 más recientes y 3 más antiguos quedan excluidos
      aiExcludedAt: i >= 25 || i < 3 ? new Date() : null,
    }));
    await db.insert(emailMessages).values(rows);
    await db.insert(emailMessages).values([
      { ...rows[0]!, subject: "Fallido", bodyText: "Correo fallido", status: "FAILED", aiExcludedAt: null, createdAt: new Date(base + 99_000) },
      { ...rows[0]!, subject: "Rebotado", bodyText: "Correo rebotado", status: "BOUNCED", aiExcludedAt: null, createdAt: new Date(base + 98_000) },
      { ...rows[0]!, subject: "Largo", bodyText: `Hola Ana:\n\n${"a".repeat(5000)}`, status: "SENT", aiExcludedAt: null, createdAt: new Date(base + 97_000) },
    ]);
    const { used, excluded } = await listExamplesForAdmin();
    const ctx = await buildAiContext();
    expect(used).toHaveLength(20);
    expect(used.every((e) => !e.excluded)).toBe(true);
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((e) => e.excluded)).toBe(true);
    expect(used.map((e) => e.subject)).not.toContain("Fallido");
    expect(used.map((e) => e.subject)).not.toContain("Rebotado");
    // El contexto de la IA contiene exactamente los mismos 20 ejemplos que muestra la página.
    expect(ctx.examples.split("\n\n---\n\n")).toHaveLength(20);
    for (const e of used) expect(ctx.examples).toContain(`Asunto: ${e.subject}\n${e.text}`);
    expect(ctx.examples).not.toContain("Juan");
    expect(ctx.examples).not.toContain("juan.cliente@example.test");
    expect(ctx.examples).toContain("Hola {nombre}");
    expect(ctx.examples).not.toContain("Hola Ana");
    expect(used.find((e) => e.subject === "Largo")!.text.length).toBe(3001);
    expect(used.find((e) => e.subject === "Largo")!.text.endsWith("…")).toBe(true);
  });

  it("saveKnowledge normaliza saltos de línea antes de medir", async () => {
    const { saveKnowledge } = await knowledge();
    expect(await saveKnowledge({ title: "crlf", body: "a\r\n".repeat(3000).trim(), active: false }, "t")).toEqual({ ok: true });
  });
});
