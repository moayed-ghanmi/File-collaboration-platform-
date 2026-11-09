import { describe, expect, it } from "vitest";
import { runHealthChecks } from "./health";

describe("runHealthChecks", () => {
  it("reports ok when every check passes", async () => {
    const res = await runHealthChecks({ a: async () => 1, b: async () => 2 });
    expect(res.status).toBe("ok");
    expect(res.services.a.ok).toBe(true);
  });

  it("reports degraded and the error when a check fails", async () => {
    const res = await runHealthChecks({
      a: async () => 1,
      b: async () => {
        throw new Error("boom");
      },
    });
    expect(res.status).toBe("degraded");
    expect(res.services.b).toMatchObject({ ok: false, error: "boom" });
  });
});
