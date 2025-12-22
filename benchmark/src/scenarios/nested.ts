import { Bench } from "tinybench";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  convictWrapper,
  zodConfigWrapper,
  zfigWrapper,
} from "../libs/index.js";
import type { LibWrapper } from "../libs/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "../../fixtures/config.json");

const libs: LibWrapper[] = [convictWrapper, zodConfigWrapper, zfigWrapper];

const testEnv = {
  HOST: "override.example.com",
  PORT: "9000",
  DEBUG: "false",
  DB_HOST: "db-override.example.com",
  DB_PORT: "5433",
  DB_NAME: "testdb",
  DB_POOL_MIN: "5",
  DB_POOL_MAX: "20",
  CACHE_ENABLED: "false",
  CACHE_TTL: "7200",
};

export async function runNested(): Promise<Bench> {
  const bench = new Bench({ time: 1000 });

  for (const lib of libs) {
    if (lib.nested) {
      bench.add(lib.name, () => {
        lib.nested!(testEnv, configPath);
      });
    }
  }

  await bench.warmup();
  await bench.run();

  return bench;
}
