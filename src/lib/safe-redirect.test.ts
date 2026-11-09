import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it.each(["/dashboard", "/settings/profile?tab=1", "/a#b"])("keeps relative path %s", (p) => {
    expect(safeRedirect(p)).toBe(p);
  });

  it.each([
    null,
    "",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "dashboard",
  ])("falls back for %s", (p) => {
    expect(safeRedirect(p)).toBe("/dashboard");
  });
});
