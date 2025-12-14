import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "./resolver";
import type { ConftsSchema, InferSchema } from "./types";

export interface ServerLike {
  listen(port: number, callback?: () => void): void;
  close(callback?: (err?: Error) => void): void;
}

export interface Service<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
> {
  create: (configOverrides?: Partial<InferSchema<S>>) => Promise<T>;
  run: (options?: RunOptions) => Promise<void>;
}

export interface RunOptions {
  port?: number;
  onReady?: () => void;
  onShutdown?: () => void;
  shutdownTimeout?: number;
}

export interface StartupOptions {
  meta?: ImportMeta;
}

function isMainModule(meta: ImportMeta): boolean {
  const callerPath = fileURLToPath(meta.url);
  const mainPath = resolvePath(process.argv[1]);
  return callerPath === mainPath;
}

export function startup<
  S extends ConftsSchema<Record<string, unknown>>,
  T extends ServerLike,
>(
  configSchema: S,
  factory: (config: InferSchema<S>) => T | Promise<T>,
  options?: StartupOptions
): Service<S, T> {
  const service: Service<S, T> = {
    async create(configOverrides?: Partial<InferSchema<S>>): Promise<T> {
      const config = resolve(configSchema, {
        env: process.env,
      }) as InferSchema<S>;

      const finalConfig = configOverrides
        ? { ...config, ...configOverrides }
        : config;

      return factory(finalConfig);
    },

    async run(runOptions?: RunOptions): Promise<void> {
      const config = resolve(configSchema, {
        env: process.env,
      }) as InferSchema<S>;

      const server = await factory(config);
      const port =
        runOptions?.port ?? (config as { port?: number }).port ?? 3000;

      return new Promise<void>((resolvePromise) => {
        const shutdown = () => {
          server.close(() => {
            runOptions?.onShutdown?.();
            resolvePromise();
          });
        };

        process.once("SIGTERM", shutdown);
        process.once("SIGINT", shutdown);

        server.listen(port, () => {
          runOptions?.onReady?.();
        });
      });
    },
  };

  // Auto-run if meta provided and this is the main module
  if (options?.meta && isMainModule(options.meta)) {
    service.run();
  }

  return service;
}
