import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, StoredObject } from "./types";

/** Solo se aceptan claves generadas por el servidor: segmentos [A-Za-z0-9._-] separados por "/". */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) {
    throw new Error("Clave de almacenamiento inválida");
  }
}

/** Almacenamiento en disco local (desarrollo o despliegues de una sola instancia). */
export function createLocalStorage(baseDir: string): StorageProvider {
  const root = path.resolve(baseDir);

  function resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Clave de almacenamiento inválida");
    return full;
  }

  return {
    name: "local",
    async put(key, data, contentType): Promise<StoredObject> {
      const full = resolve(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data, { flag: "wx" });
      await fs.writeFile(`${full}.meta.json`, JSON.stringify({ contentType, size: data.byteLength }), { flag: "w" });
      return { key, size: data.byteLength, contentType };
    },
    async get(key) {
      const full = resolve(key);
      try {
        const data = await fs.readFile(full);
        let contentType = "application/octet-stream";
        try {
          const meta = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")) as { contentType?: string };
          if (meta.contentType) contentType = meta.contentType;
        } catch {
          /* sin metadatos */
        }
        return { data: new Uint8Array(data), contentType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(key) {
      const full = resolve(key);
      await fs.rm(full, { force: true });
      await fs.rm(`${full}.meta.json`, { force: true });
    },
  };
}
