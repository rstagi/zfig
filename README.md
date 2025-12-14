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

1. **Environment variable** (`env`)
2. **Secret file** (`secretFile`) - reads file content
3. **Config file** (YAML/JSON)
4. **Default value** (`default`)

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

### Auto-run (recommended)

Pass `import.meta` to auto-run when file is executed directly:

```typescript
// app.ts
import { startup, schema, key } from "confts";
import { z } from "zod";

const configSchema = schema({
  port: key({ type: z.number(), env: "PORT", default: 3000 }),
  dbUrl: key({ type: z.string(), env: "DATABASE_URL" }),
});

export default startup(configSchema, async (config) => {
  await db.connect(config.dbUrl);
  const app = express();
  app.get("/health", (req, res) => res.send("ok"));
  return app;
}, { meta: import.meta });

// node app.ts     → auto-runs server
// import from... → just exports service (for tests)
```

### Manual check (alternative)

```typescript
const service = startup(configSchema, factory);

if (import.meta.url === `file://${process.argv[1]}`) {
  service.run();
}

export default service;
```

### Testing

```typescript
// app.test.ts
import service from "./app";

const app = await service.create({ dbUrl: "test://..." });
// use supertest(app) - no listen() called
```

### API

`startup(schema, factory, options?)` returns:
- `create(overrides?)` - builds server without listening (for tests)
- `run(options?)` - builds server, listens, handles graceful shutdown

`startup()` options:
- `meta` - pass `import.meta` to enable auto-run when main module

`run()` options:
- `port` - override config port
- `onReady` - callback when listening
- `onShutdown` - callback on shutdown
- `shutdownTimeout` - ms before force exit (default: 30000)

## License

MIT
