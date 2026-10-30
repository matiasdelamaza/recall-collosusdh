import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rcdh-admin-queries-"));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;

describe("consultas y métricas del panel interno", () => {
  beforeAll(async () => {
    const { getDb } = await import("@/db/client");
    const { recallCases, serialLookups, analyticsEvents, affectedSerials } = await import("@/db/schema");
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "DEMO-AFECTADA-0001", serialRaw: "demo-afectada-0001", model: "Collosus DH7 (DEMO)", size: "M", productionBatch: "DEMO-BATCH" });
    await db.insert(recallCases).values([
      {
        caseId: "RCDH-ABC23",
        customerName: "Persona de Prueba",
        rut: "12345678-5",
        email: "prueba@example.com",
        phone: "+56 9 1234 5678",
        region: "Metropolitana de Santiago",
        city: "Santiago",
        serialNumber: "DEMO-AFECTADA-0001",
        serialRaw: "demo-afectada-0001",
        model: "COLLOSUS_DH7",
        size: "M",
        serialVerificationStatus: "AFFECTED",
        requestType: "REPLACEMENT",
        priority: "HIGH",
        caseStatus: "REGISTERED",
        damageReported: "YES",
        accidentReported: true,
        incidentDescription: "Caída en descenso.",
        acknowledgedStopRiding: true,
      },
      {
        caseId: "RCDH-DEF45",
        customerName: "Otra Persona",
        rut: "11111111-1",
        email: "otra@example.com",
        phone: "+56 9 8765 4321",
        region: "Valparaíso",
        city: "Viña del Mar",
        serialNumber: "DEMO-OTRA-0002",
        serialRaw: "DEMO-OTRA-0002",
        model: "NOT_SURE",
        size: "NOT_SURE",
        serialVerificationStatus: "PENDING_DATABASE",
        requestType: "PENDING_DATABASE",
        priority: "NORMAL",
        caseStatus: "REPLACED",
        damageReported: "NO",
        accidentReported: false,
        acknowledgedStopRiding: true,
        closedAt: new Date(),
      },
    ]);
    await db.insert(serialLookups).values([
      { serialNormalized: "DEMO-AFECTADA-0001", result: "AFFECTED" },
      { serialNormalized: "XYZ12345", result: "PENDING_DATABASE" },
    ]);
    await db.insert(analyticsEvents).values([{ name: "page_view" }, { name: "page_view" }, { name: "serial_check_started" }]);
  });

  it("lista ordenando prioridad alta primero", async () => {
    const { listCases } = await import("@/lib/recall/cases");
    const r = await listCases({ page: 1 });
    expect(r.total).toBe(2);
    expect(r.rows[0]!.caseId).toBe("RCDH-ABC23");
  });

  it("filtra por estado, accidente y verificación", async () => {
    const { listCases, parseCaseFilters } = await import("@/lib/recall/cases");
    expect((await listCases(parseCaseFilters({ status: "REPLACED", verification: "ALL" }))).rows.map((r) => r.caseId)).toEqual(["RCDH-DEF45"]);
    expect((await listCases(parseCaseFilters({ accident: "YES", verification: "ALL" }))).total).toBe(1);
    expect((await listCases(parseCaseFilters({ verification: "AFFECTED" }))).total).toBe(1);
    expect((await listCases(parseCaseFilters({ status: "INVENTADO", verification: "ALL" }))).total).toBe(2); // valor inválido se ignora
  });

  it("sin filtro de verificación muestra solo unidades afectadas; \"ALL\" y las búsquedas abarcan todos", async () => {
    const { listCases, parseCaseFilters } = await import("@/lib/recall/cases");
    expect(parseCaseFilters({}).verification).toBe("AFFECTED");
    expect(parseCaseFilters({ verification: "" }).verification).toBe("AFFECTED");
    expect((await listCases(parseCaseFilters({}))).total).toBe(1);
    expect((await listCases(parseCaseFilters({ verification: "ALL" }))).total).toBe(2);
    expect(parseCaseFilters({ q: "otra persona" }).verification).toBe("ALL");
  });

  it("sin filtro de estado oculta los cerrados; \"ALL\", el estado Cerrado y las búsquedas los muestran", async () => {
    const { getDb } = await import("@/db/client");
    const { recallCases } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { listCases, parseCaseFilters } = await import("@/lib/recall/cases");
    const db = await getDb();
    await db.update(recallCases).set({ caseStatus: "CLOSED" }).where(eq(recallCases.caseId, "RCDH-DEF45"));
    try {
      expect(parseCaseFilters({}).status).toBe("OPEN");
      expect((await listCases(parseCaseFilters({ verification: "ALL" }))).rows.map((r) => r.caseId)).toEqual(["RCDH-ABC23"]);
      expect((await listCases(parseCaseFilters({ verification: "ALL", status: "ALL" }))).total).toBe(2);
      expect((await listCases(parseCaseFilters({ verification: "ALL", status: "CLOSED" }))).rows.map((r) => r.caseId)).toEqual(["RCDH-DEF45"]);
      expect(parseCaseFilters({ q: "otra persona" }).status).toBe("ALL");
      expect((await listCases(parseCaseFilters({ q: "otra persona" }))).total).toBe(1);
    } finally {
      await db.update(recallCases).set({ caseStatus: "REPLACED" }).where(eq(recallCases.caseId, "RCDH-DEF45"));
    }
  });

  it("busca por caso, serie, RUT, nombre y correo", async () => {
    const { listCases, parseCaseFilters } = await import("@/lib/recall/cases");
    expect((await listCases(parseCaseFilters({ q: "rcdh-abc23" }))).rows[0]!.caseId).toBe("RCDH-ABC23");
    expect((await listCases(parseCaseFilters({ q: "demo-afectada-0001" }))).total).toBe(1);
    expect((await listCases(parseCaseFilters({ q: "AFECTADA" }))).total).toBe(1); // parcial
    expect((await listCases(parseCaseFilters({ q: "12.345.678-5" }))).rows[0]!.caseId).toBe("RCDH-ABC23");
    expect((await listCases(parseCaseFilters({ q: "otra persona" }))).rows[0]!.caseId).toBe("RCDH-DEF45");
    expect((await listCases(parseCaseFilters({ q: "OTRA@EXAMPLE" }))).rows[0]!.caseId).toBe("RCDH-DEF45");
    expect((await listCases(parseCaseFilters({ q: "no-existe-nadie" }))).total).toBe(0);
  });

  it("obtiene el detalle con archivos, notas y bitácora", async () => {
    const { getCaseByCaseId } = await import("@/lib/recall/cases");
    const d = await getCaseByCaseId("RCDH-ABC23");
    expect(d).not.toBeNull();
    expect(d!.case.email).toBe("prueba@example.com");
    expect(d!.files).toEqual([]);
    expect(await getCaseByCaseId("RCDH-00000")).toBeNull();
    expect(await getCaseByCaseId("basura")).toBeNull();
  });

  it("calcula métricas", async () => {
    const { getRecallMetrics } = await import("@/lib/recall/metrics");
    const m = await getRecallMetrics();
    expect(m.serialDatabaseStatus).toBe("PENDING");
    expect(m.affectedSerialsLoaded).toBe(1);
    expect(m.totalLookups).toBe(2);
    expect(m.affectedLookups).toBe(1);
    expect(m.totalCases).toBe(2);
    expect(m.affectedCases).toBe(1);
    expect(m.openCases).toBe(1);
    expect(m.replacementsCompleted).toBe(1);
    expect(m.accidentCases).toBe(1);
    expect(m.damageCases).toBe(1);
    expect(m.completionRate).toBe(0); // la afectada aún no está reemplazada
    expect(m.casesByStatus.find((s) => s.status === "REGISTERED")!.count).toBe(1);
    expect(m.analytics.find((a) => a.name === "page_view")!.total).toBe(2);
    expect(m.daily).toHaveLength(14);
    expect(m.daily.reduce((acc, d) => acc + d.lookups, 0)).toBe(2);
    expect(m.daily.reduce((acc, d) => acc + d.registrations, 0)).toBe(2);
  });
});
