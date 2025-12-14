import { describe, it, expect } from "vitest";
import { ConfigError, formatValue } from "../src/errors";

describe("ConfigError", () => {
  it("stores path and sensitive flag", () => {
    const err = new ConfigError("missing value", "db.password", true);
    expect(err.path).toBe("db.password");
    expect(err.sensitive).toBe(true);
    expect(err.message).toBe("missing value");
    expect(err.name).toBe("ConfigError");
  });

  it("is instanceof Error", () => {
    const err = new ConfigError("msg", "key", false);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("formatValue()", () => {
  it("redacts sensitive values", () => {
    expect(formatValue("secret123", true)).toBe("[REDACTED]");
  });

  it("shows non-sensitive string values", () => {
    expect(formatValue("localhost", false)).toBe('"localhost"');
  });

  it("shows undefined as 'undefined'", () => {
    expect(formatValue(undefined, false)).toBe("undefined");
  });

  it("shows numbers without quotes", () => {
    expect(formatValue(3000, false)).toBe("3000");
  });

  it("shows booleans", () => {
    expect(formatValue(true, false)).toBe("true");
  });

  it("redacts any type when sensitive", () => {
    expect(formatValue(12345, true)).toBe("[REDACTED]");
    expect(formatValue(true, true)).toBe("[REDACTED]");
    expect(formatValue({ nested: "obj" }, true)).toBe("[REDACTED]");
  });
});
