# @zfig/bootstrap

[![npm version](https://img.shields.io/npm/v/@zfig/bootstrap.svg)](https://www.npmjs.com/package/@zfig/bootstrap)

Server lifecycle management with graceful shutdown for zfig.

## Install

```bash
npm install zfig @zfig/bootstrap
```


## Basic Usage

### Create vs Run

**Create** - returns server without starting:

```typescript
import { schema, field } from "zfig";
import { bootstrap } from "@zfig/bootstrap";
import { z } from "zod";

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
});

const service = bootstrap(configSchema, (config) => {
  // Return your server instance
  return createServer(config);
});

// Get server without listening
const { server, config } = await service.create();
```

**Run** - starts server with graceful shutdown:

```typescript
// Starts listening and handles SIGTERM/SIGINT
await service.run();
```

## Autorun

Automatically run when file is executed directly (not imported).

### ESM

```typescript
import { schema, field } from "zfig";
import { bootstrap } from "@zfig/bootstrap";
import { z } from "zod";
import express from "express";

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
});

export default bootstrap(
  configSchema,
  { autorun: { enabled: true, meta: import.meta } },
  (config) => {
    const app = express();
    app.get("/health", (req, res) => res.send("ok"));
    return app;
  }
);

// node app.ts → auto-runs server
// import from app.ts → just exports service
```

### CommonJS

```typescript
const { schema, field } = require("zfig");
const { bootstrap } = require("@zfig/bootstrap");
const { z } = require("zod");

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
});

module.exports = bootstrap(
  configSchema,
  { autorun: { enabled: true, module: module } },
  (config) => createServer(config)
);
```

## Run Options

```typescript
await service.run({
  port: 8080,              // Override config port
  host: "0.0.0.0",         // Bind to specific host
  onReady: () => {         // Called after listen succeeds
    console.log("Server ready");
  },
  onShutdown: () => {      // Called after server closes
    console.log("Server stopped");
  },
  configOverride: {        // Override config values
    debug: true,
  },
});
```

| Option | Type | Description |
|--------|------|-------------|
| `port` | `number` | Override port (default: from config or 3000) |
| `host` | `string` | Bind to specific host |
| `onReady` | `() => void` | Called after listen succeeds |
| `onShutdown` | `() => void` | Called after server closes |
| `configOverride` | `object` | Override config values |

## Dynamic Run Options

Use a function to access resolved config:

```typescript
export default bootstrap(
  configSchema,
  {
    autorun: {
      enabled: true,
      meta: import.meta,
      runOptions: (config) => ({
        port: config.serverPort || 3000,
        host: config.serverHost || "localhost",
      }),
    },
  },
  (config) => createServer(config)
);
```

Or static options:

```typescript
autorun: {
  enabled: true,
  meta: import.meta,
  runOptions: { port: 3000, host: "localhost" },
}
```

## Graceful Shutdown

Bootstrap handles graceful shutdown automatically:

1. Listens for `SIGTERM` and `SIGINT` signals
2. Calls `server.close()` to stop accepting new connections
3. Waits for existing connections to complete
4. Invokes `onShutdown` callback
5. Resolves the `run()` promise

```typescript
await service.run({
  onShutdown: () => {
    console.log("Cleanup complete");
  },
});
// Promise resolves after shutdown
```

## Testing

Use `create()` to get the server without starting it:

```typescript
import service from "./app";
import request from "supertest";

describe("app", () => {
  it("responds to health check", async () => {
    const { server } = await service.create({
      override: { port: 0 },
    });

    const response = await request(server).get("/health");
    expect(response.status).toBe(200);
  });
});
```

Create options:

```typescript
await service.create({
  configPath: "./test-config.json",
  env: { PORT: "4000" },
  override: { debug: true },
});
```

## API Reference

### `bootstrap(schema, factory)`

Minimal signature without options.

```typescript
const service = bootstrap(configSchema, (config) => server);
```

### `bootstrap(schema, options, factory)`

Full signature with startup options.

```typescript
const service = bootstrap(
  configSchema,
  {
    autorun: { enabled: true, meta: import.meta },
    configPath: "./config.json",
    onError: (error) => {
      console.error("Startup failed:", error);
    },
  },
  (config) => server
);
```

### Startup Options

| Option | Type | Description |
|--------|------|-------------|
| `autorun` | `AutorunOptions` | Auto-run configuration |
| `configPath` | `string` | Path to config file |
| `env` | `Record<string, string>` | Environment variables |
| `secretsPath` | `string` | Base path for secrets |
| `initialValues` | `object` | Base config values |
| `override` | `object` | Override all sources |
| `onError` | `(error: Error) => void` | Called on config or factory errors |

### Error Handling

The `onError` callback receives all errors during startup. For config errors, diagnostics are attached:

```typescript
import { ConfigError } from "zfig";

bootstrap(
  configSchema,
  {
    onError: (error) => {
      if (error instanceof ConfigError && error.diagnostics) {
        console.error("Config resolution trace:", error.diagnostics);
      }
    },
  },
  (config) => server
);
```

### `service.create(options?)`

Returns server and config without starting.

```typescript
const { server, config } = await service.create({
  initialValues?: object,
  configPath?: string,
  env?: Record<string, string>,
  secretsPath?: string,
  override?: object,
});
```

### `service.run(options?)`

Starts server and handles graceful shutdown.

```typescript
await service.run({
  port?: number,
  host?: string,
  onReady?: () => void,
  onShutdown?: () => void,
  configOverride?: object,
});
```

## Examples

### Express

```typescript
import { schema, field } from "zfig";
import { bootstrap } from "@zfig/bootstrap";
import { z } from "zod";
import express from "express";

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
  name: field({ type: z.string(), default: "my-app" }),
});

export default bootstrap(
  configSchema,
  { autorun: { enabled: true, meta: import.meta } },
  (config) => {
    const app = express();
    app.get("/", (req, res) => res.json({ name: config.name }));
    return app;
  }
);
```

### Fastify

```typescript
import { schema, field } from "zfig";
import { bootstrap } from "@zfig/bootstrap";
import { z } from "zod";
import Fastify from "fastify";

const configSchema = schema({
  port: field({ type: z.number(), env: "PORT", default: 3000 }),
});

export default bootstrap(
  configSchema,
  { autorun: { enabled: true, meta: import.meta } },
  (config) => {
    const app = Fastify();
    app.get("/health", async () => ({ status: "ok" }));
    return app;
  }
);
```

Fastify's Promise-based `listen()` is supported automatically.

## License

MIT
