import convict from "convict";
import type { LibWrapper, EnvOnlyResult, NestedResult } from "./types.js";

export const convictWrapper: LibWrapper = {
  name: "convict",
  envValidated: (env: Record<string, string>): EnvOnlyResult => {
    const schema = convict({
      host: {
        format: String,
        default: "localhost",
        env: "HOST",
      },
      port: {
        format: "port",
        default: 3000,
        env: "PORT",
      },
      debug: {
        format: Boolean,
        default: false,
        env: "DEBUG",
      },
    });
    schema.load({
      host: env.HOST,
      port: env.PORT ? parseInt(env.PORT, 10) : undefined,
      debug: env.DEBUG === "true",
    });
    schema.validate({ allowed: "strict" });
    return {
      host: schema.get("host"),
      port: schema.get("port"),
      debug: schema.get("debug"),
    };
  },
  fileBased: (configPath: string): NestedResult => {
    const schema = convict({
      host: { format: String, default: "localhost" },
      port: { format: "port", default: 3000 },
      debug: { format: Boolean, default: false },
      database: {
        host: { format: String, default: "localhost" },
        port: { format: "port", default: 5432 },
        name: { format: String, default: "app" },
        pool: {
          min: { format: "int", default: 2 },
          max: { format: "int", default: 10 },
        },
      },
      cache: {
        enabled: { format: Boolean, default: true },
        ttl: { format: "int", default: 3600 },
      },
    });
    schema.loadFile(configPath);
    schema.validate({ allowed: "strict" });
    return {
      host: schema.get("host"),
      port: schema.get("port"),
      debug: schema.get("debug"),
      database: {
        host: schema.get("database.host"),
        port: schema.get("database.port"),
        name: schema.get("database.name"),
        pool: {
          min: schema.get("database.pool.min"),
          max: schema.get("database.pool.max"),
        },
      },
      cache: {
        enabled: schema.get("cache.enabled"),
        ttl: schema.get("cache.ttl"),
      },
    };
  },
  nested: (env: Record<string, string>, configPath: string): NestedResult => {
    const schema = convict({
      host: { format: String, default: "localhost", env: "HOST" },
      port: { format: "port", default: 3000, env: "PORT" },
      debug: { format: Boolean, default: false, env: "DEBUG" },
      database: {
        host: { format: String, default: "localhost", env: "DB_HOST" },
        port: { format: "port", default: 5432, env: "DB_PORT" },
        name: { format: String, default: "app", env: "DB_NAME" },
        pool: {
          min: { format: "int", default: 2, env: "DB_POOL_MIN" },
          max: { format: "int", default: 10, env: "DB_POOL_MAX" },
        },
      },
      cache: {
        enabled: { format: Boolean, default: true, env: "CACHE_ENABLED" },
        ttl: { format: "int", default: 3600, env: "CACHE_TTL" },
      },
    });
    schema.loadFile(configPath);
    schema.validate({ allowed: "strict" });
    return {
      host: schema.get("host"),
      port: schema.get("port"),
      debug: schema.get("debug"),
      database: {
        host: schema.get("database.host"),
        port: schema.get("database.port"),
        name: schema.get("database.name"),
        pool: {
          min: schema.get("database.pool.min"),
          max: schema.get("database.pool.max"),
        },
      },
      cache: {
        enabled: schema.get("cache.enabled"),
        ttl: schema.get("cache.ttl"),
      },
    };
  },
};
