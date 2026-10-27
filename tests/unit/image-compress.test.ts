import { describe, expect, it } from "vitest";
import { COMPRESS_SKIP_BELOW_BYTES, compressFormImages, compressImage, scaleToFit, toJpegName } from "@/lib/image-compress";

describe("scaleToFit", () => {
  it("no agranda imágenes pequeñas", () => {
    expect(scaleToFit(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
  it("reduce el lado mayor manteniendo la proporción (horizontal y vertical)", () => {
    expect(scaleToFit(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(scaleToFit(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
  });
});

describe("toJpegName", () => {
  it("cambia la extensión a .jpg", () => {
    expect(toJpegName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(toJpegName("foto.bici.png")).toBe("foto.bici.jpg");
    expect(toJpegName("sin-extension")).toBe("sin-extension.jpg");
    expect(toJpegName(".heic")).toBe("foto.jpg");
  });
});

describe("compressImage", () => {
  it("deja intactas las fotos livianas", async () => {
    const f = new File([new Uint8Array(1000)], "chica.jpg", { type: "image/jpeg" });
    expect(await compressImage(f)).toBe(f);
  });
  it("sin soporte de decodificación en el entorno devuelve el original", async () => {
    const f = new File([new Uint8Array(COMPRESS_SKIP_BELOW_BYTES + 1)], "grande.jpg", { type: "image/jpeg" });
    expect(await compressImage(f)).toBe(f);
  });
});

describe("compressFormImages", () => {
  it("reemplaza cada foto por su versión reducida, conserva los demás campos y suma el total", async () => {
    const fd = new FormData();
    fd.set("customerName", "Juana");
    fd.set("serialPhoto", new File([new Uint8Array(5_000_000)], "serie.heic"));
    fd.set("bikePhoto", new File([new Uint8Array(3_000_000)], "bici.jpg"));
    fd.append("additionalPhotos", new File([new Uint8Array(2_000_000)], "a.jpg"));
    fd.append("additionalPhotos", new File([new Uint8Array(2_000_000)], "b.jpg"));
    fd.set("headtubePhoto", new File([], "")); // input sin archivo

    const total = await compressFormImages(fd, async (f) => new File([new Uint8Array(400_000)], toJpegName(f.name), { type: "image/jpeg" }));

    expect(total).toBe(4 * 400_000);
    expect(fd.get("customerName")).toBe("Juana");
    expect((fd.get("serialPhoto") as File).name).toBe("serie.jpg");
    expect((fd.get("serialPhoto") as File).size).toBe(400_000);
    expect(fd.getAll("additionalPhotos").map((f) => (f as File).name)).toEqual(["a.jpg", "b.jpg"]);
  });
});
