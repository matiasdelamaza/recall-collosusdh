import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { buildRegistrationForm, postForm, postJson, rutFor, setupTestEnv } from "./helpers";

setupTestEnv("tres-resultados");

// Sesión del panel controlada por la prueba (para la exportación de consultas).
const session = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/admin/session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdminApi: async () =>
      session.ok ? { ok: true, identity: { actor: "admin" } } : { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) },
  };
});

const { POST: verificar } = await import("@/app/api/verificar/route");
const { POST: registro } = await import("@/app/api/registro/route");
const { GET: exportLookups } = await import("@/app/api/admin/exportar/consultas.csv/route");
const { getDb } = await import("@/db/client");
const { affectedSerials, auditEvents, recallCases, serialLookups } = await import("@/db/schema");
const { importSerialsFromCsv, parseSerialsCsv } = await import("@/lib/recall/import");
const { listLookups, parseLookupFilters, summarizeLookups } = await import("@/lib/recall/lookups");
const { reprocessPendingCases } = await import("@/lib/recall/reprocess");
const { setSerialDatabaseStatus, verifySerial } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");

const VERIFY_URL = "http://localhost/api/verificar";
const REG_URL = "http://localhost/api/registro";

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const db = await getDb();
  await db.insert(affectedSerials).values([
    { serialNumber: "TR-AFECTADA-01", serialRaw: "TR-AFECTADA-01", model: "Collosus DH7", size: "M", status: "RECALL" },
    { serialNumber: "TR-REFORZADA-01", serialRaw: "TR-REFORZADA-01", model: "Collosus DH9", size: "L", status: "REINFORCED" },
  ]);
});
beforeEach(() => resetRateLimits());

describe("importación con columna de tanda", () => {
  it("acepta los estados de Polygon (NOT OK / OK) y sus equivalentes en español", () => {
    const r = parseSerialsCsv("serial_number,polygon_status\nP-0001,NOT OK\nP-0002,OK\nP-0003,not_ok\nP-0004,No afectada\nP-0005,Not-OK\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.status)).toEqual(["RECALL", "REINFORCED", "RECALL", "REINFORCED", "RECALL"]);
  });

  it("acepta AFECTADA, REFORZADA y EXCLUIDA (con o sin tilde) y sus equivalentes en inglés", () => {
    const r = parseSerialsCsv("serie;tanda\nA-0001;afectada\nA-0002;Reforzada\nA-0003;EXCLUÍDA\nA-0004;REINFORCED\nA-0005;\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.status)).toEqual(["RECALL", "REINFORCED", "EXCLUDED", "REINFORCED", "RECALL"]);
  });

  it("rechaza un estado desconocido con mensaje en español", () => {
    const r = parseSerialsCsv("serial_number,status\nA-0001,DUDOSA\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]!.message).toMatch(/NOT OK, OK, AFECTADA, NO AFECTADA o EXCLUIDA/);
  });
});

describe("verificación de una serie de la tanda reforzada", () => {
  it("verifySerial devuelve REINFORCED con modelo y talla, con la base en cualquier estado", async () => {
    for (const status of ["PENDING", "COMPLETE"] as const) {
      await setSerialDatabaseStatus(status, "test");
      expect(await verifySerial("tr-reforzada-01")).toMatchObject({ state: "REINFORCED", serial: "TR-REFORZADA-01", model: "Collosus DH9", size: "L" });
    }
    await setSerialDatabaseStatus("PENDING", "test");
  });

  it("POST /api/verificar responde REINFORCED y registra la consulta", async () => {
    const res = await verificar(postJson(VERIFY_URL, { serial: "TR-REFORZADA-01" }, { "x-forwarded-for": "10.1.0.1" }));
    expect(await res.json()).toMatchObject({ ok: true, state: "REINFORCED", serial: "TR-REFORZADA-01", model: "Collosus DH9", size: "L" });
    const db = await getDb();
    const rows = await db.select().from(serialLookups).where(eq(serialLookups.serialNormalized, "TR-REFORZADA-01"));
    expect(rows.map((r) => r.result)).toEqual(["REINFORCED"]);
  });

  it("el registro de una serie reforzada se rechaza (no forma parte de la campaña)", async () => {
    const res = await registro(postForm(REG_URL, buildRegistrationForm({ serial: "TR-REFORZADA-01", rut: rutFor(2222221), email: "ref@example.test" }), { "x-forwarded-for": "10.1.0.2" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "VALIDATION" });
    expect(body.fields.serial).toMatch(/no forma parte/i);
    const db = await getDb();
    expect(await db.select().from(recallCases).where(eq(recallCases.serialNumber, "TR-REFORZADA-01"))).toEqual([]);
  });
});

describe("reproceso hacia tanda reforzada", () => {
  it("un caso interino cuya serie se carga como REFORZADA pasa a revisión manual y se notifica", async () => {
    await setSerialDatabaseStatus("PENDING", "test");
    const db = await getDb();
    const reg = await (
      await registro(postForm(REG_URL, buildRegistrationForm({ serial: "TR-LUEGO-REF-01", rut: rutFor(2222234), email: "luego@example.test" }), { "x-forwarded-for": "10.1.0.3" }))
    ).json();
    expect(reg).toMatchObject({ ok: true, outcome: "CREATED", verification: "PENDING_DATABASE" });

    await importSerialsFromCsv("serial_number;tanda\nTR-LUEGO-REF-01;REFORZADA\n", { filename: "polygon-reforzadas.csv", importedBy: "prueba" });
    const r = await reprocessPendingCases({ actor: "prueba", notifyCustomers: true });
    expect(r).toMatchObject({ nowReinforced: 1, nowAffected: 0, notified: 1, errors: [] });

    const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, reg.caseId)))[0]!;
    expect(row).toMatchObject({ serialVerificationStatus: "REINFORCED", requestType: "MANUAL_REVIEW", caseStatus: "MANUAL_REVIEW" });
    const mails = (await db.select().from(auditEvents)).filter((x) => x.type === "EMAIL_SENT" && (x.payload as { kind?: string })?.kind === "CUSTOMER_RESULT_REINFORCED");
    expect(mails.length).toBe(1);

    // No vuelve a tocarse en un reproceso posterior.
    const again = await reprocessPendingCases({ actor: "prueba", notifyCustomers: true });
    expect(again.nowReinforced).toBe(0);
  });
});

describe("consultas en el panel interno", () => {
  it("resume, filtra, busca y enlaza el caso registrado", async () => {
    await setSerialDatabaseStatus("COMPLETE", "test");
    await verificar(postJson(VERIFY_URL, { serial: "TR-AFECTADA-01" }, { "x-forwarded-for": "10.2.0.1" }));
    await verificar(postJson(VERIFY_URL, { serial: "NO-EXISTE-999" }, { "x-forwarded-for": "10.2.0.1" }));
    await verificar(postJson(VERIFY_URL, { serial: "NO-EXISTE-999" }, { "x-forwarded-for": "10.2.0.1" }));
    await verificar(postJson(VERIFY_URL, { serial: "AB" }, { "x-forwarded-for": "10.2.0.2" }));
    await setSerialDatabaseStatus("PENDING", "test");

    const s = await summarizeLookups();
    expect(s.byResult.AFFECTED).toBeGreaterThanOrEqual(1);
    expect(s.byResult.REINFORCED).toBeGreaterThanOrEqual(1);
    expect(s.byResult.NOT_IDENTIFIED).toBe(2);
    expect(s.byResult.INVALID).toBe(1);
    expect(s.total).toBe(Object.values(s.byResult).reduce((a, b) => a + b, 0));
    expect(s.distinctConnections).toBeGreaterThanOrEqual(2);

    const notFound = await listLookups(parseLookupFilters({ result: "NOT_IDENTIFIED" }));
    expect(notFound.total).toBe(2);
    // Mismo hash de conexión para los dos intentos de la misma IP.
    expect(new Set(notFound.rows.map((r) => r.connection)).size).toBe(1);
    expect(notFound.rows[0]!.connection).toHaveLength(8);

    const search = await listLookups(parseLookupFilters({ q: "luego-ref" }));
    expect(search.rows.every((r) => r.serialNormalized.includes("TR-LUEGO-REF-01"))).toBe(true);

    // La serie registrada en el reproceso aparece enlazada a su caso.
    await verificar(postJson(VERIFY_URL, { serial: "TR-LUEGO-REF-01" }, { "x-forwarded-for": "10.2.0.3" }));
    const linked = await listLookups(parseLookupFilters({ q: "TR-LUEGO-REF-01" }));
    expect(linked.rows[0]!.caseId).toMatch(/^RCDH-/);

    // Filtros inválidos se ignoran.
    expect(parseLookupFilters({ result: "DROP TABLE", page: "-3" })).toMatchObject({ result: undefined, page: 1 });
  });

  it("la exportación CSV exige sesión y respeta los filtros", async () => {
    session.ok = false;
    expect((await exportLookups(new (await import("next/server")).NextRequest("http://localhost/api/admin/exportar/consultas.csv"))).status).toBe(401);
    session.ok = true;

    const res = await exportLookups(new (await import("next/server")).NextRequest("http://localhost/api/admin/exportar/consultas.csv?result=NOT_IDENTIFIED"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toContain("Serie ingresada");
    expect(lines.length).toBe(3);
    expect(lines.slice(1).every((l) => l.includes("NO-EXISTE-999") && l.includes("No encontrada"))).toBe(true);
  });
});
