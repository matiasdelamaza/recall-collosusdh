import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { UPLOAD_LIMITS } from "@/lib/config";
import { SERIALS_CSV_MAX_BYTES, UPLOAD_MAX_TOTAL_BYTES } from "@/lib/limits";

/** Tope de cuerpo de las funciones de Vercel (4,5 MB); por encima responde 413 sin ejecutar el código. */
const VERCEL_MAX_BODY_BYTES = 4_500_000;
/** Margen que /api/registro reserva para cabeceras multipart y campos de texto. */
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

function parseMb(value: string): number {
  const m = /^([\d.]+)mb$/i.exec(value);
  if (!m) throw new Error(`formato no soportado: ${value}`);
  return Number(m[1]) * 1024 * 1024;
}

describe("límites de tamaño vs. plataforma", () => {
  it("el registro con fotos cabe en el cuerpo máximo de Vercel", () => {
    expect(UPLOAD_LIMITS.maxTotalBytes).toBe(UPLOAD_MAX_TOTAL_BYTES);
    expect(UPLOAD_LIMITS.maxFileBytes).toBeLessThanOrEqual(UPLOAD_LIMITS.maxTotalBytes);
    expect(UPLOAD_LIMITS.maxTotalBytes + MULTIPART_OVERHEAD_BYTES).toBeLessThan(VERCEL_MAX_BODY_BYTES);
  });

  it("el límite de server actions admite el CSV máximo y queda bajo el tope de Vercel", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(typeof limit).toBe("string");
    const bytes = parseMb(limit as string);
    expect(bytes).toBeGreaterThan(SERIALS_CSV_MAX_BYTES + 64 * 1024);
    expect(bytes).toBeLessThan(VERCEL_MAX_BODY_BYTES);
  });
});
