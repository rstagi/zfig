export { schema, key } from "./schema";
export { parse } from "./parser";
export { resolve } from "./resolver";
export { startup } from "./startup";
export { ConfigError } from "./errors";
export type {
  KeyConfig,
  SchemaDefinition,
  ConftsSchema,
  InferSchema,
} from "./types";
export type { ResolveOptions } from "./resolver";
export type { ParseOptions } from "./parser";
export type { ServerLike, Service, RunOptions, StartupOptions } from "./startup";
