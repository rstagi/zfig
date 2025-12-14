import type { ZodTypeAny, ZodObject, z } from "zod";

export interface KeyConfig<T extends ZodTypeAny = ZodTypeAny> {
  type: T;
  env?: string;
  secretFile?: string;
  sensitive?: boolean;
  default?: unknown;
}

export type SchemaDefinition = {
  [key: string]: KeyConfig | SchemaDefinition | string | number | boolean;
};

export const KEY_MARKER = Symbol("confts.key");

export interface MarkedKeyConfig<T extends ZodTypeAny = ZodTypeAny>
  extends KeyConfig<T> {
  [KEY_MARKER]: true;
}

/** Infer type from single field */
export type InferField<F> = F extends MarkedKeyConfig<infer Z>
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
