import type { ZodObject, ZodTypeAny } from "zod";
import { extname } from "node:path";
import { loadYaml } from "./loaders/yaml";
import { loadJson } from "./loaders/json";
import { resolve } from "./resolver";
import { ConfigError } from "./errors";

export interface ParseOptions {
  configPath?: string;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
}

export function parse<T extends ZodObject<Record<string, ZodTypeAny>>>(
  schema: T,
  options: ParseOptions = {}
): ReturnType<T["parse"]> {
  const { env = process.env, secretsPath = "/secrets" } = options;
  const configPath = options.configPath ?? env.CONFIG_PATH;

  if (!configPath) {
    throw new ConfigError(
      "No config path provided. Set configPath option or CONFIG_PATH env var.",
      "CONFIG_PATH",
      false
    );
  }

  const ext = extname(configPath).toLowerCase();
  let fileValues: Record<string, unknown> | undefined;

  if (ext === ".yaml" || ext === ".yml") {
    fileValues = loadYaml(configPath);
  } else if (ext === ".json") {
    fileValues = loadJson(configPath);
  } else {
    throw new ConfigError(
      `Unsupported config file extension: ${ext}. Use .yaml, .yml, or .json`,
      configPath,
      false
    );
  }

  if (fileValues === undefined) {
    throw new ConfigError(
      `Config file not found: ${configPath}`,
      configPath,
      false
    );
  }

  return resolve(schema, { fileValues, env, secretsPath });
}
