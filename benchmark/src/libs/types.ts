export interface EnvOnlyResult {
  host: string;
  port: number;
  debug: boolean;
}

export interface NestedResult {
  host: string;
  port: number;
  debug: boolean;
  database: {
    host: string;
    port: number;
    name: string;
    pool: {
      min: number;
      max: number;
    };
  };
  cache: {
    enabled: boolean;
    ttl: number;
  };
}

export interface LibWrapper {
  name: string;
  envOnly?: (env: Record<string, string>) => EnvOnlyResult;
  envValidated?: (env: Record<string, string>) => EnvOnlyResult;
  fileBased?: (configPath: string) => NestedResult;
  nested?: (env: Record<string, string>, configPath: string) => NestedResult;
}
