import { beforeEach, describe, expect, it } from "vitest";
import { postJson, setupTestEnv } from "./helpers";

setupTestEnv("analytics");

const { POST } = await import("@/app/api/analytics/route");
const { getDb } = await import("@/db/client");
const { analyticsEvents } = await import("@/db/schema");
const { resetRateLimits } = await import("@/lib/server/rate-limit");

const URL_ = "http://localhost/api/analytics";

describe("POST /api/analytics", () => {
  beforeEach(() => resetRateLimits());

  it("guarda solo el nombre de eventos permitidos", async () => {
    const res = await POST(postJson(URL_, { name: "serial_check_started", email: "pii@example.test", serial: "ABC" }));
    expect(res.status).toBe(204);
    const db = await getDb();
    const rows = await db.select().from(analyticsEvents);
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("serial_check_started");
    expect(Object.keys(rows[0]!)).toEqual(["id", "name", "createdAt"]);
  });

  it("rechaza eventos desconocidos y cuerpos inválidos", async () => {
    expect((await POST(postJson(URL_, { name: "otro_evento" }))).status).toBe(400);
    expect((await POST(postJson(URL_, "nojson"))).status).toBe(400);
    expect((await POST(postJson(URL_, { name: "x".repeat(5000) }))).status).toBe(400);
  });

  it("ANALYTICS_PROVIDER=none no persiste", async () => {
    const { getEnv } = await import("@/lib/config");
    (getEnv() as { ANALYTICS_PROVIDER: string }).ANALYTICS_PROVIDER = "none";
    const res = await POST(postJson(URL_, { name: "page_view" }));
    expect(res.status).toBe(204);
    const db = await getDb();
    expect((await db.select().from(analyticsEvents)).length).toBe(1);
    (getEnv() as { ANALYTICS_PROVIDER: string }).ANALYTICS_PROVIDER = "internal";
  });

  it("límite de tasa → 429", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) last = await POST(postJson(URL_, { name: "page_view" }, { "x-forwarded-for": "203.0.113.5" }));
    expect(last!.status).toBe(429);
  });
});
