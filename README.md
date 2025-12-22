# zfig

[![npm version](https://img.shields.io/npm/v/zfig.svg)](https://www.npmjs.com/package/zfig)

Dev-friendly TypeScript config library wrapping Zod with multi-source value resolution.

## Features

- Type-safe config with Zod validation
- No dependencies (besides Zod as a peer dependency)
- Multi-source value resolution (env vars, secret files, config files)
- JSON support built-in, YAML via optional package
- Sensitive value redaction in errors and logs
- Composable nested schemas
- Server bootstrap with graceful shutdown (optional)
- Source tracking and diagnostics

## Install

```bash
npm install zfig zod
```

## Quick Start

```typescript
import { schema, field, resolve } from "zfig";
import { z } from "zod";

const configSchema = schema({
  name: field({ type: z.string(), env: "APP_NAME", default: "my-app" }),
  db: {
    host: field({ type: z.string(), env: "DB_HOST", default: "localhost" }),
    port: field({ type: z.coerce.number(), env: "DB_PORT", default: 5432 }),
    password: field({
      type: z.string(),
      env: "DB_PASSWORD",
      secretFile: "db-password",
      sensitive: true,
    }),
  },
});

const config = resolve(configSchema, { configPath: "./config.json" });
// config is fully typed: { name: string, db: { host: string, port: number, password: string } }
```

Config file values override defaults, env vars override file:

```json
// config.json
{
  "db": {
    "host": "production-db.example.com"
  }
}
```

## Resolution Priority

Values are resolved in order (highest to lowest):

1. **Override** - `override` option in resolve
2. **Environment variable** - `env` field option
3. **Secret file** - `secretFile` field option
4. **Config file** - JSON/YAML file
5. **Initial values** - `initialValues` option in resolve
6. **Default** - `default` field option

## Source Tracing

Track where each config value came from:

```typescript
import { getSources } from "zfig";

console.log(getSources(config));
// { "name": "default", "db.host": "file:./config.json", "db.port": "env:DB_PORT", "db.password": "secretFile:db-password" }

console.log(config.toDebugObject());
// { "name": { "value": "appName", "source": "default" }, ... }
```

See [zfig README](packages/zfig/README.md#debugging) for full debugging API.

## Bootstrap

Server lifecycle management with graceful shutdown. Simplifies config loading at startup and in tests. See [@zfig/bootstrap](packages/bootstrap/README.md) for details.

## Packages

| Package | Description | Docs |
|---------|-------------|------|
| `zfig` | Core schema, field, resolve | [README](packages/zfig/README.md) |
| `@zfig/yaml-loader` | YAML file support (side-effect import) | [README](packages/yaml-loader/README.md) |
| `@zfig/bootstrap` | Server lifecycle management | [README](packages/bootstrap/README.md) |

## License

MIT
