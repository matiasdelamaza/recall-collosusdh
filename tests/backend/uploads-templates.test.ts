import { describe, expect, it } from "vitest";
import { fakeJpeg, fakePng, fakeText } from "./helpers";

const { detectImageType, sanitizeFilename, buildStorageKey } = await import("@/lib/server/uploads");
const { customerConfirmationEmail, customerResultAffectedEmail, customerResultNotIdentifiedEmail, internalNotificationEmail } = await import("@/lib/email/templates");
const { assertSafeKey } = await import("@/lib/storage/local");

describe("detección de tipo de imagen por magic bytes", () => {
  it("reconoce JPEG, PNG, WEBP y HEIC; rechaza otros", () => {
    expect(detectImageType(fakeJpeg())?.mimeType).toBe("image/jpeg");
    expect(detectImageType(fakePng())?.mimeType).toBe("image/png");
    const webp = new Uint8Array(32);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
    expect(detectImageType(webp)?.mimeType).toBe("image/webp");
    const heic = new Uint8Array(32);
    heic.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0); // ....ftypheic
    expect(detectImageType(heic)?.mimeType).toBe("image/heic");
    const mp4 = new Uint8Array(32);
    mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0); // ....ftypisom
    expect(detectImageType(mp4)).toBeNull();
    expect(detectImageType(fakeText())).toBeNull();
    expect(detectImageType(new Uint8Array(4))).toBeNull();
  });

  it("sanea nombres de archivo", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\fotos\\mi foto (1).JPG")).toBe("mi foto (1).JPG");
    expect(sanitizeFilename("a\u0000b<script>.png")).toBe("ab_script_.png");
    expect(sanitizeFilename("x".repeat(300)).length).toBe(120);
    expect(sanitizeFilename("")).toBe("archivo");
  });

  it("genera claves de almacenamiento seguras", () => {
    const key = buildStorageKey("11111111-2222-3333-4444-555555555555", "SERIAL_PHOTO", ".jpg");
    expect(key).toMatch(/^cases\/11111111-2222-3333-4444-555555555555\/serial-photo-[0-9a-f-]{36}\.jpg$/);
    expect(() => assertSafeKey(key)).not.toThrow();
    expect(() => assertSafeKey("../x")).toThrow();
    expect(() => assertSafeKey("cases/../../x.jpg")).toThrow();
    expect(() => assertSafeKey("/abs/x.jpg")).toThrow();
  });
});

const baseCase = {
  caseId: "RCDH-ABC23",
  customerName: "Juana <Pérez>",
  email: "juana@example.test",
  phone: "+56 9 1234 5678",
  rut: "12345678-5",
  region: "Maule",
  city: "Talca",
  serialNumber: "DEMO-AFECTADA-0001",
  model: "COLLOSUS_DH7" as const,
  size: "M" as const,
  requestType: "REPLACEMENT" as const,
  serialVerificationStatus: "AFFECTED" as const,
  priority: "HIGH" as const,
  damageReported: "YES" as const,
  accidentReported: true,
  caseStatus: "REGISTERED" as const,
  createdAt: new Date("2026-10-27T12:00:00Z"),
};
const ctx = { siteUrl: "https://recallcollosusdh.cl" };

const ENGLISH_FORBIDDEN = /\b(stop riding|affected|manual review|replacement frame|safety recall|your bike is safe|defective|case id|serial number)\b/i;

describe("plantillas de correo", () => {
  it("confirmación de reemplazo: español, instrucción de no uso, datos del caso, sin contacto inventado", () => {
    const m = customerConfirmationEmail(baseCase, ctx);
    expect(m.subject).toBe("Confirmación de registro — Recall Polygon Collosus DH");
    expect(m.text).toContain("NO UTILICES LA BICICLETA");
    expect(m.text).toContain("RCDH-ABC23");
    expect(m.text).toContain("DEMO-AFECTADA-0001");
    expect(m.text).toContain("se informarán en recallcollosusdh.cl");
    expect(m.text).not.toMatch(ENGLISH_FORBIDDEN);
    expect(m.html).toContain("Juana &lt;Pérez&gt;");
    expect(m.html).not.toContain("<Pérez>");
  });

  it("confirmación de revisión manual usa recomendación en vez de orden absoluta", () => {
    const m = customerConfirmationEmail({ ...baseCase, requestType: "MANUAL_REVIEW", serialVerificationStatus: "NOT_IDENTIFIED" }, ctx);
    expect(m.subject).toMatch(/revisión/);
    expect(m.text).toContain("recomendamos no utilizar la bicicleta");
    expect(m.text).not.toMatch(ENGLISH_FORBIDDEN);
  });

  it("confirmación interina", () => {
    const m = customerConfirmationEmail({ ...baseCase, requestType: "PENDING_DATABASE", serialVerificationStatus: "PENDING_DATABASE" }, ctx);
    expect(m.subject).toMatch(/Registro recibido/);
    expect(m.text).toContain("NO UTILICES LA BICICLETA");
    expect(m.text).toContain("Polygon Bikes confirme la base");
  });

  it("alerta interna marca ALTA PRIORIDAD y enlaza al panel", () => {
    const m = internalNotificationEmail(baseCase, ctx);
    expect(m.subject).toBe("[ALTA PRIORIDAD] Nuevo caso RCDH-ABC23 — Recall Collosus DH");
    expect(m.text).toContain("https://recallcollosusdh.cl/admin/casos/RCDH-ABC23");
    expect(m.text).toContain("Accidente reportado: Sí");
    expect(m.text).toContain("Daño reportado: Sí");
    const normal = internalNotificationEmail({ ...baseCase, priority: "NORMAL", accidentReported: false }, ctx);
    expect(normal.subject).not.toContain("ALTA PRIORIDAD");
  });

  it("resultados tras reproceso: afectada y no identificada (nunca certifica seguridad)", () => {
    const a = customerResultAffectedEmail(baseCase, ctx);
    expect(a.text).toContain("NO UTILICES LA BICICLETA");
    expect(a.text).toContain("TU BICICLETA ESTÁ INCLUIDA EN ESTE RECALL");
    const n = customerResultNotIdentifiedEmail(baseCase, { ...ctx, contactEmail: "postventa@example.test", contactWhatsapp: "+56 9 0000 0000" });
    expect(n.text).toContain("NO APARECE ACTUALMENTE");
    expect(n.text).toContain("no constituye una inspección técnica");
    expect(n.text).not.toMatch(/segura|100%|sin riesgo/i);
    expect(n.text).toContain("Correo: postventa@example.test");
    expect(n.text).not.toContain("se informarán en");
  });
});
