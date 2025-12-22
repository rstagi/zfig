import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { schema, field } from "../src/schema";
import { resolveValues, getSources, getDiagnostics } from "../src/values";
import { resolve } from "../src/resolve";
import { registerLoader, clearLoaders, getLoader } from "../src/loader-registry";
import { DiagnosticsCollector } from "../src/diagnostics";
import type { DiagnosticEvent } from "../src/types";

describe("DiagnosticsCollector", () => {
  it("starts with empty events", () => {
    const collector = new DiagnosticsCollector();
    expect(collector.getEvents()).toEqual([]);
  });

  it("addConfigPath records event", () => {
    const collector = new DiagnosticsCollector();
    collector.addConfigPath("./config.json", ["option:./config.json", "env:CONFIG_PATH"], "picked from option");
    expect(collector.getEvents()).toEqual([
      { type: "configPath", picked: "./config.json", candidates: ["option:./config.json", "env:CONFIG_PATH"], reason: "picked from option" },
    ]);
  });

  it("addConfigPath records null when no path found", () => {
    const collector = new DiagnosticsCollector();
    collector.addConfigPath(null, [], "no config path found");
    expect(collector.getEvents()).toEqual([
      { type: "configPath", picked: null, candidates: [], reason: "no config path found" },
    ]);
  });

  it("addLoader records event", () => {
    const collector = new DiagnosticsCollector();
    collector.addLoader(".json", true);
    expect(collector.getEvents()).toEqual([{ type: "loader", format: ".json", used: true }]);
  });

  it("addLoader records reason when provided", () => {
    const collector = new DiagnosticsCollector();
    collector.addLoader(".yaml", false, "unsupported extension");
    expect(collector.getEvents()).toEqual([{ type: "loader", format: ".yaml", used: false, reason: "unsupported extension" }]);
  });

  it("addSourceDecision records event", () => {
    const collector = new DiagnosticsCollector();
    collector.addSourceDecision("host", "env:HOST", ["override", "env:HOST"]);
    expect(collector.getEvents()).toEqual([{ type: "sourceDecision", key: "host", picked: "env:HOST", tried: ["override", "env:HOST"] }]);
  });

  it("addNote records event", () => {
    const collector = new DiagnosticsCollector();
    collector.addNote("config loaded successfully");
    expect(collector.getEvents()).toEqual([{ type: "note", message: "config loaded successfully" }]);
  });

  it("addNote records meta when provided", () => {
    const collector = new DiagnosticsCollector();
    collector.addNote("file loaded", { path: "./config.json", size: 1024 });
    expect(collector.getEvents()).toEqual([{ type: "note", message: "file loaded", meta: { path: "./config.json", size: 1024 } }]);
  });

  it("accumulates multiple events", () => {
    const collector = new DiagnosticsCollector();
    collector.addConfigPath("./config.json", [], "from option");
    collector.addLoader(".json", true);
    collector.addSourceDecision("host", "default", ["default"]);
    expect(collector.getEvents()).toHaveLength(3);
  });

  it("getEvents returns a copy", () => {
    const collector = new DiagnosticsCollector();
    collector.addNote("test");
    const events1 = collector.getEvents();
    const events2 = collector.getEvents();
    expect(events1).not.toBe(events2);
    expect(events1).toEqual(events2);
  });
});

describe("getDiagnostics()", () => {
  it("returns diagnostics from resolved config", () => {
    const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
    const config = resolveValues(s, { env: {} });
    expect(getDiagnostics(config)).toBeDefined();
    expect(Array.isArray(getDiagnostics(config))).toBe(true);
  });

  it("returns undefined for non-config objects", () => {
    expect(getDiagnostics({})).toBeUndefined();
    expect(getDiagnostics(null)).toBeUndefined();
    expect(getDiagnostics("string")).toBeUndefined();
  });

  it("getDiagnostics is non-enumerable method", () => {
    const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
    const config = resolveValues(s, { env: {} });
    expect(Object.keys(config)).not.toContain("getDiagnostics");
  });
});

describe("sourceDecision events", () => {
  let tempDir: string;
  let secretFilePath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zfig-diag-"));
    secretFilePath = join(tempDir, "secret");
    writeFileSync(secretFilePath, "file-secret");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  it("tracks source from default", () => {
    const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
    const config = resolveValues(s, { env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "host");
    expect(decision?.picked).toBe("default");
    expect(decision?.tried).toContain("default");
  });

  it("tracks source from env", () => {
    const s = schema({ host: field({ type: z.string(), env: "HOST", default: "fallback" }) });
    const config = resolveValues(s, { env: { HOST: "from-env" } });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "host");
    expect(decision?.picked).toBe("env:HOST");
    expect(decision?.tried).toContain("env:HOST");
  });

  it("tracks tried sources that were checked but not used", () => {
    const s = schema({ host: field({ type: z.string(), env: "HOST", default: "fallback" }) });
    const config = resolveValues(s, { env: {} }); // env not set, falls back to default
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "host");
    expect(decision?.picked).toBe("default");
    expect(decision?.tried).toContain("env:HOST"); // checked but not found
    expect(decision?.tried).toContain("default");
  });

  it("tracks secretFile source", () => {
    const s = schema({ pass: field({ type: z.string(), secretFile: secretFilePath }) });
    const config = resolveValues(s, { env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "pass");
    expect(decision?.picked).toBe(`secretFile:${secretFilePath}`);
    expect(decision?.tried).toContain(`secretFile:${secretFilePath}`);
  });

  it("tracks file source", () => {
    const s = schema({ port: field({ type: z.number() }) });
    const config = resolveValues(s, { fileValues: { port: 3000 }, configPath: "./config.yaml", env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "port");
    expect(decision?.picked).toBe("file:./config.yaml");
  });

  it("tracks initial source", () => {
    const s = schema({ val: field({ type: z.string() }) });
    const config = resolveValues(s, { initialValues: { val: "initial" }, env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "val");
    expect(decision?.picked).toBe("initial");
  });

  it("tracks override source", () => {
    const s = schema({ val: field({ type: z.string(), default: "default" }) });
    const config = resolveValues(s, { override: { val: "overridden" }, env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "val");
    expect(decision?.picked).toBe("override");
    expect(decision?.tried).toContain("override");
  });

  it("uses dot notation for nested schemas", () => {
    const s = schema({ db: { host: field({ type: z.string(), env: "DB_HOST" }) } });
    const config = resolveValues(s, { env: { DB_HOST: "localhost" } });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision" && e.key === "db.host");
    expect(decision).toBeDefined();
    expect(decision?.picked).toBe("env:DB_HOST");
  });

  it("tracks multiple fields", () => {
    const s = schema({
      host: field({ type: z.string(), env: "HOST" }),
      port: field({ type: z.number(), default: 3000 }),
    });
    const config = resolveValues(s, { env: { HOST: "localhost" } });
    const events = getDiagnostics(config) ?? [];
    const decisions = events.filter((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision");
    expect(decisions).toHaveLength(2);
  });
});

describe("resolve() diagnostics", () => {
  let tempDir: string;
  let configPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zfig-resolve-diag-"));
    configPath = join(tempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ host: "from-file" }));
    registerLoader(".json", (path) => {
      try {
        return JSON.parse(require("fs").readFileSync(path, "utf-8"));
      } catch {
        return undefined;
      }
    });
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  it("captures configPath event from option", () => {
    const s = schema({ host: field({ type: z.string() }) });
    const config = resolve(s, { configPath });
    const events = getDiagnostics(config) ?? [];
    const pathEvent = events.find((e): e is Extract<DiagnosticEvent, { type: "configPath" }> => e.type === "configPath");
    expect(pathEvent).toBeDefined();
    expect(pathEvent?.picked).toBe(configPath);
    expect(pathEvent?.candidates).toContain(`option:${configPath}`);
  });

  it("captures configPath event from env", () => {
    const s = schema({ host: field({ type: z.string() }) });
    const config = resolve(s, { env: { CONFIG_PATH: configPath } });
    const events = getDiagnostics(config) ?? [];
    const pathEvent = events.find((e): e is Extract<DiagnosticEvent, { type: "configPath" }> => e.type === "configPath");
    expect(pathEvent?.picked).toBe(configPath);
    expect(pathEvent?.candidates).toContain(`env:${configPath}`);
  });

  it("captures loader event", () => {
    const s = schema({ host: field({ type: z.string() }) });
    const config = resolve(s, { configPath });
    const events = getDiagnostics(config) ?? [];
    const loaderEvent = events.find((e): e is Extract<DiagnosticEvent, { type: "loader" }> => e.type === "loader");
    expect(loaderEvent).toBeDefined();
    expect(loaderEvent?.format).toBe(".json");
    expect(loaderEvent?.used).toBe(true);
  });

  it("includes both path/loader and sourceDecision events", () => {
    const s = schema({ host: field({ type: z.string() }) });
    const config = resolve(s, { configPath });
    const events = getDiagnostics(config) ?? [];
    expect(events.some((e) => e.type === "configPath")).toBe(true);
    expect(events.some((e) => e.type === "loader")).toBe(true);
    expect(events.some((e) => e.type === "sourceDecision")).toBe(true);
  });
});

describe("toDebugObject() with diagnostics", () => {
  it("returns structured object with config and diagnostics", () => {
    const s = schema({
      host: field({ type: z.string(), env: "HOST" }),
      port: field({ type: z.number(), default: 3000 }),
    });
    const config = resolveValues(s, { env: { HOST: "localhost" } });
    const debug = config.toDebugObject({ includeDiagnostics: true });
    expect(debug).toHaveProperty("config");
    expect(debug).toHaveProperty("diagnostics");
  });

  it("config contains values with sources", () => {
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
  });

  it("diagnostics contains events array", () => {
    const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
    const config = resolveValues(s, { env: {} });
    const debug = config.toDebugObject({ includeDiagnostics: true });
    expect(Array.isArray(debug.diagnostics)).toBe(true);
  });

  it("handles nested schemas", () => {
    const s = schema({
      db: {
        host: field({ type: z.string(), env: "DB_HOST" }),
        port: field({ type: z.number(), default: 5432 }),
      },
    });
    const config = resolveValues(s, { env: { DB_HOST: "localhost" } });
    const debug = config.toDebugObject({ includeDiagnostics: true });
    expect(debug.config).toEqual({
      db: {
        host: { value: "localhost", source: "env:DB_HOST" },
        port: { value: 5432, source: "default" },
      },
    });
  });

  it("redacts sensitive values in config", () => {
    const s = schema({
      host: field({ type: z.string(), default: "localhost" }),
      password: field({ type: z.string(), default: "secret123", sensitive: true }),
    });
    const config = resolveValues(s, { env: {} });
    const debug = config.toDebugObject({ includeDiagnostics: true });
    expect(debug.config).toEqual({
      host: { value: "localhost", source: "default" },
      password: { value: "[REDACTED]", source: "default" },
    });
  });

  it("diagnostics match getDiagnostics output", () => {
    const s = schema({ host: field({ type: z.string(), default: "localhost" }) });
    const config = resolveValues(s, { env: {} });
    const debug = config.toDebugObject({ includeDiagnostics: true });
    expect(debug.diagnostics).toEqual(getDiagnostics(config));
  });
});

describe("no secret leakage in diagnostics", () => {
  let tempDir: string;
  let secretFilePath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zfig-secrets-"));
    secretFilePath = join(tempDir, "secret");
    writeFileSync(secretFilePath, "super-secret-value");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true });
  });

  it("sourceDecision contains source identifiers not values", () => {
    const s = schema({ pass: field({ type: z.string(), secretFile: secretFilePath, sensitive: true }) });
    const config = resolveValues(s, { env: {} });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision");
    // Should contain path identifier, not the secret value
    expect(decision?.picked).toBe(`secretFile:${secretFilePath}`);
    expect(decision?.picked).not.toContain("super-secret-value");
    expect(decision?.tried.join(",")).not.toContain("super-secret-value");
  });

  it("env source shows var name not value", () => {
    const s = schema({ apiKey: field({ type: z.string(), env: "API_KEY", sensitive: true }) });
    const config = resolveValues(s, { env: { API_KEY: "secret-api-key-123" } });
    const events = getDiagnostics(config) ?? [];
    const decision = events.find((e): e is Extract<DiagnosticEvent, { type: "sourceDecision" }> => e.type === "sourceDecision");
    expect(decision?.picked).toBe("env:API_KEY");
    expect(decision?.picked).not.toContain("secret-api-key-123");
  });
});
