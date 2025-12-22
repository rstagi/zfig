import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/loaders/env";

describe("loadEnv()", () => {
  it("returns value when env var exists", () => {
    const env = { DB_HOST: "localhost" };
    expect(loadEnv("DB_HOST", env)).toBe("localhost");
  });

  it("returns undefined when env var missing", () => {
    expect(loadEnv("MISSING", {})).toBeUndefined();
  });

  it("returns empty string as valid value", () => {
    expect(loadEnv("EMPTY", { EMPTY: "" })).toBe("");
  });

  it("uses process.env by default", () => {
    const originalValue = process.env.TEST_ZFIG_ENV;
    process.env.TEST_ZFIG_ENV = "test-value";
    try {
      expect(loadEnv("TEST_ZFIG_ENV")).toBe("test-value");
    } finally {
      if (originalValue === undefined) {
        delete process.env.TEST_ZFIG_ENV;
      } else {
        process.env.TEST_ZFIG_ENV = originalValue;
      }
    }
  });
});
