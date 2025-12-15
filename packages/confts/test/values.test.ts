import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { schema, field } from "../src/schema";
import { resolveValues, getSources } from "../src/values";
import { ConfigError } from "../src/errors";

describe("resolveValues()", () => {
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
      const s = schema({ host: field({ type: z.string(), env: "HOST", default: "default" }) });
      expect(resolveValues(s, { env: { HOST: "from-env" } })).toEqual({ host: "from-env" });
    });

    it("uses secretFile when env missing", () => {
      const s = schema({ pass: field({ type: z.string(), secretFile: secretFilePath, env: "PASS" }) });
      expect(resolveValues(s, { env: {} })).toEqual({ pass: "file-secret" });
    });

    it("uses fileValues when env and secretFile missing", () => {
      const s = schema({ port: field({ type: z.number(), env: "PORT" }) });
      expect(resolveValues(s, { fileValues: { port: 3000 }, env: {} })).toEqual({ port: 3000 });
    });

    it("uses default when all sources missing", () => {
      const s = schema({ debug: field({ type: z.boolean(), default: false }) });
      expect(resolveValues(s, { env: {} })).toEqual({ debug: false });
    });

    it("env overrides secretFile", () => {
      const s = schema({ val: field({ type: z.string(), env: "VAL", secretFile: secretFilePath }) });
      expect(resolveValues(s, { env: { VAL: "env-wins" } })).toEqual({ val: "env-wins" });
    });

    it("secretFile overrides fileValues", () => {
      const s = schema({ val: field({ type: z.string(), secretFile: secretFilePath }) });
      expect(resolveValues(s, { fileValues: { val: "file-loses" }, env: {} })).toEqual({ val: "file-secret" });
    });

    it("fileValues overrides default", () => {
      const s = schema({ val: field({ type: z.string(), default: "default-loses" }) });
      expect(resolveValues(s, { fileValues: { val: "file-wins" }, env: {} })).toEqual({ val: "file-wins" });
    });

    it("uses initialValues when other sources missing", () => {
      const s = schema({ val: field({ type: z.string() }) });
      expect(resolveValues(s, { initialValues: { val: "from-initial" }, env: {} })).toEqual({ val: "from-initial" });
    });

    it("initialValues overrides default", () => {
      const s = schema({ val: field({ type: z.string(), default: "default-loses" }) });
      expect(resolveValues(s, { initialValues: { val: "initial-wins" }, env: {} })).toEqual({ val: "initial-wins" });
    });

    it("fileValues overrides initialValues", () => {
      const s = schema({ val: field({ type: z.string() }) });
      expect(resolveValues(s, { initialValues: { val: "initial-loses" }, fileValues: { val: "file-wins" }, env: {} })).toEqual({ val: "file-wins" });
    });

    it("env overrides initialValues", () => {
      const s = schema({ val: field({ type: z.string(), env: "VAL" }) });
      expect(resolveValues(s, { initialValues: { val: "initial-loses" }, env: { VAL: "env-wins" } })).toEqual({ val: "env-wins" });
    });

    it("initialValues works with nested schemas", () => {
      const s = schema({ db: { host: field({ type: z.string() }) } });
      expect(resolveValues(s, { initialValues: { db: { host: "initial-host" } }, env: {} })).toEqual({ db: { host: "initial-host" } });
    });

    it("override has highest priority", () => {
      const s = schema({ val: field({ type: z.string(), env: "VAL", default: "default" }) });
      expect(resolveValues(s, { override: { val: "override-wins" }, env: { VAL: "env-loses" } })).toEqual({ val: "override-wins" });
    });

    it("override beats env", () => {
      const s = schema({ val: field({ type: z.string(), env: "VAL" }) });
      expect(resolveValues(s, { override: { val: "override-wins" }, env: { VAL: "env-loses" } })).toEqual({ val: "override-wins" });
    });

    it("override beats fileValues", () => {
      const s = schema({ val: field({ type: z.string() }) });
      expect(resolveValues(s, { override: { val: "override-wins" }, fileValues: { val: "file-loses" }, env: {} })).toEqual({ val: "override-wins" });
    });

    it("override works with nested schemas", () => {
      const s = schema({ db: { host: field({ type: z.string(), env: "DB_HOST" }) } });
      expect(resolveValues(s, { override: { db: { host: "override-host" } }, env: { DB_HOST: "env-host" } })).toEqual({ db: { host: "override-host" } });
    });

    it("override can partially override nested schemas", () => {
      const s = schema({ db: { host: field({ type: z.string(), env: "DB_HOST" }), port: field({ type: z.number(), default: 5432 }) } });
      expect(resolveValues(s, { override: { db: { host: "override-host" } }, env: {} })).toEqual({ db: { host: "override-host", port: 5432 } });
    });
  });

  describe("nested schemas", () => {
    it("resolves nested objects", () => {
      const s = schema({
        db: {
          host: field({ type: z.string(), env: "DB_HOST" }),
          port: field({ type: z.number(), default: 5432 }),
        },
      });
      expect(resolveValues(s, { env: { DB_HOST: "localhost" } })).toEqual({
        db: { host: "localhost", port: 5432 },
      });
    });

    it("merges nested fileValues", () => {
      const s = schema({
        api: { url: field({ type: z.string() }) },
      });
      expect(resolveValues(s, { fileValues: { api: { url: "http://api" } }, env: {} })).toEqual({
        api: { url: "http://api" },
      });
    });

    it("deeply nested resolution", () => {
      const s = schema({
        a: { b: { c: field({ type: z.string(), env: "DEEP" }) } },
      });
      expect(resolveValues(s, { env: { DEEP: "found" } })).toEqual({
        a: { b: { c: "found" } },
      });
    });
  });

  describe("sensitive value handling", () => {
    it("redacts sensitive values in error messages", () => {
      const s = schema({ secret: field({ type: z.string(), sensitive: true }) });
      expect(() => resolveValues(s, { env: {} })).toThrow(/\[REDACTED\]/);
    });

    it("shows non-sensitive values in error messages", () => {
      const s = schema({ host: field({ type: z.string() }) });
      expect(() => resolveValues(s, { env: {} })).toThrow(/undefined/);
    });
  });

  describe("type coercion from env", () => {
    it("parses number from env string via z.coerce", () => {
      const s = schema({ port: field({ type: z.coerce.number(), env: "PORT" }) });
      expect(resolveValues(s, { env: { PORT: "8080" } })).toEqual({ port: 8080 });
    });

    it("parses boolean from env string via z.coerce", () => {
      const s = schema({ debug: field({ type: z.coerce.boolean(), env: "DEBUG" }) });
      expect(resolveValues(s, { env: { DEBUG: "true" } })).toEqual({ debug: true });
    });
  });

  describe("literal values", () => {
    it("preserves literal values from schema()", () => {
      const s = schema({ version: "1.0", port: field({ type: z.number(), default: 3000 }) });
      expect(resolveValues(s, { env: {} })).toEqual({ version: "1.0", port: 3000 });
    });

    it("literal overrides fileValues (schema wins)", () => {
      const s = schema({ version: "1.0" });
      expect(resolveValues(s, { fileValues: { version: "2.0" }, env: {} })).toEqual({ version: "1.0" });
    });
  });

  describe("validation errors", () => {
    it("throws ConfigError on missing required value", () => {
      const s = schema({ host: field({ type: z.string() }) });
      expect(() => resolveValues(s, { env: {} })).toThrow(ConfigError);
    });

    it("includes path in ConfigError", () => {
      const s = schema({ db: { host: field({ type: z.string() }) } });
      try {
        resolveValues(s, { env: {} });
        expect.fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as ConfigError).path).toBe("db.host");
      }
    });

    it("throws ConfigError on Zod validation failure", () => {
      const s = schema({ port: field({ type: z.number(), env: "PORT" }) });
      expect(() => resolveValues(s, { env: { PORT: "not-a-number" } })).toThrow(ConfigError);
    });
  });

  describe("secretsPath", () => {
    it("resolves relative secretFile paths against secretsPath", () => {
      const s = schema({ pass: field({ type: z.string(), secretFile: "secret" }) });
      expect(resolveValues(s, { secretsPath: tempDir, env: {} })).toEqual({ pass: "file-secret" });
    });

    it("absolute secretFile paths ignore secretsPath", () => {
      const s = schema({ pass: field({ type: z.string(), secretFile: secretFilePath }) });
      expect(resolveValues(s, { secretsPath: "/other/path", env: {} })).toEqual({ pass: "file-secret" });
    });

    it("defaults secretsPath to /secrets", () => {
      const s = schema({ pass: field({ type: z.string(), secretFile: "mysecret", default: "fallback" }) });
      // /secrets/mysecret won't exist, should fall back to default
      expect(resolveValues(s, { env: {} })).toEqual({ pass: "fallback" });
    });
  });

  describe("toString() redaction", () => {
    it("redacts sensitive values in toString()", () => {
      const s = schema({
        host: field({ type: z.string(), default: "localhost" }),
        password: field({ type: z.string(), default: "secret123", sensitive: true }),
      });
      const config = resolveValues(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).not.toContain("secret123");
      expect(str).toContain("[REDACTED]");
    });

    it("redacts nested sensitive values", () => {
      const s = schema({
        db: {
          host: field({ type: z.string(), default: "localhost" }),
          password: field({ type: z.string(), default: "dbpass", sensitive: true }),
        },
      });
      const config = resolveValues(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).not.toContain("dbpass");
      expect(str).toContain("[REDACTED]");
    });

    it("works with template literals", () => {
      const s = schema({
        apiKey: field({ type: z.string(), default: "key-12345", sensitive: true }),
      });
      const config = resolveValues(s, { env: {} });
      const str = `${config}`;
      expect(str).not.toContain("key-12345");
      expect(str).toContain("[REDACTED]");
    });

    it("shows non-sensitive values normally", () => {
      const s = schema({
        host: field({ type: z.string(), default: "localhost" }),
        port: field({ type: z.number(), default: 3000 }),
      });
      const config = resolveValues(s, { env: {} });
      const str = config.toString();
      expect(str).toContain("localhost");
      expect(str).toContain("3000");
    });
  });

  describe("source tracking", () => {
    it("getSources() returns sources", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      expect(getSources(config)).toBeDefined();
      expect(Object.keys(config)).not.toContain("_sources");
    });

    it("tracks default source", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      expect(getSources(config)?.host).toBe("default");
    });

    it("tracks env source with var name", () => {
      const s = schema({ host: field({ type: z.string(), env: "HOST" }) });
      const config = resolveValues(s, { env: { HOST: "from-env" } });
      expect(getSources(config)?.host).toBe("env:HOST");
    });

    it("tracks secretFile source with path", () => {
      const s = schema({ pass: field({ type: z.string(), secretFile: secretFilePath }) });
      const config = resolveValues(s, { env: {} });
      expect(getSources(config)?.pass).toBe(`secretFile:${secretFilePath}`);
    });

    it("tracks file source with path", () => {
      const s = schema({ port: field({ type: z.number() }) });
      const config = resolveValues(s, { fileValues: { port: 3000 }, configPath: "./config.yaml", env: {} });
      expect(getSources(config)?.port).toBe("file:./config.yaml");
    });

    it("tracks file source without path when not provided", () => {
      const s = schema({ port: field({ type: z.number() }) });
      const config = resolveValues(s, { fileValues: { port: 3000 }, env: {} });
      expect(getSources(config)?.port).toBe("file");
    });

    it("tracks initial source", () => {
      const s = schema({ val: field({ type: z.string() }) });
      const config = resolveValues(s, { initialValues: { val: "initial" }, env: {} });
      expect(getSources(config)?.val).toBe("initial");
    });

    it("tracks override source", () => {
      const s = schema({ val: field({ type: z.string(), default: "default" }) });
      const config = resolveValues(s, { override: { val: "overridden" }, env: {} });
      expect(getSources(config)?.val).toBe("override");
    });

    it("uses dot notation for nested schemas", () => {
      const s = schema({ db: { host: field({ type: z.string(), env: "DB_HOST" }) } });
      const config = resolveValues(s, { env: { DB_HOST: "localhost" } });
      expect(getSources(config)?.["db.host"]).toBe("env:DB_HOST");
    });

    it("tracks multiple sources in nested schemas", () => {
      const s = schema({
        db: {
          host: field({ type: z.string(), env: "DB_HOST" }),
          port: field({ type: z.number(), default: 5432 }),
        },
      });
      const config = resolveValues(s, { env: { DB_HOST: "localhost" } });
      expect(getSources(config)?.["db.host"]).toBe("env:DB_HOST");
      expect(getSources(config)?.["db.port"]).toBe("default");
    });

    it("toSourceString() returns JSON of sources", () => {
      const s = schema({
        host: field({ type: z.string(), env: "HOST" }),
        port: field({ type: z.number(), default: 3000 }),
      });
      const config = resolveValues(s, { env: { HOST: "localhost" } });
      const str = config.toSourceString();
      expect(JSON.parse(str)).toEqual({ host: "env:HOST", port: "default" });
    });

    it("toSourceString() is non-enumerable", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      expect(Object.keys(config)).not.toContain("toSourceString");
    });

    it("getSources() returns undefined for non-config objects", () => {
      expect(getSources({})).toBeUndefined();
      expect(getSources(null)).toBeUndefined();
      expect(getSources("string")).toBeUndefined();
    });
  });

  describe("toDebugObject()", () => {
    it("excludes diagnostics by default", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      const debug = config.toDebugObject();
      expect(debug).toHaveProperty("config");
      expect(debug).not.toHaveProperty("diagnostics");
    });

    it("excludes diagnostics when includeDiagnostics is false", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      const debug = config.toDebugObject({ includeDiagnostics: false });
      expect(debug).toHaveProperty("config");
      expect(debug).not.toHaveProperty("diagnostics");
    });

    it("includes diagnostics when includeDiagnostics is true", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      const debug = config.toDebugObject({ includeDiagnostics: true });
      expect(debug).toHaveProperty("config");
      expect(debug).toHaveProperty("diagnostics");
      expect(Array.isArray(debug.diagnostics)).toBe(true);
    });

    it("returns values with embedded sources", () => {
      const s = schema({
        host: field({ type: z.string(), env: "HOST" }),
        port: field({ type: z.number(), default: 3000 }),
      });
      const config = resolveValues(s, { env: { HOST: "localhost" } });
      const debug = config.toDebugObject({ includeDiagnostics: true });
      expect(debug.config).toEqual({
        host: { value: "localhost", source: "env:HOST" },
        port: { value: 3000, source: "default" },
      });
      expect(debug).toHaveProperty("diagnostics");
    });

    it("handles nested schemas", () => {
      const s = schema({
        db: {
          host: field({ type: z.string(), env: "DB_HOST" }),
          port: field({ type: z.number(), default: 5432 }),
        },
      });
      const config = resolveValues(s, { env: { DB_HOST: "localhost" } });
      const debug = config.toDebugObject();
      expect(debug.config).toEqual({
        db: {
          host: { value: "localhost", source: "env:DB_HOST" },
          port: { value: 5432, source: "default" },
        },
      });
    });

    it("is non-enumerable", () => {
      const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
      const config = resolveValues(s, { env: {} });
      expect(Object.keys(config)).not.toContain("toDebugObject");
    });

    it("redacts sensitive values", () => {
      const s = schema({
        host: field({ type: z.string(), default: "localhost" }),
        password: field({ type: z.string(), default: "secret123", sensitive: true }),
      });
      const config = resolveValues(s, { env: {} });
      const debug = config.toDebugObject();
      expect(debug.config).toEqual({
        host: { value: "localhost", source: "default" },
        password: { value: "[REDACTED]", source: "default" },
      });
    });
  });
});
