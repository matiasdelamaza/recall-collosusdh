/**
 * Utilidades compartidas de las pruebas de backend.
 * IMPORTANTE: llamar a `setupTestEnv()` ANTES de cualquier `getDb()` / `getStorage()` / `getEnv()`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

export function setupTestEnv(prefix: string): { dataDir: string; uploadsDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `rcdh-${prefix}-`));
  const dataDir = path.join(base, "pglite");
  const uploadsDir = path.join(base, "uploads");
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DATABASE_URL = "";
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_STORAGE_DIR = uploadsDir;
  process.env.EMAIL_PROVIDER = "console";
  process.env.INTERNAL_NOTIFICATION_EMAILS = "postventa-pruebas@example.test";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.ANALYTICS_PROVIDER = "internal";
  process.env.IP_HASH_SALT = "sal-de-pruebas";
  delete process.env.TURNSTILE_SECRET_KEY;
  return { dataDir, uploadsDir };
}

/** JPEG "mínimo": solo nos interesan los magic bytes (FF D8 FF). */
export function fakeJpeg(size = 256): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  for (let i = 4; i < size; i++) b[i] = i % 251;
  return b;
}

export function fakePng(size = 256): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
}

export function fakeText(size = 256): Uint8Array {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = 0x41;
  return b;
}

export interface RegistrationOverrides {
  [k: string]: string | undefined;
}

export const BASE_FIELDS: Record<string, string> = {
  serial: "DEMO-AFECTADA-0001",
  requestType: "REPLACEMENT",
  customerName: "Juana Pérez Soto",
  rut: "12.345.678-5",
  email: "juana.perez@example.test",
  phone: "+56 9 1234 5678",
  region: "Metropolitana de Santiago",
  city: "Santiago",
  model: "COLLOSUS_DH7",
  size: "M",
  dealer: "Tienda de prueba",
  purchaseDate: "marzo 2026",
  damageReported: "NO",
  accidentReported: "NO",
  acknowledgeStopRiding: "on",
  acceptPrivacy: "on",
};

/** Copia a un ArrayBuffer "puro" (tipado estricto de BlobPart en TS 5.9). */
function part(b: Uint8Array): ArrayBuffer {
  return b.slice().buffer as ArrayBuffer;
}

export function buildRegistrationForm(
  overrides: RegistrationOverrides = {},
  files: { serialPhoto?: Uint8Array | null; bikePhoto?: Uint8Array | null; extra?: { field: string; data: Uint8Array; name?: string }[] } = {},
): FormData {
  const fd = new FormData();
  const fields = { ...BASE_FIELDS, ...overrides };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.set(k, v);
  }
  const serialPhoto = files.serialPhoto === undefined ? fakeJpeg() : files.serialPhoto;
  const bikePhoto = files.bikePhoto === undefined ? fakeJpeg() : files.bikePhoto;
  if (serialPhoto) fd.set("serialPhoto", new File([part(serialPhoto)], "serie.jpg", { type: "image/jpeg" }));
  if (bikePhoto) fd.set("bikePhoto", new File([part(bikePhoto)], "bici.jpg", { type: "image/jpeg" }));
  for (const e of files.extra ?? []) fd.append(e.field, new File([part(e.data)], e.name ?? "extra.jpg", { type: "image/jpeg" }));
  return fd;
}

export function postForm(url: string, form: FormData, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request(url, { method: "POST", body: form, headers }));
}

export function postJson(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request(url, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

/** Genera un RUT válido a partir de un número. */
export function rutFor(n: number): string {
  const body = String(n);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  const dv = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return `${body}-${dv}`;
}
