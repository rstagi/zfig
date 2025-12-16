import { schema, field, resolve } from "confts";
import { z } from "zod";
import type { LibWrapper, EnvOnlyResult, NestedResult } from "./types.js";

const envOnlySchema = schema({
  host: field({ type: z.string(), env: "HOST", default: "localhost" }),
  port: field({ type: z.coerce.number(), env: "PORT", default: 3000 }),
  debug: field({ type: z.coerce.boolean(), env: "DEBUG", default: false }),
});

const nestedSchema = schema({
  host: field({ type: z.string(), env: "HOST", default: "localhost" }),
  port: field({ type: z.coerce.number(), env: "PORT", default: 3000 }),
  debug: field({ type: z.coerce.boolean(), env: "DEBUG", default: false }),
  database: {
    host: field({ type: z.string(), env: "DB_HOST", default: "localhost" }),
    port: field({ type: z.coerce.number(), env: "DB_PORT", default: 5432 }),
    name: field({ type: z.string(), env: "DB_NAME", default: "app" }),
    pool: {
      min: field({ type: z.coerce.number(), env: "DB_POOL_MIN", default: 2 }),
      max: field({ type: z.coerce.number(), env: "DB_POOL_MAX", default: 10 }),
    },
  },
  cache: {
    enabled: field({
      type: z.coerce.boolean(),
      env: "CACHE_ENABLED",
      default: true,
    }),
    ttl: field({ type: z.coerce.number(), env: "CACHE_TTL", default: 3600 }),
  },
});

export const conftsWrapper: LibWrapper = {
  name: "confts",
  envOnly: (env: Record<string, string>): EnvOnlyResult => {
    const config = resolve(envOnlySchema, { env });
    return {
      host: config.host,
      port: config.port,
      debug: config.debug,
    };
  },
  envValidated: (env: Record<string, string>): EnvOnlyResult => {
    const config = resolve(envOnlySchema, { env });
    return {
      host: config.host,
      port: config.port,
      debug: config.debug,
    };
  },
  fileBased: (configPath: string): NestedResult => {
    const config = resolve(nestedSchema, { configPath });
    return {
      host: config.host,
      port: config.port,
      debug: config.debug,
      database: {
        host: config.database.host,
        port: config.database.port,
        name: config.database.name,
        pool: {
          min: config.database.pool.min,
          max: config.database.pool.max,
        },
      },
      cache: {
        enabled: config.cache.enabled,
        ttl: config.cache.ttl,
      },
    };
  },
  nested: (env: Record<string, string>, configPath: string): NestedResult => {
    const config = resolve(nestedSchema, { configPath, env });
    return {
      host: config.host,
      port: config.port,
      debug: config.debug,
      database: {
        host: config.database.host,
        port: config.database.port,
        name: config.database.name,
        pool: {
          min: config.database.pool.min,
          max: config.database.pool.max,
        },
      },
      cache: {
        enabled: config.cache.enabled,
        ttl: config.cache.ttl,
      },
    };
  },
};
