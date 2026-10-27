import { describe, expect, it, vi } from "vitest";
import { createSupabaseStorage } from "@/lib/storage/supabase";

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  });
  return { f: f as unknown as typeof fetch, calls };
}

const opts = { url: "https://proyecto.supabase.co/", serviceRoleKey: "clave-secreta", bucket: "recall-files" };

describe("Supabase Storage (REST)", () => {
  it("crea el bucket privado una sola vez y sube el objeto con el content-type correcto", async () => {
    const { f, calls } = fakeFetch(({ url, init }) => {
      if (url.endsWith("/storage/v1/bucket")) return new Response("{}", { status: 200 });
      if (init.method === "POST") return new Response(JSON.stringify({ Key: "recall-files/x" }), { status: 200 });
      return new Response("", { status: 500 });
    });
    const storage = createSupabaseStorage({ ...opts, fetchImpl: f });
    const data = new Uint8Array([1, 2, 3]);
    const a = await storage.put("cases/abc/serial-1.jpg", data, "image/jpeg");
    const b = await storage.put("cases/abc/bike-2.png", data, "image/png");
    expect(a).toEqual({ key: "cases/abc/serial-1.jpg", size: 3, contentType: "image/jpeg" });
    expect(b.size).toBe(3);
    const bucketCalls = calls.filter((c) => c.url.endsWith("/storage/v1/bucket"));
    expect(bucketCalls).toHaveLength(1);
    expect(JSON.parse(String(bucketCalls[0]!.init.body))).toMatchObject({ name: "recall-files", public: false });
    const upload = calls.find((c) => c.url.includes("/object/recall-files/cases/abc/serial-1.jpg"))!;
    expect((upload.init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect((upload.init.headers as Record<string, string>).Authorization).toBe("Bearer clave-secreta");
    expect(upload.url).toBe("https://proyecto.supabase.co/storage/v1/object/recall-files/cases/abc/serial-1.jpg");
  });

  it("tolera que el bucket ya exista (409)", async () => {
    const { f } = fakeFetch(({ url }) => {
      if (url.endsWith("/storage/v1/bucket")) return new Response(JSON.stringify({ message: "The resource already exists" }), { status: 409 });
      return new Response("{}", { status: 200 });
    });
    const storage = createSupabaseStorage({ ...opts, fetchImpl: f });
    await expect(storage.put("cases/abc/serial-1.jpg", new Uint8Array([1]), "image/jpeg")).resolves.toBeTruthy();
  });

  it("lee por la ruta autenticada y devuelve null si no existe", async () => {
    const { f, calls } = fakeFetch(({ url }) => {
      if (url.includes("/object/authenticated/recall-files/cases/abc/ok.jpg")) {
        return new Response(new Uint8Array([9, 9]), { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
    const storage = createSupabaseStorage({ ...opts, fetchImpl: f });
    const got = await storage.get("cases/abc/ok.jpg");
    expect(got?.contentType).toBe("image/jpeg");
    expect(Array.from(got!.data)).toEqual([9, 9]);
    expect(await storage.get("cases/abc/missing.jpg")).toBeNull();
    expect(calls.every((c) => (c.init.headers as Record<string, string>).apikey === "clave-secreta")).toBe(true);
  });

  it("rechaza claves inseguras y propaga errores del servicio", async () => {
    const { f } = fakeFetch(() => new Response("boom", { status: 500 }));
    const storage = createSupabaseStorage({ ...opts, fetchImpl: f });
    await expect(storage.get("../etc/passwd")).rejects.toThrow();
    await expect(storage.delete("cases/abc/x.jpg")).rejects.toThrow(/Supabase Storage/);
  });
});
