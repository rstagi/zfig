import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadJson } from "../../src/loaders/json";
import { ConfigError } from "../../src/errors";

describe("loadJson()", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "confts-json-test-"));
  });

  afterAll(() => {
    rmdirSync(tempDir, { recursive: true });
  });

  it("returns parsed object from valid JSON", () => {
    const filePath = join(tempDir, "config.json");
    writeFileSync(filePath, '{"db":{"host":"localhost","port":5432}}');
    expect(loadJson(filePath)).toEqual({
      db: { host: "localhost", port: 5432 },
    });
  });

  it("returns undefined when file not found", () => {
    expect(loadJson("/nonexistent/config.json")).toBeUndefined();
  });

  it("throws ConfigError on invalid JSON", () => {
    const filePath = join(tempDir, "invalid.json");
    writeFileSync(filePath, "{invalid json}");
    expect(() => loadJson(filePath)).toThrow(ConfigError);
  });
});
