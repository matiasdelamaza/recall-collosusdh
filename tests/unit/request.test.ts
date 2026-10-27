import { afterEach, describe, expect, it } from "vitest";
import { getClientIp, hashIp } from "@/lib/server/request";

const original = process.env.TRUSTED_PROXY;

afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = original;
});

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/verificar", { method: "POST", headers });
}

describe("getClientIp", () => {
  it("modo standard: usa el ÚLTIMO elemento de X-Forwarded-For (el que añade el proxy), nunca el primero", () => {
    process.env.TRUSTED_PROXY = "standard";
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10" }))).toBe("203.0.113.10");
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.10" }))).toBe("203.0.113.10");
  });

  it("modo standard ignora cf-connecting-ip y x-real-ip si hay X-Forwarded-For", () => {
    process.env.TRUSTED_PROXY = "standard";
    expect(getClientIp(req({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.10" }))).toBe("203.0.113.10");
  });

  it("modo cloudflare: usa cf-connecting-ip", () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    expect(getClientIp(req({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.7");
  });

  it("modo nginx: usa X-Real-IP", () => {
    process.env.TRUSTED_PROXY = "nginx";
    expect(getClientIp(req({ "x-real-ip": "198.51.100.8", "x-forwarded-for": "6.6.6.6, 7.7.7.7" }))).toBe("198.51.100.8");
  });

  it("sin cabeceras de proxy devuelve 0.0.0.0", () => {
    process.env.TRUSTED_PROXY = "standard";
    expect(getClientIp(req({}))).toBe("0.0.0.0");
  });

  it("acepta un objeto Headers (server actions)", () => {
    process.env.TRUSTED_PROXY = "standard";
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.11" }))).toBe("203.0.113.11");
  });
});

describe("hashIp", () => {
  it("es determinista y no contiene la IP en claro", () => {
    const h = hashIp("203.0.113.10");
    expect(h).toBe(hashIp("203.0.113.10"));
    expect(h).not.toContain("203.0.113.10");
    expect(h).toHaveLength(32);
  });
});
