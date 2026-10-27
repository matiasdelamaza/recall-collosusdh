import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, peekRateLimit, resetRateLimits } from "@/lib/server/rate-limit";

const rule = { windowMs: 60_000, max: 3 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("permite hasta `max` solicitudes dentro de la ventana", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("b", "k", rule, t0)).toMatchObject({ allowed: true, remaining: 2, count: 1 });
    expect(checkRateLimit("b", "k", rule, t0 + 1)).toMatchObject({ allowed: true, remaining: 1, count: 2 });
    expect(checkRateLimit("b", "k", rule, t0 + 2)).toMatchObject({ allowed: true, remaining: 0, count: 3 });
  });

  it("bloquea la solicitud que excede el máximo e informa retryAfterSeconds", () => {
    const t0 = 1_000_000;
    checkRateLimit("b", "k", rule, t0);
    checkRateLimit("b", "k", rule, t0 + 1_000);
    checkRateLimit("b", "k", rule, t0 + 2_000);
    const r = checkRateLimit("b", "k", rule, t0 + 10_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    // El hit más antiguo (t0) expira en t0 + 60s → faltan 50s
    expect(r.retryAfterSeconds).toBe(50);
  });

  it("vuelve a permitir cuando la ventana se desliza", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("b", "k", rule, t0 + i);
    expect(checkRateLimit("b", "k", rule, t0 + 100).allowed).toBe(false);
    expect(checkRateLimit("b", "k", rule, t0 + rule.windowMs + 1).allowed).toBe(true);
  });

  it("aísla claves y buckets entre sí", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("b", "k1", rule, t0);
    expect(checkRateLimit("b", "k1", rule, t0).allowed).toBe(false);
    expect(checkRateLimit("b", "k2", rule, t0).allowed).toBe(true);
    expect(checkRateLimit("otro", "k1", rule, t0).allowed).toBe(true);
  });

  it("retryAfterSeconds es al menos 1", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("b", "k", rule, t0);
    const r = checkRateLimit("b", "k", rule, t0 + rule.windowMs - 10);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("peekRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("cuenta hits sin registrar uno nuevo", () => {
    const t0 = 1_000_000;
    expect(peekRateLimit("b", "k", rule, t0)).toBe(0);
    checkRateLimit("b", "k", rule, t0);
    checkRateLimit("b", "k", rule, t0);
    expect(peekRateLimit("b", "k", rule, t0)).toBe(2);
    expect(peekRateLimit("b", "k", rule, t0)).toBe(2);
    expect(peekRateLimit("b", "k", rule, t0 + rule.windowMs + 1)).toBe(0);
  });
});

describe("resetRateLimits", () => {
  it("limpia todos los buckets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("b", "k", rule, t0);
    expect(checkRateLimit("b", "k", rule, t0).allowed).toBe(false);
    resetRateLimits();
    expect(checkRateLimit("b", "k", rule, t0).allowed).toBe(true);
  });
});
