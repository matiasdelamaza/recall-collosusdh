import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSupabaseHost, resolveDatabaseSsl, resolveDatabaseUrl } from "@/lib/db-url";

const KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_SSL", "DATABASE_SSL_CA"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveDatabaseUrl", () => {
  it("app: DATABASE_URL tiene prioridad sobre POSTGRES_URL", () => {
    process.env.DATABASE_URL = "postgresql://a";
    process.env.POSTGRES_URL = "postgresql://b";
    expect(resolveDatabaseUrl()).toBe("postgresql://a");
  });
  it("app: sin DATABASE_URL usa POSTGRES_URL (integración Supabase-Vercel)", () => {
    process.env.POSTGRES_URL = "postgresql://b";
    expect(resolveDatabaseUrl()).toBe("postgresql://b");
  });
  it("migraciones: POSTGRES_URL_NON_POOLING tiene prioridad incluso sobre DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgresql://pooler:6543";
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://direct:5432";
    expect(resolveDatabaseUrl({ forMigrations: true })).toBe("postgresql://direct:5432");
    expect(resolveDatabaseUrl()).toBe("postgresql://pooler:6543");
  });
  it("migraciones: cae a DATABASE_URL y luego a POSTGRES_URL", () => {
    process.env.DATABASE_URL = "postgresql://a";
    expect(resolveDatabaseUrl({ forMigrations: true })).toBe("postgresql://a");
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://b";
    expect(resolveDatabaseUrl({ forMigrations: true })).toBe("postgresql://b");
  });
  it("sin variables devuelve undefined (modo PGlite)", () => {
    expect(resolveDatabaseUrl()).toBeUndefined();
  });
});

describe("resolveDatabaseSsl", () => {
  it("localhost sin sslmode → sin TLS", () => {
    expect(resolveDatabaseSsl("postgresql://u:p@localhost:5432/db")).toBeUndefined();
  });
  it("sslmode=require → TLS verificado", () => {
    expect(resolveDatabaseSsl("postgresql://u:p@db.example.com:5432/db?sslmode=require")).toEqual({ rejectUnauthorized: true });
  });
  it("Supabase sin CA → TLS sin verificación; con CA → verificado", () => {
    const url = "postgresql://postgres.ref:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
    expect(isSupabaseHost(url)).toBe(true);
    expect(resolveDatabaseSsl(url)).toEqual({ rejectUnauthorized: false });
    process.env.DATABASE_SSL_CA = "-----BEGIN CERTIFICATE-----";
    expect(resolveDatabaseSsl(url)).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----" });
  });
  it("DATABASE_SSL=no-verify es explícito", () => {
    process.env.DATABASE_SSL = "no-verify";
    expect(resolveDatabaseSsl("postgresql://u:p@db.example.com/db")).toEqual({ rejectUnauthorized: false });
  });
});
