import type { ZodTypeAny, ZodObject, z } from "zod";

export type ConfigSource = string;

export interface FieldConfig<T extends ZodTypeAny = ZodTypeAny> {
  type: T;
  env?: string;
  secretFile?: string;
  sensitive?: boolean;
  default?: unknown;
  doc?: string;
}

export type SchemaDefinition = {
  [key: string]: FieldConfig | SchemaDefinition | string | number | boolean;
};

export const FIELD_MARKER = Symbol("confts.field");

export interface MarkedFieldConfig<T extends ZodTypeAny = ZodTypeAny>
  extends FieldConfig<T> {
  [FIELD_MARKER]: true;
}

/** Infer type from single field */
export type InferField<F> = F extends MarkedFieldConfig<infer Z>
  ? z.infer<Z>
  : F extends string
    ? F
    : F extends number
      ? F
      : F extends boolean
        ? F
        : F extends Record<string, unknown>
          ? InferDefinition<F>
          : never;

/** Infer full definition type (recursive) */
export type InferDefinition<D extends Record<string, unknown>> = {
  [K in keyof D]: InferField<D[K]>;
};

/** Schema with embedded definition type */
export type ConftsSchema<D extends Record<string, unknown>> = ZodObject<
  Record<string, ZodTypeAny>
> & {
  readonly _conftsDefinition: D;
};

/** Extract output type from schema */
export type InferSchema<S> = S extends ConftsSchema<infer D>
  ? InferDefinition<D>
  : S extends ZodObject<infer _Shape>
    ? z.infer<S>
    : never;
