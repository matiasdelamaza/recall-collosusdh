import "server-only";
import { assertSafeKey } from "./local";
import type { StorageProvider, StoredObject } from "./types";

export interface SupabaseStorageOptions {
  /** URL del proyecto, p. ej. https://xyz.supabase.co */
  url: string;
  /** Clave service_role (solo servidor; nunca en el cliente). */
  serviceRoleKey: string;
  /** Bucket PRIVADO. Se crea automáticamente si no existe. */
  bucket: string;
  /** Inyectable en pruebas. */
  fetchImpl?: typeof fetch;
}

/**
 * Almacenamiento en Supabase Storage a través de su API REST (sin claves S3).
 * Funciona con las variables que inyecta la integración de Supabase en Vercel
 * (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY). Los objetos son privados: el panel
 * interno los sirve mediante una ruta autenticada.
 */
export function createSupabaseStorage(opts: SupabaseStorageOptions): StorageProvider {
  const base = opts.url.replace(/\/+$/, "");
  const f = opts.fetchImpl ?? fetch;
  const authHeaders = { Authorization: `Bearer ${opts.serviceRoleKey}`, apikey: opts.serviceRoleKey };
  const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");
  let bucketReady: Promise<void> | null = null;

  async function ensureBucket(): Promise<void> {
    if (!bucketReady) {
      bucketReady = (async () => {
        const res = await f(`${base}/storage/v1/bucket`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ id: opts.bucket, name: opts.bucket, public: false }),
        });
        if (res.ok || res.status === 409) return;
        const text = await res.text().catch(() => "");
        if (/already exists/i.test(text)) return;
        throw new Error(`Supabase Storage: no se pudo crear el bucket "${opts.bucket}" (${res.status}): ${text.slice(0, 200)}`);
      })().catch((err) => {
        bucketReady = null;
        throw err;
      });
    }
    return bucketReady;
  }

  return {
    name: "supabase",
    async put(key, data, contentType): Promise<StoredObject> {
      assertSafeKey(key);
      await ensureBucket();
      const res = await f(`${base}/storage/v1/object/${opts.bucket}/${encodeKey(key)}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": contentType, "x-upsert": "false", "Content-Length": String(data.byteLength) },
        body: data as unknown as BodyInit,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase Storage: fallo al subir "${key}" (${res.status}): ${text.slice(0, 200)}`);
      }
      return { key, size: data.byteLength, contentType };
    },
    async get(key) {
      assertSafeKey(key);
      const res = await f(`${base}/storage/v1/object/authenticated/${opts.bucket}/${encodeKey(key)}`, {
        method: "GET",
        headers: authHeaders,
      });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase Storage: fallo al leer "${key}" (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = new Uint8Array(await res.arrayBuffer());
      return { data, contentType: res.headers.get("content-type") || "application/octet-stream" };
    },
    async delete(key) {
      assertSafeKey(key);
      const res = await f(`${base}/storage/v1/object/${opts.bucket}/${encodeKey(key)}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase Storage: fallo al eliminar "${key}" (${res.status}): ${text.slice(0, 200)}`);
      }
    },
  };
}
