import { describe, it, expect } from "vitest";
import { z } from "zod";
import { schema, field } from "../src/schema";

describe("schema()", () => {
  it("returns Zod object for nested definition with field()", () => {
    const s = schema({
      db: {
        host: field({ type: z.string() }),
      },
    });

    // Should be a valid ZodObject
    expect(s.parse({ db: { host: "localhost" } })).toEqual({
      db: { host: "localhost" },
    });

    // Should reject invalid input
    expect(() => s.parse({ db: { host: 123 } })).toThrow();
  });

  it("converts literals to z.literal()", () => {
    const s = schema({
      version: "1.0",
      port: 3000,
      debug: true,
    });

    // Should accept exact literal values
    expect(s.parse({ version: "1.0", port: 3000, debug: true })).toEqual({
      version: "1.0",
      port: 3000,
      debug: true,
    });

    // Should reject different values
    expect(() => s.parse({ version: "2.0", port: 3000, debug: true })).toThrow();
  });

  it("handles mixed nested objects with keys and literals", () => {
    const s = schema({
      api: {
        url: field({ type: z.string() }),
        timeout: 5000,
      },
    });

    // Should accept valid input
    expect(s.parse({ api: { url: "http://localhost", timeout: 5000 } })).toEqual({
      api: { url: "http://localhost", timeout: 5000 },
    });

    // Should reject wrong timeout (literal mismatch)
    expect(() => s.parse({ api: { url: "http://localhost", timeout: 3000 } })).toThrow();

    // Should reject wrong url type
    expect(() => s.parse({ api: { url: 123, timeout: 5000 } })).toThrow();
  });

  it("stores FieldConfig metadata via .meta()", () => {
    const s = schema({
      host: field({
        type: z.string(),
        env: "DB_HOST",
        sensitive: false,
      }),
      password: field({
        type: z.string(),
        env: "DB_PASSWORD",
        secretFile: "/run/secrets/db_password",
        sensitive: true,
      }),
    });

    // Check metadata on host (Zod v4: .meta() getter)
    expect(s.shape.host.meta()).toEqual({
      env: "DB_HOST",
      sensitive: false,
    });

    // Check metadata on password
    expect(s.shape.password.meta()).toEqual({
      env: "DB_PASSWORD",
      secretFile: "/run/secrets/db_password",
      sensitive: true,
    });
  });
});
