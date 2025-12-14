import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadYaml } from "../../src/loaders/yaml";
import { ConfigError } from "../../src/errors";

describe("loadYaml()", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "confts-yaml-test-"));
  });

  afterAll(() => {
    rmdirSync(tempDir, { recursive: true });
  });

  it("returns parsed object from valid YAML", () => {
    const filePath = join(tempDir, "config.yaml");
    writeFileSync(filePath, "db:\n  host: localhost\n  port: 5432");
    expect(loadYaml(filePath)).toEqual({
      db: { host: "localhost", port: 5432 },
    });
  });

  it("returns undefined when file not found", () => {
    expect(loadYaml("/nonexistent/config.yaml")).toBeUndefined();
  });

  it("throws ConfigError on invalid YAML", () => {
    const filePath = join(tempDir, "invalid.yaml");
    writeFileSync(filePath, "invalid: yaml: content:");
    expect(() => loadYaml(filePath)).toThrow(ConfigError);
  });

  it("handles .yml extension", () => {
    const filePath = join(tempDir, "config.yml");
    writeFileSync(filePath, "key: value");
    expect(loadYaml(filePath)).toEqual({ key: "value" });
  });
});
