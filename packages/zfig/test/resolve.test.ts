import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
// Import from index to ensure JSON loader is registered
import { schema, field, resolve, ConfigError } from "../src";

describe("resolve()", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zfig-parser-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  describe("JSON file format", () => {
    it("loads JSON file with .json extension", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, '{"host":"localhost","port":8080}');
      const s = schema({
        host: field({ type: z.string() }),
        port: field({ type: z.number() }),
      });
      expect(resolve(s, { configPath, env: {} })).toEqual({ host: "localhost", port: 8080 });
    });

    it("throws ConfigError on missing file", () => {
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath: "/nonexistent/config.json", env: {} })).toThrow(ConfigError);
    });

    it("attaches diagnostics to ConfigError on missing file", () => {
      const s = schema({ key: field({ type: z.string() }) });
      try {
        resolve(s, { configPath: "/nonexistent/config.json", env: {} });
        expect.fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        const err = e as ConfigError;
        expect(err.diagnostics).toBeDefined();
        expect(err.diagnostics!.some((d) => d.type === "loader" && d.used)).toBe(true);
      }
    });
  });

  describe("unsupported formats without loader", () => {
    it("throws ConfigError on YAML without yaml-loader", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(configPath, "key: value");
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath, env: {} })).toThrow(ConfigError);
      expect(() => resolve(s, { configPath, env: {} })).toThrow(/yaml-loader/i);
    });

    it("throws ConfigError on .yml without yaml-loader", () => {
      const configPath = join(tempDir, "config.yml");
      writeFileSync(configPath, "key: value");
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath, env: {} })).toThrow(ConfigError);
    });

    it("throws ConfigError on unsupported extension", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, "key = value");
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath, env: {} })).toThrow(ConfigError);
      expect(() => resolve(s, { configPath, env: {} })).toThrow(/unsupported/i);
    });

    it("attaches diagnostics to ConfigError on unsupported extension", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, "key = value");
      const s = schema({ key: field({ type: z.string() }) });
      try {
        resolve(s, { configPath, env: {} });
        expect.fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        const err = e as ConfigError;
        expect(err.diagnostics).toBeDefined();
        expect(err.diagnostics!.some((d) => d.type === "loader" && !d.used)).toBe(true);
      }
    });
  });

  describe("CONFIG_PATH env var", () => {
    it("uses process.env.CONFIG_PATH when configPath not provided", () => {
      const configPath = join(tempDir, "env-config.json");
      writeFileSync(configPath, '{"value":"from-env-path"}');
      const s = schema({ value: field({ type: z.string() }) });
      expect(resolve(s, { env: { CONFIG_PATH: configPath } })).toEqual({ value: "from-env-path" });
    });

    it("works without configPath when all values have defaults", () => {
      const s = schema({ key: field({ type: z.string(), default: "default-val" }) });
      expect(resolve(s, { env: {} })).toEqual({ key: "default-val" });
    });

    it("throws if no configPath and required field has no value", () => {
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { env: {} })).toThrow(ConfigError);
    });
  });

  describe("initialValues", () => {
    it("passes initialValues to resolver", () => {
      const s = schema({ host: field({ type: z.string() }) });
      expect(resolve(s, { initialValues: { host: "initial-host" }, env: {} })).toEqual({
        host: "initial-host",
      });
    });

    it("file values override initialValues", () => {
      const configPath = join(tempDir, "initial-override.json");
      writeFileSync(configPath, '{"host":"from-file"}');
      const s = schema({ host: field({ type: z.string() }) });
      expect(resolve(s, { configPath, initialValues: { host: "initial" }, env: {} })).toEqual({
        host: "from-file",
      });
    });
  });

  describe("override", () => {
    it("passes override to resolver", () => {
      const s = schema({ host: field({ type: z.string(), default: "default" }) });
      expect(resolve(s, { override: { host: "overridden" }, env: {} })).toEqual({
        host: "overridden",
      });
    });

    it("override beats file and env values", () => {
      const configPath = join(tempDir, "override-test.json");
      writeFileSync(configPath, '{"host":"from-file"}');
      const s = schema({ host: field({ type: z.string(), env: "HOST" }) });
      expect(resolve(s, { configPath, override: { host: "overridden" }, env: { HOST: "from-env" } })).toEqual({
        host: "overridden",
      });
    });
  });

  describe("value resolution", () => {
    it("env vars override file values", () => {
      const configPath = join(tempDir, "override.json");
      writeFileSync(configPath, '{"host":"from-file"}');
      const s = schema({ host: field({ type: z.string(), env: "HOST" }) });
      expect(resolve(s, { configPath, env: { HOST: "from-env" } })).toEqual({ host: "from-env" });
    });

    it("file values used when env not set", () => {
      const configPath = join(tempDir, "fileonly.json");
      writeFileSync(configPath, '{"port":9000}');
      const s = schema({ port: field({ type: z.number(), env: "PORT" }) });
      expect(resolve(s, { configPath, env: {} })).toEqual({ port: 9000 });
    });

    it("returns fully validated config object", () => {
      const configPath = join(tempDir, "validated.json");
      writeFileSync(configPath, '{"db":{"host":"localhost","port":5432}}');
      const s = schema({
        db: {
          host: field({ type: z.string() }),
          port: field({ type: z.number() }),
        },
      });
      expect(resolve(s, { configPath, env: {} })).toEqual({
        db: { host: "localhost", port: 5432 },
      });
    });
  });

  describe("secretsPath", () => {
    it("passes secretsPath to resolver", () => {
      writeFileSync(join(tempDir, "dbpass"), "secret123");
      const configPath = join(tempDir, "secrets.json");
      writeFileSync(configPath, '{"host":"localhost"}');
      const s = schema({
        host: field({ type: z.string() }),
        pass: field({ type: z.string(), secretFile: "dbpass" }),
      });
      expect(resolve(s, { configPath, secretsPath: tempDir, env: {} })).toEqual({
        host: "localhost",
        pass: "secret123",
      });
    });
  });
});
