import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "./resolver";
import type { ConftsSchema, InferSchema } from "./types";

export interface ListenOptions {
  port: number;
  host?: string;
}

export interface ServerLike {
  listen(options: ListenOptions, callback?: () => void): void | Promise<unknown>;
  close(callback?: (err?: Error) => void): void;
}

export interface Service<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
> {
  create: () => Promise<T>;
  run: (options?: RunOptions) => Promise<void>;
}

export interface RunOptions {
  port?: number;
  host?: string;
  onReady?: () => void;
  onShutdown?: () => void;
  shutdownTimeout?: number;
}

export interface StartupOptions {
  // Auto-run detection
  meta?: ImportMeta;
  module?: NodeModule;
  // Resolution options
  initialValues?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  secretsPath?: string;
  override?: Record<string, unknown>;
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

  const resolveConfig = () =>
    resolve(configSchema, {
      initialValues: options.initialValues,
      env: options.env ?? process.env,
      secretsPath: options.secretsPath,
      override: options.override,
    }) as InferSchema<S>;

  const service: Service<S, T> = {
    async create(): Promise<T> {
      const config = resolveConfig();
      return factory(config);
    },

    async run(runOptions?: RunOptions): Promise<void> {
      const config = resolveConfig();

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
