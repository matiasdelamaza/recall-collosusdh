/**
 * Conexión a base de datos.
 *
 * - Producción: `DATABASE_URL` → PostgreSQL / Supabase (driver `pg`).
 * - Desarrollo / pruebas: sin `DATABASE_URL` → PGlite (PostgreSQL embebido, archivo en ./.data/pglite).
 *
 * El esquema es idéntico en ambos casos. Las migraciones de `./drizzle` se aplican
 * automáticamente en PGlite; en producción ejecutar `npm run db:migrate`.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { resolveDatabaseSsl, resolveDatabaseUrl } from "@/lib/db-url";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & {
  __recallDb?: Promise<Database>;
};

const g = globalThis as GlobalWithDb;

async function createDb(): Promise<Database> {
  // DATABASE_URL, o las variables que inyecta la integración de Supabase en Vercel (POSTGRES_URL).
  const url = resolveDatabaseUrl();
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 10, ssl: resolveDatabaseSsl(url) });
    return drizzlePg(pool, { schema });
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
    throw new Error(
      "DATABASE_URL (o POSTGRES_URL) no está definida. En producción se requiere PostgreSQL. (Para pruebas puedes definir ALLOW_PGLITE_IN_PRODUCTION=true)",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/** Obtiene la instancia (singleton) de base de datos. */
export function getDb(): Promise<Database> {
  if (!g.__recallDb) {
    g.__recallDb = createDb().catch((err) => {
      g.__recallDb = undefined;
      throw err;
    });
  }
  return g.__recallDb;
}

export { schema };
