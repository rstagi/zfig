import type { ZodObject, ZodTypeAny } from "zod";
import { isAbsolute, join } from "node:path";
import { loadEnv } from "./loaders/env";
import { loadSecretFile } from "./loaders/secretFile";
import { ConfigError, formatValue } from "./errors";
import type { ConftsSchema, InferSchema } from "./types";

export interface ResolveOptions {
  fileValues?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
}

interface KeyMeta {
  env?: string;
  secretFile?: string;
  sensitive?: boolean;
  default?: unknown;
}

function getDefType(schema: ZodTypeAny): string | undefined {
  return (schema._zod?.def as { type?: string } | undefined)?.type;
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

function resolveValue(
  schema: ZodTypeAny,
  path: string[],
  fileValues: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
  secretsPath: string
): unknown {
  if (isZodObject(schema)) {
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      result[key] = resolveValue(childSchema, [...path, key], fileValues, env, secretsPath);
    }
    return result;
  }

  if (isZodLiteral(schema)) {
    return getLiteralValue(schema);
  }

  const meta = getMeta(schema);
  const pathStr = path.join(".");
  const sensitive = meta?.sensitive ?? false;

  // Get file value for this specific key
  const fileValue = path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, fileValues);

  // Resolution priority: env > secretFile > fileValues > default
  let value: unknown;

  if (meta?.env !== undefined) {
    const envValue = loadEnv(meta.env, env);
    if (envValue !== undefined) {
      value = envValue;
    }
  }

  if (value === undefined && meta?.secretFile !== undefined) {
    const secretPath = isAbsolute(meta.secretFile)
      ? meta.secretFile
      : join(secretsPath, meta.secretFile);
    const secretValue = loadSecretFile(secretPath);
    if (secretValue !== undefined) {
      value = secretValue;
    }
  }

  if (value === undefined && fileValue !== undefined) {
    value = fileValue;
  }

  if (value === undefined && meta?.default !== undefined) {
    value = meta.default;
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

  return result.data;
}

export function resolve<S extends ConftsSchema<Record<string, unknown>>>(
  schema: S,
  options: ResolveOptions = {}
): InferSchema<S> {
  const { fileValues, env = process.env, secretsPath = "/secrets" } = options;
  const result = resolveValue(schema, [], fileValues, env, secretsPath) as InferSchema<S>;

  Object.defineProperty(result, "toString", {
    value: () => JSON.stringify(redactValue(schema, result), null, 2),
    enumerable: false,
    writable: false,
  });

  return result;
}
