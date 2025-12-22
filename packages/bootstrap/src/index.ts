import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "zfig";
import type { ZfigSchema, ResolvedConfig } from "zfig";

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
  S extends ZfigSchema<Record<string, unknown>>,
  T extends ServerLike,
> {
  create: (options?: ResolveParams) => Promise<{ server: T, config: ResolvedConfig<S> }>;
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

export type AutorunOptions<T> =
  | { enabled: false }
  | ({
    enabled: true;
    runOptions?: Partial<RunOptions> | ((config: T) => Partial<RunOptions>);
  } & ({ meta: ImportMeta } | { module: NodeModule }));

export interface StartupOptions<T = unknown> extends ResolveParams {
  autorun?: AutorunOptions<T>;
  onError?: (error: Error) => void;
}

// Overload: bootstrap(schema, factory)
export function bootstrap<
  S extends ZfigSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  factory: (config: ResolvedConfig<S>) => T | Promise<T>
): Service<S, T>;

// Overload: bootstrap(schema, options, factory)
export function bootstrap<
  S extends ZfigSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  options: StartupOptions<ResolvedConfig<S>>,
  factory: (config: ResolvedConfig<S>) => T | Promise<T>
): Service<S, T>;

// Implementation
export function bootstrap<
  S extends ZfigSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  factoryOrOptions: ((config: ResolvedConfig<S>) => T | Promise<T>) | StartupOptions<ResolvedConfig<S>>,
  maybeFactory?: (config: ResolvedConfig<S>) => T | Promise<T>
): Service<S, T> {
  const isOptionsSignature = typeof factoryOrOptions !== "function";
  const options: StartupOptions<ResolvedConfig<S>> = isOptionsSignature ? factoryOrOptions : {};
  const factory = isOptionsSignature ? maybeFactory! : factoryOrOptions;

  const resolveConfig = (overrides?: ResolveParams) => {
    const params = { ...options, ...overrides };
    return resolve(configSchema, {
      initialValues: params.initialValues,
      configPath: params.configPath,
      env: params.env ?? process.env,
      secretsPath: params.secretsPath,
      override: params.override,
    });
  };

  const service: Service<S, T> = {
    async create(createOptions?: ResolveParams): Promise<{ server: T, config: ResolvedConfig<S> }> {
      try {
        const config = resolveConfig(createOptions);
        return {
          server: await factory(config),
          config,
        };
      } catch (error) {
        if (options.onError && error instanceof Error) {
          options.onError(error);
        }
        throw error;
      }
    },

    async run(runOptions?: RunOptions): Promise<void> {
      const { server, config } = await this.create(
        runOptions?.configOverride ? { override: runOptions.configOverride } : undefined
      )
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

  // Auto-run if enabled and this is the main module
  if (options.autorun?.enabled && isMainModule(options.autorun)) {
    const config = resolveConfig();
    const runOpts = resolveAutorunOptions(options.autorun, config);
    service.run(runOpts);
  }

  return service;
}

function isMainModule(autorun: { enabled: true; meta?: ImportMeta; module?: NodeModule }): boolean {
  if ("meta" in autorun && autorun.meta) {
    const callerPath = fileURLToPath(autorun.meta.url);
    const mainPath = resolvePath(process.argv[1]);
    return callerPath === mainPath;
  }
  if ("module" in autorun && autorun.module) {
    return require.main === autorun.module;
  }
  return false;
}

function resolveAutorunOptions<T>(
  autorun: AutorunOptions<T>,
  config: T
): Partial<RunOptions> | undefined {
  if (!autorun.enabled || !autorun.runOptions) return undefined;
  return typeof autorun.runOptions === "function"
    ? autorun.runOptions(config)
    : autorun.runOptions;
}
