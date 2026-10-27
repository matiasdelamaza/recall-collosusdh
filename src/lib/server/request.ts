import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

type HeaderSource = NextRequest | Request | Headers;

function headersOf(src: HeaderSource): Headers {
  return src instanceof Headers ? src : src.headers;
}

/** Último elemento de X-Forwarded-For: el que añadió el proxy de confianza más cercano. */
function lastForwardedFor(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : null;
}

/**
 * IP del cliente según el proxy de confianza configurado (`TRUSTED_PROXY`):
 *   - "cloudflare": `cf-connecting-ip` (solo si TODO el tráfico entra por Cloudflare).
 *   - "nginx":      `x-real-ip` (nginx con `proxy_set_header X-Real-IP $remote_addr`).
 *   - "standard" (por defecto; Vercel, Caddy, balanceadores): ÚLTIMO elemento de `x-forwarded-for`.
 * Nunca se usa el primer elemento de X-Forwarded-For, que puede fijarlo el propio cliente.
 * Si no hay cabeceras de proxy se devuelve "0.0.0.0" (sin proxy no hay IP fiable).
 */
export function getClientIp(src: HeaderSource): string {
  const h = headersOf(src);
  const mode = (process.env.TRUSTED_PROXY ?? "standard").trim().toLowerCase();
  if (mode === "cloudflare") {
    const cf = h.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  if (mode === "nginx") {
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  }
  const last = lastForwardedFor(h);
  if (last) return last;
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  return "0.0.0.0";
}

/** Hash de IP con sal (no se almacenan IPs en claro). */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "recallcollosusdh-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function getUserAgent(src: HeaderSource): string | null {
  const ua = headersOf(src).get("user-agent");
  if (!ua) return null;
  return ua.slice(0, 300);
}
