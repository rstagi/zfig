import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { schema, key } from "../src/schema";
import { resolve } from "../src/resolver";
import { ConfigError } from "../src/errors";

describe("resolve()", () => {
  let tempDir: string;
  let secretFilePath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "confts-resolver-"));
    secretFilePath = join(tempDir, "secret");
    writeFileSync(secretFilePath, "file-secret");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  describe("resolution priority: override > env > secretFile > fileValues > initialValues > default", () => {
    it("uses env var when present", () => {
      const s = schema({ host: key({ type: z.string(), env: "HOST", default: "default" }) });
      expect(resolve(s, { env: { HOST: "from-env" } })).toEqual({ host: "from-env" });
    });

    it("uses secretFile when env missing", () => {
      const s = schema({ pass: key({ type: z.string(), secretFile: secretFilePath, env: "PASS" }) });
      expect(resolve(s, { env: {} })).toEqual({ pass: "file-secret" });
    });

    it("uses fileValues when env and secretFile missing", () => {
      const s = schema({ port: key({ type: z.number(), env: "PORT" }) });
      expect(resolve(s, { fileValues: { port: 3000 }, env: {} })).toEqual({ port: 3000 });
    });

    it("uses default when all sources missing", () => {
      const s = schema({ debug: key({ type: z.boolean(), default: false }) });
      expect(resolve(s, { env: {} })).toEqual({ debug: false });
    });

    it("env overrides secretFile", () => {
      const s = schema({ val: key({ type: z.string(), env: "VAL", secretFile: secretFilePath }) });
      expect(resolve(s, { env: { VAL: "env-wins" } })).toEqual({ val: "env-wins" });
    });

    it("secretFile overrides fileValues", () => {
      const s = schema({ val: key({ type: z.string(), secretFile: secretFilePath }) });
      expect(resolve(s, { fileValues: { val: "file-loses" }, env: {} })).toEqual({ val: "file-secret" });
    });

    it("fileValues overrides default", () => {
      const s = schema({ val: key({ type: z.string(), default: "default-loses" }) });
      expect(resolve(s, { fileValues: { val: "file-wins" }, env: {} })).toEqual({ val: "file-wins" });
    });

    it("uses initialValues when other sources missing", () => {
      const s = schema({ val: key({ type: z.string() }) });
      expect(resolve(s, { initialValues: { val: "from-initial" }, env: {} })).toEqual({ val: "from-initial" });
    });

    it("initialValues overrides default", () => {
      const s = schema({ val: key({ type: z.string(), default: "default-loses" }) });
      expect(resolve(s, { initialValues: { val: "initial-wins" }, env: {} })).toEqual({ val: "initial-wins" });
    });

    it("fileValues overrides initialValues", () => {
      const s = schema({ val: key({ type: z.string() }) });
      expect(resolve(s, { initialValues: { val: "initial-loses" }, fileValues: { val: "file-wins" }, env: {} })).toEqual({ val: "file-wins" });
    });

    it("env overrides initialValues", () => {
      const s = schema({ val: key({ type: z.string(), env: "VAL" }) });
      expect(resolve(s, { initialValues: { val: "initial-loses" }, env: { VAL: "env-wins" } })).toEqual({ val: "env-wins" });
    });

    it("initialValues works with nested schemas", () => {
      const s = schema({ db: { host: key({ type: z.string() }) } });
      expect(resolve(s, { initialValues: { db: { host: "initial-host" } }, env: {} })).toEqual({ db: { host: "initial-host" } });
    });

    it("override has highest priority", () => {
      const s = schema({ val: key({ type: z.string(), env: "VAL", default: "default" }) });
      expect(resolve(s, { override: { val: "override-wins" }, env: { VAL: "env-loses" } })).toEqual({ val: "override-wins" });
    });

    it("override beats env", () => {
      const s = schema({ val: key({ type: z.string(), env: "VAL" }) });
      expect(resolve(s, { override: { val: "override-wins" }, env: { VAL: "env-loses" } })).toEqual({ val: "override-wins" });
    });

    it("override beats fileValues", () => {
      const s = schema({ val: key({ type: z.string() }) });
      expect(resolve(s, { override: { val: "override-wins" }, fileValues: { val: "file-loses" }, env: {} })).toEqual({ val: "override-wins" });
    });

    it("override works with nested schemas", () => {
      const s = schema({ db: { host: key({ type: z.string(), env: "DB_HOST" }) } });
      expect(resolve(s, { override: { db: { host: "override-host" } }, env: { DB_HOST: "env-host" } })).toEqual({ db: { host: "override-host" } });
    });

    it("override can partially override nested schemas", () => {
      const s = schema({ db: { host: key({ type: z.string(), env: "DB_HOST" }), port: key({ type: z.number(), default: 5432 }) } });
      expect(resolve(s, { override: { db: { host: "override-host" } }, env: {} })).toEqual({ db: { host: "override-host", port: 5432 } });
    });
  });

  describe("nested schemas", () => {
    it("resolves nested objects", () => {
      const s = schema({
        db: {
          host: key({ type: z.string(), env: "DB_HOST" }),
          port: key({ type: z.number(), default: 5432 }),
        },
      });
      expect(resolve(s, { env: { DB_HOST: "localhost" } })).toEqual({
        db: { host: "localhost", port: 5432 },
      });
    });

    it("merges nested fileValues", () => {
      const s = schema({
        api: { url: key({ type: z.string() }) },
      });
      expect(resolve(s, { fileValues: { api: { url: "http://api" } }, env: {} })).toEqual({
        api: { url: "http://api" },
      });
    });

    it("deeply nested resolution", () => {
      const s = schema({
        a: { b: { c: key({ type: z.string(), env: "DEEP" }) } },
      });
      expect(resolve(s, { env: { DEEP: "found" } })).toEqual({
        a: { b: { c: "found" } },
      });
    });
  });

  describe("sensitive value handling", () => {
    it("redacts sensitive values in error messages", () => {
      const s = schema({ secret: key({ type: z.string(), sensitive: true }) });
      expect(() => resolve(s, { env: {} })).toThrow(/\[REDACTED\]/);
    });

    it("shows non-sensitive values in error messages", () => {
      const s = schema({ host: key({ type: z.string() }) });
      expect(() => resolve(s, { env: {} })).toThrow(/undefined/);
    });
  });

  describe("type coercion from env", () => {
    it("parses number from env string via z.coerce", () => {
      const s = schema({ port: key({ type: z.coerce.number(), env: "PORT" }) });
      expect(resolve(s, { env: { PORT: "8080" } })).toEqual({ port: 8080 });
    });

    it("parses boolean from env string via z.coerce", () => {
      const s = schema({ debug: key({ type: z.coerce.boolean(), env: "DEBUG" }) });
      expect(resolve(s, { env: { DEBUG: "true" } })).toEqual({ debug: true });
    });
  });

  describe("literal values", () => {
    it("preserves literal values from schema()", () => {
      const s = schema({ version: "1.0", port: key({ type: z.number(), default: 3000 }) });
      expect(resolve(s, { env: {} })).toEqual({ version: "1.0", port: 3000 });
    });

    it("literal overrides fileValues (schema wins)", () => {
      const s = schema({ version: "1.0" });
      expect(resolve(s, { fileValues: { version: "2.0" }, env: {} })).toEqual({ version: "1.0" });
    });
  });

  describe("validation errors", () => {
    it("throws ConfigError on missing required value", () => {
      const s = schema({ host: key({ type: z.string() }) });
      expect(() => resolve(s, { env: {} })).toThrow(ConfigError);
    });

    it("includes path in ConfigError", () => {
      const s = schema({ db: { host: key({ type: z.string() }) } });
      try {
        resolve(s, { env: {} });
        expect.fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as ConfigError).path).toBe("db.host");
      }
    });

    it("throws ConfigError on Zod validation failure", () => {
      const s = schema({ port: key({ type: z.number(), env: "PORT" }) });
      expect(() => resolve(s, { env: { PORT: "not-a-number" } })).toThrow(ConfigError);
    });
  });

  describe("secretsPath", () => {
    it("resolves relative secretFile paths against secretsPath", () => {
      const s = schema({ pass: key({ type: z.string(), secretFile: "secret" }) });
      expect(resolve(s, { secretsPath: tempDir, env: {} })).toEqual({ pass: "file-secret" });
    });

    it("absolute secretFile paths ignore secretsPath", () => {
      const s = schema({ pass: key({ type: z.string(), secretFile: secretFilePath }) });
      expect(resolve(s, { secretsPath: "/other/path", env: {} })).toEqual({ pass: "file-secret" });
    });

    it("defaults secretsPath to /secrets", () => {
      const s = schema({ pass: key({ type: z.string(), secretFile: "mysecret", default: "fallback" }) });
      // /secrets/mysecret won't exist, should fall back to default
      expect(resolve(s, { env: {} })).toEqual({ pass: "fallback" });
    });
  });

  describe("toString() redaction", () => {
    it("redacts sensitive values in toString()", () => {
      const s = schema({
        host: key({ type: z.string(), default: "localhost" }),
        password: key({ type: z.string(), default: "secret123", sensitive: true }),
      });
      const config = resolve(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).not.toContain("secret123");
      expect(str).toContain("[REDACTED]");
    });

    it("redacts nested sensitive values", () => {
      const s = schema({
        db: {
          host: key({ type: z.string(), default: "localhost" }),
          password: key({ type: z.string(), default: "dbpass", sensitive: true }),
        },
      });
      const config = resolve(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).not.toContain("dbpass");
      expect(str).toContain("[REDACTED]");
    });

    it("works with template literals", () => {
      const s = schema({
        apiKey: key({ type: z.string(), default: "key-12345", sensitive: true }),
      });
      const config = resolve(s, { env: {} });
      const str = `${config}`;
      expect(str).not.toContain("key-12345");
      expect(str).toContain("[REDACTED]");
    });

    it("shows non-sensitive values normally", () => {
      const s = schema({
        host: key({ type: z.string(), default: "localhost" }),
        port: key({ type: z.number(), default: 3000 }),
      });
      const config = resolve(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).toContain("3000");
    });
  });
});
