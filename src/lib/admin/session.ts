/**
 * Sesión del panel interno: cookie firmada (HMAC-SHA256) sin estado en servidor.
 *
 * Cookie `rcdh_admin` = base64url(payload JSON {iat, exp, nonce}) + "." + base64url(HMAC)
 * Requiere ADMIN_SESSION_SECRET (≥ 32 caracteres) y ADMIN_PASSWORD; sin ambos NO hay acceso.
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "rcdh_admin";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export interface AdminSessionPayload {
  iat: number;
  exp: number;
  nonce: string;
}

export interface AdminIdentity {
  actor: string;
}

/** true si el panel está correctamente configurado (secreto y contraseña presentes). */
export function isAdminConfigured(): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  const password = process.env.ADMIN_PASSWORD?.trim() ?? "";
  return secret.length >= 32 && password.length >= 8;
}

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) return null;
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** Crea el valor firmado de la cookie. Exportado para pruebas. */
export function createSessionValue(secret: string, now = Date.now()): string {
  const payload: AdminSessionPayload = {
    iat: now,
    exp: now + ADMIN_SESSION_TTL_MS,
    nonce: randomBytes(12).toString("base64url"),
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

/** Verifica firma y vigencia. Devuelve el payload o null. Exportado para pruebas. */
export function verifySessionValue(value: string | undefined | null, secret: string, now = Date.now()): AdminSessionPayload | null {
  if (!value || typeof value !== "string" || value.length > 1024) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const encoded = value.slice(0, dot);
  const givenSig = value.slice(dot + 1);
  if (!encoded || !givenSig) return null;
  const expectedSig = sign(encoded, secret);
  const a = Buffer.from(givenSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminSessionPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || typeof payload.iat !== "number" || typeof payload.nonce !== "string") return null;
  if (payload.exp <= now) return null;
  if (payload.iat > now + 60_000) return null; // emitida en el futuro → inválida
  return payload;
}

/** Establece la cookie de sesión (tras login correcto). */
export async function createSession(): Promise<void> {
  const secret = getSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET no configurado o demasiado corto (mín. 32 caracteres)");
  const value = createSessionValue(secret);
  const store = await cookies();
  store.set({
    name: ADMIN_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
}

/** Elimina la cookie de sesión. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Verifica la cookie actual. Devuelve el payload o null. */
export async function verifySession(cookieValue?: string | null): Promise<AdminSessionPayload | null> {
  const secret = getSecret();
  if (!secret || !isAdminConfigured()) return null;
  let value = cookieValue;
  if (value === undefined) {
    const store = await cookies();
    value = store.get(ADMIN_COOKIE_NAME)?.value ?? null;
  }
  return verifySessionValue(value, secret);
}

/** Para páginas y server actions: redirige a /admin/login si no hay sesión válida. */
export async function requireAdmin(): Promise<AdminIdentity> {
  if (!isAdminConfigured()) {
    redirect("/admin/login?config=1");
  }
  const session = await verifySession();
  if (!session) {
    redirect("/admin/login");
  }
  return { actor: "admin" };
}

/** Para route handlers: devuelve 401 JSON si no hay sesión válida. */
export async function requireAdminApi(): Promise<{ ok: true; identity: AdminIdentity } | { ok: false; response: NextResponse }> {
  if (!isAdminConfigured()) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Panel interno no configurado." }, { status: 503, headers: { "Cache-Control": "no-store" } }),
    };
  }
  const session = await verifySession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    };
  }
  return { ok: true, identity: { actor: "admin" } };
}
