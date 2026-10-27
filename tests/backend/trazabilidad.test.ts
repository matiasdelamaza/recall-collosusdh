import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { buildRegistrationForm, postForm, postJson, setupTestEnv } from "./helpers";

setupTestEnv("trazabilidad");

const { POST: verificar } = await import("@/app/api/verificar/route");
const { POST: correo } = await import("@/app/api/verificar/correo/route");
const { POST: registro } = await import("@/app/api/registro/route");
const { getDb } = await import("@/db/client");
const { affectedSerials, auditEvents, recallCases, serialLookups } = await import("@/db/schema");
const { setSerialDatabaseStatus } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");
const { reminderCustomerEmail } = await import("@/lib/email/templates");

const URL_VERIFICAR = "http://localhost/api/verificar";
const URL_CORREO = "http://localhost/api/verificar/correo";
const IP = { "x-forwarded-for": "10.1.0.1" };

async function verificarAfectada(headers: Record<string, string> = IP, ref?: string) {
  const res = await verificar(postJson(URL_VERIFICAR, { serial: "DEMO-AFECTADA-0001", ...(ref ? { ref } : {}) }, headers));
  return (await res.json()) as { state: string; lookupId: string | null };
}

describe("Trazabilidad: correo antes del aviso y enlaces personales", () => {
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "DEMO-AFECTADA-0001", serialRaw: "DEMO-AFECTADA-0001", model: "Collosus DH7 (DEMO)", size: "M", status: "RECALL" });
    await setSerialDatabaseStatus("COMPLETE", "test");
  });
  beforeEach(() => resetRateLimits());

  it("una serie afectada devuelve el id de la consulta y guarda el código del enlace", async () => {
    const body = await verificarAfectada(IP, "c-7k2m9q");
    expect(body.state).toBe("AFFECTED");
    expect(body.lookupId).toMatch(/^[0-9a-f-]{36}$/);
    const db = await getDb();
    const [row] = await db.select().from(serialLookups).where(eq(serialLookups.id, body.lookupId!));
    expect(row!.outreachRef).toBe("C-7K2M9Q");
    expect(row!.contactEmail).toBeNull();
  });

  it("un código con caracteres raros se ignora", async () => {
    const body = await verificarAfectada(IP, "<script>");
    const db = await getDb();
    const [row] = await db.select().from(serialLookups).where(eq(serialLookups.id, body.lookupId!));
    expect(row!.outreachRef).toBeNull();
  });

  it("guarda el correo en la consulta y avisa a Postventa una sola vez", async () => {
    const { lookupId } = await verificarAfectada();
    const res = await correo(postJson(URL_CORREO, { lookupId, email: "  Dueno.Bici@Example.TEST " }, IP));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const db = await getDb();
    const [row] = await db.select().from(serialLookups).where(eq(serialLookups.id, lookupId!));
    expect(row!.contactEmail).toBe("dueno.bici@example.test");
    expect(row!.contactAt).toBeInstanceOf(Date);

    // Segundo envío (p. ej. doble clic): se acepta, sin repetir la alerta interna.
    await correo(postJson(URL_CORREO, { lookupId, email: "dueno.bici@example.test" }, IP));
    const sent = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.type, "EMAIL_SENT")));
    const alerts = sent.filter((e) => e.payload?.kind === "INTERNAL_AFFECTED_CONTACT" && e.payload?.caseId === "DEMO-AFECTADA-0001");
    expect(alerts).toHaveLength(1);
  });

  it("correo inválido → 422 con mensaje en español", async () => {
    const { lookupId } = await verificarAfectada();
    const res = await correo(postJson(URL_CORREO, { lookupId, email: "no-es-correo" }, IP));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/correo electrónico válido/i);
  });

  it("no acepta el correo desde otra conexión ni para una consulta que no es afectada", async () => {
    const { lookupId } = await verificarAfectada();
    const otra = await correo(postJson(URL_CORREO, { lookupId, email: "x@example.test" }, { "x-forwarded-for": "10.1.0.99" }));
    expect(otra.status).toBe(404);

    const res = await verificar(postJson(URL_VERIFICAR, { serial: "OTRA-SERIE-123" }, IP));
    expect(await res.json()).not.toHaveProperty("lookupId");
    const db = await getDb();
    const [miss] = await db.select().from(serialLookups).where(eq(serialLookups.result, "NOT_IDENTIFIED")).limit(1);
    const noAfectada = await correo(postJson(URL_CORREO, { lookupId: miss!.id, email: "x@example.test" }, IP));
    expect(noAfectada.status).toBe(404);
  });

  it("id mal formado → 400", async () => {
    const res = await correo(postJson(URL_CORREO, { lookupId: "123", email: "x@example.test" }, IP));
    expect(res.status).toBe(400);
  });

  it("el registro guarda el código del enlace en el caso", async () => {
    const form = buildRegistrationForm({ ref: "C-ABC234", email: "ref.prueba@example.test" });
    const res = await registro(postForm("http://localhost/api/registro", form, { "x-forwarded-for": "10.1.0.2" }));
    expect(res.status).toBe(201);
    const { caseId } = await res.json();
    const db = await getDb();
    const [row] = await db.select().from(recallCases).where(eq(recallCases.caseId, caseId));
    expect(row!.outreachRef).toBe("C-ABC234");
  });

  it("el recordatorio lleva el enlace personal con el código", () => {
    const mail = reminderCustomerEmail({ siteUrl: "https://recallcollosusdh.cl", contactEmail: "contacto@crossmountain.cl" }, "C-7K2M9Q");
    expect(mail.subject).toMatch(/^Recordatorio/);
    expect(mail.text).toContain("https://www.recallcollosusdh.cl/?r=C-7K2M9Q");
    expect(mail.html).toContain("https://www.recallcollosusdh.cl/?r=C-7K2M9Q");
  });
});
