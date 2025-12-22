import { readFileSync } from "node:fs";

export function loadSecretFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return undefined;
  }
}
