// Core
export { schema, field } from "./schema";
export { resolveValues, getSources, type ResolveOptions } from "./values";
export { resolve, type ResolveOptions as ResolveFileOptions } from "./resolve";
export { ConfigError } from "./errors";

// Types
export type {
  ConfigSource,
  FieldConfig,
  SchemaDefinition,
  ConftsSchema,
  InferSchema,
} from "./types";

// Loader registry
export {
  registerLoader,
  getLoader,
  getSupportedExtensions,
  clearLoaders,
  type FileLoader,
} from "./loader-registry";

// Register JSON loader by default
import { registerLoader } from "./loader-registry";
import { loadJson } from "./loaders/json";
registerLoader(".json", loadJson);
