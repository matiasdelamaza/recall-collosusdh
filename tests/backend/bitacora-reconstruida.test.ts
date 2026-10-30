import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestEnv } from "./helpers";

vi.mock("server-only", () => ({}));
setupTestEnv("bitacora");

const { getDb } = await import("@/db/client");
const { auditEvents, emailMessages, recallCases } = await import("@/db/schema");
const { importOutreach, parseOutreachCsv, parseSentAt, rebuildCaseEmails, OUTREACH_ACTOR, OUTREACH_KIND, REBUILT_ACTOR, OutreachCsvError } = await import("@/lib/recall/email-backfill");

async function caso(caseId: string, email: string) {
  const db = await getDb();
  const [row] = await db
    .insert(recallCases)
    .values({
      caseId,
      customerName: "Cliente Prueba",
      rut: "11111111-1",
      email,
      phone: "+56 9 1111 2222",
      region: "Metropolitana de Santiago",
      city: "Santiago",
      serialNumber: `S-${caseId}`,
      serialRaw: `S-${caseId}`,
      model: "COLLOSUS_DH9",
      size: "M",
      damageReported: "NO",
      accidentReported: false,
      acknowledgedStopRiding: true,
      serialVerificationStatus: "AFFECTED",
      requestType: "REPLACEMENT",
      caseStatus: "REGISTERED",
    })
    .returning();
  return row!;
}

async function messagesOf(caseUuid: string) {
  const db = await getDb();
  return db.select().from(emailMessages).where(eq(emailMessages.caseId, caseUuid)).orderBy(emailMessages.createdAt);
}

describe("Bitácora: correos anteriores reconstruidos", () => {
  it("convierte la hora de Santiago del CSV a UTC", () => {
    // 27-10-2026 en Chile continental: horario de verano (UTC-3).
    expect(parseSentAt("27-10-2026, 2:56:56 p. m.")?.toISOString()).toBe("2026-10-27T17:56:56.000Z");
    expect(parseSentAt("27-10-2026, 12:05:00 a. m.")?.toISOString()).toBe("2026-10-27T03:05:00.000Z");
    expect(parseSentAt("REBOTÓ")).toBeNull();
  });

  it("lee solo las filas con envío y rechaza un archivo sin las columnas", () => {
    const csv = '﻿Prioridad;Nombre;Email;Correo enviado\n1;A;Uno@Example.test;"27-10-2026, 2:56:56 p. m."\n2;B;dos@example.test;\n2;C;no-es-correo;"27-10-2026, 2:57:00 p. m."\n';
    const r = parseOutreachCsv(csv);
    expect(r.rows).toEqual([{ email: "uno@example.test", sentAt: new Date("2026-10-27T17:56:56.000Z") }]);
    expect(r.invalid).toBe(1);
    expect(() => parseOutreachCsv("Nombre;Correo\nA;b@c.cl\n")).toThrow(OutreachCsvError);
  });

  it("reconstruye la confirmación desde la auditoría con su fecha real, una sola vez", async () => {
    const c = await caso("RCDH-BIT01", "cliente.bit01@example.test");
    const db = await getDb();
    const at = new Date("2026-10-27T19:10:00.000Z");
    await db.insert(auditEvents).values([
      { type: "EMAIL_SENT", caseId: c.id, payload: { kind: "CUSTOMER_CONFIRMATION", provider: "resend", id: "re_conf_1", caseId: c.caseId }, createdAt: at },
      { type: "EMAIL_SENT", caseId: c.id, payload: { kind: "INTERNAL_NEW_CASE", provider: "resend", id: "re_int_1", caseId: c.caseId }, createdAt: at },
    ]);

    const first = await rebuildCaseEmails("admin");
    expect(first).toEqual({ inserted: 1, existing: 0 });
    const msgs = await messagesOf(c.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ kind: "CUSTOMER_CONFIRMATION", direction: "OUT", providerId: "re_conf_1", actor: REBUILT_ACTOR, toEmails: "cliente.bit01@example.test", status: "SENT" });
    expect(msgs[0]!.createdAt.toISOString()).toBe(at.toISOString());
    expect(msgs[0]!.bodyText).toContain("RCDH-BIT01");

    expect(await rebuildCaseEmails("admin")).toEqual({ inserted: 0, existing: 1 });
    expect(await messagesOf(c.id)).toHaveLength(1);
  });

  it("agrega el aviso del 27-10 a los casos con el mismo correo, omite a quien no tiene caso y no duplica", async () => {
    const c = await caso("RCDH-BIT02", "Comprador.Dos@Example.test");
    const csv = 'Email;Correo enviado\n comprador.dos@example.test ;"27-10-2026, 2:56:59 p. m."\nsin.caso@example.test;"27-10-2026, 2:57:01 p. m."\n';

    const r = await importOutreach(csv, "admin");
    expect(r).toEqual({ sent: 2, inserted: 1, existing: 0, withoutCase: 1, invalid: 0 });
    const msgs = (await messagesOf(c.id)).filter((m) => m.kind === OUTREACH_KIND);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ actor: OUTREACH_ACTOR, fromEmail: "contacto@crossmountain.cl", toEmails: "comprador.dos@example.test" });
    expect(msgs[0]!.createdAt.toISOString()).toBe("2026-10-27T17:56:59.000Z");
    expect(msgs[0]!.bodyText).toContain("https://www.recallcollosusdh.cl/");

    expect(await importOutreach(csv, "admin")).toMatchObject({ inserted: 0, existing: 1 });
  });
});
