import { z } from "zod";
import { loadConfigSync } from "zod-config";
import { envAdapter } from "zod-config/env-adapter";
import { jsonAdapter } from "zod-config/json-adapter";
import type { LibWrapper, EnvOnlyResult, NestedResult } from "./types.js";

const envSchema = z.object({
  HOST: z.string().default("localhost"),
  PORT: z.coerce.number().default(3000),
  DEBUG: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

const nestedSchema = z.object({
  host: z.string().default("localhost"),
  port: z.coerce.number().default(3000),
  debug: z.boolean().default(false),
  database: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().default(5432),
    name: z.string().default("app"),
    pool: z.object({
      min: z.coerce.number().default(2),
      max: z.coerce.number().default(10),
    }),
  }),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.coerce.number().default(3600),
  }),
});

export const zodConfigWrapper: LibWrapper = {
  name: "zod-config",
  envValidated: (env: Record<string, string>): EnvOnlyResult => {
    const result = loadConfigSync({
      schema: envSchema,
      adapters: envAdapter({ customEnv: env }),
    });
    return {
      host: result.HOST,
      port: result.PORT,
      debug: result.DEBUG,
    };
  },
  fileBased: (configPath: string): NestedResult => {
    const result = loadConfigSync({
      schema: nestedSchema,
      adapters: jsonAdapter({ path: configPath }),
    });
    return result;
  },
  nested: (env: Record<string, string>, configPath: string): NestedResult => {
    const result = loadConfigSync({
      schema: nestedSchema,
      adapters: [
        jsonAdapter({ path: configPath }),
        envAdapter({ customEnv: env }),
      ],
    });
    return result;
  },
};
