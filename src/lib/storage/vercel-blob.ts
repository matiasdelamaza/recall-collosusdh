import "server-only";
import { del, get, put } from "@vercel/blob";
import { assertSafeKey } from "./local";
import type { StorageProvider, StoredObject } from "./types";

export interface VercelBlobStorageOptions {
  /** Prefijo dentro del almacén (p. ej. "recall"). */
  prefix?: string;
  /** Token estático; en Vercel se usa BLOB_READ_WRITE_TOKEN / OIDC automáticamente. */
  token?: string;
}

/**
 * Almacenamiento en Vercel Blob con acceso PRIVADO: los objetos no tienen URL pública;
 * solo se leen desde el servidor (panel interno, ruta autenticada).
 * El almacén se enlaza al proyecto y Vercel inyecta BLOB_READ_WRITE_TOKEN.
 */
export function createVercelBlobStorage(opts: VercelBlobStorageOptions = {}): StorageProvider {
  const prefix = (opts.prefix ?? "").replace(/^\/+|\/+$/g, "");
  const full = (key: string) => (prefix ? `${prefix}/${key}` : key);
  const tokenOpt = opts.token ? { token: opts.token } : {};

  return {
    name: "vercel-blob",
    async put(key, data, contentType): Promise<StoredObject> {
      assertSafeKey(key);
      await put(full(key), data as unknown as Blob | ArrayBuffer | Buffer, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType,
        ...tokenOpt,
      });
      return { key, size: data.byteLength, contentType };
    },
    async get(key) {
      assertSafeKey(key);
      let res: Awaited<ReturnType<typeof get>>;
      try {
        res = await get(full(key), { access: "private", useCache: false, ...tokenOpt });
      } catch (err) {
        if ((err as { name?: string })?.name === "BlobNotFoundError") return null;
        throw err;
      }
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      const chunks: Uint8Array[] = [];
      const reader = res.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const data = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        data.set(c, offset);
        offset += c.byteLength;
      }
      return { data, contentType: res.blob?.contentType || "application/octet-stream" };
    },
    async delete(key) {
      assertSafeKey(key);
      await del(full(key), tokenOpt);
    },
  };
}
