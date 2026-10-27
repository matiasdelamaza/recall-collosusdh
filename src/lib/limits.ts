/**
 * Límites de tamaño compartidos por cliente y servidor.
 *
 * Vercel rechaza con 413 (FUNCTION_PAYLOAD_TOO_LARGE) cualquier cuerpo de más de 4,5 MB antes de
 * ejecutar la función, así que ningún límite de la app puede superarlo: se deja margen para las
 * cabeceras multipart y los campos de texto.
 */

/** Máximo de fotos sumadas en un registro (después de comprimirlas en el navegador). */
export const UPLOAD_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** Máximo del CSV de series que se sube desde el panel. Para archivos más grandes: `npm run serials:import`. */
export const SERIALS_CSV_MAX_BYTES = 4 * 1024 * 1024;
