/**
 * Importación de la base oficial de series afectadas (CSV de Polygon).
 * CONTRATO: usado por `scripts/import-serials.ts` y por el panel interno (/admin/series).
 * Implementación: agente backend.
 */
import "server-only";

export interface ImportSerialsOptions {
  /** Nombre del archivo de origen (para registro). */
  filename: string;
  /** Quién ejecuta la importación (usuario admin o "cli"). */
  importedBy: string;
  /** Si true, solo valida y cuenta, sin escribir. */
  dryRun?: boolean;
  notes?: string;
}

export interface ImportSerialsResult {
  ok: boolean;
  importId: number | null;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  /** Errores por fila (número de fila, mensaje en español). Máx. 50. */
  errors: { row: number; message: string }[];
}

/**
 * Columnas aceptadas (cabecera, insensible a mayúsculas/espacios):
 *   serial_number (obligatoria) | model | size | production_batch | status
 * Alias aceptados para serial_number: serial, frame_number, serie, numero_de_serie.
 */
export async function importSerialsFromCsv(csvText: string, options: ImportSerialsOptions): Promise<ImportSerialsResult> {
  void csvText;
  void options;
  throw new Error("importSerialsFromCsv: pendiente de implementación (agente backend)");
}
