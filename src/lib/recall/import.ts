/**
 * Importación de la base oficial de series afectadas (CSV de Polygon).
 * Usado por `scripts/import-serials.ts` y por el panel interno (/admin/series).
 */
import "server-only";
import { parse } from "csv-parse/sync";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { affectedSerials, serialImports } from "@/db/schema";
import { logAudit } from "@/lib/server/audit";
import { normalizeSerial, validateSerial } from "@/lib/serial";

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

const MAX_ERRORS = 50;
const BATCH_SIZE = 500;
const SERIAL_ALIASES = ["serial_number", "serial", "frame_number", "serie", "numero_de_serie", "número_de_serie", "n_serie", "frame_serial", "serialnumber"];
/** Valores aceptados en la columna de estado (en inglés o en español) → estado guardado. */
const STATUS_ALIASES: Record<string, string> = {
  RECALL: "RECALL",
  AFFECTED: "RECALL",
  AFECTADA: "RECALL",
  REINFORCED: "REINFORCED",
  REFORZADA: "REINFORCED",
  EXCLUDED: "EXCLUDED",
  EXCLUIDA: "EXCLUDED",
};

function normalizeStatus(value: string): string | undefined {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return STATUS_ALIASES[key];
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "");
}

/** Detecta el separador mirando la primera línea no vacía. */
export function detectDelimiter(csvText: string): "," | ";" | "\t" {
  const firstLine = csvText.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: Record<"," | ";" | "\t", number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  let best: "," | ";" | "\t" = ",";
  for (const d of [";", "\t"] as const) if (counts[d] > counts[best]) best = d;
  return best;
}

interface ParsedRow {
  row: number;
  serialNumber: string;
  serialRaw: string;
  model: string | null;
  size: string | null;
  productionBatch: string | null;
  status: string;
}

/** Parsea y valida el CSV sin tocar la base. Exportado para pruebas. */
export function parseSerialsCsv(csvText: string): { rows: ParsedRow[]; errors: { row: number; message: string }[]; rowCount: number } {
  const errors: { row: number; message: string }[] = [];
  const text = csvText.replace(/^﻿/, "");
  if (!text.trim()) return { rows: [], errors: [{ row: 0, message: "El archivo está vacío." }], rowCount: 0 };

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (header: string[]) => header.map(normalizeHeader),
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: detectDelimiter(text),
    }) as Record<string, string>[];
  } catch (err) {
    return { rows: [], errors: [{ row: 0, message: `No se pudo leer el CSV: ${err instanceof Error ? err.message : String(err)}` }], rowCount: 0 };
  }

  if (records.length === 0) return { rows: [], errors: [{ row: 0, message: "El archivo no contiene filas de datos." }], rowCount: 0 };

  const headers = Object.keys(records[0]!);
  const serialKey = SERIAL_ALIASES.find((a) => headers.includes(a));
  if (!serialKey) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Falta la columna "serial_number" (alias aceptados: ${SERIAL_ALIASES.join(", ")}). Columnas encontradas: ${headers.join(", ")}` }],
      rowCount: records.length,
    };
  }

  const pick = (r: Record<string, string>, keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  records.forEach((r, i) => {
    const rowNumber = i + 2; // 1 = cabecera
    const raw = (r[serialKey] ?? "").trim();
    const validation = validateSerial(raw);
    if (!validation.valid) {
      if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: raw ? `Serie inválida: "${raw.slice(0, 40)}"` : "Serie vacía" });
      return;
    }
    const serialNumber = validation.serial;
    const dup = seen.get(serialNumber);
    if (dup !== undefined) {
      if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: `Serie repetida en el archivo (ya aparece en la fila ${dup}): ${serialNumber}` });
      return;
    }
    seen.set(serialNumber, rowNumber);
    const statusRaw = pick(r, ["status", "estado", "tanda"]) ?? "RECALL";
    const status = normalizeStatus(statusRaw);
    if (!status) {
      if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: `Estado no permitido "${statusRaw.slice(0, 40)}" (use AFECTADA, REFORZADA o EXCLUIDA)` });
      return;
    }
    rows.push({
      row: rowNumber,
      serialNumber,
      serialRaw: raw.slice(0, 64),
      model: pick(r, ["model", "modelo"])?.slice(0, 80) ?? null,
      size: pick(r, ["size", "talla", "frame_size"])?.slice(0, 20) ?? null,
      productionBatch: pick(r, ["production_batch", "batch", "lote", "lote_de_produccion", "lote_de_producción"])?.slice(0, 80) ?? null,
      status,
    });
  });

  return { rows, errors, rowCount: records.length };
}

/**
 * Columnas aceptadas (cabecera, insensible a mayúsculas/espacios):
 *   serial_number (obligatoria) | model | size | production_batch | status
 * Alias aceptados para serial_number: serial, frame_number, serie, numero_de_serie.
 */
export async function importSerialsFromCsv(csvText: string, options: ImportSerialsOptions): Promise<ImportSerialsResult> {
  const parsed = parseSerialsCsv(csvText);
  const base: ImportSerialsResult = {
    ok: false,
    importId: null,
    rowCount: parsed.rowCount,
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: parsed.rowCount - parsed.rows.length,
    errors: parsed.errors,
  };
  if (parsed.rows.length === 0) return base;

  if (options.dryRun) {
    // En simulación informamos cuántas series ya existen para estimar insertadas/actualizadas.
    const db = await getDb();
    const serials = parsed.rows.map((r) => r.serialNumber);
    let existing = 0;
    for (let i = 0; i < serials.length; i += BATCH_SIZE) {
      const chunk = serials.slice(i, i + BATCH_SIZE);
      const rows = await db.select({ serialNumber: affectedSerials.serialNumber }).from(affectedSerials).where(inArray(affectedSerials.serialNumber, chunk));
      existing += rows.length;
    }
    return { ...base, ok: true, insertedCount: parsed.rows.length - existing, updatedCount: existing };
  }

  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const impRows = await tx
      .insert(serialImports)
      .values({ filename: options.filename.slice(0, 200), rowCount: parsed.rowCount, importedBy: options.importedBy.slice(0, 120), notes: options.notes?.slice(0, 1000) ?? null })
      .returning();
    const importId = impRows[0]!.id;
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const chunk = parsed.rows.slice(i, i + BATCH_SIZE);
      const serials = chunk.map((r) => r.serialNumber);
      const existing = await tx
        .select({ serialNumber: affectedSerials.serialNumber })
        .from(affectedSerials)
        .where(inArray(affectedSerials.serialNumber, serials));
      const existingSet = new Set(existing.map((e) => e.serialNumber));
      await tx
        .insert(affectedSerials)
        .values(
          chunk.map((r) => ({
            serialNumber: r.serialNumber,
            serialRaw: r.serialRaw,
            model: r.model,
            size: r.size,
            productionBatch: r.productionBatch,
            status: r.status,
            importId,
          })),
        )
        .onConflictDoUpdate({
          target: affectedSerials.serialNumber,
          set: {
            serialRaw: sql`excluded.serial_raw`,
            model: sql`excluded.model`,
            size: sql`excluded.size`,
            productionBatch: sql`excluded.production_batch`,
            status: sql`excluded.status`,
            importId: sql`excluded.import_id`,
            updatedAt: new Date(),
          },
        });
      for (const r of chunk) {
        if (existingSet.has(r.serialNumber)) updated++;
        else inserted++;
      }
    }
    await tx
      .update(serialImports)
      .set({ insertedCount: inserted, updatedCount: updated, skippedCount: base.skippedCount })
      .where(eq(serialImports.id, importId));
    return { importId, inserted, updated };
  });

  await logAudit({
    type: "SERIALS_IMPORTED",
    actor: options.importedBy,
    payload: {
      importId: result.importId,
      filename: options.filename,
      rowCount: parsed.rowCount,
      inserted: result.inserted,
      updated: result.updated,
      skipped: base.skippedCount,
      errorCount: parsed.errors.length,
    },
  });

  return { ...base, ok: true, importId: result.importId, insertedCount: result.inserted, updatedCount: result.updated };
}
