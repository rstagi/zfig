import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { registerLoader, ConfigError } from "confts";

export function loadYaml(path: string): Record<string, unknown> | undefined {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }

  try {
    return load(content) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(
      `Invalid YAML in ${path}: ${e instanceof Error ? e.message : String(e)}`,
      path,
      false
    );
  }
}

// Auto-register on import
registerLoader(".yaml", loadYaml);
registerLoader(".yml", loadYaml);
