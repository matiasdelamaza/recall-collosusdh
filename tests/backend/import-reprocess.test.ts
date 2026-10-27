import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { buildRegistrationForm, postForm, rutFor, setupTestEnv } from "./helpers";

setupTestEnv("import");

const { POST } = await import("@/app/api/registro/route");
const { getDb } = await import("@/db/client");
const { affectedSerials, auditEvents, recallCases, serialImports } = await import("@/db/schema");
const { importSerialsFromCsv, parseSerialsCsv, detectDelimiter } = await import("@/lib/recall/import");
const { reprocessPendingCases } = await import("@/lib/recall/reprocess");
const { setSerialDatabaseStatus, verifySerial } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");

describe("importSerialsFromCsv", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("detecta el separador", () => {
    expect(detectDelimiter("serial_number,model\nA,B")).toBe(",");
    expect(detectDelimiter("serial_number;model\nA;B")).toBe(";");
    expect(detectDelimiter("serial_number\tmodel\nA\tB")).toBe("\t");
  });

  it("parsea con alias de cabecera y filas inválidas", () => {
    const csv = "\uFEFFFrame Number;Modelo;Talla;Lote\nimp-0001;DH9;L;B1\nAB;x;y;z\n;;;\nIMP-0001;dup;;\nIMP-0002;DH7;M;B1\n";
    const r = parseSerialsCsv(csv);
    expect(r.rowCount).toBe(5);
    expect(r.rows.map((x) => x.serialNumber)).toEqual(["IMP-0001", "IMP-0002"]);
    expect(r.rows[0]).toMatchObject({ model: "DH9", size: "L", productionBatch: "B1", status: "RECALL" });
    expect(r.errors.length).toBe(3);
    expect(r.errors[0]).toMatchObject({ row: 3 });
    expect(r.errors[0]!.message).toMatch(/inválida/);
    expect(r.errors[1]!.message).toMatch(/vacía/);
    expect(r.errors[2]!.message).toMatch(/repetida/);
  });

  it("rechaza archivo vacío o sin columna de serie", () => {
    expect(parseSerialsCsv("   \n").errors[0]!.message).toMatch(/vacío/);
    expect(parseSerialsCsv("modelo,talla\nA,B\n").errors[0]!.message).toMatch(/serial_number/);
  });

  it("importa con ',' y ';', hace upsert y registra la importación", async () => {
    const db = await getDb();
    const r1 = await importSerialsFromCsv("serial_number,model,size,production_batch\nIMP-1001,Collosus DH7,M,B-1\nIMP-1002,Collosus DH9,L,B-1\nAB,x,y,z\n", {
      filename: "lote1.csv",
      importedBy: "prueba",
    });
    expect(r1).toMatchObject({ ok: true, rowCount: 3, insertedCount: 2, updatedCount: 0, skippedCount: 1 });
    expect(r1.importId).toBeTypeOf("number");

    const r2 = await importSerialsFromCsv("serial;model;status\nimp-1002;Collosus DH9 v2;RECALL\nIMP-1003;Collosus DH7;EXCLUDED\n", {
      filename: "lote2.csv",
      importedBy: "prueba",
    });
    expect(r2).toMatchObject({ ok: true, insertedCount: 1, updatedCount: 1, skippedCount: 0 });

    const rows = await db.select().from(affectedSerials);
    expect(rows.length).toBe(3);
    expect(rows.find((r) => r.serialNumber === "IMP-1002")!.model).toBe("Collosus DH9 v2");
    expect(rows.find((r) => r.serialNumber === "IMP-1003")!.status).toBe("EXCLUDED");

    const imports = await db.select().from(serialImports);
    expect(imports.length).toBe(2);
    expect(imports[1]).toMatchObject({ filename: "lote2.csv", insertedCount: 1, updatedCount: 1 });

    const audits = await db.select().from(auditEvents).where(eq(auditEvents.type, "SERIALS_IMPORTED"));
    expect(audits.length).toBe(2);

    // Las EXCLUDED no se consideran afectadas.
    await setSerialDatabaseStatus("COMPLETE", "test");
    expect((await verifySerial("IMP-1003")).state).toBe("NOT_IDENTIFIED");
    expect((await verifySerial("IMP-1002")).state).toBe("AFFECTED");
    await setSerialDatabaseStatus("PENDING", "test");
  });

  it("la lista trae la talla pegada (A25022640XL): se encuentra escrita con o sin talla y se registra como la de Polygon", async () => {
    await importSerialsFromCsv("serial_number;status\nA25022640XL;OK\nB25028554;NOT OK\n", { filename: "talla.csv", importedBy: "prueba" });
    await setSerialDatabaseStatus("COMPLETE", "prueba");
    expect(await verifySerial("A25022640")).toMatchObject({ state: "REINFORCED", serial: "A25022640XL" });
    expect(await verifySerial("a25022640xl")).toMatchObject({ state: "REINFORCED", serial: "A25022640XL" });
    // Al revés: la lista sin talla y el cliente la escribe con talla.
    expect(await verifySerial("B25028554M")).toMatchObject({ state: "AFFECTED", serial: "B25028554" });
    expect(await verifySerial("A99999999XL")).toMatchObject({ state: "NOT_IDENTIFIED", serial: "A99999999XL" });
    await setSerialDatabaseStatus("PENDING", "prueba");
  });

  it("dry-run no escribe", async () => {
    const db = await getDb();
    const before = (await db.select().from(affectedSerials)).length;
    const r = await importSerialsFromCsv("serial_number\nIMP-2001\nIMP-1001\n", { filename: "sim.csv", importedBy: "prueba", dryRun: true });
    expect(r).toMatchObject({ ok: true, insertedCount: 1, updatedCount: 1, importId: null });
    expect((await db.select().from(affectedSerials)).length).toBe(before);
  });
});

describe("reprocessPendingCases", () => {
  const URL_ = "http://localhost/api/registro";

  it("casos registrados en modo interino se promueven a AFECTADA / NO IDENTIFICADA tras cargar la base", async () => {
    await setSerialDatabaseStatus("PENDING", "test");
    await resetRateLimits();
    const db = await getDb();

    // Dos registros en modo interino: uno quedará afectado tras la importación, el otro no.
    const a = await (await POST(postForm(URL_, buildRegistrationForm({ serial: "PEND-AFECT-01", rut: rutFor(1111112), email: "pa@example.test" }), { "x-forwarded-for": "198.51.100.1" }))).json();
    const b = await (await POST(postForm(URL_, buildRegistrationForm({ serial: "PEND-NOEST-01", rut: rutFor(1111113), email: "pb@example.test" }), { "x-forwarded-for": "198.51.100.2" }))).json();
    expect(a).toMatchObject({ ok: true, outcome: "CREATED", verification: "PENDING_DATABASE" });
    expect(b).toMatchObject({ ok: true, outcome: "CREATED", verification: "PENDING_DATABASE" });

    // Mientras la base siga PENDING, solo se promueven coincidencias positivas.
    await importSerialsFromCsv("serial_number\nPEND-AFECT-01\n", { filename: "polygon.csv", importedBy: "prueba" });
    const dry = await reprocessPendingCases({ actor: "prueba", notifyCustomers: true, dryRun: true });
    expect(dry).toMatchObject({ scanned: 2, nowAffected: 1, nowNotIdentified: 0, unchanged: 1, notified: 0 });
    expect((await db.select().from(recallCases).where(eq(recallCases.caseId, a.caseId)))[0]!.serialVerificationStatus).toBe("PENDING_DATABASE");

    const r1 = await reprocessPendingCases({ actor: "prueba", notifyCustomers: true });
    expect(r1).toMatchObject({ scanned: 2, nowAffected: 1, nowNotIdentified: 0, unchanged: 1, notified: 1, errors: [] });

    const rowA = (await db.select().from(recallCases).where(eq(recallCases.caseId, a.caseId)))[0]!;
    expect(rowA.serialVerificationStatus).toBe("AFFECTED");
    expect(rowA.requestType).toBe("REPLACEMENT");
    expect(rowA.caseStatus).toBe("REGISTERED");
    expect(rowA.resultNotifiedAt).toBeInstanceOf(Date);

    const rowB1 = (await db.select().from(recallCases).where(eq(recallCases.caseId, b.caseId)))[0]!;
    expect(rowB1.serialVerificationStatus).toBe("PENDING_DATABASE");

    // Base marcada como COMPLETA: el resto pasa a NO IDENTIFICADA y revisión manual.
    await setSerialDatabaseStatus("COMPLETE", "test");
    const r2 = await reprocessPendingCases({ actor: "prueba", notifyCustomers: true });
    expect(r2).toMatchObject({ scanned: 1, nowAffected: 0, nowNotIdentified: 1, unchanged: 0, notified: 1 });
    const rowB2 = (await db.select().from(recallCases).where(eq(recallCases.caseId, b.caseId)))[0]!;
    expect(rowB2.serialVerificationStatus).toBe("NOT_IDENTIFIED");
    expect(rowB2.caseStatus).toBe("MANUAL_REVIEW");
    expect(rowB2.requestType).toBe("MANUAL_REVIEW");

    // Un nuevo reproceso no toca nada (NOT_IDENTIFIED se mantiene; sin coincidencia nueva).
    const r3 = await reprocessPendingCases({ actor: "prueba", notifyCustomers: false });
    expect(r3).toMatchObject({ scanned: 1, nowAffected: 0, nowNotIdentified: 0, unchanged: 1, notified: 0 });

    const audits = await db.select().from(auditEvents);
    expect(audits.filter((x) => x.type === "CASES_REPROCESSED").length).toBe(3);
    expect(audits.filter((x) => x.type === "STATUS_CHANGED").length).toBe(2);
    expect(audits.filter((x) => x.type === "EMAIL_SENT" && (x.payload as { kind?: string })?.kind === "CUSTOMER_RESULT_AFFECTED").length).toBe(1);
    expect(audits.filter((x) => x.type === "EMAIL_SENT" && (x.payload as { kind?: string })?.kind === "CUSTOMER_RESULT_NOT_IDENTIFIED").length).toBe(1);
  });

  it("reproceso: un caso con la serie sin talla toma la serie de la lista de Polygon (A25022699 → A25022699XL)", async () => {
    await setSerialDatabaseStatus("PENDING", "test");
    await resetRateLimits();
    const db = await getDb();
    const c = await (await POST(postForm(URL_, buildRegistrationForm({ serial: "A25022699", rut: rutFor(1111114), email: "pt@example.test" }), { "x-forwarded-for": "198.51.100.3" }))).json();
    expect(c).toMatchObject({ ok: true, outcome: "CREATED", verification: "PENDING_DATABASE" });

    await importSerialsFromCsv("serial_number;status\nA25022699XL;OK\n", { filename: "polygon-talla.csv", importedBy: "prueba" });
    const r = await reprocessPendingCases({ actor: "prueba", notifyCustomers: false });
    expect(r).toMatchObject({ nowReinforced: 1, errors: [] });
    const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, c.caseId)))[0]!;
    expect(row).toMatchObject({ serialNumber: "A25022699XL", serialRaw: "A25022699", serialVerificationStatus: "REINFORCED", caseStatus: "MANUAL_REVIEW" });
  });
});
