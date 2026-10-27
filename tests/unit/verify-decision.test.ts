import { describe, expect, it } from "vitest";
import { decideNonMatch, outcomeToStatus } from "@/lib/recall/verify";

describe("decideNonMatch", () => {
  it("devuelve PENDING_DATABASE mientras la base de Polygon no esté completa", () => {
    expect(decideNonMatch("ABC12345", "PENDING")).toEqual({ state: "PENDING_DATABASE", serial: "ABC12345" });
  });

  it("devuelve NOT_IDENTIFIED solo cuando la base está completa", () => {
    expect(decideNonMatch("ABC12345", "COMPLETE")).toEqual({ state: "NOT_IDENTIFIED", serial: "ABC12345" });
  });

  it("nunca devuelve AFFECTED sin coincidencia", () => {
    expect(decideNonMatch("ABC12345", "PENDING").state).not.toBe("AFFECTED");
    expect(decideNonMatch("ABC12345", "COMPLETE").state).not.toBe("AFFECTED");
  });
});

describe("outcomeToStatus", () => {
  it("mapea el estado del resultado directamente", () => {
    expect(outcomeToStatus({ state: "NOT_IDENTIFIED", serial: "X" })).toBe("NOT_IDENTIFIED");
    expect(outcomeToStatus({ state: "PENDING_DATABASE", serial: "X" })).toBe("PENDING_DATABASE");
    expect(outcomeToStatus({ state: "UNVERIFIED", serial: "", reason: "EMPTY" })).toBe("UNVERIFIED");
    expect(outcomeToStatus({ state: "AFFECTED", serial: "X", model: null, size: null, productionBatch: null })).toBe("AFFECTED");
  });
});
