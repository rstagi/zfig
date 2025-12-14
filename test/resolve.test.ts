import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { schema, field } from "../src/schema";
import { resolve } from "../src/resolve";
import { ConfigError } from "../src/errors";

describe("resolve()", () => {
  let tempDir: string;
  let secretsDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "confts-parser-"));
    secretsDir = join(tempDir, "secrets");
    rmSync(secretsDir, { recursive: true, force: true });
    mkdtempSync(secretsDir.slice(0, -1));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  describe("file format detection", () => {
    it("loads YAML file with .yaml extension", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(configPath, "host: localhost\nport: 3000");
      const s = schema({
        host: field({ type: z.string() }),
        port: field({ type: z.number() }),
      });
      expect(resolve(s, { configPath, env: {} })).toEqual({ host: "localhost", port: 3000 });
    });

    it("loads YAML file with .yml extension", () => {
      const configPath = join(tempDir, "config.yml");
      writeFileSync(configPath, "name: test");
      const s = schema({ name: field({ type: z.string() }) });
      expect(resolve(s, { configPath, env: {} })).toEqual({ name: "test" });
    });

    it("loads JSON file with .json extension", () => {
      const configPath = join(tempDir, "config.json");
      writeFileSync(configPath, '{"host":"localhost","port":8080}');
      const s = schema({
        host: field({ type: z.string() }),
        port: field({ type: z.number() }),
      });
      expect(resolve(s, { configPath, env: {} })).toEqual({ host: "localhost", port: 8080 });
    });

    it("throws ConfigError on unsupported extension", () => {
      const configPath = join(tempDir, "config.toml");
      writeFileSync(configPath, "key = value");
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath, env: {} })).toThrow(ConfigError);
      expect(() => resolve(s, { configPath, env: {} })).toThrow(/unsupported/i);
    });

    it("throws ConfigError on missing file", () => {
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { configPath: "/nonexistent/config.yaml", env: {} })).toThrow(ConfigError);
    });
  });

  describe("CONFIG_PATH env var", () => {
    it("uses process.env.CONFIG_PATH when configPath not provided", () => {
      const configPath = join(tempDir, "env-config.yaml");
      writeFileSync(configPath, "value: from-env-path");
      const s = schema({ value: field({ type: z.string() }) });
      expect(resolve(s, { env: { CONFIG_PATH: configPath } })).toEqual({ value: "from-env-path" });
    });

    it("throws if no configPath and CONFIG_PATH not set", () => {
      const s = schema({ key: field({ type: z.string() }) });
      expect(() => resolve(s, { env: {} })).toThrow(ConfigError);
      expect(() => resolve(s, { env: {} })).toThrow(/CONFIG_PATH/);
    });
  });

  describe("value resolution", () => {
    it("env vars override file values", () => {
      const configPath = join(tempDir, "override.yaml");
      writeFileSync(configPath, "host: from-file");
      const s = schema({ host: field({ type: z.string(), env: "HOST" }) });
      expect(resolve(s, { configPath, env: { HOST: "from-env" } })).toEqual({ host: "from-env" });
    });

    it("file values used when env not set", () => {
      const configPath = join(tempDir, "fileonly.yaml");
      writeFileSync(configPath, "port: 9000");
      const s = schema({ port: field({ type: z.number(), env: "PORT" }) });
      expect(resolve(s, { configPath, env: {} })).toEqual({ port: 9000 });
    });

    it("returns fully validated config object", () => {
      const configPath = join(tempDir, "validated.yaml");
      writeFileSync(configPath, "db:\n  host: localhost\n  port: 5432");
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
      const mySecretsDir = join(tempDir, "mysecrets");
      rmSync(mySecretsDir, { recursive: true, force: true });
      writeFileSync(join(tempDir, "dbpass"), "secret123");
      const configPath = join(tempDir, "secrets.yaml");
      writeFileSync(configPath, "host: localhost");
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
