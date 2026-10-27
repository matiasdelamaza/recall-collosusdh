import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { fn: string; args: unknown[] }[] = [];
const store = new Map<string, { data: Uint8Array; contentType: string }>();

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Uint8Array, opts: Record<string, unknown>) => {
    calls.push({ fn: "put", args: [pathname, opts] });
    store.set(pathname, { data: body, contentType: String(opts.contentType) });
    return { pathname, url: `https://x.private.blob.vercel-storage.com/${pathname}` };
  }),
  get: vi.fn(async (pathname: string, opts: Record<string, unknown>) => {
    calls.push({ fn: "get", args: [pathname, opts] });
    const obj = store.get(pathname);
    if (!obj) return null;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(obj.data.slice(0, 1));
        c.enqueue(obj.data.slice(1));
        c.close();
      },
    });
    return { statusCode: 200, stream, headers: new Headers(), blob: { contentType: obj.contentType } };
  }),
  del: vi.fn(async (pathname: string) => {
    calls.push({ fn: "del", args: [pathname] });
    store.delete(pathname);
  }),
}));

import { createVercelBlobStorage } from "@/lib/storage/vercel-blob";

beforeEach(() => {
  calls.length = 0;
  store.clear();
});

describe("Vercel Blob (privado)", () => {
  it("sube con access=private, sin sufijo aleatorio y con prefijo; lee y borra", async () => {
    const s = createVercelBlobStorage({ prefix: "recall" });
    const data = new Uint8Array([7, 8, 9]);
    const put = await s.put("cases/abc/serial-1.jpg", data, "image/jpeg");
    expect(put).toEqual({ key: "cases/abc/serial-1.jpg", size: 3, contentType: "image/jpeg" });
    const putCall = calls.find((c) => c.fn === "put")!;
    expect(putCall.args[0]).toBe("recall/cases/abc/serial-1.jpg");
    expect(putCall.args[1]).toMatchObject({ access: "private", addRandomSuffix: false, contentType: "image/jpeg" });

    const got = await s.get("cases/abc/serial-1.jpg");
    expect(Array.from(got!.data)).toEqual([7, 8, 9]);
    expect(got!.contentType).toBe("image/jpeg");
    expect(calls.find((c) => c.fn === "get")!.args[1]).toMatchObject({ access: "private" });

    await s.delete("cases/abc/serial-1.jpg");
    expect(await s.get("cases/abc/serial-1.jpg")).toBeNull();
  });

  it("rechaza claves inseguras", async () => {
    const s = createVercelBlobStorage();
    await expect(s.get("../x")).rejects.toThrow();
  });
});
