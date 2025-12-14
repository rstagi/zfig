# confts

[![npm version](https://img.shields.io/npm/v/confts.svg)](https://www.npmjs.com/package/confts)

Dev-friendly TypeScript config library wrapping Zod with multi-source value resolution.

## Packages

| Package | Description |
|---------|-------------|
| `confts` | Core - schema, field, resolve, value resolution |
| `@confts/yaml-loader` | YAML file support (optional) |
| `@confts/bootstrap` | Server lifecycle management (optional) |

## Installation

```bash
# Core only (JSON config)
npm install confts zod

# With YAML support
npm install confts @confts/yaml-loader zod

# With server bootstrap
npm install confts @confts/bootstrap zod
```

## Quick Start

```typescript
import { schema, field, resolve } from "confts";
import "@confts/yaml-loader"; // enables YAML support (side-effect import)
import { z } from "zod";

const configSchema = schema({
  appName: "my-app", // literal value
  someKey: {
    publishableKey: field({
      type: z.string().nonempty(),
      env: "MY_PUBLISHABLE_KEY",
    }),
    secretKey: field({
      type: z.string().nonempty(),
      secretFile: "some-secret-file-name",
      sensitive: true,
    }),
    nested: {
      someNestedKey: field({ type: z.number(), env: "MY_VAR", default: 3000 }),
    },
  },
});

const config = resolve(configSchema, { configPath: "./config.yaml" });
// config is fully typed
```

**JSON-only** (no yaml-loader needed):
```typescript
import { schema, field, resolve } from "confts";
const config = resolve(configSchema, { configPath: "./config.json" });
```

## Value Resolution

Values are resolved in priority order:

1. **Override** (`override` in resolve options) - highest priority
2. **Environment variable** (`env`)
3. **Secret file** (`secretFile`) - reads file content
4. **Config file** (YAML/JSON)
5. **Initial values** (`initialValues` in resolve options)
6. **Default value** (`default`)

## API

### `field(config)`

Define a config field with metadata:

```typescript
field({
  type: z.string(),        // Zod type (required)
  env: "MY_VAR",           // env var name
  secretFile: "/path",     // path to secret file
  sensitive: true,         // redact in errors
  default: "value",        // fallback value
  doc: "Description",      // field description (uses z.describe)
});
```

### `schema(definition)`

Build a typed schema from a definition object:

```typescript
const s = schema({
  literal: "value",           // becomes z.literal("value")
  myField: field({ type: z.string() }),
  nested: { deep: field({ type: z.number() }) },
});
```

### `resolve(schema, options)`

Load and validate config:

```typescript
const config = resolve(schema, {
  configPath: "./config.yaml", // or set CONFIG_PATH env
  env: process.env,            // custom env (default: process.env)
  secretsPath: "/secrets",     // base path for secret files
});
```

Supports `.yaml`, `.yml`, and `.json` files.

### `getSources(config)`

Get which source each config value came from (useful for debugging/logging):

```typescript
import { resolveValues, getSources } from "confts";

const config = resolveValues(schema, options);
const sources = getSources(config);
// { host: "env:HOST", port: "default", "db.password": "secretFile:/secrets/db_pass" }

// Or use toSourceString() for logging
console.log(config.toSourceString());
// '{"host":"env:HOST","port":"default","db.password":"secretFile:/secrets/db_pass"}'
```

Source formats:
- `"override"` - from override option
- `"env:VAR_NAME"` - from environment variable
- `"secretFile:/path/to/file"` - from secret file
- `"file:/path/to/config.yaml"` - from config file
- `"initial"` - from initialValues option
- `"default"` - from field default

### `toDebugObject()`

Get config values with embedded source info (useful for debugging):

```typescript
const config = resolveValues(schema, options);
console.log(config.toDebugObject());
// {
//   host: { value: "localhost", source: "env:HOST" },
//   db: {
//     port: { value: 5432, source: "default" },
//     password: { value: "[REDACTED]", source: "secretFile:/secrets/db_pass" }
//   }
// }
```

Sensitive values are automatically redacted.

## Sensitive Values

Mark fields as `sensitive: true` to redact values in error messages:

```typescript
field({
  type: z.string(),
  env: "API_SECRET",
  sensitive: true, // shows [REDACTED] in errors
});
```

## Server Bootstrap

The `bootstrap()` helper from `@confts/bootstrap` provides server lifecycle management with graceful shutdown.

```bash
npm install @confts/bootstrap
```

### Auto-run (ESM)

Pass `import.meta` to auto-run when file is executed directly:

```typescript
// app.ts (ESM)
import { schema, field } from "confts";
import { bootstrap } from "@confts/bootstrap";
import { z } from "zod";

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
  dbUrl: field({ type: z.string(), env: "DATABASE_URL" }),
});

export default bootstrap(configSchema, { meta: import.meta }, async (config) => {
  await db.connect(config.dbUrl);
  const app = express();
  app.get("/health", (req, res) => res.send("ok"));
  return app;
});

// node app.ts     → auto-runs server
// import from... → just exports service (for tests)
```

### Testing

```typescript
// app.test.ts
import service from "./app";

const { server } = await service.create({ override: { dbUrl: "test://..." } });
// use supertest(server) - no listen() called
```

### API

Signatures:
- `bootstrap(schema, factory)` - basic, no auto-run
- `bootstrap(schema, options, factory)` - with options

Returns:
- `create(options?)` - builds server without listening (for tests)
- `run(options?)` - builds server, listens, handles graceful shutdown

## Migration from 0.9.x

### Breaking Changes

**YAML support now requires `@confts/yaml-loader`:**
```typescript
// Before (0.9.x)
import { resolve } from "confts";
resolve(schema, { configPath: "./config.yaml" }); // worked

// After (0.10.x)
import { resolve } from "confts";
import "@confts/yaml-loader"; // required for YAML
resolve(schema, { configPath: "./config.yaml" });
```

**`bootstrap()` moved to `@confts/bootstrap`:**
```typescript
// Before (0.9.x)
import { bootstrap } from "confts";

// After (0.10.x)
import { bootstrap } from "@confts/bootstrap";
```

JSON config files work without extra packages.

## License

MIT
