import "server-only";

/**
 * Limitador de tasa en memoria (ventana deslizante) por clave.
 * Suficiente para un despliegue de una instancia o pocas réplicas; para
 * despliegues serverless multi-región, reemplazar por Redis/Upstash manteniendo esta interfaz.
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

type Store = Map<string, number[]>;

type GlobalWithRl = typeof globalThis & { __recallRateLimit?: Map<string, Store> };
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

/** Registra un hit y devuelve si está permitido. */
export function checkRateLimit(bucket: string, key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
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

/** Cuenta hits sin registrar uno nuevo. */
export function peekRateLimit(bucket: string, key: string, rule: RateLimitRule, now = Date.now()): number {
  const store = bucketStore(bucket);
  const cutoff = now - rule.windowMs;
  return (store.get(key) ?? []).filter((t) => t > cutoff).length;
}

/** Reinicia (para pruebas). */
export function resetRateLimits(): void {
  g.__recallRateLimit!.clear();
}
