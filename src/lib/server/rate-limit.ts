import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/**
 * Limitador de tasa (ventana deslizante) por clave, persistido en la tabla `rate_limit_hits`.
 *
 * En Vercel cada instancia serverless tiene su propia memoria, así que un contador en memoria
 * se reinicia con cada arranque en frío y no se comparte entre réplicas. Por eso el estado vive
 * en PostgreSQL. Si la base no responde, se usa el contador en memoria de la instancia como
 * respaldo (mejor un límite parcial que ninguno) y se avisa una vez en los logs.
 */
export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /** Número de hits en la ventana (incluido el actual si fue permitido). */
  count: number;
}

/** Las ventanas más largas son de 1 hora; se purgan los hits de más de 1 día. */
const PURGE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
const PURGE_PROBABILITY = 0.01;

// ── Respaldo en memoria ────────────────────────────────────────────────

type Store = Map<string, number[]>;

type GlobalWithRl = typeof globalThis & { __recallRateLimit?: Map<string, Store>; __recallRateLimitWarned?: boolean };
const g = globalThis as GlobalWithRl;
if (!g.__recallRateLimit) g.__recallRateLimit = new Map();

function bucketStore(bucket: string): Store {
  let s = g.__recallRateLimit!.get(bucket);
  if (!s) {
    s = new Map();
    g.__recallRateLimit!.set(bucket, s);
  }
  return s;
}

function memoryCheck(bucket: string, key: string, rule: RateLimitRule, now: number): RateLimitResult {
  const store = bucketStore(bucket);
  const cutoff = now - rule.windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= rule.max) {
    const oldest = hits[0]!;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
    store.set(key, hits);
    return { allowed: false, remaining: 0, retryAfterSeconds, count: hits.length };
  }
  hits.push(now);
  store.set(key, hits);
  // Limpieza oportunista
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.every((t) => t <= cutoff)) store.delete(k);
    }
  }
  return { allowed: true, remaining: rule.max - hits.length, retryAfterSeconds: 0, count: hits.length };
}

function memoryPeek(bucket: string, key: string, rule: RateLimitRule, now: number): number {
  const cutoff = now - rule.windowMs;
  return (bucketStore(bucket).get(key) ?? []).filter((t) => t > cutoff).length;
}

function warnFallback(err: unknown): void {
  if (g.__recallRateLimitWarned) return;
  g.__recallRateLimitWarned = true;
  const reason = err instanceof Error ? err.name : "desconocido";
  console.warn(`[rate-limit] base de datos no disponible (${reason}); se usa el contador en memoria de esta instancia.`);
}

// ── PostgreSQL ─────────────────────────────────────────────────────────

type Rows<T> = { rows: T[] };

async function dbCheck(bucket: string, key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> {
  const db = await getDb();
  const nowAt = new Date(now).toISOString();
  const cutoff = new Date(now - rule.windowMs).toISOString();
  const lockKey = `${bucket}:${key}`;

  const row = await db.transaction(async (tx) => {
    // Serializa los hits de la misma clave para que peticiones simultáneas no superen el máximo.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const res = (await tx.execute(sql`
      with recent as (
        select count(*)::int as c, min(created_at) as oldest
        from rate_limit_hits
        where bucket = ${bucket} and key = ${key} and created_at > ${cutoff}::timestamptz
      ), ins as (
        insert into rate_limit_hits (bucket, key, created_at)
        select ${bucket}, ${key}, ${nowAt}::timestamptz from recent where recent.c < ${rule.max}
        returning 1
      )
      select recent.c as count, recent.oldest as oldest, (select count(*)::int from ins) as inserted from recent
    `)) as unknown as Rows<{ count: number; oldest: string | Date | null; inserted: number }>;
    return res.rows[0]!;
  });

  if (Math.random() < PURGE_PROBABILITY) {
    await db.execute(sql`delete from rate_limit_hits where created_at < ${new Date(now - PURGE_OLDER_THAN_MS).toISOString()}::timestamptz`);
  }

  const count = Number(row.count);
  if (Number(row.inserted) === 0) {
    const oldest = row.oldest ? new Date(row.oldest).getTime() : now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds, count };
  }
  return { allowed: true, remaining: rule.max - (count + 1), retryAfterSeconds: 0, count: count + 1 };
}

async function dbPeek(bucket: string, key: string, rule: RateLimitRule, now: number): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(now - rule.windowMs).toISOString();
  const res = (await db.execute(sql`
    select count(*)::int as c from rate_limit_hits
    where bucket = ${bucket} and key = ${key} and created_at > ${cutoff}::timestamptz
  `)) as unknown as Rows<{ c: number }>;
  return Number(res.rows[0]?.c ?? 0);
}

// ── API pública ────────────────────────────────────────────────────────

/** Registra un hit y devuelve si está permitido. */
export async function checkRateLimit(bucket: string, key: string, rule: RateLimitRule, now = Date.now()): Promise<RateLimitResult> {
  try {
    return await dbCheck(bucket, key, rule, now);
  } catch (err) {
    warnFallback(err);
    return memoryCheck(bucket, key, rule, now);
  }
}

/** Cuenta hits sin registrar uno nuevo. */
export async function peekRateLimit(bucket: string, key: string, rule: RateLimitRule, now = Date.now()): Promise<number> {
  try {
    return await dbPeek(bucket, key, rule, now);
  } catch (err) {
    warnFallback(err);
    return memoryPeek(bucket, key, rule, now);
  }
}

/** Reinicia (para pruebas). */
export async function resetRateLimits(): Promise<void> {
  g.__recallRateLimit!.clear();
  try {
    const db = await getDb();
    await db.execute(sql`delete from rate_limit_hits`);
  } catch {
    // Sin base disponible solo queda el contador en memoria, que ya se limpió.
  }
}
