import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postJson, setupTestEnv } from "./helpers";

setupTestEnv("verificar");

const { POST } = await import("@/app/api/verificar/route");
const { getDb } = await import("@/db/client");
const { affectedSerials } = await import("@/db/schema");
const { setSerialDatabaseStatus } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");

const URL_ = "http://localhost/api/verificar";

describe("POST /api/verificar", () => {
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "DEMO-AFECTADA-0001", serialRaw: "DEMO-AFECTADA-0001", model: "Collosus DH7 (DEMO)", size: "M", status: "RECALL" });
    await db.insert(affectedSerials).values({ serialNumber: "DEMO-EXCLUIDA-0001", serialRaw: "DEMO-EXCLUIDA-0001", status: "EXCLUDED" });
  });
  beforeEach(() => resetRateLimits());

  it("devuelve AFFECTED con coincidencia exacta (normalizando entrada)", async () => {
    const res = await POST(postJson(URL_, { serial: "  demo-afectada-0001 " }, { "x-forwarded-for": "10.0.0.1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, state: "AFFECTED", serial: "DEMO-AFECTADA-0001", model: "Collosus DH7 (DEMO)", size: "M" });
  });

  it("en modo interino (base PENDING) una serie sin coincidencia → PENDING_DATABASE", async () => {
    await setSerialDatabaseStatus("PENDING", "test");
    const res = await POST(postJson(URL_, { serial: "OTRA-SERIE-123" }, { "x-forwarded-for": "10.0.0.2" }));
    expect(await res.json()).toMatchObject({ ok: true, state: "PENDING_DATABASE", serial: "OTRA-SERIE-123" });
  });

  it("una serie con estado EXCLUDED en la base no se considera afectada", async () => {
    await setSerialDatabaseStatus("COMPLETE", "test");
    const res = await POST(postJson(URL_, { serial: "DEMO-EXCLUIDA-0001" }, { "x-forwarded-for": "10.0.0.9" }));
    expect(await res.json()).toMatchObject({ ok: true, state: "NOT_IDENTIFIED" });
  });

  it("con base COMPLETE una serie sin coincidencia → NOT_IDENTIFIED", async () => {
    await setSerialDatabaseStatus("COMPLETE", "test");
    const res = await POST(postJson(URL_, { serial: "OTRA-SERIE-123" }, { "x-forwarded-for": "10.0.0.3" }));
    expect(await res.json()).toMatchObject({ ok: true, state: "NOT_IDENTIFIED", serial: "OTRA-SERIE-123" });
  });

  it("formato inválido → UNVERIFIED con motivo", async () => {
    const res = await POST(postJson(URL_, { serial: "AB" }, { "x-forwarded-for": "10.0.0.4" }));
    expect(await res.json()).toMatchObject({ ok: true, state: "UNVERIFIED", reason: "TOO_SHORT" });
    const res2 = await POST(postJson(URL_, { serial: "ABC$%&123" }, { "x-forwarded-for": "10.0.0.4" }));
    expect(await res2.json()).toMatchObject({ ok: true, state: "UNVERIFIED", reason: "INVALID_CHARS" });
  });

  it("cuerpo inválido → 400 con mensaje en español", async () => {
    const res = await POST(postJson(URL_, "{no es json", { "x-forwarded-for": "10.0.0.5" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("INVALID_REQUEST");
    expect(body.message).toMatch(/inválida/i);
    const res2 = await POST(postJson(URL_, { serial: 123 }, { "x-forwarded-for": "10.0.0.5" }));
    expect(res2.status).toBe(400);
  });

  it("cuerpo demasiado grande → 400", async () => {
    const res = await POST(postJson(URL_, { serial: "A".repeat(5000) }, { "x-forwarded-for": "10.0.0.6" }));
    expect(res.status).toBe(400);
  });

  it("límite de tasa por IP → 429 con Retry-After", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 13; i++) {
      last = await POST(postJson(URL_, { serial: "DEMO-AFECTADA-0001" }, { "x-forwarded-for": "10.0.0.7" }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    const body = await last!.json();
    expect(body).toMatchObject({ ok: false, error: "RATE_LIMITED" });
    expect(body.message).toMatch(/demasiadas verificaciones/i);
  });

  it("anti-enumeración: tras muchas consultas sin coincidencia y sin Turnstile → 429", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 8; i++) {
      await resetRateLimits();
      last = await POST(postJson(URL_, { serial: `ENUM-INTENTO-${i}` }, { "x-forwarded-for": "10.0.0.8" }));
    }
    expect(last!.status).toBe(429);
    const body = await last!.json();
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("anti-enumeración con Turnstile configurado → TURNSTILE_REQUIRED (403)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secreto-de-prueba";
    try {
      let last: Response | undefined;
      for (let i = 0; i < 8; i++) {
        await resetRateLimits();
        last = await POST(postJson(URL_, { serial: `ENUM-TS-${i}` }, { "x-forwarded-for": "10.0.0.10" }));
      }
      expect(last!.status).toBe(403);
      expect((await last!.json()).error).toBe("TURNSTILE_REQUIRED");
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });

  it("GET → 405", async () => {
    const { GET } = await import("@/app/api/verificar/route");
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
