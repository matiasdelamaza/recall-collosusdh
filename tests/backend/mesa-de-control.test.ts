import { createHmac, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { setupTestEnv } from "./helpers";

setupTestEnv("mesa");
const SECRET_BYTES = randomBytes(24);
process.env.RESEND_WEBHOOK_SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
delete process.env.OPENROUTER_API_KEY;

const inbound = new Map<string, import("@/lib/email/inbound").InboundEmail>();
vi.mock("@/lib/email/inbound", () => ({
  fetchReceivedEmail: async (id: string) => {
    const e = inbound.get(id);
    if (!e) throw new Error("no existe");
    return e;
  },
  fetchReceivedAttachmentUrl: async () => null,
}));

const { POST: webhook } = await import("@/app/api/webhooks/resend/route");
const { getDb } = await import("@/db/client");
const { auditEvents, emailMessages, recallCases } = await import("@/db/schema");
const { triageByRules, triageMessage } = await import("@/lib/recall/triage");
const { sendFromInbox, stripQuotedReply } = await import("@/lib/recall/inbox");
const { caseSignal, getControlBoard, getMailStats, markCaseCalled, EMPTY_MAIL_STATS } = await import("@/lib/recall/mailbox");
const { sendBroadcastTest } = await import("@/lib/recall/follow-up");

function signed(body: unknown, opts: { badSignature?: boolean } = {}) {
  const payload = JSON.stringify(body);
  const id = `msg_${randomBytes(6).toString("hex")}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.badSignature ? randomBytes(24) : SECRET_BYTES).update(`${id}.${ts}.${payload}`).digest("base64");
  return webhook(new NextRequest(new Request("http://localhost/api/webhooks/resend", { method: "POST", body: payload, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } })));
}

function receivedEvent(id: string) {
  return { type: "email.received", created_at: new Date().toISOString(), data: { email_id: id, from: "x", to: [], subject: "", attachments: [] } };
}

function mail(id: string, from: string, subject: string, text: string, headers: Record<string, string> = {}) {
  inbound.set(id, { providerId: id, from, to: ["postventa@recallcollosusdh.cl"], subject, text, html: null, headers, attachments: [], receivedAt: new Date() });
}

async function caso(caseId: string, email: string, extra: Partial<typeof recallCases.$inferInsert> = {}) {
  const db = await getDb();
  const [row] = await db
    .insert(recallCases)
    .values({
      caseId,
      customerName: "Cliente Prueba",
      rut: "11111111-1",
      email,
      phone: "+56 9 1111 2222",
      region: "Metropolitana de Santiago",
      city: "Santiago",
      serialNumber: `S-${caseId}`,
      serialRaw: `S-${caseId}`,
      model: "COLLOSUS_DH9",
      size: "M",
      damageReported: "NO",
      accidentReported: false,
      acknowledgedStopRiding: true,
      serialVerificationStatus: "AFFECTED",
      requestType: "REPLACEMENT",
      caseStatus: "VALIDATED",
      ...extra,
    })
    .returning();
  return row!;
}

async function messagesOf(caseUuid: string) {
  const db = await getDb();
  return db.select().from(emailMessages).where(eq(emailMessages.caseId, caseUuid)).orderBy(emailMessages.createdAt);
}

describe("Mesa de control: bandeja, prioridad y semáforo", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("las reglas detectan urgencias sin alarmar por frases comunes", () => {
    const t = (body: string) => triageByRules({ subject: "Consulta", body }).priority;
    expect(t("Ayer me caí con la bicicleta y fui a la clínica")).toBe("HIGH");
    expect(t("Le vi una fisura al cuadro cerca del pedalier")).toBe("HIGH");
    expect(t("Voy a ir al SERNAC si no me responden")).toBe("HIGH");
    expect(t("Todavía la uso los fines de semana")).toBe("HIGH");
    expect(t("Ya no la uso desde que me llegó el aviso")).toBe("LOW");
    expect(t("Estoy muy molesto, nadie me responde")).toBe("MEDIUM");
    expect(t("Muchas gracias por la información")).toBe("LOW");
  });

  it("con OpenRouter, la IA puede subir la prioridad pero nunca bajarla; si falla, quedan las reglas", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    let reply: unknown = { priority: "HIGH", reason: "Angustia evidente" };
    let status = 200;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] }), { status });
    });
    process.env.OPENROUTER_API_KEY = "sk-or-prueba";
    try {
      const quiet = { subject: "Consulta", body: "No sé qué hacer, estoy muy preocupado" };
      expect(await triageMessage(quiet)).toMatchObject({ priority: "HIGH", source: "AI", reason: "Angustia evidente" });
      expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(calls[0]!.body).toMatchObject({ model: "anthropic/claude-opus-5.5", response_format: { type: "json_schema" } });

      reply = { priority: "LOW", reason: "Consulta" };
      expect((await triageMessage({ subject: "Consulta", body: "Me caí ayer" })).priority).toBe("HIGH");

      status = 500;
      expect(await triageMessage(quiet)).toMatchObject({ priority: "LOW", source: "RULES" });
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      vi.unstubAllGlobals();
    }
  });

  it("el texto citado de nuestro correo no cuenta para la prioridad", () => {
    const body = "Gracias, quedo atento.\n\nEl lun, 27 oct 2026 a las 10:00, Postventa escribió:\n> NO UTILICES LA BICICLETA\n> Si tuviste un accidente avísanos";
    expect(stripQuotedReply(body)).toBe("Gracias, quedo atento.");
  });

  it("el webhook exige la firma de Resend", async () => {
    expect((await signed(receivedEvent("x"), { badSignature: true })).status).toBe(401);
  });

  it("un correo entrante se asocia al caso, se prioriza, alerta al equipo y no se duplica", async () => {
    const c = await caso("RCDH-MSA22", "ana@example.test");
    mail("in-1", "Ana Pérez <Ana@Example.test>", "Re: Tu caso RCDH-MSA22 avanzó", "Me caí ayer bajando, el cuadro sonó raro. Estoy bien pero preocupada.");
    const res = await signed(receivedEvent("in-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, duplicate: false, priority: "HIGH", caseId: "RCDH-MSA22" });
    expect((await signed(receivedEvent("in-1"))).status).toBe(200); // reintento de Resend

    const msgs = await messagesOf(c.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ direction: "IN", fromEmail: "ana@example.test", fromName: "Ana Pérez", priority: "HIGH", triageSource: "RULES", handledAt: null });

    const db = await getDb();
    const alerts = (await db.select().from(auditEvents).where(eq(auditEvents.type, "EMAIL_SENT"))).filter((e) => (e.payload as { kind?: string }).kind === "INTERNAL_URGENT_MESSAGE");
    expect(alerts).toHaveLength(1);

    const stats = (await getMailStats([c.id])).get(c.id)!;
    expect(caseSignal(c, stats)).toMatchObject({ level: "RED", reasons: ["highPriorityMessage"] });
    expect((await getControlBoard())[0]!.case.caseId).toBe("RCDH-MSA22");
  });

  it("responder desde la bandeja registra el envío, atiende lo pendiente y sigue los estados de entrega", async () => {
    const db = await getDb();
    const [c] = await db.select().from(recallCases).where(eq(recallCases.caseId, "RCDH-MSA22"));
    expect(await sendFromInbox({ case: c!, to: c!.email, subject: "Te llamaremos – caso RCDH-MSA22", body: "Hola Ana: te llamaremos hoy.", actor: "postventa" })).toBe(true);
    let msgs = await messagesOf(c!.id);
    const out = msgs.find((m) => m.direction === "OUT")!;
    expect(out).toMatchObject({ kind: "MANUAL_EMAIL", status: "SENT", toEmails: "ana@example.test", actor: "postventa" });
    expect(out.bodyText).toContain("Número de caso: RCDH-MSA22");
    expect(msgs.find((m) => m.direction === "IN")!.handledBy).toBe("postventa");

    const ev = (type: string, extra = {}) => signed({ type, created_at: new Date().toISOString(), data: { email_id: out.providerId, ...extra } });
    await ev("email.delivered");
    await ev("email.delivery_delayed"); // atrasado: no deshace "entregado"
    await ev("email.opened");
    [msgs] = [await messagesOf(c!.id)];
    expect(msgs.find((m) => m.id === out.id)).toMatchObject({ status: "DELIVERED" });
    expect(msgs.find((m) => m.id === out.id)!.openedAt).toBeInstanceOf(Date);

    const [after] = await db.select().from(recallCases).where(eq(recallCases.id, c!.id));
    expect(caseSignal(after!, (await getMailStats([c!.id])).get(c!.id)!).level).toBe("GREEN");
  });

  it("un rebote deja el caso en amarillo; una llamada registrada lo saca de rojo", async () => {
    const c = await caso("RCDH-MSB33", "rebote@example.test", { accidentReported: true });
    expect(caseSignal(c, EMPTY_MAIL_STATS).level).toBe("RED");
    await sendFromInbox({ case: c, to: c.email, subject: "Necesitamos contactarte", body: "Hola: ¿nos confirmas tu teléfono?", actor: "postventa" });
    const out = (await messagesOf(c.id))[0]!;
    await signed({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: out.providerId, bounce: { type: "Permanent", message: "Buzón inexistente" } } });
    expect((await messagesOf(c.id))[0]).toMatchObject({ status: "BOUNCED", statusDetail: "Permanent: Buzón inexistente" });

    await markCaseCalled(c, "postventa", "Confirmó otro correo");
    const db = await getDb();
    const [after] = await db.select().from(recallCases).where(eq(recallCases.id, c.id));
    expect(after!.lastCallAt).toBeInstanceOf(Date);
    expect(caseSignal(after!, (await getMailStats([c.id])).get(c.id)!)).toMatchObject({ level: "AMBER", reasons: ["undelivered"] });
  });

  it("un correo de alguien sin caso queda en la bandeja sin caso; las respuestas automáticas no alertan", async () => {
    mail("in-2", "desconocido@example.test", "Consulta", "Hola, ¿mi bici está incluida?");
    mail("in-3", "ana@example.test", "Respuesta automática: fuera de la oficina", "Vuelvo el lunes", { "Auto-Submitted": "auto-replied" });
    expect(await (await signed(receivedEvent("in-2"))).json()).toMatchObject({ caseId: null, priority: "LOW" });
    await signed(receivedEvent("in-3"));
    const db = await getDb();
    const [auto] = await db.select().from(emailMessages).where(eq(emailMessages.providerId, "in-3"));
    expect(auto).toMatchObject({ priority: "LOW", handledBy: "automático" });
  });

  it("las pruebas de comunicados a Postventa no entran a la bandeja", async () => {
    const db = await getDb();
    const before = (await db.select().from(emailMessages)).length;
    await sendBroadcastTest({ subject: "Novedades", body: "Mensaje de prueba para Postventa." }, ["postventa-pruebas@example.test"]);
    expect((await db.select().from(emailMessages)).length).toBe(before);
  });
});
