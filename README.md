# confts

[![npm version](https://img.shields.io/npm/v/confts.svg)](https://www.npmjs.com/package/confts)

Dev-friendly TypeScript config library wrapping Zod with multi-source value resolution.

## Installation

```bash
npm install confts zod
```

## Quick Start

```typescript
import { schema, key, parse } from "confts";
import { z } from "zod";

const configSchema = schema({
  appName: "my-app", // literal value
  clerk: {
    publishableKey: key({
      type: z.string().nonempty(),
      env: "CLERK_PUBLISHABLE_KEY",
      secretFile: "/secrets/clerk-key",
      sensitive: true,
      default: "pk_test_xxx",
    }),
    nested: {
      port: key({ type: z.number(), env: "PORT", default: 3000 }),
    },
  },
});

const config = parse(configSchema, { configPath: "./config.yaml" });
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

### `key(config)`

Define a config field with metadata:

```typescript
key({
  type: z.string(),        // Zod type (required)
  env: "MY_VAR",           // env var name
  secretFile: "/path",     // path to secret file
  sensitive: true,         // redact in errors
  default: "value",        // fallback value
});
```

### `schema(definition)`

Build a typed schema from a definition object:

```typescript
const s = schema({
  literal: "value",           // becomes z.literal("value")
  field: key({ type: z.string() }),
  nested: { deep: key({ type: z.number() }) },
});
```

### `parse(schema, options)`

Load and validate config:

```typescript
const config = parse(schema, {
  configPath: "./config.yaml", // or set CONFIG_PATH env
  env: process.env,            // custom env (default: process.env)
  secretsPath: "/secrets",     // base path for secret files
});
```

Supports `.yaml`, `.yml`, and `.json` files.

## Sensitive Values

Mark fields as `sensitive: true` to redact values in error messages:

```typescript
key({
  type: z.string(),
  env: "API_SECRET",
  sensitive: true, // shows [REDACTED] in errors
});
```

## Server Startup

The `startup()` helper provides a consistent pattern for server lifecycle management with graceful shutdown.

### Auto-run (ESM)

Pass `import.meta` to auto-run when file is executed directly:

```typescript
// app.ts (ESM)
import { startup, schema, key } from "confts";
import { z } from "zod";

const configSchema = schema({
  port: key({ type: z.number(), env: "PORT", default: 3000 }),
  dbUrl: key({ type: z.string(), env: "DATABASE_URL" }),
});

export default startup(configSchema, { meta: import.meta }, async (config) => {
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
const { startup, schema, key } = require("confts");
const { z } = require("zod");

const configSchema = schema({
  port: key({ type: z.number(), env: "PORT", default: 3000 }),
});

module.exports = startup(configSchema, { module }, (config) => {
  const app = require("express")();
  return app;
});

// node app.cjs    → auto-runs server
// require(...)    → just exports service (for tests)
```

### Manual check (alternative)

```typescript
// ESM
const service = startup(configSchema, factory);
if (import.meta.url === `file://${process.argv[1]}`) service.run();
export default service;

// CJS
const service = startup(configSchema, factory);
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
- `startup(schema, factory)` - basic, no auto-run
- `startup(schema, options, factory)` - with options

Returns:
- `create(options?)` - builds server without listening (for tests)
- `run(options?)` - builds server, listens, handles graceful shutdown

`StartupOptions`:
- `meta` - pass `import.meta` for ESM auto-run
- `module` - pass `module` for CJS auto-run
- `initialValues` - base config values (lowest priority)
- `configPath` - path to config file
- `env` - custom env object (default: process.env)
- `secretsPath` - base path for secret files
- `override` - override values (highest priority)

`create(options?)` accepts same resolution options as `StartupOptions`.

`run(options?)`:
- `port` - override config port
- `host` - override host
- `onReady` - callback when listening
- `onShutdown` - callback on shutdown
- `shutdownTimeout` - ms before force exit (default: 30000)
- `configOverride` - override config values

## License

MIT
