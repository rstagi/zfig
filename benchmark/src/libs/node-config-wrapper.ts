import { readFileSync } from "fs";
import type { LibWrapper, NestedResult } from "./types.js";

export const nodeConfigWrapper: LibWrapper = {
  name: "JSON.parse (baseline)",
  fileBased: (configPath: string): NestedResult => {
    const data = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      host: data.host ?? "localhost",
      port: data.port ?? 3000,
      debug: data.debug ?? false,
      database: {
        host: data.database?.host ?? "localhost",
        port: data.database?.port ?? 5432,
        name: data.database?.name ?? "app",
        pool: {
          min: data.database?.pool?.min ?? 2,
          max: data.database?.pool?.max ?? 10,
        },
      },
      cache: {
        enabled: data.cache?.enabled ?? true,
        ttl: data.cache?.ttl ?? 3600,
      },
    };
  },
};
