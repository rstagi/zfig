import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSecretFile } from "../../src/loaders/secretFile";

describe("loadSecretFile()", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "confts-test-"));
  });

  afterAll(() => {
    rmdirSync(tempDir, { recursive: true });
  });

  it("returns trimmed file content when exists", () => {
    const filePath = join(tempDir, "secret1");
    writeFileSync(filePath, "my-secret-value");
    expect(loadSecretFile(filePath)).toBe("my-secret-value");
  });

  it("returns undefined when file not found", () => {
    expect(loadSecretFile("/nonexistent/path/to/secret")).toBeUndefined();
  });

  it("trims whitespace and newlines from content", () => {
    const filePath = join(tempDir, "secret2");
    writeFileSync(filePath, "  secret-with-whitespace\n\n");
    expect(loadSecretFile(filePath)).toBe("secret-with-whitespace");
  });

  it("returns empty string if file contains only whitespace", () => {
    const filePath = join(tempDir, "secret3");
    writeFileSync(filePath, "   \n\n  ");
    expect(loadSecretFile(filePath)).toBe("");
  });
});
