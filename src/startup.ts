import { resolve as resolvePath, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "./resolver";
import { loadYaml } from "./loaders/yaml";
import { loadJson } from "./loaders/json";
import type { ConftsSchema, InferSchema } from "./types";

export interface ListenOptions {
  port: number;
  host?: string;
}

export interface ServerLike {
  listen(options: ListenOptions, callback?: () => void): void | Promise<unknown>;
  close(callback?: (err?: Error) => void): void;
}

export interface ResolveParams {
  initialValues?: Record<string, unknown>;
  configPath?: string;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
  override?: Record<string, unknown>;
}

export interface Service<
  _S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
> {
  create: (options?: ResolveParams) => Promise<T>;
  run: (options?: RunOptions) => Promise<void>;
}

export interface RunOptions {
  port?: number;
  host?: string;
  onReady?: () => void;
  onShutdown?: () => void;
  shutdownTimeout?: number;
  configOverride?: Record<string, unknown>;
}

export interface StartupOptions extends ResolveParams {
  // Auto-run detection
  meta?: ImportMeta;
  module?: NodeModule;
}

function isMainModule(options: StartupOptions): boolean {
  if (options.meta) {
    const callerPath = fileURLToPath(options.meta.url);
    const mainPath = resolvePath(process.argv[1]);
    return callerPath === mainPath;
  }
  if (options.module) {
    return require.main === options.module;
  }
  return false;
}

function loadConfigFile(configPath: string): Record<string, unknown> | undefined {
  const ext = extname(configPath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return loadYaml(configPath);
  } else if (ext === ".json") {
    return loadJson(configPath);
  }
  return undefined;
}

// Overload: startup(schema, factory)
export function startup<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  factory: (config: InferSchema<S>) => T | Promise<T>
): Service<S, T>;

// Overload: startup(schema, options, factory)
export function startup<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  options: StartupOptions,
  factory: (config: InferSchema<S>) => T | Promise<T>
): Service<S, T>;

// Implementation
export function startup<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  factoryOrOptions: ((config: InferSchema<S>) => T | Promise<T>) | StartupOptions,
  maybeFactory?: (config: InferSchema<S>) => T | Promise<T>
): Service<S, T> {
  const isOptionsSignature = typeof factoryOrOptions !== "function";
  const options: StartupOptions = isOptionsSignature ? factoryOrOptions : {};
  const factory = isOptionsSignature ? maybeFactory! : factoryOrOptions;

  const resolveConfig = (overrides?: ResolveParams) => {
    const params = { ...options, ...overrides };
    const fileValues = params.configPath ? loadConfigFile(params.configPath) : undefined;
    return resolve(configSchema, {
      initialValues: params.initialValues,
      fileValues,
      env: params.env ?? process.env,
      secretsPath: params.secretsPath,
      override: params.override,
    }) as InferSchema<S>;
  };

  const service: Service<S, T> = {
    async create(createOptions?: ResolveParams): Promise<T> {
      const config = resolveConfig(createOptions);
      return factory(config);
    },

    async run(runOptions?: RunOptions): Promise<void> {
      const config = resolveConfig(
        runOptions?.configOverride ? { override: runOptions.configOverride } : undefined
      );

      const server = await factory(config);
      const port =
        runOptions?.port ?? (config as { port?: number }).port ?? 3000;
      const host = runOptions?.host;

      return new Promise<void>((resolvePromise, rejectPromise) => {
        const shutdown = () => {
          server.close(() => {
            runOptions?.onShutdown?.();
            resolvePromise();
          });
        };

        process.once("SIGTERM", shutdown);
        process.once("SIGINT", shutdown);

        const listenOptions: ListenOptions = host !== undefined ? { port, host } : { port };
        const maybePromise = server.listen(listenOptions, () => {
          runOptions?.onReady?.();
        });

        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise
            .then(() => {
              runOptions?.onReady?.();
            })
            .catch((err: Error) => {
              rejectPromise(err);
            });
        }
      });
    },
  };

  // Auto-run if meta or module provided and this is the main module
  if (options && (options.meta || options.module) && isMainModule(options)) {
    service.run();
  }

  return service;
}
