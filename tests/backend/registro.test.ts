import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { buildRegistrationForm, fakeText, fakeJpeg, fakePng, postForm, rutFor, setupTestEnv } from "./helpers";

const env = setupTestEnv("registro");

const { POST } = await import("@/app/api/registro/route");
const { getDb } = await import("@/db/client");
const { affectedSerials, auditEvents, caseFiles, recallCases } = await import("@/db/schema");
const { setSerialDatabaseStatus } = await import("@/lib/recall/verify");
const { resetRateLimits } = await import("@/lib/server/rate-limit");
const { FORM_VALIDATION } = await import("@/lib/copy/es");

const URL_ = "http://localhost/api/registro";
const IP = { "x-forwarded-for": "192.0.2.10", "user-agent": "vitest" };

describe("POST /api/registro", () => {
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "DEMO-AFECTADA-0001", serialRaw: "DEMO-AFECTADA-0001", model: "Collosus DH7 (DEMO)", size: "M", status: "RECALL" });
    await setSerialDatabaseStatus("PENDING", "test");
  });
  beforeEach(() => resetRateLimits());

  it("registro completo de serie afectada → 201 CREATED, archivos guardados, correos auditados", async () => {
    const form = buildRegistrationForm({ phone: "912345678" }, { extra: [{ field: "headtubePhoto", data: fakePng(), name: "direccion.png" }] });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, outcome: "CREATED", serial: "DEMO-AFECTADA-0001", verification: "AFFECTED", requestType: "REPLACEMENT" });
    expect(body.caseId).toMatch(/^RCDH-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);

    const db = await getDb();
    const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, body.caseId)))[0]!;
    expect(row.caseStatus).toBe("REGISTERED");
    expect(row.priority).toBe("NORMAL");
    expect(row.rut).toBe("12345678-5");
    expect(row.email).toBe("juana.perez@example.test");
    expect(row.phone).toBe("+56 9 1234 5678");
    expect(row.acknowledgedStopRiding).toBe(true);
    expect(row.ipHash).toBeTruthy();
    expect(row.ipHash).not.toContain("192.0.2.10");

    const files = await db.select().from(caseFiles).where(eq(caseFiles.caseId, row.id));
    expect(files.map((f) => f.kind).sort()).toEqual(["BIKE_PHOTO", "HEADTUBE_PHOTO", "SERIAL_PHOTO"]);
    for (const f of files) {
      expect(f.storageKey).toMatch(new RegExp(`^cases/${row.id}/`));
      expect(fs.existsSync(`${env.uploadsDir}/${f.storageKey}`)).toBe(true);
    }
    expect(files.find((f) => f.kind === "HEADTUBE_PHOTO")!.mimeType).toBe("image/png");

    const audits = await db.select().from(auditEvents).where(eq(auditEvents.caseId, row.id));
    const types = audits.map((a) => a.type);
    expect(types).toContain("CASE_CREATED");
    expect(types.filter((t) => t === "EMAIL_SENT").length).toBe(2); // cliente + interno
  });

  it("misma serie con el mismo correo → 200 EXISTING (sin crear otro caso)", async () => {
    const res = await POST(postForm(URL_, buildRegistrationForm({ rut: rutFor(20345678), customerName: "Otra Persona Pero Mismo Correo" }), IP));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("EXISTING");
    const db = await getDb();
    const rows = await db.select().from(recallCases).where(eq(recallCases.serialNumber, "DEMO-AFECTADA-0001"));
    expect(rows.length).toBe(1);
  });

  it("misma serie con el mismo RUT (formato distinto) → EXISTING", async () => {
    const res = await POST(postForm(URL_, buildRegistrationForm({ rut: "123456785", email: "otro.correo@example.test" }), IP));
    expect((await res.json()).outcome).toBe("EXISTING");
  });

  it("misma serie con identidad distinta → CREATED marcado como DUPLICATE_CASE", async () => {
    const res = await POST(postForm(URL_, buildRegistrationForm({ rut: rutFor(9876543), email: "tercero@example.test", customerName: "Tercero Distinto" }), IP));
    expect(res.status).toBe(201);
    const body = await res.json();
    const db = await getDb();
    const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, body.caseId)))[0]!;
    expect(row.caseStatus).toBe("DUPLICATE_CASE");
  });

  it("al alcanzar el máximo de casos activos por serie → 409 DUPLICATE_LIMIT", async () => {
    // Ya hay 2 casos activos; el tercero se crea (DUPLICATE_CASE) y el cuarto se rechaza.
    const r3 = await POST(postForm(URL_, buildRegistrationForm({ rut: rutFor(15432198), email: "cuarto@example.test" }), IP));
    expect(r3.status).toBe(201);
    const r4 = await POST(postForm(URL_, buildRegistrationForm({ rut: rutFor(16543219), email: "quinto@example.test" }), IP));
    expect(r4.status).toBe(409);
    const body = await r4.json();
    expect(body.error).toBe("DUPLICATE_LIMIT");
    expect(body.message).toMatch(/solicitudes activas/i);
  });

  it("accidente reportado → prioridad ALTA y descripción obligatoria", async () => {
    const sinDescripcion = buildRegistrationForm({ serial: "SERIE-ACCIDENTE-01", accidentReported: "YES", rut: rutFor(17654321), email: "acc@example.test" });
    const r1 = await POST(postForm(URL_, sinDescripcion, IP));
    expect(r1.status).toBe(422);
    expect((await r1.json()).fields.incidentDescription).toBeTruthy();

    const conDescripcion = buildRegistrationForm(
      { serial: "SERIE-ACCIDENTE-01", accidentReported: "YES", incidentDescription: "Caída en bajada, se separó el cuadro.", rut: rutFor(17654321), email: "acc@example.test", damageReported: "YES" },
      { extra: [{ field: "incidentFiles", data: fakeJpeg(), name: "dano1.jpg" }, { field: "incidentFiles", data: fakeJpeg(), name: "dano2.jpg" }] },
    );
    const r2 = await POST(postForm(URL_, conDescripcion, IP));
    expect(r2.status).toBe(201);
    const body = await r2.json();
    expect(body.verification).toBe("PENDING_DATABASE");
    expect(body.requestType).toBe("PENDING_DATABASE");
    const db = await getDb();
    const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, body.caseId)))[0]!;
    expect(row.priority).toBe("HIGH");
    expect(row.accidentReported).toBe(true);
    expect(row.caseStatus).toBe("REGISTERED");
    const files = await db.select().from(caseFiles).where(eq(caseFiles.caseId, row.id));
    expect(files.filter((f) => f.kind === "ADDITIONAL").length).toBe(2);
  });

  it("el requestType del cliente se ignora: con base COMPLETE y sin coincidencia → MANUAL_REVIEW", async () => {
    await setSerialDatabaseStatus("COMPLETE", "test");
    try {
      const form = buildRegistrationForm({ serial: "NO-ESTA-EN-BASE-77", requestType: "REPLACEMENT", rut: rutFor(18765432), email: "manual@example.test" });
      const res = await POST(postForm(URL_, form, IP));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.verification).toBe("NOT_IDENTIFIED");
      expect(body.requestType).toBe("MANUAL_REVIEW");
      const db = await getDb();
      const row = (await db.select().from(recallCases).where(eq(recallCases.caseId, body.caseId)))[0]!;
      expect(row.caseStatus).toBe("MANUAL_REVIEW");
    } finally {
      await setSerialDatabaseStatus("PENDING", "test");
    }
  });

  it("archivo con magic bytes inválidos → 422 con error en español en el campo", async () => {
    const form = buildRegistrationForm({ serial: "SERIE-ARCHIVO-01", rut: rutFor(13876543), email: "archivo@example.test" }, { serialPhoto: fakeText() });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION");
    expect(body.fields.serialPhoto).toMatch(/formato/i);
    const db = await getDb();
    expect((await db.select().from(recallCases).where(eq(recallCases.serialNumber, "SERIE-ARCHIVO-01"))).length).toBe(0);
  });

  it("faltan fotos obligatorias → 422", async () => {
    const form = buildRegistrationForm({ serial: "SERIE-SINFOTO-01", rut: rutFor(14987654), email: "sinfoto@example.test" }, { bikePhoto: null });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(422);
    expect((await res.json()).fields.bikePhoto).toMatch(/foto completa/i);
  });

  it("campos inválidos → 422 con mensajes por campo en español", async () => {
    const form = buildRegistrationForm({
      serial: "SERIE-CAMPOS-01",
      rut: "11.111.111-1",
      email: "no-es-correo",
      phone: "abc",
      region: "Marte",
      city: "",
      model: "OTRO",
      acknowledgeStopRiding: "",
      acceptPrivacy: "",
    });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(422);
    const { fields } = await res.json();
    expect(fields.rut).toMatch(/RUT/);
    expect(fields.email).toMatch(/correo/i);
    expect(fields.phone).toMatch(/teléfono/i);
    expect(fields.region).toMatch(/región/i);
    expect(fields.city).toMatch(/ciudad/i);
    expect(fields.model).toMatch(/modelo/i);
    expect(fields.acknowledgeStopRiding).toMatch(/no utilizar la bicicleta/i);
    expect(fields.acceptPrivacy).toMatch(/privacidad/i);
    for (const msg of Object.values(fields) as string[]) expect(msg).not.toMatch(/\b(required|invalid|expected|string)\b/i);
  });

  it("serie ilegible o parcial → se acepta SOLO como revisión manual (nunca como afectada)", async () => {
    const res = await POST(postForm(URL_, buildRegistrationForm({ serial: "ab 1", rut: rutFor(12121213), email: "serie@example.test" }), IP));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.outcome).toBe("CREATED");
    expect(body.verification).toBe("UNVERIFIED");
    expect(body.requestType).toBe("MANUAL_REVIEW");
    const db = await getDb();
    const [row] = await db.select().from(recallCases).where(eq(recallCases.caseId, body.caseId));
    expect(row?.serialNumber).toBe("AB1");
    expect(row?.caseStatus).toBe("MANUAL_REVIEW");
  });

  it("serie vacía o sin caracteres válidos → 422 fields.serial", async () => {
    const res = await POST(postForm(URL_, buildRegistrationForm({ serial: "???", rut: rutFor(12121214), email: "serie2@example.test" }), IP));
    expect(res.status).toBe(422);
    expect((await res.json()).fields.serial).toBeTruthy();
  });

  it("honeypot relleno → 400 genérico sin crear caso", async () => {
    const form = buildRegistrationForm({ serial: "SERIE-BOT-01", website: "http://spam.example", rut: rutFor(23232324), email: "bot@example.test" });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(400);
    const db = await getDb();
    expect((await db.select().from(recallCases).where(eq(recallCases.serialNumber, "SERIE-BOT-01"))).length).toBe(0);
  });

  it("los datos se sanean (sin HTML) y se recortan", async () => {
    const form = buildRegistrationForm({ serial: "SERIE-HTML-01", customerName: "  <b>Pedro</b>   Soto  ", city: "<script>x</script>Valdivia", rut: rutFor(34343435), email: "html@example.test" });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(201);
    const db = await getDb();
    const row = (await db.select().from(recallCases).where(eq(recallCases.serialNumber, "SERIE-HTML-01")))[0]!;
    expect(row.customerName).toBe("Pedro Soto");
    expect(row.city).toBe("xValdivia");
  });

  it("content-length excesivo → 413", async () => {
    const req = postForm(URL_, buildRegistrationForm(), { ...IP, "content-length": String(200 * 1024 * 1024) });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("fotos que suman más de 4 MB → 422 sin crear caso (el tope de Vercel es 4,5 MB)", async () => {
    const big = fakeJpeg(2_500_000);
    const form = buildRegistrationForm({ serial: "SERIE-PESADA-01", rut: rutFor(45454545), email: "pesada@example.test" }, { serialPhoto: big, bikePhoto: big });
    const res = await POST(postForm(URL_, form, IP));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION");
    expect(Object.values(body.fields ?? {})).toContain(FORM_VALIDATION.tooLarge);
    const db = await getDb();
    expect(await db.select().from(recallCases).where(eq(recallCases.serialNumber, "SERIE-PESADA-01"))).toHaveLength(0);
  });

  it("límite de tasa de registro → 429", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) last = await POST(postForm(URL_, buildRegistrationForm({ serial: "AB" }), { "x-forwarded-for": "192.0.2.99" }));
    expect(last!.status).toBe(429);
  });
});
