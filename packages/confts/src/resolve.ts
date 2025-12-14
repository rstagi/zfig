import { extname } from "node:path";
import { getLoader, getSupportedExtensions } from "./loader-registry";
import { resolveValues } from "./values";
import { ConfigError } from "./errors";
import type { ConftsSchema, InferSchema } from "./types";

export interface ResolveOptions {
  configPath?: string;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
}

export function resolve<S extends ConftsSchema<Record<string, unknown>>>(
  schema: S,
  options: ResolveOptions = {}
): InferSchema<S> {
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
  const loader = getLoader(ext);

  if (!loader) {
    const supported = getSupportedExtensions().join(", ");
    throw new ConfigError(
      `Unsupported config file extension: ${ext}. Supported: ${supported || "none"}. Install @confts/yaml-loader for YAML support.`,
      configPath,
      false
    );
  }

  const fileValues = loader(configPath);

  if (fileValues === undefined) {
    throw new ConfigError(
      `Config file not found: ${configPath}`,
      configPath,
      false
    );
  }

  return resolveValues(schema, { fileValues, env, secretsPath, configPath }) as InferSchema<S>;
}
