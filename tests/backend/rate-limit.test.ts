import { beforeEach, describe, expect, it } from "vitest";
import { setupTestEnv } from "./helpers";

setupTestEnv("rate-limit");

const { checkRateLimit, peekRateLimit, resetRateLimits } = await import("@/lib/server/rate-limit");

const rule = { windowMs: 60_000, max: 3 };

/** Simula una instancia serverless nueva: memoria del proceso vacía, misma base de datos. */
function coldStart() {
  (globalThis as { __recallRateLimit?: Map<string, unknown> }).__recallRateLimit!.clear();
}

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("permite hasta `max` solicitudes dentro de la ventana", async () => {
    const t0 = 1_000_000;
    expect(await checkRateLimit("b", "k", rule, t0)).toMatchObject({ allowed: true, remaining: 2, count: 1 });
    expect(await checkRateLimit("b", "k", rule, t0 + 1)).toMatchObject({ allowed: true, remaining: 1, count: 2 });
    expect(await checkRateLimit("b", "k", rule, t0 + 2)).toMatchObject({ allowed: true, remaining: 0, count: 3 });
  });

  it("bloquea la solicitud que excede el máximo e informa retryAfterSeconds", async () => {
    const t0 = 1_000_000;
    await checkRateLimit("b", "k", rule, t0);
    await checkRateLimit("b", "k", rule, t0 + 1_000);
    await checkRateLimit("b", "k", rule, t0 + 2_000);
    const r = await checkRateLimit("b", "k", rule, t0 + 10_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    // El hit más antiguo (t0) expira en t0 + 60s → faltan 50s
    expect(r.retryAfterSeconds).toBe(50);
  });

  it("vuelve a permitir cuando la ventana se desliza", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("b", "k", rule, t0 + i);
    expect((await checkRateLimit("b", "k", rule, t0 + 100)).allowed).toBe(false);
    expect((await checkRateLimit("b", "k", rule, t0 + rule.windowMs + 1)).allowed).toBe(true);
  });

  it("aísla claves y buckets entre sí", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("b", "k1", rule, t0);
    expect((await checkRateLimit("b", "k1", rule, t0)).allowed).toBe(false);
    expect((await checkRateLimit("b", "k2", rule, t0)).allowed).toBe(true);
    expect((await checkRateLimit("otro", "k1", rule, t0)).allowed).toBe(true);
  });

  it("retryAfterSeconds es al menos 1", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("b", "k", rule, t0);
    const r = await checkRateLimit("b", "k", rule, t0 + rule.windowMs - 10);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("el límite sobrevive a un arranque en frío (estado compartido en la base)", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("b", "k", rule, t0);
    coldStart();
    expect((await checkRateLimit("b", "k", rule, t0 + 1)).allowed).toBe(false);
  });

  it("solicitudes simultáneas no superan el máximo", async () => {
    const t0 = 1_000_000;
    const results = await Promise.all(Array.from({ length: 10 }, () => checkRateLimit("b", "simultaneo", rule, t0)));
    expect(results.filter((r) => r.allowed).length).toBe(3);
  });
});

describe("peekRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("cuenta hits sin registrar uno nuevo", async () => {
    const t0 = 1_000_000;
    expect(await peekRateLimit("b", "k", rule, t0)).toBe(0);
    await checkRateLimit("b", "k", rule, t0);
    await checkRateLimit("b", "k", rule, t0);
    expect(await peekRateLimit("b", "k", rule, t0)).toBe(2);
    expect(await peekRateLimit("b", "k", rule, t0)).toBe(2);
    expect(await peekRateLimit("b", "k", rule, t0 + rule.windowMs + 1)).toBe(0);
  });
});

describe("resetRateLimits", () => {
  it("limpia todos los buckets", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("b", "k", rule, t0);
    expect((await checkRateLimit("b", "k", rule, t0)).allowed).toBe(false);
    await resetRateLimits();
    expect((await checkRateLimit("b", "k", rule, t0)).allowed).toBe(true);
  });
});
