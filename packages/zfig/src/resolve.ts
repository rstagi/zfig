import { extname } from "node:path";
import { getLoader, getSupportedExtensions } from "./loader-registry";
import { resolveValues } from "./values";
import { ConfigError } from "./errors";
import type { ZfigSchema, ResolvedConfig } from "./types";
import { DiagnosticsCollector } from "./diagnostics";

export interface ResolveOptions {
  initialValues?: Record<string, unknown>;
  configPath?: string;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
  override?: Record<string, unknown>;
}

export function resolve<S extends ZfigSchema<Record<string, unknown>>>(
  schema: S,
  options: ResolveOptions = {}
): ResolvedConfig<S> {
  const { env = process.env, secretsPath = "/secrets", initialValues, override } = options;
  const collector = new DiagnosticsCollector();

  // Build candidates list for diagnostics
  const candidates: string[] = [];
  if (options.configPath) candidates.push(`option:${options.configPath}`);
  if (env.CONFIG_PATH) candidates.push(`env:${env.CONFIG_PATH}`);

  const configPath = options.configPath ?? env.CONFIG_PATH;

  let fileValues: Record<string, unknown> | undefined;

  if (configPath) {
    const reason = options.configPath ? "picked from configPath option" : "picked from CONFIG_PATH env";
    collector.addConfigPath(configPath, candidates, reason);

    const ext = extname(configPath).toLowerCase();
    const loader = getLoader(ext);

    if (!loader) {
      const supported = getSupportedExtensions().join(", ");
      collector.addLoader(ext, false, `unsupported extension, supported: ${supported || "none"}`);
      throw new ConfigError(
        `Unsupported config file extension: ${ext}. Supported: ${supported || "none"}. Install @zfig/yaml-loader for YAML support.`,
        configPath,
        false,
        collector.getEvents()
      );
    }

    collector.addLoader(ext, true);

    fileValues = loader(configPath);

    if (fileValues === undefined) {
      throw new ConfigError(
        `Config file not found: ${configPath}`,
        configPath,
        false,
        collector.getEvents()
      );
    }
  } else {
    collector.addConfigPath(null, candidates, "no config path, skipping file loading");
  }

  return resolveValues(schema, { initialValues, fileValues, env, secretsPath, override, configPath, _collector: collector });
}
