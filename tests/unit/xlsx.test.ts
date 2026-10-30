import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, excelDate } from "@/lib/xlsx";

/** Lee los archivos de un ZIP recorriendo sus encabezados locales. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.toString("utf8", p + 30, p + 30 + nameLen);
    const start = p + 30 + nameLen;
    out.set(name, inflateRawSync(buf.subarray(start, start + size)).toString("utf8"));
    p = start + size;
  }
  return out;
}

describe("buildXlsx", () => {
  it("convierte fechas a la hora de Chile en formato de Excel", () => {
    // 27-10-2026 17:56 UTC = 14:56 en Santiago (UTC-3); 46322 = 27-10-2026.
    expect(excelDate(new Date("2026-10-27T17:56:00Z"), "America/Santiago")).toBeCloseTo(46322 + (14 * 60 + 56) / 1440, 6);
  });

  it("arma una planilla válida con encabezado, textos escapados, números y celdas vacías", () => {
    const file = buildXlsx({
      sheetName: "Casos",
      headers: ["N° caso", "Nombre", "Monto", "Fecha"],
      rows: [
        ["RCDH-AAAAA", "Peña & <Hijos> \"SpA\"", 12, new Date("2026-10-27T17:56:00Z")],
        ["RCDH-BBBBB", null, undefined, null],
      ],
    });
    expect(file.subarray(0, 2).toString()).toBe("PK");
    const parts = unzip(file);
    expect([...parts.keys()]).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]));
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("N° caso");
    expect(sheet).toContain("Peña &amp; &lt;Hijos&gt; &quot;SpA&quot;");
    expect(sheet).toContain('<c r="C2"><v>12</v></c>');
    expect(sheet).toMatch(/<c r="D2" s="2"><v>46322\.62/);
    expect(sheet).toContain('<row r="3"><c r="A3" t="inlineStr">');
    expect(sheet).toContain('<autoFilter ref="A1:D3"/>');
  });
});
