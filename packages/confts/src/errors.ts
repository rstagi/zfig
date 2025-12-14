export class ConfigError extends Error {
  name = "ConfigError";

  constructor(
    message: string,
    public readonly path: string,
    public readonly sensitive: boolean
  ) {
    super(message);
  }
}

export function formatValue(value: unknown, sensitive: boolean): string {
  if (sensitive) return "[REDACTED]";
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}
