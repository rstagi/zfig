import { Bench } from "tinybench";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  nodeConfigWrapper,
  convictWrapper,
  zodConfigWrapper,
  conftsWrapper,
} from "../libs/index.js";
import type { LibWrapper } from "../libs/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "../../fixtures/config.json");

const libs: LibWrapper[] = [
  nodeConfigWrapper,
  convictWrapper,
  zodConfigWrapper,
  conftsWrapper,
];

export async function runFileBased(): Promise<Bench> {
  const bench = new Bench({ time: 1000 });

  for (const lib of libs) {
    if (lib.fileBased) {
      bench.add(lib.name, () => {
        lib.fileBased!(configPath);
      });
    }
  }

  await bench.warmup();
  await bench.run();

  return bench;
}
