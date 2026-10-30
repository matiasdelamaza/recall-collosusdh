import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTestEnv } from "./helpers";

setupTestEnv("ia");

// Las server actions exigen sesión del panel; en estas pruebas se da por iniciada.
vi.mock("@/lib/admin/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/session")>()),
  requireAdmin: async () => ({ actor: "admin-pruebas" }),
}));

const { redactForAi, redactGreeting } = await import("@/lib/ai/redact");
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

  it("no toma fechas por teléfonos", () => {
    expect(redactForAi("llega el 30-10-2026, o el 30/10/2026, o el 2026-10-30")).toBe("llega el 30-10-2026, o el 30/10/2026, o el 2026-10-30");
    expect(redactForAi("el 1/2/2026 llamé al 912345678")).toBe("el 1/2/2026 llamé al [teléfono]");
  });

  it("saludo sin caso: reemplaza el nombre con o sin coma antes", () => {
    expect(redactGreeting("Hola Juan:\n\nTexto")).toBe("Hola {nombre}:\n\nTexto");
    expect(redactGreeting("Hola, Juan:\n\nTexto")).toBe("Hola, {nombre}:\n\nTexto");
    expect(redactGreeting("Estimado, Juan\nTexto")).toBe("Estimado, {nombre}\nTexto");
    expect(redactGreeting("Estimada Ana Soto, te escribo")).toBe("Estimada {nombre}, te escribo");
    expect(redactGreeting("Hola,\nTexto")).toBe("Hola,\nTexto");
    expect(redactForAi("Hola, Juan:\nfono 912345678", { greeting: true })).toBe("Hola, {nombre}:\nfono [teléfono]");
    expect(redactForAi("Hola, Juan:", {})).toBe("Hola, Juan:");
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

  it("guarda un solo texto de contexto, lo reemplaza al volver a cargar y lo borra si queda vacío", async () => {
    await clearKnowledge();
    const { saveTeamContext, getTeamContext } = await knowledge();
    expect(await getTeamContext()).toBe("");
    expect(await saveTeamContext("  Horario: lunes a viernes  ", "t")).toEqual({ ok: true });
    expect(await getTeamContext()).toBe("Horario: lunes a viernes");
    expect(await saveTeamContext("Texto nuevo", "t")).toEqual({ ok: true });
    expect(await getTeamContext()).toBe("Texto nuevo");
    const { getDb } = await import("@/db/client");
    const { aiKnowledge } = await import("@/db/schema");
    expect(await (await getDb()).select().from(aiKnowledge)).toHaveLength(1);
    expect(await saveTeamContext("   ", "t")).toEqual({ ok: true });
    expect(await getTeamContext()).toBe("");
  });

  it("limita el texto de contexto a 40.000 caracteres, contando saltos de línea normalizados", async () => {
    await clearKnowledge();
    const { saveTeamContext, getTeamContext } = await knowledge();
    expect(await saveTeamContext("x".repeat(40_000), "t")).toEqual({ ok: true });
    expect(await saveTeamContext("x".repeat(40_001), "t")).toEqual({ ok: false, error: "tooLong" });
    expect((await getTeamContext()).length).toBe(40_000); // el anterior queda intacto
    expect(await saveTeamContext("a\r\n".repeat(20_000).trim(), "t")).toEqual({ ok: true });
  });

  it("buildAiContext incluye fichas activas y ejemplos anonimizados sin pie", async () => {
    await clearKnowledge();
    const { getDb } = await import("@/db/client");
    const { emailMessages, recallCases } = await import("@/db/schema");
    const { manualEmail } = await import("@/lib/email/templates");
    const { saveTeamContext, buildAiContext, listExampleReplies, setExampleExcluded } = await knowledge();
    await saveTeamContext("Horario de atención lunes a viernes", "t");

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
    expect(ctx.facts).toContain("CONTEXTO DEL EQUIPO");
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
});

describe("resumen del caso", () => {
  let n = 0;
  const OK_SUMMARY = { resumen: "Cliente pide estado del reemplazo", pide: "Saber cuándo llega el cuadro", pendiente: ["Confirmar fecha"], alerta: "" };
  type Body = { messages: { role: string; content: string }[] };
  let bodies: Body[] = [];
  const stubOk = () => {
    bodies = [];
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(OK_SUMMARY) } }] }), { status: 200 });
    });
  };
  const userText = (b: Body) => b.messages.find((m) => m.role === "user")!.content;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function seedCase(opts: { messages?: number; bodyOf?: (i: number) => string } = {}) {
    const { getDb } = await import("@/db/client");
    const { emailMessages, recallCases } = await import("@/db/schema");
    const db = await getDb();
    const i = ++n;
    const [c] = await db
      .insert(recallCases)
      .values({
        caseId: `RCDH-RS${String(i).padStart(3, "0")}`,
        customerName: "Bartolomé Iturriaga",
        rut: "12345678-5",
        email: `bartolome${i}@example.test`,
        phone: "+56 9 8765 4321",
        region: "Metropolitana de Santiago",
        city: "Santiago",
        serialNumber: `S-RS${i}`,
        serialRaw: `S-RS${i}`,
        model: "COLLOSUS_DH7",
        size: "L",
        damageReported: "YES",
        accidentReported: true,
        acknowledgedStopRiding: true,
        serialVerificationStatus: "AFFECTED",
        requestType: "REPLACEMENT",
        caseStatus: "VALIDATED",
      })
      .returning();
    const base = Date.now() - 10 * 60 * 60 * 1000;
    const count = opts.messages ?? 2;
    const rows = Array.from({ length: count }, (_, k) => ({
      caseId: c!.id,
      direction: (k % 2 === 0 ? "IN" : "OUT") as "IN" | "OUT",
      kind: k % 2 === 0 ? "CUSTOMER_MESSAGE" : "MANUAL_EMAIL",
      fromEmail: k % 2 === 0 ? c!.email : "postventa@example.test",
      fromName: k % 2 === 0 ? "Bartolomé Iturriaga" : null,
      toEmails: k % 2 === 0 ? "postventa@example.test" : c!.email,
      subject: `Asunto ${k}`,
      bodyText: opts.bodyOf ? opts.bodyOf(k) : `Mensaje ${k} de Bartolomé, fono 987654321`,
      status: (k % 2 === 0 ? "RECEIVED" : "SENT") as "RECEIVED" | "SENT",
      createdAt: new Date(base + k * 60_000),
    }));
    const inserted = await db.insert(emailMessages).values(rows).returning();
    return { c: c!, first: inserted[0]!, db };
  }

  it("guarda el resumen y no vuelve a llamar hasta que llega un correo nuevo", async () => {
    stubOk();
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { emailMessages, aiSummaries } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { c, first, db } = await seedCase();

    const s1 = await getCaseSummary(first.id);
    expect(s1?.content).toEqual(OK_SUMMARY);
    expect(bodies).toHaveLength(1);
    const user = userText(bodies[0]!);
    expect(user).not.toContain("Bartolomé");
    expect(user).not.toContain("Iturriaga");
    expect(user).not.toContain(c.email);
    expect(user).not.toContain("987654321");
    expect(user).not.toContain(c.caseId);
    expect(user).toContain("Cliente");
    expect(user).toContain("Postventa");
    const [row] = await db.select().from(aiSummaries).where(eq(aiSummaries.threadKey, c.id));
    expect(row?.content).toEqual(OK_SUMMARY);

    await getCaseSummary(first.id);
    expect(bodies).toHaveLength(1);

    await db.insert(emailMessages).values({
      caseId: c.id,
      direction: "IN",
      kind: "CUSTOMER_MESSAGE",
      fromEmail: c.email,
      toEmails: "postventa@example.test",
      subject: "Otra consulta",
      bodyText: "¿Hay novedades?",
      status: "RECEIVED",
    });
    await getCaseSummary(first.id);
    expect(bodies).toHaveLength(2);
  });

  it("force: true siempre llama", async () => {
    stubOk();
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { first } = await seedCase();
    await getCaseSummary(first.id);
    await getCaseSummary(first.id, { force: true });
    await getCaseSummary(first.id, { force: true });
    expect(bodies).toHaveLength(3);
  });

  it("hilo sin caso: clave por remitente y sin el nombre del remitente", async () => {
    stubOk();
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { getDb } = await import("@/db/client");
    const { emailMessages, aiSummaries } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const from = `ximena.sincaso${++n}@example.test`;
    const [m] = await db
      .insert(emailMessages)
      .values({
        direction: "IN",
        kind: "CUSTOMER_MESSAGE",
        fromEmail: from,
        fromName: "Ximena Valdivieso",
        toEmails: "postventa@example.test",
        subject: "Consulta de Ximena",
        bodyText: "Hola, soy Ximena Valdivieso y tengo una Collosus. Escríbanme a " + from,
        status: "RECEIVED",
      })
      .returning();
    const s = await getCaseSummary(m!.id);
    expect(s).not.toBeNull();
    const user = userText(bodies[0]!);
    expect(user).not.toContain("Ximena");
    expect(user).not.toContain("Valdivieso");
    expect(user).not.toContain(from);
    expect(user).toContain("tengo una Collosus");
    const rows = await db.select().from(aiSummaries).where(eq(aiSummaries.threadKey, `email:${from}`));
    expect(rows).toHaveLength(1);
  });

  it("solo envía los últimos 15 correos y cada cuerpo hasta 3.000 caracteres", async () => {
    stubOk();
    const { getCaseSummary, buildThreadText } = await import("@/lib/ai/assist");
    const { first } = await seedCase({ messages: 60, bodyOf: (k) => (k === 50 ? `Correo ${k} ${"z".repeat(50_000)}` : `Correo ${k} contenido`) });
    await getCaseSummary(first.id);
    const user = userText(bodies[0]!);
    const headers = user.match(/^### Correo \d+/gm) ?? [];
    expect(headers).toHaveLength(15);
    expect(user).not.toContain("Correo 44 contenido");
    expect(user).toContain("Correo 45 contenido");
    expect(user).toContain("Correo 59 contenido");
    expect(user).not.toContain("z".repeat(3000));
    expect(user).toContain("z".repeat(2000));

    const text = buildThreadText(
      [{ ...first, bodyText: "9".repeat(10_000) + " fono 987654321" }],
      {},
    );
    const body = text.split("\n").slice(2).join("\n");
    expect(body.length).toBeLessThanOrEqual(3000);
  });

  it("si OpenRouter falla devuelve null y no guarda nada", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async () => new Response("error", { status: 500 }));
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { aiSummaries } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { c, first, db } = await seedCase();
    expect(await getCaseSummary(first.id)).toBeNull();
    expect(await db.select().from(aiSummaries).where(eq(aiSummaries.threadKey, c.id))).toHaveLength(0);
  });

  it("si falla la base de datos devuelve null en vez de lanzar", async () => {
    stubOk();
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { sql } = await import("drizzle-orm");
    const { first, db } = await seedCase();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`alter table ai_summaries rename to ai_summaries_fuera`);
    try {
      await expect(getCaseSummary(first.id)).resolves.toBeNull();
      await expect(getCaseSummary(first.id, { force: true })).resolves.toBeNull();
      expect(errors.mock.calls.some((c) => String(c[0]).startsWith("[resumen]"))).toBe(true);
    } finally {
      await db.execute(sql`alter table ai_summaries_fuera rename to ai_summaries`);
      errors.mockRestore();
    }
  });

  it("hilo sin caso: el saludo de Postventa no deja pasar el nombre aunque el remitente no lo dé", async () => {
    stubOk();
    const { getCaseSummary, buildThreadText } = await import("@/lib/ai/assist");
    const { getDb } = await import("@/db/client");
    const { emailMessages } = await import("@/db/schema");
    const db = await getDb();
    const from = `sin.nombre${++n}@example.test`;
    const base = Date.now() - 5 * 60 * 60 * 1000;
    const [inMsg] = await db
      .insert(emailMessages)
      .values([
        { direction: "IN", kind: "CUSTOMER_MESSAGE", fromEmail: from, fromName: null, toEmails: "postventa@example.test", subject: "Consulta", bodyText: "¿Cuándo llega mi cuadro?", status: "RECEIVED", createdAt: new Date(base) },
        { direction: "OUT", kind: "MANUAL_EMAIL", fromEmail: "postventa@example.test", toEmails: from, subject: "Re: Consulta", bodyText: "Hola, Rigoberto:\n\nLo revisamos y te avisamos.", status: "SENT", createdAt: new Date(base + 60_000) },
      ])
      .returning();
    await getCaseSummary(inMsg!.id);
    const user = userText(bodies[0]!);
    expect(user).not.toContain("Rigoberto");
    expect(user).toContain("Hola, {nombre}:");

    // buildThreadText aplica el saludo cuando el contexto lo pide.
    const text = buildThreadText([{ ...inMsg!, bodyText: "Hola Rigoberto:\nhola" }], { greeting: true });
    expect(text).toContain("Hola {nombre}:");
  });

  it("sin clave devuelve null sin llamar", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (...a: unknown[]) => {
      calls.push(a);
      return new Response("{}", { status: 200 });
    });
    const { getCaseSummary } = await import("@/lib/ai/assist");
    const { first } = await seedCase();
    expect(await getCaseSummary(first.id)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("propuesta de respuesta", () => {
  let n = 0;
  const OK_DRAFT = { asunto: "Estado de tu reemplazo", cuerpo: "Hola {nombre}:\n\nTu cuadro está en camino. Llega en [completar: fecha]." };
  type Body = { messages: { role: string; content: string }[] };
  let bodies: Body[] = [];
  const stubOk = (content: unknown = OK_DRAFT) => {
    bodies = [];
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] }), { status: 200 });
    });
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function seedCase() {
    const { getDb } = await import("@/db/client");
    const { caseNotes, emailMessages, recallCases } = await import("@/db/schema");
    const db = await getDb();
    const i = ++n;
    const [c] = await db
      .insert(recallCases)
      .values({
        caseId: `RCDH-DR${"ABCDEFGHJK"[i % 10]}${"MNPQRSTUVW"[Math.floor(i / 10) % 10]}Z`,
        customerName: "Leopoldina Errázuriz",
        rut: "12.345.678-5",
        email: `leopoldina${i}@example.test`,
        phone: "+56 9 8765 4321",
        region: "Metropolitana de Santiago",
        city: "Santiago",
        serialNumber: `S-DR${i}`,
        serialRaw: `S-DR${i}`,
        model: "COLLOSUS_DH7",
        size: "L",
        damageReported: "NO",
        accidentReported: false,
        acknowledgedStopRiding: true,
        serialVerificationStatus: "AFFECTED",
        requestType: "REPLACEMENT",
        caseStatus: "VALIDATED",
      })
      .returning();
    await db.insert(caseNotes).values({ caseId: c!.id, author: "admin", body: "NOTA-INTERNA-RESERVADA: cliente difícil" });
    const base = Date.now() - 10 * 60 * 60 * 1000;
    const inserted = await db
      .insert(emailMessages)
      .values([
        {
          caseId: c!.id,
          direction: "IN" as const,
          kind: "CUSTOMER_MESSAGE",
          fromEmail: c!.email,
          fromName: "Leopoldina Errázuriz",
          toEmails: "postventa@example.test",
          subject: "Consulta por mi cuadro",
          bodyText: `Hola, soy Leopoldina, RUT 12.345.678-5, fono 987654321, correo ${c!.email}. ¿Cuándo llega mi cuadro?`,
          status: "RECEIVED" as const,
          createdAt: new Date(base),
        },
        {
          caseId: c!.id,
          direction: "OUT" as const,
          kind: "MANUAL_EMAIL",
          fromEmail: "postventa@example.test",
          toEmails: c!.email,
          subject: "Re: Consulta por mi cuadro",
          bodyText: "Hola Leopoldina, estamos revisando tu caso.",
          status: "SENT" as const,
          createdAt: new Date(base + 60_000),
        },
      ])
      .returning();
    return { c: c!, first: inserted[0]!, db };
  }

  async function addFicha() {
    const { saveTeamContext } = await import("@/lib/ai/knowledge");
    await saveTeamContext("FICHA-ACTIVA: el despacho demora 10 días hábiles", "t");
  }

  it("envía fichas y ejemplos rotulados, sin notas internas ni datos personales", async () => {
    stubOk();
    await addFicha();
    const { draftReply } = await import("@/lib/ai/assist");
    const { c, first } = await seedCase();

    for (const input of [{ messageId: first.id }, { caseId: c.caseId }]) {
      bodies = [];
      const res = await draftReply(input);
      expect(res).toMatchObject({ subject: "Re: Consulta por mi cuadro", body: OK_DRAFT.cuerpo });
      expect(bodies).toHaveLength(1);
      const sent = JSON.stringify(bodies[0]);
      expect(sent).toContain("FICHA-ACTIVA");
      expect(sent).toContain("solo tono y forma, no son fuente de datos");
      expect(sent).toContain("¿Cuándo llega mi cuadro?");
      expect(sent).not.toContain("NOTA-INTERNA-RESERVADA");
      expect(sent).not.toContain("Leopoldina");
      expect(sent).not.toContain("Errázuriz");
      expect(sent).not.toContain(c.email);
      expect(sent).not.toContain("987654321");
      expect(sent).not.toContain("8765 4321");
      expect(sent).not.toContain("12.345.678-5");
      expect(sent).not.toContain(c.caseId);
    }
  });

  it("sin correos entrantes usa el asunto que propone la IA", async () => {
    stubOk();
    const { draftReply } = await import("@/lib/ai/assist");
    const { emailMessages } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { c, db } = await seedCase();
    await db.delete(emailMessages).where(eq(emailMessages.caseId, c.id));
    expect(await draftReply({ caseId: c.caseId })).toMatchObject({ subject: OK_DRAFT.asunto, body: OK_DRAFT.cuerpo });
  });

  it("si OpenRouter falla devuelve null", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async () => new Response("error", { status: 500 }));
    const { draftReply } = await import("@/lib/ai/assist");
    const { first } = await seedCase();
    expect(await draftReply({ messageId: first.id })).toBeNull();
  });

  it("si falla la base de datos devuelve null en vez de lanzar", async () => {
    stubOk();
    const { draftReply } = await import("@/lib/ai/assist");
    const { sql } = await import("drizzle-orm");
    const { first, db } = await seedCase();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`alter table ai_knowledge rename to ai_knowledge_fuera`);
    try {
      await expect(draftReply({ messageId: first.id })).resolves.toBeNull();
      expect(errors.mock.calls.some((c) => String(c[0]).startsWith("[borrador]"))).toBe(true);
    } finally {
      await db.execute(sql`alter table ai_knowledge_fuera rename to ai_knowledge`);
      errors.mockRestore();
    }
  });

  it("sin clave devuelve null sin llamar", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (...a: unknown[]) => {
      calls.push(a);
      return new Response("{}", { status: 200 });
    });
    const { draftReply } = await import("@/lib/ai/assist");
    const { first } = await seedCase();
    expect(await draftReply({ messageId: first.id })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("la acción devuelve la propuesta y audita solo el largo", async () => {
    stubOk();
    const { draftReplyAction } = await import("@/lib/admin/ai-actions");
    const { auditEvents } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { c, db } = await seedCase();
    const fd = new FormData();
    fd.set("draftCaseId", c.caseId);
    const res = await draftReplyAction({ status: "idle" }, fd);
    expect(res).toMatchObject({ status: "ok", subject: "Re: Consulta por mi cuadro", body: OK_DRAFT.cuerpo });
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.type, "AI_DRAFT_GENERATED"));
    const row = rows.find((r) => r.caseId === c.id);
    expect(row?.payload).toEqual({ length: OK_DRAFT.cuerpo.length });
  });

  it("la acción avisa si no hay clave o si la IA falla", async () => {
    const { draftReplyAction } = await import("@/lib/admin/ai-actions");
    const { ADMIN } = await import("@/lib/copy/es-admin");
    const { first } = await seedCase();
    const fd = new FormData();
    fd.set("draftMessageId", first.id);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await draftReplyAction({ status: "idle" }, fd)).toEqual({ status: "error", message: ADMIN.ai.draftNoKey });
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", async () => new Response("error", { status: 500 }));
    expect(await draftReplyAction({ status: "idle" }, fd)).toEqual({ status: "error", message: ADMIN.ai.draftFailed });
  });

  it("sendEmailAction no envía un mensaje con partes por completar", async () => {
    const { sendEmailAction } = await import("@/lib/admin/actions");
    const { ADMIN } = await import("@/lib/copy/es-admin");
    const { emailMessages } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { c, db } = await seedCase();
    const fd = new FormData();
    fd.set("caseId", c.caseId);
    fd.set("to", c.email);
    fd.set("subject", "Asunto con borrador pendiente");
    fd.set("body", "Hola:\n\nTu cuadro llega el [completar: fecha]. Saludos.");
    expect(await sendEmailAction({ status: "idle" }, fd)).toEqual({ status: "error", message: ADMIN.ai.draftIncomplete });
    expect(await db.select().from(emailMessages).where(eq(emailMessages.subject, "Asunto con borrador pendiente"))).toHaveLength(0);
  });

  it("sendEmailAction tampoco envía con marcas de anonimización ([correo], [teléfono], [rut])", async () => {
    const { sendEmailAction } = await import("@/lib/admin/actions");
    const { ADMIN } = await import("@/lib/copy/es-admin");
    const { c } = await seedCase();
    const blocked = [
      "Escríbenos a [correo] cuando puedas.",
      "Te llamamos al [ teléfono ] mañana.",
      "Te llamamos al [TELEFONO] mañana.",
      "Confírmanos tu [rut] por favor.",
      "Tu cuadro llega el [ Completar: fecha ].",
    ];
    for (const body of blocked) {
      const fd = new FormData();
      fd.set("caseId", c.caseId);
      fd.set("to", c.email);
      fd.set("subject", "Asunto de prueba");
      fd.set("body", `Hola:\n\n${body}`);
      expect(await sendEmailAction({ status: "idle" }, fd)).toEqual({ status: "error", message: ADMIN.ai.draftIncomplete });
    }
    const fd = new FormData();
    fd.set("caseId", c.caseId);
    fd.set("to", c.email);
    fd.set("subject", "Tu [rut] pendiente");
    fd.set("body", "Hola:\n\nTexto completo y sin marcas.");
    expect(await sendEmailAction({ status: "idle" }, fd)).toEqual({ status: "error", message: ADMIN.ai.draftIncomplete });
  });
});
