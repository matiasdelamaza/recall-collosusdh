import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey } from "./local";
import type { StorageProvider, StoredObject } from "./types";

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/** Almacenamiento S3-compatible (AWS S3, Cloudflare R2, Supabase Storage vía S3). Objetos privados. */
export function createS3Storage(opts: S3StorageOptions): StorageProvider {
  const client = new S3Client({
    region: opts.region || "auto",
    endpoint: opts.endpoint || undefined,
    forcePathStyle: opts.forcePathStyle ?? true,
    credentials:
      opts.accessKeyId && opts.secretAccessKey
        ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
        : undefined,
  });

  return {
    name: "s3",
    async put(key, data, contentType): Promise<StoredObject> {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          ContentLength: data.byteLength,
        }),
      );
      return { key, size: data.byteLength, contentType };
    },
    async get(key) {
      assertSafeKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        return { data: bytes, contentType: res.ContentType || "application/octet-stream" };
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw err;
      }
    },
    async delete(key) {
      assertSafeKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}
