import type { ZodObject, ZodTypeAny } from "zod";
import { isAbsolute, join } from "node:path";
import { loadEnv } from "./loaders/env";
import { loadSecretFile } from "./loaders/secretFile";
import { ConfigError, formatValue } from "./errors";
import type { ConfigSource, ConftsSchema, InferSchema, DiagnosticEvent } from "./types";
import { DiagnosticsCollector } from "./diagnostics";

export interface ResolveOptions {
  initialValues?: Record<string, unknown>;
  fileValues?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
  override?: Record<string, unknown>;
  configPath?: string;
  /** @internal */
  _collector?: DiagnosticsCollector;
}

interface KeyMeta {
  env?: string;
  secretFile?: string;
  sensitive?: boolean;
  default?: unknown;
}

interface ResolveResult {
  value: unknown;
  source: ConfigSource | null;
  sources: Record<string, ConfigSource>;
}

const SOURCES_SYMBOL = Symbol("confts.sources");
const DIAGNOSTICS_SYMBOL = Symbol("confts.diagnostics");

export function getSources(config: unknown): Record<string, ConfigSource> | undefined {
  if (config && typeof config === "object") {
    return (config as Record<symbol, unknown>)[SOURCES_SYMBOL] as Record<string, ConfigSource> | undefined;
  }
  return undefined;
}

export function getDiagnostics(config: unknown): DiagnosticEvent[] | undefined {
  if (config && typeof config === "object") {
    return (config as Record<symbol, unknown>)[DIAGNOSTICS_SYMBOL] as DiagnosticEvent[] | undefined;
  }
  return undefined;
}

export function resolveValues<S extends ConftsSchema<Record<string, unknown>>>(
  schema: S,
  options: ResolveOptions = {}
): InferSchema<S> {
  const { initialValues, fileValues, env = process.env, secretsPath = "/secrets", override, configPath, _collector } = options;
  const collector = _collector ?? new DiagnosticsCollector();
  const { value, sources } = resolveValue(schema, [], initialValues, fileValues, env, secretsPath, override, configPath, collector);
  const result = value as InferSchema<S>;

  Object.defineProperty(result, "toString", {
    value: () => JSON.stringify(redactValue(schema, result), null, 2),
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(result, SOURCES_SYMBOL, {
    value: sources,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(result, DIAGNOSTICS_SYMBOL, {
    value: collector.getEvents(),
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(result, "toSourceString", {
    value: () => JSON.stringify(getSources(result)),
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(result, "getDiagnostics", {
    value: () => getDiagnostics(result),
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(result, "toDebugObject", {
    value: (options?: { includeDiagnostics?: boolean }) => ({
      config: buildConfigDebugObject(schema, result, sources),
      ...(options?.includeDiagnostics && { diagnostics: getDiagnostics(result) ?? [] }),
    }),
    enumerable: false,
    writable: false,
  });

  return result;
}

function resolveValue(
  schema: ZodTypeAny,
  path: string[],
  initialValues: Record<string, unknown> | undefined,
  fileValues: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
  secretsPath: string,
  override: Record<string, unknown> | undefined,
  configPath: string | undefined,
  collector: DiagnosticsCollector
): ResolveResult {
  if (isZodObject(schema)) {
    const result: Record<string, unknown> = {};
    const sources: Record<string, ConfigSource> = {};
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      const childResult = resolveValue(childSchema, [...path, key], initialValues, fileValues, env, secretsPath, override, configPath, collector);
      result[key] = childResult.value;
      Object.assign(sources, childResult.sources);
    }
    return { value: result, source: null, sources };
  }

  if (isZodLiteral(schema)) {
    return { value: getLiteralValue(schema), source: null, sources: {} };
  }

  const meta = getMeta(schema);
  const pathStr = path.join(".");
  const sensitive = meta?.sensitive ?? false;
  const tried: string[] = [];

  // Get nested values for this specific key path
  const overrideValue = path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, override);

  const initialValue = path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, initialValues);

  const fileValue = path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, fileValues);

  // Resolution priority: override > env > secretFile > fileValues > initialValues > default
  let value: unknown;
  let source: ConfigSource | undefined;

  if (overrideValue !== undefined) {
    tried.push("override");
    value = overrideValue;
    source = "override";
  }

  if (value === undefined && meta?.env !== undefined) {
    const envSource = `env:${meta.env}`;
    tried.push(envSource);
    const envValue = loadEnv(meta.env, env);
    if (envValue !== undefined) {
      value = envValue;
      source = envSource;
    }
  }

  if (value === undefined && meta?.secretFile !== undefined) {
    const secretFilePath = isAbsolute(meta.secretFile)
      ? meta.secretFile
      : join(secretsPath, meta.secretFile);
    const secretSource = `secretFile:${secretFilePath}`;
    tried.push(secretSource);
    const secretValue = loadSecretFile(secretFilePath);
    if (secretValue !== undefined) {
      value = secretValue;
      source = secretSource;
    }
  }

  if (value === undefined && fileValue !== undefined) {
    const fileSource = configPath ? `file:${configPath}` : "file";
    tried.push(fileSource);
    value = fileValue;
    source = fileSource;
  }

  if (value === undefined && initialValue !== undefined) {
    tried.push("initial");
    value = initialValue;
    source = "initial";
  }

  if (value === undefined && meta?.default !== undefined) {
    tried.push("default");
    value = meta.default;
    source = "default";
  }

  if (value === undefined) {
    throw new ConfigError(
      `Missing required config at '${pathStr}' (value: ${formatValue(value, sensitive)})`,
      pathStr,
      sensitive
    );
  }

  // Validate with Zod schema
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ConfigError(
      `Invalid config at '${pathStr}': ${result.error.issues[0]?.message} (value: ${formatValue(value, sensitive)})`,
      pathStr,
      sensitive
    );
  }

  collector.addSourceDecision(pathStr, source!, tried);

  return { value: result.data, source: source!, sources: { [pathStr]: source! } };
}

function redactValue(schema: ZodTypeAny, value: unknown): unknown {
  if (isZodObject(schema) && value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      result[key] = redactValue(childSchema, (value as Record<string, unknown>)[key]);
    }
    return result;
  }

  const meta = getMeta(schema);
  if (meta?.sensitive) {
    return "[REDACTED]";
  }

  return value;
}

function buildConfigDebugObject(
  schema: ZodTypeAny,
  value: unknown,
  sources: Record<string, ConfigSource>,
  path: string[] = []
): unknown {
  if (isZodObject(schema) && value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      result[key] = buildConfigDebugObject(
        childSchema,
        (value as Record<string, unknown>)[key],
        sources,
        [...path, key]
      );
    }
    return result;
  }

  if (isZodLiteral(schema)) {
    return { value, source: "literal" };
  }

  const pathStr = path.join(".");
  const meta = getMeta(schema);
  const displayValue = meta?.sensitive ? "[REDACTED]" : value;

  return { value: displayValue, source: sources[pathStr] };
}

function isZodObject(schema: ZodTypeAny): schema is ZodObject<Record<string, ZodTypeAny>> {
  return getDefType(schema) === "object";
}

function isZodLiteral(schema: ZodTypeAny): boolean {
  return getDefType(schema) === "literal";
}

function getLiteralValue(schema: ZodTypeAny): unknown {
  return (schema._zod?.def as { values?: unknown[] } | undefined)?.values?.[0];
}

function getMeta(schema: ZodTypeAny): KeyMeta | undefined {
  const meta = schema.meta?.();
  if (!meta || typeof meta !== "object") return undefined;
  const { env, secretFile, sensitive, default: defaultValue } = meta as Record<string, unknown>;
  if (env === undefined && secretFile === undefined && sensitive === undefined && defaultValue === undefined) {
    return undefined;
  }
  return { env, secretFile, sensitive, default: defaultValue } as KeyMeta;
}

function getDefType(schema: ZodTypeAny): string | undefined {
  return (schema._zod?.def as { type?: string } | undefined)?.type;
}
