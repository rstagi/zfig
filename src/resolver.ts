import type { ZodObject, ZodTypeAny } from "zod";
import { isAbsolute, join } from "node:path";
import { loadEnv } from "./loaders/env";
import { loadSecretFile } from "./loaders/secretFile";
import { ConfigError, formatValue } from "./errors";
import type { ConftsSchema, InferSchema } from "./types";

export interface ResolveOptions {
  initialValues?: Record<string, unknown>;
  fileValues?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
  override?: Record<string, unknown>;
}

interface KeyMeta {
  env?: string;
  secretFile?: string;
  sensitive?: boolean;
  default?: unknown;
}

export function resolve<S extends ConftsSchema<Record<string, unknown>>>(
  schema: S,
  options: ResolveOptions = {}
): InferSchema<S> {
  const { initialValues, fileValues, env = process.env, secretsPath = "/secrets", override } = options;
  const result = resolveValue(schema, [], initialValues, fileValues, env, secretsPath, override) as InferSchema<S>;

  Object.defineProperty(result, "toString", {
    value: () => JSON.stringify(redactValue(schema, result), null, 2),
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
  override: Record<string, unknown> | undefined
): unknown {
  if (isZodObject(schema)) {
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      result[key] = resolveValue(childSchema, [...path, key], initialValues, fileValues, env, secretsPath, override);
    }
    return result;
  }

  if (isZodLiteral(schema)) {
    return getLiteralValue(schema);
  }

  const meta = getMeta(schema);
  const pathStr = path.join(".");
  const sensitive = meta?.sensitive ?? false;

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

  if (overrideValue !== undefined) {
    value = overrideValue;
  }

  if (value === undefined && meta?.env !== undefined) {
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

  if (value === undefined && initialValue !== undefined) {
    value = initialValue;
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
