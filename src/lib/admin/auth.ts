"use server";
/**
 * Acciones de autenticación del panel interno.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RATE_LIMITS } from "@/lib/config";
import { logAudit } from "@/lib/server/audit";
import { hashIp } from "@/lib/server/request";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createSession, destroySession, isAdminConfigured } from "./session";

async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "0.0.0.0";
  return hashIp(ip);
}

function safeNext(value: FormDataEntryValue | null): string {
  const s = typeof value === "string" ? value : "";
  if (s.startsWith("/admin") && !s.startsWith("//") && s.length < 512) return s;
  return "/admin";
}

function passwordsMatch(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function loginAction(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  if (!isAdminConfigured()) {
    redirect("/admin/login?config=1");
  }
  const ipHash = await clientIpHash();
  const rl = checkRateLimit("admin-login", ipHash, RATE_LIMITS.adminLogin);
  if (!rl.allowed) {
    await logAudit({ type: "ADMIN_LOGIN_FAILED", actor: "anonymous", payload: { reason: "RATE_LIMITED", ipHash } });
    redirect(`/admin/login?error=rate&next=${encodeURIComponent(next)}`);
  }
  const given = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!given || given.length > 256 || !expected || !passwordsMatch(given, expected)) {
    await logAudit({ type: "ADMIN_LOGIN_FAILED", actor: "anonymous", payload: { reason: "INVALID_PASSWORD", ipHash } });
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(next)}`);
  }
  await createSession();
  await logAudit({ type: "ADMIN_LOGIN", actor: "admin", payload: { ipHash } });
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  await logAudit({ type: "ADMIN_LOGOUT", actor: "admin" });
  redirect("/admin/login");
}
