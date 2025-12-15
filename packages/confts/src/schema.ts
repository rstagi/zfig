import { z, type ZodTypeAny } from "zod";
import {
  FIELD_MARKER,
  type FieldConfig,
  type MarkedFieldConfig,
  type ConftsSchema,
} from "./types";

export function schema<const D extends Record<string, unknown>>(
  definition: D
): ConftsSchema<D> {
  return z.object(buildZodShape(definition)) as ConftsSchema<D>;
}

export function field<T extends ZodTypeAny>(config: FieldConfig<T>): MarkedFieldConfig<T> {
  return {
    ...config,
    [FIELD_MARKER]: true,
  };
}

function buildZodShape(definition: Record<string, unknown>): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const [k, v] of Object.entries(definition)) {
    if (isMarkedField(v)) {
      const { type, env, secretFile, sensitive, default: defaultValue, doc } = v;
      const meta: Record<string, unknown> = {};
      if (env !== undefined) meta.env = env;
      if (secretFile !== undefined) meta.secretFile = secretFile;
      if (sensitive !== undefined) meta.sensitive = sensitive;
      if (defaultValue !== undefined) meta.default = defaultValue;
      const described = doc !== undefined ? type.describe(doc) : type;
      shape[k] = Object.keys(meta).length > 0 ? described.meta(meta) : described;
    } else if (isPrimitive(v)) {
      shape[k] = z.literal(v);
    } else if (isZodType(v)) {
      shape[k] = v;
    } else if (typeof v === "object" && v !== null) {
      shape[k] = z.object(buildZodShape(v as Record<string, unknown>));
    }
  }

  return shape;
}

function isZodType(value: unknown): value is ZodTypeAny {
  return (
    typeof value === "object" &&
    value !== null &&
    "_def" in value &&
    typeof (value as Record<string, unknown>)._def === "object"
  );
}

function isMarkedField(value: unknown): value is MarkedFieldConfig {
  return typeof value === "object" && value !== null && FIELD_MARKER in value;
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
