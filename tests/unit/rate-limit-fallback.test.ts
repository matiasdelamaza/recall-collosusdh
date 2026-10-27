import { describe, expect, it, vi } from "vitest";

// Base de datos caída: el limitador debe seguir funcionando con el contador en memoria.
vi.mock("@/db/client", () => ({ getDb: () => Promise.reject(new Error("sin conexión")) }));

const { checkRateLimit, peekRateLimit } = await import("@/lib/server/rate-limit");

const rule = { windowMs: 60_000, max: 2 };

describe("rate limit sin base de datos", () => {
  it("usa el contador en memoria y avisa una sola vez", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t0 = 1_000_000;
    expect((await checkRateLimit("b", "k", rule, t0)).allowed).toBe(true);
    expect((await checkRateLimit("b", "k", rule, t0)).allowed).toBe(true);
    expect((await checkRateLimit("b", "k", rule, t0)).allowed).toBe(false);
    expect(await peekRateLimit("b", "k", rule, t0)).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain("sin conexión");
  });
});
