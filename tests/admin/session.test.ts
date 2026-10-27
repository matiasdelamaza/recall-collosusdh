import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_TTL_MS, createSessionValue, verifySessionValue } from "@/lib/admin/session";

const SECRET = "s3cr3t-de-prueba-muy-largo-para-firmar-cookies-0123456789";
const OTHER = "otro-secreto-distinto-igual-de-largo-para-la-prueba-9876543210";

describe("sesión del panel interno", () => {
  it("firma y verifica una cookie válida", () => {
    const now = Date.now();
    const value = createSessionValue(SECRET, now);
    const payload = verifySessionValue(value, SECRET, now + 1000);
    expect(payload).not.toBeNull();
    expect(payload!.iat).toBe(now);
    expect(payload!.exp).toBe(now + ADMIN_SESSION_TTL_MS);
    expect(payload!.nonce.length).toBeGreaterThan(8);
  });

  it("rechaza una cookie expirada", () => {
    const now = Date.now();
    const value = createSessionValue(SECRET, now);
    expect(verifySessionValue(value, SECRET, now + ADMIN_SESSION_TTL_MS + 1)).toBeNull();
  });

  it("rechaza una firma manipulada", () => {
    const value = createSessionValue(SECRET);
    const [payload, sig] = value.split(".");
    const flipped = sig!.endsWith("A") ? `${sig!.slice(0, -1)}B` : `${sig!.slice(0, -1)}A`;
    expect(verifySessionValue(`${payload}.${flipped}`, SECRET)).toBeNull();
  });

  it("rechaza un payload manipulado (extender expiración)", () => {
    const now = Date.now();
    const value = createSessionValue(SECRET, now);
    const [, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ iat: now, exp: now + 10 * ADMIN_SESSION_TTL_MS, nonce: "x" })).toString("base64url");
    expect(verifySessionValue(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it("rechaza una cookie firmada con otro secreto", () => {
    const value = createSessionValue(OTHER);
    expect(verifySessionValue(value, SECRET)).toBeNull();
  });

  it("rechaza valores malformados", () => {
    expect(verifySessionValue("", SECRET)).toBeNull();
    expect(verifySessionValue(null, SECRET)).toBeNull();
    expect(verifySessionValue("sin-punto", SECRET)).toBeNull();
    expect(verifySessionValue(".", SECRET)).toBeNull();
    expect(verifySessionValue("a".repeat(2000), SECRET)).toBeNull();
  });

  it("rechaza una cookie emitida en el futuro", () => {
    const now = Date.now();
    const value = createSessionValue(SECRET, now + 5 * 60_000);
    expect(verifySessionValue(value, SECRET, now)).toBeNull();
  });
});
