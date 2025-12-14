# confts

[![npm version](https://img.shields.io/npm/v/confts.svg)](https://www.npmjs.com/package/confts)

Dev-friendly TypeScript config library wrapping Zod with multi-source value resolution.

## Installation

```bash
npm install confts zod
```

## Quick Start

```typescript
import confts from "confts";
import { z } from "zod";

const configSchema = confts.schema({
  appName: "my-app", // literal value
  someKey: {
    publishableKey: confts.field({
      type: z.string().nonempty(),
      env: "MY_PUBLISHABLE_KEY",
    }),
    secretKey: confts.field({
      type: z.string().nonempty(),
      secretFile: "some-secret-file-name",
      sensitive: true,
    }),
    nested: {
      someNestedKey: confts.field({ type: z.number(), env: "MY_VAR", default: 3000 }),
    },
  },
});

const config = confts.resolve(configSchema, { configPath: "./config.yaml" });
// config is fully typed
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
// { host: "env", port: "default", "db.password": "secretFile" }

// Or use toSourceString() for logging
console.log(config.toSourceString());
// '{"host":"env","port":"default","db.password":"secretFile"}'
```

Source types: `"override"` | `"env"` | `"secretFile"` | `"file"` | `"initial"` | `"default"`

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

The `bootstrap()` helper provides a consistent pattern for server lifecycle management with graceful shutdown.

### Auto-run (ESM)

Pass `import.meta` to auto-run when file is executed directly:

```typescript
// app.ts (ESM)
import confts from "confts";
import { z } from "zod";

const configSchema = confts.schema({
  port: confts.field({ type: z.number(), env: "PORT", default: 3000 }),
  dbUrl: confts.field({ type: z.string(), env: "DATABASE_URL" }),
});

export default confts.bootstrap(configSchema, { meta: import.meta }, async (config) => {
  await db.connect(config.dbUrl);
  const app = express();
  app.get("/health", (req, res) => res.send("ok"));
  return app;
});

// node app.ts     → auto-runs server
// import from... → just exports service (for tests)
```

### Auto-run (CommonJS)

Pass `module` for CJS projects:

```javascript
// app.cjs (CommonJS)
const confts = require("confts");
const { z } = require("zod");

const configSchema = confts.schema({
  port: confts.field({ type: z.number(), env: "PORT", default: 3000 }),
});

module.exports = confts.bootstrap(configSchema, { module }, (config) => {
  const app = require("express")();
  return app;
});

// node app.cjs    → auto-runs server
// require(...)    → just exports service (for tests)
```

### Manual check (alternative)

```typescript
// ESM
const service = bootstrap(configSchema, factory);
if (import.meta.url === `file://${process.argv[1]}`) service.run();
export default service;

// CJS
const service = bootstrap(configSchema, factory);
if (require.main === module) service.run();
module.exports = service;
```

### Testing

```typescript
// app.test.ts
import service from "./app";

const app = await service.create({ override: { dbUrl: "test://..." } });
// use supertest(app) - no listen() called
```

### API

Signatures:
- `bootstrap(schema, factory)` - basic, no auto-run
- `bootstrap(schema, options, factory)` - with options

Returns:
- `create(options?)` - builds server without listening (for tests)
- `run(options?)` - builds server, listens, handles graceful shutdown

`BootstrapOptions`:
- `meta` - pass `import.meta` for ESM auto-run
- `module` - pass `module` for CJS auto-run
- `initialValues` - base config values (lowest priority)
- `configPath` - path to config file
- `env` - custom env object (default: process.env)
- `secretsPath` - base path for secret files
- `override` - override values (highest priority)

`create(options?)` accepts same resolution options as `BootstrapOptions`.

`run(options?)`:
- `port` - override config port
- `host` - override host
- `onReady` - callback when listening
- `onShutdown` - callback on shutdown
- `shutdownTimeout` - ms before force exit (default: 30000)
- `configOverride` - override config values

## License

MIT
