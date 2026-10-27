import "server-only";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { UPLOAD_LIMITS } from "@/lib/config";
import { FORM_VALIDATION } from "@/lib/copy/es";
import type { FileKind } from "@/db/schema";

export interface ValidatedUpload {
  kind: FileKind;
  field: string;
  originalName: string;
  mimeType: string;
  extension: string;
  data: Uint8Array;
  size: number;
}

export interface UploadFieldSpec {
  field: string;
  kind: FileKind;
  min: number;
  max: number; // Infinity para "n"
}

/** Campos de archivo aceptados por el formulario de registro. */
export const REGISTRATION_UPLOAD_FIELDS: readonly UploadFieldSpec[] = [
  { field: "serialPhoto", kind: "SERIAL_PHOTO", min: 1, max: 1 },
  { field: "bikePhoto", kind: "BIKE_PHOTO", min: 1, max: 1 },
  { field: "headtubePhoto", kind: "HEADTUBE_PHOTO", min: 0, max: 1 },
  { field: "additionalPhotos", kind: "ADDITIONAL", min: 0, max: Infinity },
  { field: "incidentFiles", kind: "ADDITIONAL", min: 0, max: Infinity },
];

export type DetectedImage = { mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" } | null;

/** Detecta el tipo real de imagen por "magic bytes". No confía en el tipo declarado por el cliente. */
export function detectImageType(bytes: Uint8Array): DetectedImage {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg" };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { mimeType: "image/png" };
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  // WEBP: "RIFF" .... "WEBP"
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { mimeType: "image/webp" };
  // HEIC/HEIF: caja ftyp en offset 4 con brand compatible
  if (ascii(4, 4) === "ftyp") {
    const brands = new Set<string>();
    brands.add(ascii(8, 4).toLowerCase());
    const boxSize = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
    const end = Math.min(bytes.length, boxSize > 0 ? boxSize : 32);
    for (let i = 16; i + 4 <= end; i += 4) brands.add(ascii(i, 4).toLowerCase());
    const heicBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"];
    if (heicBrands.some((b) => brands.has(b))) return { mimeType: "image/heic" };
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

/** Nombre original saneado (sin rutas ni caracteres de control, máx. 120). */
export function sanitizeFilename(name: string): string {
  const base = path.basename((name ?? "").replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "");
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, "_").trim();
  return (cleaned || "archivo").slice(0, 120);
}

export class UploadValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function isFileLike(v: unknown): v is File {
  return typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function" && typeof (v as File).size === "number";
}

/**
 * Extrae y valida los archivos del FormData de registro.
 * Lanza UploadValidationError con mensaje en español (campo incluido).
 */
export async function collectRegistrationUploads(
  form: FormData,
  options?: { requireMandatory?: boolean },
): Promise<ValidatedUpload[]> {
  const requireMandatory = options?.requireMandatory ?? true;
  const result: ValidatedUpload[] = [];
  let totalBytes = 0;

  for (const spec of REGISTRATION_UPLOAD_FIELDS) {
    const entries = form.getAll(spec.field).filter((e) => isFileLike(e) && e.size > 0) as File[];
    if (requireMandatory && entries.length < spec.min) {
      throw new UploadValidationError(
        spec.field,
        spec.field === "serialPhoto" ? FORM_VALIDATION.serialPhoto : FORM_VALIDATION.bikePhoto,
      );
    }
    if (entries.length > spec.max) throw new UploadValidationError(spec.field, FORM_VALIDATION.tooManyFiles);

    for (const file of entries) {
      if (result.length >= UPLOAD_LIMITS.maxFilesPerCase) throw new UploadValidationError(spec.field, FORM_VALIDATION.tooManyFiles);
      if (file.size > UPLOAD_LIMITS.maxFileBytes) throw new UploadValidationError(spec.field, FORM_VALIDATION.fileSize);
      totalBytes += file.size;
      if (totalBytes > UPLOAD_LIMITS.maxTotalBytes) throw new UploadValidationError(spec.field, FORM_VALIDATION.tooLarge);

      const originalName = sanitizeFilename(file.name);
      const ext = path.extname(originalName).toLowerCase();
      if (ext && !(UPLOAD_LIMITS.allowedExtensions as readonly string[]).includes(ext)) {
        throw new UploadValidationError(spec.field, FORM_VALIDATION.fileType);
      }
      const data = new Uint8Array(await file.arrayBuffer());
      const detected = detectImageType(data);
      if (!detected) throw new UploadValidationError(spec.field, FORM_VALIDATION.fileType);

      result.push({
        kind: spec.kind,
        field: spec.field,
        originalName,
        mimeType: detected.mimeType,
        extension: EXT_BY_MIME[detected.mimeType] ?? ".bin",
        data,
        size: data.byteLength,
      });
    }
  }
  return result;
}

/** Clave de almacenamiento privada para un archivo de caso. */
export function buildStorageKey(caseUuid: string, kind: FileKind, extension: string): string {
  return `cases/${caseUuid}/${kind.toLowerCase().replace(/_/g, "-")}-${randomUUID()}${extension}`;
}
