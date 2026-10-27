/**
 * Reducción de fotos en el navegador antes de enviarlas a /api/registro.
 *
 * Una foto de celular pesa 3–8 MB y Vercel rechaza cuerpos de más de 4,5 MB, así que cada imagen
 * se redimensiona (lado mayor ≤ 2048 px) y se recodifica como JPEG. Si el navegador no puede
 * decodificarla (p. ej. HEIC fuera de Safari) se envía tal cual y decide el límite total.
 */

export const COMPRESS_MAX_DIMENSION = 2048;
export const COMPRESS_QUALITY = 0.82;
/** Fotos más livianas que esto se envían sin tocar. */
export const COMPRESS_SKIP_BELOW_BYTES = 500 * 1024;

/** Campos de archivo del formulario de registro. */
export const UPLOAD_FIELDS = ["serialPhoto", "bikePhoto", "headtubePhoto", "additionalPhotos", "incidentFiles"] as const;

/** Escala (ancho, alto) para que el lado mayor no supere `max`, sin agrandar. */
export function scaleToFit(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const ratio = max / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** "IMG_0001.HEIC" → "IMG_0001.jpg". */
export function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, "") || "foto";
  return `${base}.jpg`;
}

/** Reduce una imagen; devuelve el archivo original si no hace falta o no se puede. */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_SKIP_BELOW_BYTES || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, COMPRESS_MAX_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fondo blanco: JPEG no tiene transparencia (PNG con alfa quedaría negro).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], toJpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/**
 * Reemplaza en `fd` cada foto por su versión reducida y devuelve el total de bytes a enviar.
 * `compress` es inyectable para las pruebas.
 */
export async function compressFormImages(fd: FormData, compress: (f: File) => Promise<File> = compressImage): Promise<number> {
  let total = 0;
  for (const field of UPLOAD_FIELDS) {
    const files = fd.getAll(field).filter((v): v is File => v instanceof File && v.size > 0);
    if (files.length === 0) continue;
    const reduced = await Promise.all(files.map((f) => compress(f)));
    fd.delete(field);
    for (const f of reduced) {
      fd.append(field, f, f.name);
      total += f.size;
    }
  }
  return total;
}
