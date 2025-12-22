import { Bench } from "tinybench";
import {
  runEnvOnly,
  runEnvValidated,
  runFileBased,
  runNested,
} from "./scenarios/index.js";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function printResults(name: string, bench: Bench): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log("=".repeat(60));

  const tasks = bench.tasks.sort((a, b) => {
    const aHz = a.result?.hz ?? 0;
    const bHz = b.result?.hz ?? 0;
    return bHz - aHz;
  });

  const fastest = tasks[0]?.result?.hz ?? 1;

  console.log(
    "\n" +
      "Library".padEnd(25) +
      "ops/sec".padStart(15) +
      "mean (ms)".padStart(15) +
      "relative".padStart(12)
  );
  console.log("-".repeat(67));

  for (const task of tasks) {
    const hz = task.result?.hz ?? 0;
    const mean = task.result?.mean ?? 0;
    const relative = hz / fastest;

    console.log(
      task.name.padEnd(25) +
        formatNumber(hz).padStart(15) +
        mean.toFixed(4).padStart(15) +
        `${relative.toFixed(2)}x`.padStart(12)
    );
  }
}

async function main(): Promise<void> {
  console.log("\nZfig Benchmark Suite");
  console.log("=".repeat(60));
  console.log("Running benchmarks... (this may take a minute)\n");

  const scenarios = [
    { name: "Env Only (no validation)", run: runEnvOnly },
    { name: "Env + Validation", run: runEnvValidated },
    { name: "File-Based Config", run: runFileBased },
    { name: "Nested Schema + File + Env", run: runNested },
  ];

  for (const scenario of scenarios) {
    console.log(`Running: ${scenario.name}...`);
    const bench = await scenario.run();
    printResults(scenario.name, bench);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Benchmark complete!");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
