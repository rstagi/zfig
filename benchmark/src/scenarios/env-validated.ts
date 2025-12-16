import { Bench } from "tinybench";
import {
  envalidWrapper,
  t3EnvWrapper,
  convictWrapper,
  zodConfigWrapper,
  conftsWrapper,
} from "../libs/index.js";
import type { LibWrapper } from "../libs/index.js";

const libs: LibWrapper[] = [
  envalidWrapper,
  t3EnvWrapper,
  convictWrapper,
  zodConfigWrapper,
  conftsWrapper,
];

const testEnv = {
  HOST: "testhost.example.com",
  PORT: "8080",
  DEBUG: "true",
};

export async function runEnvValidated(): Promise<Bench> {
  const bench = new Bench({ time: 1000 });

  for (const lib of libs) {
    if (lib.envValidated) {
      bench.add(lib.name, () => {
        lib.envValidated!(testEnv);
      });
    }
  }

  await bench.warmup();
  await bench.run();

  return bench;
}
