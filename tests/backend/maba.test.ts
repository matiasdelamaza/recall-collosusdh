import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { postJson, setupTestEnv } from "./helpers";

setupTestEnv("maba");
const KEY = "clave-de-pruebas-maba-0123456789abcdef";
process.env.MABA_API_KEY = KEY;

const { POST } = await import("@/app/api/maba/serie/route");
const { getDb } = await import("@/db/client");
const { affectedSerials, recallCases } = await import("@/db/schema");
const { setSerialDatabaseStatus } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");

const URL_ = "http://localhost/api/maba/serie";
const auth = { authorization: `Bearer ${KEY}` };

async function caso(caseId: string, serial: string, extra: Partial<typeof recallCases.$inferInsert> = {}) {
  const db = await getDb();
  await db.insert(recallCases).values({
    caseId,
    customerName: "Cliente Prueba",
    rut: "11111111-1",
    email: `${caseId}@example.test`,
    phone: "+56 9 1111 2222",
    region: "Metropolitana de Santiago",
    city: "Santiago",
    serialNumber: serial,
    serialRaw: serial,
    model: "COLLOSUS_DH9",
    size: "M",
    damageReported: "NO",
    accidentReported: false,
    acknowledgedStopRiding: true,
    serialVerificationStatus: "AFFECTED",
    requestType: "REPLACEMENT",
    caseStatus: "VALIDATED",
    ...extra,
  });
}

describe("POST /api/maba/serie", () => {
  beforeAll(async () => {
    const db = await getDb();
    await db.insert(affectedSerials).values([
      { serialNumber: "MABA-AFECTADA-01", serialRaw: "MABA-AFECTADA-01", model: "Collosus DH9", size: "M", status: "RECALL" },
      { serialNumber: "MABA-AFECTADA-02", serialRaw: "MABA-AFECTADA-02", model: "Collosus DH9", size: "L", status: "RECALL" },
    ]);
    await caso("RCDH-MB001", "MABA-AFECTADA-01", { caseStatus: "REGISTERED", createdAt: new Date("2026-09-01T12:00:00Z") });
    await caso("RCDH-MB002", "MABA-AFECTADA-01", { caseStatus: "FRAME_IN_TRANSIT", createdAt: new Date("2026-10-01T12:00:00Z") });
    await setSerialDatabaseStatus("COMPLETE", "test");
  });
  beforeEach(() => resetRateLimits());

  it("sin clave o con clave incorrecta → 401", async () => {
    expect((await POST(postJson(URL_, { serial: "MABA-AFECTADA-01" }))).status).toBe(401);
    expect((await POST(postJson(URL_, { serial: "MABA-AFECTADA-01" }, { authorization: "Bearer otra" }))).status).toBe(401);
  });

  it("serie afectada con caso: devuelve la etapa del caso más reciente sin datos personales", async () => {
    const res = await POST(postJson(URL_, { serial: " maba-afectada-01 " }, auth));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      state: "AFFECTED",
      serial: "MABA-AFECTADA-01",
      model: "Collosus DH9",
      case: { status: "FRAME_IN_TRANSIT", statusLabel: "Cuadro en tránsito", active: true },
    });
    const text = JSON.stringify(body);
    for (const pii of ["Cliente Prueba", "11111111-1", "example.test", "1111 2222", "RCDH-MB00"]) {
      expect(text).not.toContain(pii);
    }
  });

  it("serie afectada sin caso → case null", async () => {
    const body = await (await POST(postJson(URL_, { serial: "MABA-AFECTADA-02" }, auth))).json();
    expect(body).toMatchObject({ ok: true, state: "AFFECTED", case: null });
  });

  it("serie no listada con base completa → NOT_IDENTIFIED", async () => {
    const body = await (await POST(postJson(URL_, { serial: "OTRA-SERIE-999" }, auth))).json();
    expect(body).toMatchObject({ ok: true, state: "NOT_IDENTIFIED", case: null });
  });

  it("formato inválido → UNVERIFIED con motivo", async () => {
    const body = await (await POST(postJson(URL_, { serial: "AB" }, auth))).json();
    expect(body).toMatchObject({ ok: true, state: "UNVERIFIED", reason: "TOO_SHORT", case: null });
  });

  it("cuerpo inválido → 400", async () => {
    expect((await POST(postJson(URL_, "{no es json", auth))).status).toBe(400);
    expect((await POST(postJson(URL_, { serial: 123 }, auth))).status).toBe(400);
  });
});
