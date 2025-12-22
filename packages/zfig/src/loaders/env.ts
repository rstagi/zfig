export function loadEnv(
  name: string,
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return env[name];
}
