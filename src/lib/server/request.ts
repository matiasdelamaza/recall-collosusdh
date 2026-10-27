import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/** IP del cliente considerando proxies habituales (Vercel, Cloudflare, nginx). */
export function getClientIp(req: NextRequest | Request): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

/** Hash de IP con sal (no se almacenan IPs en claro). */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "recallcollosusdh-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function getUserAgent(req: NextRequest | Request): string | null {
  const ua = req.headers.get("user-agent");
  if (!ua) return null;
  return ua.slice(0, 300);
}
