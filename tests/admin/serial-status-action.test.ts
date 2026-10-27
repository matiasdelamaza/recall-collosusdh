import { describe, expect, it, vi } from "vitest";
import { setupTestEnv } from "../backend/helpers";

setupTestEnv("serial-status-action");

vi.mock("@/lib/admin/session", () => ({ requireAdmin: async () => ({ actor: "admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { setSerialDatabaseStatusAction } = await import("@/lib/admin/actions");
const { getDb } = await import("@/db/client");
const { affectedSerials } = await import("@/db/schema");
const { getSerialDatabaseStatus } = await import("@/lib/recall/verify");

async function submit(status: string): Promise<string> {
  const fd = new FormData();
  fd.set("status", status);
  try {
    await setSerialDatabaseStatusAction(fd);
  } catch (err) {
    return (err as Error).message.replace("REDIRECT:", "");
  }
  throw new Error("la acción debía redirigir");
}

describe("setSerialDatabaseStatusAction", () => {
  it("no permite marcar COMPLETE con la base de series vacía", async () => {
    expect(await submit("COMPLETE")).toBe("/admin/series?msg=completeWithoutSerials");
    expect(await getSerialDatabaseStatus()).toBe("PENDING");
  });

  it("tampoco lo permite si solo hay series EXCLUDED", async () => {
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "EXCLUIDA-0001", serialRaw: "EXCLUIDA-0001", status: "EXCLUDED" });
    expect(await submit("COMPLETE")).toBe("/admin/series?msg=completeWithoutSerials");
    expect(await getSerialDatabaseStatus()).toBe("PENDING");
  });

  it("permite COMPLETE con al menos una serie RECALL y volver a PENDING", async () => {
    const db = await getDb();
    await db.insert(affectedSerials).values({ serialNumber: "AFECTADA-0001", serialRaw: "AFECTADA-0001", status: "RECALL" });
    expect(await submit("COMPLETE")).toBe("/admin/series?msg=statusChanged");
    expect(await getSerialDatabaseStatus()).toBe("COMPLETE");
    expect(await submit("PENDING")).toBe("/admin/series?msg=statusChanged");
    expect(await getSerialDatabaseStatus()).toBe("PENDING");
  });
});
