import { readFileSync } from "node:fs";
import { ConfigError } from "../errors";

export function loadJson(path: string): Record<string, unknown> | undefined {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(
      `Invalid JSON in ${path}: ${e instanceof Error ? e.message : String(e)}`,
      path,
      false
    );
  }
}
