import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import type { LibWrapper, EnvOnlyResult } from "./types.js";

export const t3EnvWrapper: LibWrapper = {
  name: "@t3-oss/env-core",
  envOnly: (env: Record<string, string>): EnvOnlyResult => {
    const result = createEnv({
      server: {
        HOST: z.string().default("localhost"),
        PORT: z.coerce.number().default(3000),
        DEBUG: z
          .string()
          .transform((v) => v === "true")
          .default("false"),
      },
      runtimeEnv: env,
    });
    return {
      host: result.HOST,
      port: result.PORT,
      debug: result.DEBUG,
    };
  },
  envValidated: (env: Record<string, string>): EnvOnlyResult => {
    const result = createEnv({
      server: {
        HOST: z.string().default("localhost"),
        PORT: z.coerce.number().default(3000),
        DEBUG: z
          .string()
          .transform((v) => v === "true")
          .default("false"),
      },
      runtimeEnv: env,
    });
    return {
      host: result.HOST,
      port: result.PORT,
      debug: result.DEBUG,
    };
  },
};
